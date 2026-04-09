/**
 * Re-export default app; side effects live in `connectFirebaseEmulators.ts` (imported first from `_layout`).
 */
import { firebaseApp } from '@/services/connectFirebaseEmulators';

export { firebaseApp };
