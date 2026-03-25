import { Timestamp } from '@react-native-firebase/firestore';

export type SeatInfo = {
  used: number;
  max: number; // base plan limit + extra seat add-ons
};

export type Clinic = {
  id: string;
  name: string;
  ownerId: string;
  plan: string; // mirrors subscriptions/{clinicId}.plan for quick reads
  seats: SeatInfo;
  addons: string[]; // active addon IDs
  activeDiscounts: string[]; // active discount codes
  createdAt: Timestamp;
};
