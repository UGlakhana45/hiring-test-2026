import * as functions from 'firebase-functions';

/** Wraps Stripe API calls — maps failures to callable-friendly HttpsError. */
export async function runStripeCall<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string } | Error | null;
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code?: string }).code) : '';
    const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);

    if (/no such customer/i.test(message) || (code === 'resource_missing' && /customer/i.test(message))) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Stripe customer not found. Re-seed or clear stripeCustomerId in Firestore, then retry.',
      );
    }

    if (code === 'resource_missing' || /no such price/i.test(message)) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Stripe price not found. Set STRIPE_PRICE_* in .env to valid Price IDs (price_…) and restart the emulator.',
      );
    }

    const safe = (message || 'Stripe request failed').replace(/\s+/g, ' ').trim().slice(0, 450);
    throw new functions.https.HttpsError('failed-precondition', safe);
  }
}
