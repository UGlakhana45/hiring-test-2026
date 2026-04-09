import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import type Stripe from 'stripe';
import { syncCustomClaimsForAllClinicMembers } from '../auth/claims';
import { primaryPlanFromStripeItems } from './priceIds';
import { ADDON_PRICE_SERVER, PLAN_CONFIG_SERVER, planSeatsForClaims } from './planConfig';
import { planTier, type PlanId } from '../types/authClaims';
import { stripe } from './stripeClient';

const GRACE_PERIOD_DAYS = 7;

function stripeTs(unix: number): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(new Date(unix * 1000));
}

export const handleStripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig!, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).send('Webhook Error');
    return;
  }

  const db = admin.firestore();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(db, session);
        break;
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(db, sub);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentSucceeded(db, invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(db, invoice);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(db, sub);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).send('Internal error');
  }
});

async function handleCheckoutCompleted(
  db: admin.firestore.Firestore,
  session: Stripe.Checkout.Session,
): Promise<void> {
  const clinicId = session.metadata?.clinicId;
  const addonType = session.metadata?.addonType;
  const discountDocId = session.metadata?.discountDocId;

  if (clinicId && addonType) {
    const allowed =
      addonType === 'extra_storage' ||
      addonType === 'extra_seats' ||
      addonType === 'advanced_analytics';
    if (!allowed) {
      throw new Error('Invalid addonType in session metadata');
    }
    const itemRef = db
      .collection('addons')
      .doc(clinicId)
      .collection('items')
      .doc(`checkout_${session.id}`);
    const price = ADDON_PRICE_SERVER[addonType];
    await itemRef.set({
      clinicId,
      type: addonType,
      price,
      active: true,
      stripeCheckoutSessionId: session.id,
    });
    await syncCustomClaimsForAllClinicMembers(db, clinicId);
    if (discountDocId) {
      await incrementDiscountUsedCount(db, discountDocId);
    }
    return;
  }

  const plan = session.metadata?.plan as PlanId | undefined;

  if (!clinicId || !plan) {
    throw new Error('Missing clinicId or plan in session metadata');
  }

  const planConfig = PLAN_CONFIG_SERVER[plan];

  let periodEnd = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  );
  if (typeof session.subscription === 'string') {
    try {
      const stripeSub = await stripe.subscriptions.retrieve(session.subscription);
      if (stripeSub.current_period_end) {
        periodEnd = stripeTs(stripeSub.current_period_end);
      }
    } catch {
      /* fall back to ~30d estimate */
    }
  }

  await db.runTransaction(async (tx) => {
    const subRef = db.collection('subscriptions').doc(clinicId);
    const clinicRef = db.collection('clinics').doc(clinicId);

    tx.set(subRef, {
      clinicId,
      plan,
      status: 'active',
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
      currentPeriodEnd: periodEnd,
      gracePeriodEnd: null,
      downgradeAt: null,
      scheduledPlan: null,
    }, { merge: true });

    tx.update(clinicRef, {
      plan,
      'seats.max': planConfig.seats,
    });
  });

  await syncCustomClaimsForAllClinicMembers(db, clinicId);

  if (discountDocId) {
    await incrementDiscountUsedCount(db, discountDocId);
  }
}

async function incrementDiscountUsedCount(
  db: admin.firestore.Firestore,
  discountDocId: string,
): Promise<void> {
  const ref = db.collection('discounts').doc(discountDocId);
  await ref.update({
    usedCount: admin.firestore.FieldValue.increment(1),
  });
}

async function handleSubscriptionUpdated(
  db: admin.firestore.Firestore,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const snap = await db
    .collection('subscriptions')
    .where('stripeSubscriptionId', '==', stripeSub.id)
    .limit(1)
    .get();

  if (snap.empty) {
    console.warn('No clinic found for subscription', stripeSub.id);
    return;
  }

  const subDoc = snap.docs[0];
  const clinicId = subDoc.id;
  const currentData = subDoc.data();
  const currentPlan = (currentData?.plan as PlanId) ?? 'free';

  const newPlan = primaryPlanFromStripeItems(stripeSub.items);
  const periodEnd = stripeTs(stripeSub.current_period_end);
  const now = new Date();

  const pendingDowngradeAt = currentData?.downgradeAt?.toDate?.() as Date | undefined;
  if (pendingDowngradeAt && pendingDowngradeAt <= now) {
    const scheduledPlan = (currentData?.scheduledPlan as PlanId) ?? newPlan ?? 'free';
    const targetConfig = PLAN_CONFIG_SERVER[scheduledPlan] ?? PLAN_CONFIG_SERVER.free;

    await db.runTransaction(async (tx) => {
      tx.update(subDoc.ref, {
        plan: scheduledPlan,
        status: 'active',
        currentPeriodEnd: periodEnd,
        downgradeAt: null,
        scheduledPlan: null,
      });
      tx.update(db.collection('clinics').doc(clinicId), {
        plan: scheduledPlan,
        'seats.max': targetConfig.seats,
      });
    });

    await syncCustomClaimsForAllClinicMembers(db, clinicId);
    return;
  }

  if (!newPlan) {
    console.warn('Could not determine plan from subscription items for', stripeSub.id);
    await subDoc.ref.update({ currentPeriodEnd: periodEnd });
    return;
  }

  const currentTier = planTier(currentPlan);
  const newTier = planTier(newPlan);

  if (newTier > currentTier) {
    const targetConfig = PLAN_CONFIG_SERVER[newPlan];
    await db.runTransaction(async (tx) => {
      tx.update(subDoc.ref, {
        plan: newPlan,
        status: 'active',
        currentPeriodEnd: periodEnd,
        downgradeAt: null,
        scheduledPlan: null,
      });
      tx.update(db.collection('clinics').doc(clinicId), {
        plan: newPlan,
        'seats.max': targetConfig.seats,
      });
    });
    await syncCustomClaimsForAllClinicMembers(db, clinicId);
  } else if (newTier < currentTier) {
    if (!currentData?.downgradeAt) {
      await subDoc.ref.update({
        downgradeAt: periodEnd,
        scheduledPlan: newPlan,
        currentPeriodEnd: periodEnd,
      });
    } else {
      await subDoc.ref.update({ currentPeriodEnd: periodEnd });
    }
  } else {
    await subDoc.ref.update({
      currentPeriodEnd: periodEnd,
      status: 'active',
    });
    await syncCustomClaimsForAllClinicMembers(db, clinicId);
  }
}

async function handlePaymentSucceeded(
  db: admin.firestore.Firestore,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.customer) return;

  const snap = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', invoice.customer)
    .limit(1)
    .get();

  if (snap.empty) return;

  const subDoc = snap.docs[0];
  const clinicId = subDoc.id;

  await subDoc.ref.update({
    status: 'active',
    gracePeriodEnd: null,
  });

  await syncCustomClaimsForAllClinicMembers(db, clinicId);
}

async function handlePaymentFailed(
  db: admin.firestore.Firestore,
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.customer) return;

  const snap = await db
    .collection('subscriptions')
    .where('stripeCustomerId', '==', invoice.customer)
    .limit(1)
    .get();

  if (snap.empty) return;

  const gracePeriodEnd = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
  );

  await snap.docs[0].ref.update({
    status: 'grace_period',
    gracePeriodEnd,
  });
}

async function handleSubscriptionDeleted(
  db: admin.firestore.Firestore,
  stripeSub: Stripe.Subscription,
): Promise<void> {
  const snap = await db
    .collection('subscriptions')
    .where('stripeSubscriptionId', '==', stripeSub.id)
    .limit(1)
    .get();

  if (snap.empty) return;

  const subDoc = snap.docs[0];
  const clinicId = subDoc.id;
  const freeConfig = PLAN_CONFIG_SERVER.free;

  await db.runTransaction(async (tx) => {
    tx.update(subDoc.ref, {
      plan: 'free',
      status: 'canceled',
      stripeSubscriptionId: null,
      gracePeriodEnd: null,
      downgradeAt: null,
      scheduledPlan: null,
    });
    tx.update(db.collection('clinics').doc(clinicId), {
      plan: 'free',
      'seats.max': freeConfig.seats,
    });
  });

  const seatsSnap = await db
    .collection('seats')
    .doc(clinicId)
    .collection('members')
    .where('active', '==', true)
    .get();

  const activeMembers = seatsSnap.docs;
  if (activeMembers.length > freeConfig.seats) {
    const toDeactivate = activeMembers
      .filter((d) => d.data()?.role !== 'owner')
      .slice(0, activeMembers.length - freeConfig.seats);

    for (const member of toDeactivate) {
      await admin.auth().setCustomUserClaims(member.id, {
        clinicId: null,
        planId: 'free',
        claimRole: 'patient',
        seatLimit: 0,
        activeAddons: [],
      });
      await admin.auth().revokeRefreshTokens(member.id);
    }

    const batch = db.batch();
    for (const member of toDeactivate) {
      batch.update(member.ref, { active: false });
      batch.update(db.collection('users').doc(member.id), {
        clinicId: null,
        role: 'patient',
      });
    }
    batch.update(db.collection('clinics').doc(clinicId), {
      'seats.used': admin.firestore.FieldValue.increment(-toDeactivate.length),
    });
    await batch.commit();
  }

  await syncCustomClaimsForAllClinicMembers(db, clinicId);
}
