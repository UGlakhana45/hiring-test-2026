/**
 * Seed script — populates the Firebase Emulator with realistic test data.
 * Run with: npm run seed
 *
 * Uses the Admin SDK so writes succeed regardless of Firestore rules (subscriptions/add-ons/discounts
 * are server-only in rules). Auth users are created against the Auth emulator.
 */

import * as admin from 'firebase-admin';
import { syncCustomClaimsForAllClinicMembers } from '../functions/src/auth/claims';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = admin.initializeApp({ projectId: 'clinic-test-local' });
const db = admin.firestore(app);
const auth = admin.auth(app);

const CLINIC_ID = 'clinic_alpine_001';

const SEED_EMAILS = [
  'sophie.owner@test.com',
  'anna.staff@test.com',
  'marc.staff@test.com',
  'patient1@test.com',
  'patient2@test.com',
];

/** Remove prior seed so `npm run seed` can be re-run safely. */
async function resetPriorSeed(): Promise<void> {
  for (const email of SEED_EMAILS) {
    try {
      const user = await auth.getUserByEmail(email);
      await auth.deleteUser(user.uid);
    } catch {
      // not registered
    }
  }

  const userSnaps = await Promise.all(
    SEED_EMAILS.map((email) => db.collection('users').where('email', '==', email).get()),
  );
  for (const snap of userSnaps) {
    for (const d of snap.docs) {
      await d.ref.delete();
    }
  }

  const appointmentIds = ['appt_001', 'appt_002', 'appt_003', 'appt_004'];
  for (const id of appointmentIds) {
    await db.collection('appointments').doc(id).delete().catch(() => undefined);
  }

  await db.collection('discounts').doc('discount_welcome_001').delete().catch(() => undefined);
  await db.collection('discounts').doc('discount_addons_exp').delete().catch(() => undefined);

  const members = await db.collection('seats').doc(CLINIC_ID).collection('members').get();
  for (const d of members.docs) {
    await d.ref.delete();
  }

  await db
    .collection('addons')
    .doc(CLINIC_ID)
    .collection('items')
    .doc('addon_storage_001')
    .delete()
    .catch(() => undefined);

  await db.collection('subscriptions').doc(CLINIC_ID).delete().catch(() => undefined);
  await db.collection('clinics').doc(CLINIC_ID).delete().catch(() => undefined);
}

async function createUser(
  email: string,
  password: string,
  displayName: string,
  role: 'owner' | 'staff' | 'patient',
  clinicId: string | null,
): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.deleteUser(existing.uid);
  } catch {
    // no prior user
  }

  const user = await auth.createUser({
    email,
    password,
    displayName,
  });

  await db.collection('users').doc(user.uid).set({
    displayName,
    email,
    role,
    clinicId,
    createdAt: admin.firestore.Timestamp.now(),
  });

  console.log(`  ✓ Created ${role}: ${email} (uid: ${user.uid})`);
  return user.uid;
}

async function seed() {
  console.log('Seeding Firebase Emulator...\n');

  console.log('Clearing any previous seed data...\n');
  await resetPriorSeed();

  console.log('Creating users...');
  const ownerId = await createUser('sophie.owner@test.com', 'test1234', 'Sophie Moreau', 'owner', CLINIC_ID);
  const staff1Id = await createUser('anna.staff@test.com', 'test1234', 'Anna Kellenberger', 'staff', CLINIC_ID);
  const staff2Id = await createUser('marc.staff@test.com', 'test1234', 'Marc Dubois', 'staff', CLINIC_ID);
  const patient1Id = await createUser('patient1@test.com', 'test1234', 'Léa Fontaine', 'patient', CLINIC_ID);
  const patient2Id = await createUser('patient2@test.com', 'test1234', 'Thomas Müller', 'patient', CLINIC_ID);

  console.log('\nCreating clinic...');
  await db.collection('clinics').doc(CLINIC_ID).set({
    name: 'Alpine Aesthetics Clinic',
    ownerId,
    plan: 'pro',
    seats: { used: 2, max: 5 },
    addons: ['addon_storage_001'],
    activeDiscounts: ['WELCOME20', 'ADDONS15'],
    createdAt: admin.firestore.Timestamp.now(),
  });
  console.log('  ✓ Clinic: Alpine Aesthetics Clinic');

  console.log('\nCreating subscription...');
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() + 18);

  await db.collection('subscriptions').doc(CLINIC_ID).set({
    clinicId: CLINIC_ID,
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: admin.firestore.Timestamp.fromDate(periodEnd),
    // Omit fake Stripe ids — Checkout creates a real cus_… on first upgrade (see createCheckoutSession).
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    gracePeriodEnd: null,
  });
  console.log('  ✓ Subscription: Pro, active, 18 days remaining');

  console.log('\nCreating add-on...');
  await db
    .collection('addons')
    .doc(CLINIC_ID)
    .collection('items')
    .doc('addon_storage_001')
    .set({
      clinicId: CLINIC_ID,
      type: 'extra_storage',
      price: 19,
      active: true,
      stripeItemId: 'si_test_REPLACE_ME',
    });
  console.log('  ✓ Add-on: Extra Storage (CHF 19/mo)');

  console.log('\nCreating discounts...');
  const validUntil = new Date();
  validUntil.setFullYear(validUntil.getFullYear() + 1);
  await db.collection('discounts').doc('discount_welcome_001').set({
    code: 'WELCOME20',
    percentOff: 20,
    appliesToBase: true,
    appliesToAddons: [],
    validUntil: admin.firestore.Timestamp.fromDate(validUntil),
    usageLimit: 100,
    usedCount: 1,
  });
  console.log('  ✓ Discount: WELCOME20 — 20% off base plan (valid 1 year)');

  const expiredDate = new Date();
  expiredDate.setDate(expiredDate.getDate() - 7);
  await db.collection('discounts').doc('discount_addons_exp').set({
    code: 'ADDONS15',
    percentOff: 15,
    appliesToBase: false,
    appliesToAddons: 'all',
    validUntil: admin.firestore.Timestamp.fromDate(expiredDate),
    usageLimit: 50,
    usedCount: 3,
  });
  console.log('  ✓ Discount: ADDONS15 — 15% off all add-ons (EXPIRED — for Scenario 5)');

  console.log('\nCreating seats...');
  await db.collection('seats').doc(CLINIC_ID).collection('members').doc(ownerId).set({
    role: 'owner',
    joinedAt: admin.firestore.Timestamp.now(),
    active: true,
  });
  await db.collection('seats').doc(CLINIC_ID).collection('members').doc(staff1Id).set({
    role: 'staff',
    joinedAt: admin.firestore.Timestamp.now(),
    active: true,
  });
  await db.collection('seats').doc(CLINIC_ID).collection('members').doc(staff2Id).set({
    role: 'staff',
    joinedAt: admin.firestore.Timestamp.now(),
    active: true,
  });
  console.log('  ✓ Seats: 1 owner + 2 staff active');

  console.log('\nCreating appointments...');
  const makeDate = (daysFromNow: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    return admin.firestore.Timestamp.fromDate(d);
  };

  await db.collection('appointments').doc('appt_001').set({
    patientId: patient1Id,
    staffId: staff1Id,
    clinicId: CLINIC_ID,
    status: 'confirmed',
    datetime: makeDate(1, 10),
    notes: 'Initial consultation',
  });
  await db.collection('appointments').doc('appt_002').set({
    patientId: patient2Id,
    staffId: staff2Id,
    clinicId: CLINIC_ID,
    status: 'scheduled',
    datetime: makeDate(3, 14),
    notes: null,
  });
  await db.collection('appointments').doc('appt_003').set({
    patientId: patient1Id,
    staffId: staff1Id,
    clinicId: CLINIC_ID,
    status: 'completed',
    datetime: makeDate(-5, 9),
    notes: 'Follow-up after treatment',
  });
  await db.collection('appointments').doc('appt_004').set({
    patientId: patient2Id,
    staffId: staff1Id,
    clinicId: CLINIC_ID,
    status: 'canceled',
    datetime: makeDate(-2, 16),
    notes: null,
  });
  console.log('  ✓ Appointments: 4 created (confirmed, scheduled, completed, canceled)');

  console.log('\nSyncing Auth custom claims (role, clinicId, plan, seats)...');
  await syncCustomClaimsForAllClinicMembers(db, CLINIC_ID, auth);
  console.log('  ✓ Custom claims set for all users in clinic (force token refresh on next sign-in if needed)');

  console.log('\n✅ Seed complete!\n');
  console.log('Test accounts (password: test1234):');
  console.log('  Owner:    sophie.owner@test.com');
  console.log('  Staff:    anna.staff@test.com');
  console.log('  Staff:    marc.staff@test.com');
  console.log('  Patient:  patient1@test.com');
  console.log('  Patient:  patient2@test.com');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
