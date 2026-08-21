import {
  type Auth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { GOOGLE_LOGIN_ENABLED } from './auth-config';
import { SafeAuthError } from './auth-error';
import { getFirebaseAuthInstance } from './firebase-mobile-auth';

let preparedAuth: Auth | null = null;
let preparation: Promise<Auth> | null = null;

async function prepareAuth(): Promise<Auth> {
  if (preparedAuth) return preparedAuth;

  if (!preparation) {
    preparation = (async () => {
      const auth = getFirebaseAuthInstance();
      await setPersistence(auth, inMemoryPersistence);
      preparedAuth = auth;
      return auth;
    })().catch((error) => {
      preparation = null;
      throw error;
    });
  }

  return preparation;
}

export async function getFirebaseIdTokenFromGoogle(): Promise<string> {
  if (!GOOGLE_LOGIN_ENABLED) {
    throw new SafeAuthError('Login Google belum dikonfigurasi untuk build ini.');
  }

  const auth = await prepareAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);

  try {
    return await result.user.getIdToken();
  } finally {
    await signOut(auth).catch(() => undefined);
  }
}

export async function signOutGoogleBestEffort(): Promise<void> {
  if (preparedAuth) {
    await signOut(preparedAuth).catch(() => undefined);
  }
}
