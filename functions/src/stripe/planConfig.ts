// Server-side plan config — keep in sync with src/types/subscription.ts
// Duplicated here to avoid importing client-side code into Cloud Functions.
import { CLAIM_SEAT_LIMIT_SENTINEL } from '../types/authClaims';

export const PLAN_CONFIG_SERVER = {
  free:    { price: 0,   seats: 1,         label: 'Free' },
  pro:     { price: 99,  seats: 5,         label: 'Pro' },
  premium: { price: 249, seats: 15,        label: 'Premium' },
  vip:     { price: 499, seats: Infinity,  label: 'VIP' },
} as const;

export const ADDON_SEATS_BONUS = 5; // Extra Seats Pack adds 5 seats per purchase

/** CHF / month — keep in sync with `ADDON_CONFIG` in `src/types/subscription.ts` */
export const ADDON_PRICE_SERVER: Record<
  'extra_storage' | 'extra_seats' | 'advanced_analytics',
  number
> = {
  extra_storage: 19,
  extra_seats: 49,
  advanced_analytics: 79,
};

export type PlanKey = keyof typeof PLAN_CONFIG_SERVER;

export function planSeatsForClaims(plan: PlanKey): number {
  const s = PLAN_CONFIG_SERVER[plan].seats;
  return s === Infinity ? CLAIM_SEAT_LIMIT_SENTINEL : s;
}
