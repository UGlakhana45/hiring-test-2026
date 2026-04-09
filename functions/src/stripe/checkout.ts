import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { getStripePriceIds, priceIdToPlan } from './priceIds';
import { planSeatsForClaims } from './planConfig';
import { countActiveSeats } from '../auth/claims';
import { stripe } from './stripeClient';
import { runStripeCall } from './stripeCall';
import { stripeCheckoutReturnUrls } from './checkoutUrls';

function isLiveStripeCustomerId(id: unknown): id is string {
  if (typeof id !== 'string') return false;
  const s = id.trim();
  if (!s.startsWith('cus_')) return false;
  if (s.toUpperCase().includes('REPLACE')) return false;
  return true;
}

function discountIsValidForApply(data: {
  validUntil: admin.firestore.Timestamp;
  usedCount: number;
  usageLimit: number;
}): boolean {
  const now = new Date();
  return data.validUntil.toDate() > now && data.usedCount < data.usageLimit;
}

function discountAppliesToAddonType(
  appliesToAddons: unknown,
  addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics',
): boolean {
  if (appliesToAddons === 'all') return true;
  if (Array.isArray(appliesToAddons)) {
    return appliesToAddons.includes(addonType);
  }
  return false;
}

function requirePlanPriceId(plan: 'pro' | 'premium' | 'vip'): string {
  const id = getStripePriceIds()[plan];
  if (!id || id.includes('REPLACE_ME')) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Set STRIPE_PRICE_${plan.toUpperCase()} in .env to a valid price_ ID and restart the emulator.`,
    );
  }
  if (id.startsWith('prod_')) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `STRIPE_PRICE_${plan.toUpperCase()} is a Product ID (prod_), use the Price ID (price_) instead.`,
    );
  }
  if (!/^price_[a-zA-Z0-9]+$/.test(id)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `STRIPE_PRICE_${plan.toUpperCase()} must be a Stripe Price ID (price_xxxx). Fix .env and restart.`,
    );
  }
  return id;
}

function requireAddonPriceId(addonType: string, raw: string | undefined): string {
  if (!raw || raw.includes('REPLACE_ME')) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Set the Stripe price for add-on "${addonType}" in .env (STRIPE_PRICE_EXTRA_*) and restart.`,
    );
  }
  if (raw.startsWith('prod_')) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Add-on "${addonType}" uses a Product ID (prod_), use the Price ID (price_) instead.`,
    );
  }
  if (!/^price_[a-zA-Z0-9]+$/.test(raw)) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Add-on price for "${addonType}" must be a Stripe Price ID (price_). Fix .env and restart.`,
    );
  }
  return raw;
}

async function ensureStripeCouponForDiscount(discountDocId: string, percentOff: number): Promise<string> {
  try {
    await stripe.coupons.retrieve(discountDocId);
    return discountDocId;
  } catch (err: unknown) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? (err as { code?: string }).code : undefined;
    if (code !== 'resource_missing') {
      throw err;
    }
    await stripe.coupons.create({
      id: discountDocId,
      percent_off: percentOff,
      duration: 'once',
    });
    return discountDocId;
  }
}

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

  if (isLiveStripeCustomerId(sub?.stripeCustomerId)) {
    customerId = sub.stripeCustomerId;
  } else {
    const clinicDoc = await db.collection('clinics').doc(clinicId).get();
    const clinic = clinicDoc.data();
    const customer = await runStripeCall(() =>
      stripe.customers.create({
        email: user.email,
        name: clinic?.name,
        metadata: { clinicId },
      }),
    );
    customerId = customer.id;
  }

  let stripeCouponId: string | undefined;
  let discountDocId: string | undefined;
  if (discountCode) {
    const discountSnap = await db
      .collection('discounts')
      .where('code', '==', discountCode)
      .limit(1)
      .get();
    if (discountSnap.empty) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid or expired discount code');
    }
    const discountDoc = discountSnap.docs[0];
    discountDocId = discountDoc.id;
    const d = discountDoc.data();
    const validUntil = d.validUntil as admin.firestore.Timestamp | undefined;
    const usedCount = typeof d.usedCount === 'number' ? d.usedCount : 0;
    const usageLimit = typeof d.usageLimit === 'number' ? d.usageLimit : 0;
    const percentOff = typeof d.percentOff === 'number' ? d.percentOff : 0;
    const appliesToBase = d.appliesToBase === true;
    if (!validUntil || !discountIsValidForApply({ validUntil, usedCount, usageLimit })) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid or expired discount code');
    }
    if (!appliesToBase) {
      throw new functions.https.HttpsError('invalid-argument', 'This discount does not apply to base plans');
    }
    stripeCouponId = await ensureStripeCouponForDiscount(discountDoc.id, percentOff);
  }

  const planPriceId = requirePlanPriceId(plan);
  const { success_url, cancel_url } = stripeCheckoutReturnUrls();
  const session = await runStripeCall(() =>
    stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: planPriceId, quantity: 1 }],
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      metadata: { clinicId, plan, ...(discountDocId ? { discountDocId } : {}) },
      success_url,
      cancel_url,
    }),
  );
  return { sessionId: session.id, url: session.url };
});

export const purchaseAddon = functions.https.onCall(async (request) => {
  if (!request.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');

  const { clinicId, addonType, discountCode } = request.data as {
    clinicId: string;
    addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics';
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
  if (!sub?.stripeCustomerId || sub.status !== 'active' || !sub.stripeSubscriptionId) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'No active subscription — add-ons require an active base plan',
    );
  }
  const customerId = sub.stripeCustomerId as string;

  const PRICE_IDS = getStripePriceIds();
  const rawAddonPrice = PRICE_IDS[addonType];
  if (!rawAddonPrice) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown add-on type');
  }
  const priceId = requireAddonPriceId(addonType, rawAddonPrice);

  let stripeCouponId: string | undefined;
  let discountDocId: string | undefined;
  if (discountCode) {
    const discountSnap = await db
      .collection('discounts')
      .where('code', '==', discountCode)
      .limit(1)
      .get();
    if (discountSnap.empty) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid or expired discount code');
    }
    const discountDoc = discountSnap.docs[0];
    discountDocId = discountDoc.id;
    const d = discountDoc.data();
    const validUntil = d.validUntil as admin.firestore.Timestamp | undefined;
    const usedCount = typeof d.usedCount === 'number' ? d.usedCount : 0;
    const usageLimit = typeof d.usageLimit === 'number' ? d.usageLimit : 0;
    const percentOff = typeof d.percentOff === 'number' ? d.percentOff : 0;
    if (!validUntil || !discountIsValidForApply({ validUntil, usedCount, usageLimit })) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid or expired discount code');
    }
    if (!discountAppliesToAddonType(d.appliesToAddons, addonType)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid or expired discount code');
    }
    stripeCouponId = await ensureStripeCouponForDiscount(discountDoc.id, percentOff);
  }

  const { success_url, cancel_url } = stripeCheckoutReturnUrls();
  const session = await runStripeCall(() =>
    stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      metadata: { clinicId, addonType, ...(discountDocId ? { discountDocId } : {}) },
      success_url,
      cancel_url,
    }),
  );

  return { sessionId: session.id, url: session.url };
});

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
