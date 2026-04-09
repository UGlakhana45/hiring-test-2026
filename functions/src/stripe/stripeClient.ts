import Stripe from 'stripe';

const secret = process.env.STRIPE_SECRET_KEY?.trim();

if (!secret) {
  console.warn('[stripe] STRIPE_SECRET_KEY unset — checkout/webhooks will fail.');
}

export const stripe = new Stripe(secret ?? '', {
  apiVersion: '2025-02-24.acacia',
});
