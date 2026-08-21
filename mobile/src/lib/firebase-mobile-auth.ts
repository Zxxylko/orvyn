import { getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  getAuth,
  initializeAuth,
  inMemoryPersistence,
} from 'firebase/auth';
import { firebaseMobileConfig } from './auth-config';

const FIREBASE_APP_NAME = 'orvyn-mobile-auth';
let firebaseAuth: Auth | null = null;

export function getFirebaseAuthInstance(): Auth {
  if (firebaseAuth) return firebaseAuth;

  const app = getApps().find((candidate) => candidate.name === FIREBASE_APP_NAME)
    ?? initializeApp(firebaseMobileConfig, FIREBASE_APP_NAME);

  try {
    firebaseAuth = initializeAuth(app, { persistence: inMemoryPersistence });
  } catch {
    firebaseAuth = getAuth(app);
  }

  return firebaseAuth;
}

