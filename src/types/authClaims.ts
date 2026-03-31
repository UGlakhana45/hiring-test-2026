// Keep in sync with functions/src/types/authClaims.ts

import type { AddonType, Plan } from '@/types/subscription';

export const CLAIM_SEAT_LIMIT_SENTINEL = 999_999; // VIP sentinel (JSON can't encode Infinity)

export type ClaimRole = 'admin' | 'member' | 'patient';

export type AppCustomClaims = {
  clinicId: string | null;
  planId: Plan;
  claimRole: ClaimRole;
  seatLimit: number;
  activeAddons: AddonType[];
};

const PLAN_ORDER: Plan[] = ['free', 'pro', 'premium', 'vip'];

export function planTier(plan: Plan): number {
  return PLAN_ORDER.indexOf(plan);
}

export function parseAppCustomClaims(raw: Record<string, unknown>): AppCustomClaims {
  const planId = (raw.planId as Plan) ?? 'free';
  const claimRole = (raw.claimRole as ClaimRole) ?? 'patient';
  const clinicId = typeof raw.clinicId === 'string' ? raw.clinicId : null;
  const seatLimit = typeof raw.seatLimit === 'number' ? raw.seatLimit : 0;
  const addonsRaw = raw.activeAddons;
  const activeAddons: AddonType[] = Array.isArray(addonsRaw)
    ? (addonsRaw.filter((x) => typeof x === 'string') as AddonType[])
    : [];

  return {
    clinicId,
    planId: PLAN_ORDER.includes(planId) ? planId : 'free',
    claimRole,
    seatLimit,
    activeAddons,
  };
}
