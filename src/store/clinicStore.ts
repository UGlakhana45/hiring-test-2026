import { create } from 'zustand';
import { subscribeToClinic, subscribeToSubscription } from '@/services/firestore';
import type { Clinic } from '@/types/clinic';
import type { Subscription } from '@/types/subscription';

type ClinicState = {
  clinic: Clinic | null;
  subscription: Subscription | null;
  setClinic: (clinic: Clinic) => void;
  setSubscription: (sub: Subscription) => void;
  startListeners: (clinicId: string) => () => void;
};

export const useClinicStore = create<ClinicState>((set) => ({
  clinic: null,
  subscription: null,

  setClinic: (clinic) => set({ clinic }),
  setSubscription: (sub) => set({ subscription: sub }),

  startListeners: (clinicId) => {
    const unsubClinic = subscribeToClinic(clinicId, (clinic) =>
      set({ clinic }),
    );
    const unsubSub = subscribeToSubscription(clinicId, (sub) =>
      set({ subscription: sub }),
    );
    // Return cleanup function
    return () => {
      unsubClinic();
      unsubSub();
    };
  },
}));
