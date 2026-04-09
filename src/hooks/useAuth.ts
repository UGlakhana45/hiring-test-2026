import { useMemo } from 'react';
import firestore from '@react-native-firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { User, UserRole } from '@/types/user';
import type { ClaimRole } from '@/types/authClaims';

function claimRoleToAppRole(claim: ClaimRole | undefined): UserRole | null {
  if (claim === 'admin') return 'owner';
  if (claim === 'member') return 'staff';
  if (claim === 'patient') return 'patient';
  return null;
}

/** Derive UI state from Auth claims when the Firestore user doc is missing. */
function mergeProfile(
  firebaseUser: import('@react-native-firebase/auth').FirebaseAuthTypes.User | null,
  userProfile: User | null,
  claimRole: ClaimRole | undefined,
  clinicIdFromClaims: string | null | undefined,
): User | null {
  if (userProfile) return userProfile;
  if (!firebaseUser) return null;

  const roleFromClaims = claimRoleToAppRole(claimRole);
  const createdAt =
    firebaseUser.metadata?.creationTime != null
      ? firestore.Timestamp.fromDate(new Date(firebaseUser.metadata.creationTime))
      : firestore.Timestamp.fromMillis(0);

  return {
    id: firebaseUser.uid,
    displayName: firebaseUser.displayName?.trim() || '—',
    email: firebaseUser.email?.trim() || '',
    role: roleFromClaims ?? 'patient',
    clinicId: typeof clinicIdFromClaims === 'string' ? clinicIdFromClaims : null,
    createdAt,
  };
}

export function useAuth() {
  const { firebaseUser, userProfile, idTokenClaims, isLoading } = useAuthStore();

  const profile = useMemo(
    () =>
      mergeProfile(firebaseUser, userProfile, idTokenClaims?.claimRole, idTokenClaims?.clinicId),
    [firebaseUser, userProfile, idTokenClaims?.claimRole, idTokenClaims?.clinicId],
  );

  return {
    user: firebaseUser,
    profile,
    firestoreProfile: userProfile,
    isLoading,
    isAuthenticated: firebaseUser !== null,
    isOwner: profile?.role === 'owner',
    isStaff: profile?.role === 'staff' || profile?.role === 'owner',
    isPatient: profile?.role === 'patient',
  };
}
