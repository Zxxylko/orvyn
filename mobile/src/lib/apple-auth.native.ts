import * as Crypto from 'expo-crypto';
import {
  OAuthProvider,
  signInWithCredential,
  signOut as signOutFirebase,
  updateProfile,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { GOOGLE_LOGIN_ENABLED } from './auth-config';
import { SafeAuthError } from './auth-error';
import { getFirebaseAuthInstance } from './firebase-mobile-auth';

function randomHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
}

export async function getFirebaseIdTokenFromApple(): Promise<string> {
  if (Platform.OS !== 'ios') {
    throw new SafeAuthError('Login Apple hanya tersedia pada perangkat Apple.');
  }
  if (!GOOGLE_LOGIN_ENABLED) {
    throw new SafeAuthError('Firebase belum dikonfigurasi untuk build ini.');
  }

  const AppleAuthentication = await import('expo-apple-authentication');
  if (!await AppleAuthentication.isAvailableAsync()) {
    throw new SafeAuthError('Login Apple tidak tersedia pada perangkat ini.');
  }

  const rawNonce = randomHex(await Crypto.getRandomBytesAsync(32));
  const state = randomHex(await Crypto.getRandomBytesAsync(24));
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  let appleCredential;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
      state,
    });
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ERR_REQUEST_CANCELED'
    ) {
      throw new SafeAuthError('Login Apple dibatalkan.');
    }
    throw error;
  }

  if (appleCredential.state !== state || !appleCredential.identityToken?.trim()) {
    throw new SafeAuthError('Apple tidak mengembalikan identitas yang valid.');
  }

  const auth = getFirebaseAuthInstance();
  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: appleCredential.identityToken,
    rawNonce,
  });
  const firebaseSession = await signInWithCredential(auth, firebaseCredential);

  try {
    if (appleCredential.fullName && !firebaseSession.user.displayName) {
      const displayName = AppleAuthentication.formatFullName(appleCredential.fullName).trim();
      if (displayName) {
        await updateProfile(firebaseSession.user, { displayName });
      }
    }

    return await firebaseSession.user.getIdToken();
  } finally {
    await signOutFirebase(auth).catch(() => undefined);
  }
}

