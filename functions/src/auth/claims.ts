import * as admin from 'firebase-admin';
import type { AppCustomClaims, AddonKey, ClaimRole, PlanId } from '../types/authClaims';
import { CLAIM_SEAT_LIMIT_SENTINEL } from '../types/authClaims';
import { ADDON_SEATS_BONUS, planSeatsForClaims, type PlanKey } from '../stripe/planConfig';

function firestoreRoleToClaimRole(role: string | undefined): ClaimRole {
  if (role === 'owner') return 'admin';
  if (role === 'staff') return 'member';
  return 'patient';
}

export async function loadActiveAddonKeys(
  db: admin.firestore.Firestore,
  clinicId: string,
): Promise<AddonKey[]> {
  const snap = await db
    .collection('addons')
    .doc(clinicId)
    .collection('items')
    .where('active', '==', true)
    .get();

  const keys = new Set<AddonKey>();
  for (const doc of snap.docs) {
    const t = doc.data()?.type as string | undefined;
    if (t === 'extra_storage' || t === 'extra_seats' || t === 'advanced_analytics') {
      keys.add(t);
    }
  }
  return Array.from(keys);
}

/** Derives seat limit from Firestore (effective plan + add-on packs). */
export async function computeSeatLimitForClinic(
  db: admin.firestore.Firestore,
  clinicId: string,
): Promise<{ seatLimit: number; planId: PlanId; activeAddons: AddonKey[] }> {
  const subSnap = await db.collection('subscriptions').doc(clinicId).get();
  const sub = subSnap.data();
  const planId = (sub?.plan as PlanKey | undefined) ?? 'free';
  const safePlan: PlanKey =
    planId === 'free' || planId === 'pro' || planId === 'premium' || planId === 'vip'
      ? planId
      : 'free';

  const itemsSnap = await db
    .collection('addons')
    .doc(clinicId)
    .collection('items')
    .where('active', '==', true)
    .get();

  const keys = new Set<AddonKey>();
  let extraSeatPacks = 0;
  for (const doc of itemsSnap.docs) {
    const t = doc.data()?.type as string | undefined;
    if (t === 'extra_storage' || t === 'extra_seats' || t === 'advanced_analytics') {
      keys.add(t);
    }
    if (t === 'extra_seats') extraSeatPacks += 1;
  }
  const activeAddons = Array.from(keys);
  const base = planSeatsForClaims(safePlan);
  const bonus = extraSeatPacks * ADDON_SEATS_BONUS;
  const seatLimit = safePlan === 'vip' ? CLAIM_SEAT_LIMIT_SENTINEL : base + bonus;

  return { seatLimit, planId: safePlan as PlanId, activeAddons };
}

export function buildClaimsPayload(input: {
  clinicId: string | null;
  planId: PlanId;
  claimRole: ClaimRole;
  seatLimit: number;
  activeAddons: AddonKey[];
}): AppCustomClaims {
  return {
    clinicId: input.clinicId,
    planId: input.planId,
    claimRole: input.claimRole,
    seatLimit: input.seatLimit,
    activeAddons: input.activeAddons,
  };
}

export async function countActiveSeats(
  db: admin.firestore.Firestore,
  clinicId: string,
): Promise<number> {
  const snap = await db
    .collection('seats')
    .doc(clinicId)
    .collection('members')
    .where('active', '==', true)
    .get();
  return snap.size;
}

/** Pushes up-to-date claims to every user in the clinic. */
export async function syncCustomClaimsForAllClinicMembers(
  db: admin.firestore.Firestore,
  clinicId: string,
): Promise<void> {
  const { seatLimit, planId, activeAddons } = await computeSeatLimitForClinic(db, clinicId);

  const usersSnap = await db.collection('users').where('clinicId', '==', clinicId).get();

  const tasks: Promise<void>[] = [];
  for (const doc of usersSnap.docs) {
    const role = doc.data()?.role as string | undefined;
    const claimRole = firestoreRoleToClaimRole(role);
    const payload = buildClaimsPayload({
      clinicId,
      planId,
      claimRole,
      seatLimit,
      activeAddons,
    });
    tasks.push(admin.auth().setCustomUserClaims(doc.id, payload as Record<string, unknown>));
  }

  await Promise.all(tasks);
}
