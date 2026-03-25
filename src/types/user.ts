import { Timestamp } from '@react-native-firebase/firestore';

export type UserRole = 'owner' | 'staff' | 'patient';

export type User = {
  id: string;
  displayName: string;
  email: string;
  role: UserRole;
  clinicId: string | null; // null for patients not yet associated
  createdAt: Timestamp;
};
