import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { countActiveSeats, computeSeatLimitForClinic } from './claims';

/** Checks if the clinic can add another seat. Recomputes limits from Firestore. */
export const validateSeatInvite = functions.https.onCall(async (request) => {
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
  }

  const { clinicId } = request.data as { clinicId: string };
  if (!clinicId || typeof clinicId !== 'string') {
    throw new functions.https.HttpsError('invalid-argument', 'clinicId is required');
  }

  const db = admin.firestore();
  const caller = await db.collection('users').doc(request.auth.uid).get();
  const callerData = caller.data();
  if (!callerData || callerData.role !== 'owner' || callerData.clinicId !== clinicId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only the clinic owner can validate seat invites',
    );
  }

  const subSnap = await db.collection('subscriptions').doc(clinicId).get();
  const status = subSnap.data()?.status as string | undefined;
  if (status !== 'active' && status !== 'trialing') {
    return {
      allowed: false,
      activeSeats: await countActiveSeats(db, clinicId),
      seatLimit: (await computeSeatLimitForClinic(db, clinicId)).seatLimit,
      reason: 'Subscription is not active; cannot add staff.',
    };
  }

  const activeSeats = await countActiveSeats(db, clinicId);
  const { seatLimit } = await computeSeatLimitForClinic(db, clinicId);
  const allowed = activeSeats < seatLimit;

  return {
    allowed,
    activeSeats,
    seatLimit,
    reason: allowed ? undefined : 'Seat limit reached for current plan and add-ons.',
  };
});
