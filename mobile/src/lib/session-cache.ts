import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '../types';

const CACHED_USER_KEY = '@orvyn/session-user/v1';

export async function loadCachedUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHED_USER_KEY);
    if (!raw) return null;

    const user = JSON.parse(raw) as Partial<User>;
    if (
      typeof user.id !== 'string'
      || typeof user.name !== 'string'
      || typeof user.email !== 'string'
    ) {
      await AsyncStorage.removeItem(CACHED_USER_KEY);
      return null;
    }

    return user as User;
  } catch {
    return null;
  }
}

export async function saveCachedUser(user: User): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHED_USER_KEY, JSON.stringify(user));
  } catch {
    // A failed convenience cache must not invalidate an authenticated session.
  }
}

export async function clearCachedUser(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHED_USER_KEY);
  } catch {
    // Local session cleanup continues even if AsyncStorage is unavailable.
  }
}
