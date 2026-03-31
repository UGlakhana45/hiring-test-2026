import type { PlanId } from '../types/authClaims';
import type { PlanKey } from './planConfig';

export function getStripePriceIds(): Record<string, string> {
  return {
    pro: process.env.STRIPE_PRICE_PRO ?? 'price_PRO_REPLACE_ME',
    premium: process.env.STRIPE_PRICE_PREMIUM ?? 'price_PREMIUM_REPLACE_ME',
    vip: process.env.STRIPE_PRICE_VIP ?? 'price_VIP_REPLACE_ME',
    extra_storage: process.env.STRIPE_PRICE_EXTRA_STORAGE ?? 'price_STORAGE_REPLACE_ME',
    extra_seats: process.env.STRIPE_PRICE_EXTRA_SEATS ?? 'price_SEATS_REPLACE_ME',
    advanced_analytics:
      process.env.STRIPE_PRICE_ADVANCED_ANALYTICS ?? 'price_ANALYTICS_REPLACE_ME',
  };
}

const PAID_PLANS: PlanKey[] = ['pro', 'premium', 'vip'];

export function priceIdToPlan(priceId: string): PlanId | null {
  const ids = getStripePriceIds();
  for (const p of PAID_PLANS) {
    if (ids[p] === priceId) return p;
  }
  return null;
}

export function primaryPlanFromStripeItems(
  items: { data: Array<{ price?: { id?: string } | null }> },
): PlanId | null {
  for (const item of items.data) {
    const pid = item.price?.id;
    if (!pid) continue;
    const plan = priceIdToPlan(pid);
    if (plan) return plan;
  }
  return null;
}
