import { getApps, initializeApp } from 'firebase/app';
import {
  type Auth,
  GoogleAuthProvider,
  getAuth,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { firebaseLoginEnabled, firebaseWebConfig } from './firebase-config';

const FIREBASE_APP_NAME = 'orvyn-web-auth';
let preparedAuth: Auth | null = null;
let preparation: Promise<void> | null = null;

export function prepareGoogleAuth(): Promise<void> {
  if (!firebaseLoginEnabled) {
    return Promise.reject(new Error('Firebase web login is not configured.'));
  }

  if (preparedAuth) {
    return Promise.resolve();
  }

  if (!preparation) {
    preparation = (async () => {
      const app = getApps().find((candidate) => candidate.name === FIREBASE_APP_NAME)
        ?? initializeApp(firebaseWebConfig, FIREBASE_APP_NAME);
      const auth = getAuth(app);

      await setPersistence(auth, inMemoryPersistence);
      preparedAuth = auth;
    })().catch((error) => {
      preparation = null;
      throw error;
    });
  }

  return preparation;
}

export async function getGoogleIdToken(): Promise<string> {
  if (!preparedAuth) {
    throw new Error('Firebase web login is not ready.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  const result = await signInWithPopup(preparedAuth, provider);

  try {
    return await result.user.getIdToken();
  } finally {
    await signOut(preparedAuth).catch(() => undefined);
  }
}
