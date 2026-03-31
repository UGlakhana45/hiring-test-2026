import React from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import type { FeatureId } from '@/config/features';

type Props = {
  feature: FeatureId;
  fallback?: React.ReactNode;
  children: React.ReactNode;
};
export function RequireFeature({ feature, fallback = null, children }: Props) {
  const { hasFeature } = usePermissions();
  if (!hasFeature(feature)) return <>{fallback}</>;
  return <>{children}</>;
}
