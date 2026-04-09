import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import type { User } from '@/types/user';

export async function signUp(
  email: string,
  password: string,
  displayName: string,
  role: 'owner' | 'patient' = 'patient',
): Promise<void> {
  const credential = await auth().createUserWithEmailAndPassword(email, password);
  await credential.user.updateProfile({ displayName });

  // Write user doc to Firestore
  const userData: Omit<User, 'id'> = {
    displayName,
    email,
    role,
    clinicId: null,
    createdAt: firestore.Timestamp.now(),
  };

  await firestore().collection('users').doc(credential.user.uid).set(userData);
}

export async function signIn(email: string, password: string): Promise<void> {
  await auth().signInWithEmailAndPassword(email, password);
}

export async function signOut(): Promise<void> {
  await auth().signOut();
}

// Force token refresh to pick up new custom claims (e.g., after role change)
// Call this after any server-side role update.
export async function refreshAuthToken(): Promise<void> {
  await auth().currentUser?.getIdToken(true);
}

// Session invalidation for removed staff runs in the `removeStaffMember` Cloud Function
// (refresh token revocation + cleared claims). Call that from the app — no separate client RPC.
export async function revokeUserSession(_userId: string): Promise<void> {
  void _userId;
}
