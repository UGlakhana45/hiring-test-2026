// Stripe service — client-side helpers.
// Actual Stripe operations happen in Cloud Functions (functions/src/stripe/).
// The client calls Firebase Functions, which call Stripe server-side.
// This keeps the Stripe secret key off the device.

import functions from '@react-native-firebase/functions';

const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === 'true';
const EMULATOR_HOST = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';

if (USE_EMULATOR) {
  functions().useEmulator(EMULATOR_HOST, 5001);
}

export type CreateCheckoutParams = {
  clinicId: string;
  plan: 'pro' | 'premium' | 'vip';
  discountCode?: string;
};

export type CheckoutResult = {
  sessionId: string;
  url: string;
};

export async function createCheckoutSession(
  params: CreateCheckoutParams,
): Promise<CheckoutResult> {
  const callable = functions().httpsCallable('createCheckoutSession');
  const result = await callable(params);
  return result.data as CheckoutResult;
}

export type AddonPurchaseParams = {
  clinicId: string;
  addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics';
  discountCode?: string;
};

export async function purchaseAddon(
  params: AddonPurchaseParams,
): Promise<void> {
  const callable = functions().httpsCallable('purchaseAddon');
  await callable(params);
}

export type DowngradeParams = {
  clinicId: string;
  targetPlan: 'free' | 'pro' | 'premium';
};

export type DowngradeResult = {
  strategy: 'queued' | 'seat_conflict';
  conflictingSeats?: number;
  activeSeats?: number;
  seatLimit?: number;
  effectiveDate?: string; // ISO date when queued
};

export async function initiateDowngrade(
  params: DowngradeParams,
): Promise<DowngradeResult> {
  const callable = functions().httpsCallable('initiateDowngrade');
  const result = await callable(params);
  return result.data as DowngradeResult;
}
