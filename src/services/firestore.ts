import firestore from "@react-native-firebase/firestore";
import type { Clinic } from "@/types/clinic";
import type { User } from "@/types/user";
import type { Subscription } from "@/types/subscription";
import type { Appointment } from "@/types/appointment";
import type { Addon } from "@/types/subscription";
import type { Discount } from "@/types/discount";

// --- Clinics ---

export function subscribeToClinic(
  clinicId: string,
  onUpdate: (clinic: Clinic | null) => void,
): () => void {
  return firestore()
    .collection("clinics")
    .doc(clinicId)
    .onSnapshot((snap) => {
      if (!snap) {
        onUpdate(null);
        return;
      }
      if (snap.exists) {
        const data = snap.data();
        if (data) onUpdate({ id: snap.id, ...data } as Clinic);
        else onUpdate(null);
      } else {
        onUpdate(null);
      }
    });
}

// --- Users ---

export async function getUser(userId: string): Promise<User | null> {
  const snap = await firestore().collection("users").doc(userId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as User;
}

export async function getClinicMembers(clinicId: string): Promise<User[]> {
  const snap = await firestore()
    .collection("users")
    .where("clinicId", "==", clinicId)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as User);
}

// --- Subscriptions ---

export function subscribeToSubscription(
  clinicId: string,
  onUpdate: (sub: Subscription | null) => void,
): () => void {
  return firestore()
    .collection("subscriptions")
    .doc(clinicId)
    .onSnapshot((snap) => {
      if (!snap) {
        onUpdate(null);
        return;
      }
      const data = snap.data();
      if (snap.exists && data) {
        onUpdate({ clinicId, ...data } as Subscription);
      } else {
        onUpdate(null);
      }
    });
}

// --- Appointments ---

export function subscribeToClinicAppointments(
  clinicId: string,
  onUpdate: (appointments: Appointment[]) => void,
): () => void {
  return firestore()
    .collection("appointments")
    .where("clinicId", "==", clinicId)
    .orderBy("datetime", "asc")
    .onSnapshot((snap) => {
      if (!snap?.docs) {
        onUpdate([]);
        return;
      }
      const appointments = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Appointment,
      );
      onUpdate(appointments);
    });
}

export function subscribeToPatientAppointments(
  patientId: string,
  onUpdate: (appointments: Appointment[]) => void,
): () => void {
  return firestore()
    .collection("appointments")
    .where("patientId", "==", patientId)
    .orderBy("datetime", "asc")
    .onSnapshot((snap) => {
      if (!snap?.docs) {
        onUpdate([]);
        return;
      }
      const appointments = snap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as Appointment,
      );
      onUpdate(appointments);
    });
}

// --- Add-ons ---

export async function getClinicAddons(clinicId: string): Promise<Addon[]> {
  const snap = await firestore()
    .collection("addons")
    .doc(clinicId)
    .collection("items")
    .where("active", "==", true)
    .get();
  return snap.docs.map((d) => ({ id: d.id, clinicId, ...d.data() }) as Addon);
}

// --- Discounts ---

export async function getClinicDiscounts(
  clinicId: string,
): Promise<Discount[]> {
  try {
    // Fetch discounts referenced by the clinic's activeDiscounts array
    const clinicSnap = await firestore()
      .collection("clinics")
      .doc(clinicId)
      .get();
    const clinic = clinicSnap.data() as Clinic | undefined;
    if (!clinic?.activeDiscounts?.length) return [];

    const discountDocs = await Promise.all(
      clinic.activeDiscounts.map((code) =>
        firestore()
          .collection("discounts")
          .where("code", "==", code)
          .limit(1)
          .get(),
      ),
    );

    return discountDocs
      .flatMap((snap) => snap.docs)
      .map((d) => ({ id: d.id, ...d.data() }) as Discount);
  } catch {
    return [];
  }
}
