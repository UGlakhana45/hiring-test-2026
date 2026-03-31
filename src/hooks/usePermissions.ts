import { useAuthStore } from '@/store/authStore';
import { FEATURES, type FeatureId } from '@/config/features';
import type { Plan, AddonType } from '@/types/subscription';
import { planTier } from '@/types/authClaims';

/** Permission helpers derived from decoded JWT claims. No Firestore reads. */
export function usePermissions() {
  const claims = useAuthStore((s) => s.idTokenClaims);

  function hasPlanAtLeast(minPlan: Plan): boolean {
    if (!claims) return false;
    return planTier(claims.planId) >= planTier(minPlan);
  }

  function hasAddon(addon: AddonType): boolean {
    return claims?.activeAddons.includes(addon) ?? false;
  }

  function hasFeature(featureId: FeatureId): boolean {
    const req = FEATURES[featureId];
    if (!req) return false;
    if (req.minPlan && !hasPlanAtLeast(req.minPlan)) return false;
    if (req.addon && !hasAddon(req.addon)) return false;
    return true;
  }

  return {
    claims,
    hasPlanAtLeast,
    hasAddon,
    hasFeature,
    isAdmin: claims?.claimRole === 'admin',
    isMember: claims?.claimRole === 'member',
    seatLimit: claims?.seatLimit ?? 0,
  };
}
