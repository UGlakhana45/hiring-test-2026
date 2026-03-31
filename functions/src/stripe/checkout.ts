import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { getStripePriceIds, priceIdToPlan } from './priceIds';
import { planSeatsForClaims } from './planConfig';
import { countActiveSeats } from '../auth/claims';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

/** Creates a Stripe Checkout session for a plan upgrade. */
export const createCheckoutSession = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { clinicId, plan, discountCode } = request.data as {
    clinicId: string;
    plan: 'pro' | 'premium' | 'vip';
    discountCode?: string;
  };

  const db = admin.firestore();

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const user = userDoc.data();
  if (!user || user.role !== 'owner' || user.clinicId !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', 'Only clinic owners can manage billing');
  }

  const subDoc = await db.collection('subscriptions').doc(clinicId).get();
  const sub = subDoc.data();
  let customerId: string;

  if (sub?.stripeCustomerId) {
    customerId = sub.stripeCustomerId;
  } else {
    const clinicDoc = await db.collection('clinics').doc(clinicId).get();
    const clinic = clinicDoc.data();
    const customer = await stripe.customers.create({
      email: user.email,
      name: clinic?.name,
      metadata: { clinicId },
    });
    customerId = customer.id;
  }

  // TODO [CHALLENGE]: Validate and apply discount code (Scenario 3 & 5).
  let stripeCouponId: string | undefined;
  if (discountCode) {
    console.log('TODO [CHALLENGE]: Validate and apply discount code:', discountCode);
  }

  const PRICE_IDS = getStripePriceIds();
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
    ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
    metadata: { clinicId, plan },
    success_url: 'clinicapp://billing?success=true',
    cancel_url: 'clinicapp://billing?canceled=true',
  });

  return { sessionId: session.id, url: session.url };
});

/**
 * Purchases an add-on for a clinic.
 */
export const purchaseAddon = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { clinicId, addonType, discountCode } = request.data as {
    clinicId: string;
    addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics';
    discountCode?: string;
  };

  // TODO [CHALLENGE]: Implement add-on purchase (Scenario 3).
  console.log('TODO [CHALLENGE]: Implement purchaseAddon for', addonType, 'clinic', clinicId, discountCode);
  throw new functions.https.HttpsError('unimplemented', 'TODO [CHALLENGE]: Implement purchaseAddon');
});

/** Initiates a plan downgrade. Blocks on seat conflicts; otherwise queues for period end. */
export const initiateDowngrade = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { clinicId, targetPlan } = request.data as {
    clinicId: string;
    targetPlan: 'free' | 'pro' | 'premium';
  };

  const db = admin.firestore();

  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const user = userDoc.data();
  if (!user || user.role !== 'owner' || user.clinicId !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', 'Only clinic owners can manage billing');
  }

  const subDoc = await db.collection('subscriptions').doc(clinicId).get();
  const sub = subDoc.data();
  if (!sub?.stripeSubscriptionId) {
    throw new functions.https.HttpsError('failed-precondition', 'No active subscription to downgrade');
  }

  const targetSeatLimit = planSeatsForClaims(targetPlan);
  const activeSeats = await countActiveSeats(db, clinicId);

  if (activeSeats > targetSeatLimit) {
    return {
      strategy: 'seat_conflict' as const,
      conflictingSeats: activeSeats - targetSeatLimit,
      activeSeats,
      seatLimit: targetSeatLimit,
    };
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubscriptionId);
  const periodEnd = admin.firestore.Timestamp.fromDate(
    new Date(stripeSub.current_period_end * 1000),
  );

  if (targetPlan === 'free') {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
  } else {
    const PRICE_IDS = getStripePriceIds();
    const baseItem = stripeSub.items.data.find((item) => priceIdToPlan(item.price.id) !== null);
    if (baseItem) {
      await stripe.subscriptions.update(sub.stripeSubscriptionId, {
        items: [{ id: baseItem.id, price: PRICE_IDS[targetPlan] }],
        proration_behavior: 'none',
      });
    }
  }

  await subDoc.ref.update({
    downgradeAt: periodEnd,
    scheduledPlan: targetPlan,
  });

  return {
    strategy: 'queued' as const,
    effectiveDate: periodEnd.toDate().toISOString(),
  };
});

/** Removes a staff member: deactivates seat, wipes claims, revokes sessions. */
export const removeStaffMember = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { clinicId, targetUserId } = request.data as { clinicId: string; targetUserId: string };

  const db = admin.firestore();

  const callerDoc = await db.collection('users').doc(request.auth.uid).get();
  const caller = callerDoc.data();
  if (!caller || caller.role !== 'owner' || caller.clinicId !== clinicId) {
    throw new functions.https.HttpsError('permission-denied', 'Only clinic owners can remove staff');
  }

  const targetDoc = await db.collection('users').doc(targetUserId).get();
  const target = targetDoc.data();
  if (!target || target.role === 'owner' || target.clinicId !== clinicId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Target must be a staff member of this clinic',
    );
  }

  await db.runTransaction(async (tx) => {
    const seatRef = db.collection('seats').doc(clinicId).collection('members').doc(targetUserId);
    tx.update(seatRef, { active: false });
    tx.update(db.collection('users').doc(targetUserId), {
      clinicId: null,
      role: 'patient',
    });
    tx.update(db.collection('clinics').doc(clinicId), {
      'seats.used': admin.firestore.FieldValue.increment(-1),
    });
  });

  await admin.auth().setCustomUserClaims(targetUserId, {
    clinicId: null,
    planId: 'free',
    claimRole: 'patient',
    seatLimit: 0,
    activeAddons: [],
  });

  await admin.auth().revokeRefreshTokens(targetUserId);
});
