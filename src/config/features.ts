import type { Plan, AddonType } from '@/types/subscription';

export type FeatureId =
  | 'pro_analytics'
  | 'extra_storage'
  | 'advanced_reporting'
  | 'unlimited_appointments';

export type FeatureRequirement = {
  minPlan?: Plan;
  addon?: AddonType;
};

export const FEATURES: Record<FeatureId, FeatureRequirement> = {
  pro_analytics:          { addon: 'advanced_analytics' },
  extra_storage:          { addon: 'extra_storage' },
  advanced_reporting:     { minPlan: 'premium' },
  unlimited_appointments: { minPlan: 'pro' },
};
