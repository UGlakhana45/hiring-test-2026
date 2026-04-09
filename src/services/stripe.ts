import { Linking } from 'react-native';
import functions from '@react-native-firebase/functions';

/**
 * Call 1st-gen `onCall` functions via the native SDK (correct wire format + auth token).
 * Manual `fetch` to `:5001/...` often returns 404 / non-JSON because callable HTTP is not plain REST.
 */
async function callFirebaseFunction<T>(name: string, data: unknown): Promise<T> {
  const callable = functions().httpsCallable(name);
  const result = await callable(data);
  return (result?.data ?? result) as T;
}

function logCallableFailure(label: string, error: unknown): void {
  if (!__DEV__) return;
  const e = error as {
    code?: string;
    message?: string;
    details?: unknown;
    nativeErrorMessage?: string;
  };
  const line = [
    `code=${String(e.code ?? '')}`,
    `message=${String(e.message ?? '')}`,
    `details=${JSON.stringify(e.details ?? null)}`,
  ].join(' | ');
  // eslint-disable-next-line no-console
  console.error(`[${label}] callable failed ${line}`);
}

export function getHttpsCallableErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const o = error as {
      message?: string;
      code?: string;
      nativeErrorMessage?: string;
      details?: { message?: string };
    };
    const codeRaw = typeof o.code === 'string' ? o.code : '';
    const codeNorm = codeRaw.replace(/^functions\//, '');
    const msg =
      typeof o.nativeErrorMessage === 'string' && o.nativeErrorMessage.length > 0
        ? o.nativeErrorMessage
        : typeof o.message === 'string'
          ? o.message
          : '';

    if (
      codeNorm === 'not-found' ||
      /^not found$/i.test(msg.trim()) ||
      /^not found$/i.test(String(o.nativeErrorMessage ?? '').trim())
    ) {
      return 'Cloud Function not found. Run `npm run emulator` and wait for "All emulators ready", then retry.';
    }

    if (typeof o.nativeErrorMessage === 'string' && o.nativeErrorMessage.length > 0) {
      return o.nativeErrorMessage;
    }
    if (typeof o.message === 'string' && o.message.length > 0) {
      return o.message;
    }
    const d = o.details;
    if (d && typeof d === 'object' && typeof d.message === 'string' && d.message.length > 0) {
      return d.message;
    }
    if (codeRaw.length > 0) {
      return codeRaw.replace(/^functions\//, '').replace(/-/g, ' ');
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Something went wrong. Check that Metro and Cloud Functions are running.';
}

export async function openCheckoutUrl(url: string | null | undefined): Promise<void> {
  const u = typeof url === 'string' ? url.trim() : '';
  if (!u) {
    throw new Error('No checkout URL returned. Check Stripe keys and Cloud Function logs.');
  }
  await Linking.openURL(u);
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
  try {
    return await callFirebaseFunction<CheckoutResult>('createCheckoutSession', params);
  } catch (e) {
    logCallableFailure('createCheckoutSession', e);
    throw e;
  }
}

export type AddonPurchaseParams = {
  clinicId: string;
  addonType: 'extra_storage' | 'extra_seats' | 'advanced_analytics';
  discountCode?: string;
};

export async function purchaseAddon(
  params: AddonPurchaseParams,
): Promise<CheckoutResult> {
  try {
    return await callFirebaseFunction<CheckoutResult>('purchaseAddon', params);
  } catch (e) {
    logCallableFailure('purchaseAddon', e);
    throw e;
  }
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
  effectiveDate?: string;
};

export async function initiateDowngrade(
  params: DowngradeParams,
): Promise<DowngradeResult> {
  try {
    return await callFirebaseFunction<DowngradeResult>('initiateDowngrade', params);
  } catch (e) {
    logCallableFailure('initiateDowngrade', e);
    throw e;
  }
}

export async function removeStaffMember(params: {
  clinicId: string;
  targetUserId: string;
}): Promise<void> {
  await callFirebaseFunction<void>('removeStaffMember', params);
}

export type ValidateSeatInviteResult = {
  allowed: boolean;
  activeSeats?: number;
  seatLimit?: number;
  reason?: string;
};

export async function validateSeatInvite(
  clinicId: string,
): Promise<ValidateSeatInviteResult> {
  return callFirebaseFunction<ValidateSeatInviteResult>('validateSeatInvite', { clinicId });
}
