/**
 * Single bootstrap: default JS app + emulator wiring. Imported first from `app/_layout.tsx`.
 * Host: iOS Simulator resolves `127.0.0.1` reliably; avoid relying on `localhost` alone.
 */
import { getApp, getApps, initializeApp } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID!,
};

if (getApps().length === 0) {
  initializeApp(firebaseConfig);
}

const USE_EMULATOR = process.env.EXPO_PUBLIC_USE_EMULATOR === 'true';
const rawHost = process.env.EXPO_PUBLIC_EMULATOR_HOST ?? '127.0.0.1';
/** Simulator + some RN stacks behave more predictably with explicit loopback. */
const EMULATOR_HOST = rawHost === 'localhost' ? '127.0.0.1' : rawHost;

if (USE_EMULATOR) {
  auth().useEmulator(`http://${EMULATOR_HOST}:9099`);
  firestore().useEmulator(EMULATOR_HOST, 8080);
  functions().useEmulator(EMULATOR_HOST, 5001);
}

export const firebaseApp = getApp();
