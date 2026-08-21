import Constants from 'expo-constants';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signOut as signOutFirebase,
} from 'firebase/auth';
import { GOOGLE_LOGIN_ENABLED, googleOAuthConfig } from './auth-config';
import { SafeAuthError } from './auth-error';
import { getFirebaseAuthInstance } from './firebase-mobile-auth';

export async function getFirebaseIdTokenFromGoogle(): Promise<string> {
  if (!GOOGLE_LOGIN_ENABLED) {
    throw new SafeAuthError('Login Google belum dikonfigurasi untuk build ini.');
  }

  if (Constants.appOwnership === 'expo') {
    throw new SafeAuthError('Login Google memerlukan ORVYN development build, bukan Expo Go.');
  }

  const {
    GoogleOneTapSignIn,
    isCancelledResponse,
    isNoSavedCredentialFoundResponse,
    isSuccessResponse,
  } = await import('react-native-nitro-google-signin');

  GoogleOneTapSignIn.configure({
    webClientId: googleOAuthConfig.webClientId,
    iosClientId: googleOAuthConfig.iosClientId,
    offlineAccess: false,
    autoSelectOnSignIn: false,
  });

  await GoogleOneTapSignIn.checkPlayServices();

  let response = await GoogleOneTapSignIn.signIn();
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.createAccount();
  }
  if (isNoSavedCredentialFoundResponse(response)) {
    response = await GoogleOneTapSignIn.presentExplicitSignIn();
  }

  if (isCancelledResponse(response)) {
    throw new SafeAuthError('Login Google dibatalkan.');
  }
  if (!isSuccessResponse(response) || !response.data.idToken.trim()) {
    throw new SafeAuthError('Google tidak mengembalikan identitas yang valid.');
  }

  const auth = getFirebaseAuthInstance();
  const credential = GoogleAuthProvider.credential(response.data.idToken);
  const firebaseSession = await signInWithCredential(auth, credential);

  try {
    return await firebaseSession.user.getIdToken();
  } finally {
    await signOutFirebase(auth).catch(() => undefined);
  }
}

export async function signOutGoogleBestEffort(): Promise<void> {
  try {
    const { GoogleOneTapSignIn } = await import('react-native-nitro-google-signin');
    await GoogleOneTapSignIn.signOut();
  } catch {
    // Backend and local session revocation must not depend on the native provider.
  }
}
