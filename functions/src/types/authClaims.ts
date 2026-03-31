// Keep in sync with src/types/authClaims.ts

export type PlanId = 'free' | 'pro' | 'premium' | 'vip';

export type AddonKey = 'extra_storage' | 'extra_seats' | 'advanced_analytics';

export type ClaimRole = 'admin' | 'member' | 'patient';

export const CLAIM_SEAT_LIMIT_SENTINEL = 999_999; // VIP sentinel (JSON can't encode Infinity)

export type AppCustomClaims = {
  clinicId: string | null;
  planId: PlanId;
  claimRole: ClaimRole;
  seatLimit: number;
  activeAddons: AddonKey[];
};

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'premium', 'vip'];

export function planTier(plan: PlanId): number {
  return PLAN_ORDER.indexOf(plan);
}
