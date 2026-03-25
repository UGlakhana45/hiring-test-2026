import { useEffect } from 'react';
import { useClinicStore } from '@/store/clinicStore';
import { useAuth } from './useAuth';

export function useClinic() {
  const { profile } = useAuth();
  const { clinic, subscription, startListeners } = useClinicStore();

  useEffect(() => {
    if (!profile?.clinicId) return;
    const cleanup = startListeners(profile.clinicId);
    return cleanup;
  }, [profile?.clinicId]);

  return { clinic, subscription };
}
