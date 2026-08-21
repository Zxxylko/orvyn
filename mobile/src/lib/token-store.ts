import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'orvyn_access_token';
let cachedToken: string | null = null;

function getWebSessionStorage(): Storage | null {
  if (Platform.OS !== 'web' || typeof globalThis.sessionStorage === 'undefined') return null;
  return globalThis.sessionStorage;
}

export async function loadAccessToken(): Promise<string | null> {
  const webStorage = getWebSessionStorage();
  cachedToken = webStorage
    ? webStorage.getItem(ACCESS_TOKEN_KEY)
    : await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  return cachedToken;
}

export function getAccessToken(): string | null {
  return cachedToken;
}

export async function saveAccessToken(token: string): Promise<void> {
  const webStorage = getWebSessionStorage();
  if (webStorage) {
    webStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  cachedToken = token;
}

export async function clearAccessToken(): Promise<void> {
  const webStorage = getWebSessionStorage();
  if (webStorage) webStorage.removeItem(ACCESS_TOKEN_KEY);
  else await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  cachedToken = null;
}
