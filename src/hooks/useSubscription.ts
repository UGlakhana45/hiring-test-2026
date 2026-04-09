import { useClinicStore } from '@/store/clinicStore';
import type { Plan } from '@/types/subscription';
import { PLAN_CONFIG } from '@/types/subscription';

export function useSubscription() {
  const { clinic, subscription } = useClinicStore();

  const plan: Plan = subscription?.plan ?? 'free';
  const config = PLAN_CONFIG[plan];

  const seatsUsed = clinic?.seats.used ?? 0;
  const seatsMax = clinic?.seats.max ?? config.seats;
  const seatsAvailable = seatsMax === Infinity ? Infinity : seatsMax - seatsUsed;

  const gracePeriodEnd = subscription?.gracePeriodEnd ?? null;
  const gracePeriodEndsAt =
    gracePeriodEnd && typeof gracePeriodEnd.toDate === 'function'
      ? gracePeriodEnd.toDate().toLocaleString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  return {
    plan,
    status: subscription?.status ?? 'canceled',
    config,
    seatsUsed,
    seatsMax,
    seatsAvailable,
    isActive: subscription?.status === 'active',
    isGracePeriod: subscription?.status === 'grace_period',
    gracePeriodEnd,
    gracePeriodEndsAt,
    // True if clinic can add more staff
    canAddStaff: seatsAvailable > 0 && subscription?.status === 'active',
  };
}
