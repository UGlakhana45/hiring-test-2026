import { useAuthStore } from '@/store/authStore';

export function useAuth() {
  const { firebaseUser, userProfile, isLoading } = useAuthStore();
  return {
    user: firebaseUser,
    profile: userProfile,
    isLoading,
    isAuthenticated: firebaseUser !== null,
    isOwner: userProfile?.role === 'owner',
    isStaff: userProfile?.role === 'staff' || userProfile?.role === 'owner',
    isPatient: userProfile?.role === 'patient',
  };
}
