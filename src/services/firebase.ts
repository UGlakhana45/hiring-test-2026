import { getApp, getApps, initializeApp } from '@react-native-firebase/app';
import firestore from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import functions from '@react-native-firebase/functions';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

export const firebaseApp = getApps().length === 0
  ? initializeApp(firebaseConfig)
  : getApp();

let emulatorsConfigured = false;
if (process.env.EXPO_PUBLIC_USE_EMULATOR === 'true' && !emulatorsConfigured) {
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? 'localhost';
  firestore().useEmulator(host, 8080);
  auth().useEmulator(`http://${host}:9099`);
  functions().useEmulator(host, 5001);
  emulatorsConfigured = true;
}
