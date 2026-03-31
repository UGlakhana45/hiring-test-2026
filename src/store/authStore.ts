import { create } from 'zustand';
import auth from '@react-native-firebase/auth';
import { getUser } from '@/services/firestore';
import type { User } from '@/types/user';
import type { AppCustomClaims } from '@/types/authClaims';
import { parseAppCustomClaims } from '@/types/authClaims';

type AuthState = {
  firebaseUser: import('@react-native-firebase/auth').FirebaseAuthTypes.User | null;
  userProfile: User | null;
  idTokenClaims: AppCustomClaims | null;
  isLoading: boolean;
  setFirebaseUser: (user: import('@react-native-firebase/auth').FirebaseAuthTypes.User | null) => void;
  loadUserProfile: (uid: string) => Promise<void>;
  setIdTokenClaims: (claims: AppCustomClaims | null) => void;
  refreshIdToken: () => Promise<void>;
  reset: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  firebaseUser: null,
  userProfile: null,
  idTokenClaims: null,
  isLoading: true,

  setFirebaseUser: (user) => set({ firebaseUser: user }),

  loadUserProfile: async (uid) => {
    const profile = await getUser(uid);
    set({ userProfile: profile, isLoading: false });
  },

  setIdTokenClaims: (claims) => set({ idTokenClaims: claims }),

  refreshIdToken: async () => {
    const user = auth().currentUser;
    if (!user) return;
    await user.getIdToken(true);
    const tokenResult = await user.getIdTokenResult();
    set({
      idTokenClaims: parseAppCustomClaims(
        tokenResult.claims as Record<string, unknown>,
      ),
    });
  },

  reset: () =>
    set({
      firebaseUser: null,
      userProfile: null,
      idTokenClaims: null,
      isLoading: false,
    }),
}));

/** Call once at app startup. Uses onIdTokenChanged so forced refreshes propagate claims. */
export function initAuthListener(): () => void {
  return auth().onIdTokenChanged(async (user) => {
    const { setFirebaseUser, loadUserProfile, setIdTokenClaims, reset } =
      useAuthStore.getState();

    if (user) {
      setFirebaseUser(user);

      const current = useAuthStore.getState().userProfile;
      if (!current || current.id !== user.uid) {
        await loadUserProfile(user.uid);
      }

      const tokenResult = await user.getIdTokenResult();
      setIdTokenClaims(
        parseAppCustomClaims(tokenResult.claims as Record<string, unknown>),
      );
    } else {
      reset();
    }
  });
}
