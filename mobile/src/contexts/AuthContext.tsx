import { isAxiosError } from 'axios';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PropsWithChildren } from 'react';
import { authApi } from '../lib/api';
import {
  clearActiveApiCache,
  setApiCacheScope,
} from '../lib/api-cache';
import {
  registerCurrentDeviceForPush,
  unregisterCurrentDevicePushBestEffort,
} from '../lib/push-notifications';
import {
  clearCachedUser,
  loadCachedUser,
  saveCachedUser,
} from '../lib/session-cache';
import { getFirebaseIdTokenFromApple } from '../lib/apple-auth';
import {
  getFirebaseIdTokenFromGoogle,
  signOutGoogleBestEffort,
} from '../lib/google-auth';
import { clearAccessToken, loadAccessToken, saveAccessToken } from '../lib/token-store';
import type { User } from '../types';
import { useNetworkStatus } from './NetworkContext';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  appleLogin: () => Promise<void>;
  googleLogin: () => Promise<void>;
  demoLogin: () => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  deleteAccount: (provider: 'apple' | 'google', confirmation: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const { status: networkStatus } = useNetworkStatus();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const restoreStartedRef = useRef(false);
  const onlineRestoreStartedRef = useRef(false);
  const pushRegistrationUserRef = useRef<string | null>(null);

  const acceptUser = useCallback(async (nextUser: User) => {
    setApiCacheScope(nextUser.id);
    await saveCachedUser(nextUser);
    setUser(nextUser);
  }, []);

  const restoreSession = useCallback(async () => {
    try {
      const token = await loadAccessToken();
      if (!token) return;

      const cachedUser = await loadCachedUser();
      if (cachedUser) setApiCacheScope(cachedUser.id);

      if (networkStatus === 'offline' && cachedUser) {
        setUser(cachedUser);
        return;
      }

      const response = await authApi.me();
      await acceptUser(response.data.data);
    } catch (error) {
      const cachedUser = await loadCachedUser();
      if (!isAxiosError(error) || error.response?.status === 401) {
        await clearActiveApiCache();
        await Promise.all([clearAccessToken(), clearCachedUser()]);
        setApiCacheScope(null);
        setUser(null);
      } else if (cachedUser && !error.response) {
        setApiCacheScope(cachedUser.id);
        setUser(cachedUser);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [acceptUser, networkStatus]);

  useEffect(() => {
    if (networkStatus === 'checking') return;

    if (networkStatus === 'online') {
      if (onlineRestoreStartedRef.current) return;
      onlineRestoreStartedRef.current = true;
    } else {
      onlineRestoreStartedRef.current = false;
      if (restoreStartedRef.current) return;
      restoreStartedRef.current = true;
    }

    void restoreSession();
  }, [networkStatus, restoreSession]);

  useEffect(() => {
    if (
      !user
      || networkStatus !== 'online'
      || pushRegistrationUserRef.current === user.id
    ) {
      return;
    }

    let cancelled = false;
    void registerCurrentDeviceForPush().then((result) => {
      if (
        !cancelled
        && result.status !== 'unavailable'
      ) {
        pushRegistrationUserRef.current = user.id;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [networkStatus, user]);

  const demoLogin = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authApi.demoLogin();
      await saveAccessToken(response.data.data.token);
      await acceptUser(response.data.data.user);
    } finally {
      setLoading(false);
    }
  }, [acceptUser]);

  const googleLogin = useCallback(async () => {
    setLoading(true);
    try {
      const firebaseIdToken = await getFirebaseIdTokenFromGoogle();
      const response = await authApi.firebaseLogin(firebaseIdToken);
      await saveAccessToken(response.data.data.token);
      await acceptUser(response.data.data.user);
    } catch (error) {
      await clearActiveApiCache();
      await Promise.all([clearAccessToken(), clearCachedUser()]);
      setApiCacheScope(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [acceptUser]);

  const appleLogin = useCallback(async () => {
    setLoading(true);
    try {
      const firebaseIdToken = await getFirebaseIdTokenFromApple();
      const response = await authApi.firebaseLogin(firebaseIdToken);
      await saveAccessToken(response.data.data.token);
      await acceptUser(response.data.data.user);
    } catch (error) {
      await clearActiveApiCache();
      await Promise.all([clearAccessToken(), clearCachedUser()]);
      setApiCacheScope(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [acceptUser]);

  const loginWithToken = useCallback(async (token: string) => {
    const normalizedToken = token.trim();
    if (!normalizedToken) throw new Error('Token wajib diisi.');

    setLoading(true);
    try {
      await saveAccessToken(normalizedToken);
      const response = await authApi.me();
      await acceptUser(response.data.data);
    } catch (error) {
      await clearActiveApiCache();
      await Promise.all([clearAccessToken(), clearCachedUser()]);
      setApiCacheScope(null);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [acceptUser]);

  const deleteAccount = useCallback(async (
    provider: 'apple' | 'google',
    confirmation: string,
  ) => {
    if (confirmation !== 'HAPUS AKUN') {
      throw new Error('Konfirmasi penghapusan akun tidak valid.');
    }

    setLoading(true);
    try {
      const firebaseIdToken = provider === 'apple'
        ? await getFirebaseIdTokenFromApple()
        : await getFirebaseIdTokenFromGoogle();

      await authApi.deleteAccount(confirmation, firebaseIdToken);
      pushRegistrationUserRef.current = null;
      await clearActiveApiCache();
      await Promise.all([clearAccessToken(), clearCachedUser()]);
      await signOutGoogleBestEffort();
      setApiCacheScope(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    pushRegistrationUserRef.current = null;
    await unregisterCurrentDevicePushBestEffort();
    try {
      await authApi.logout();
    } catch {
      // Local logout must remain available if the backend cannot be reached.
    }
    await clearActiveApiCache();
    await Promise.all([clearAccessToken(), clearCachedUser()]);
    await signOutGoogleBestEffort();
    setApiCacheScope(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      appleLogin,
      googleLogin,
      demoLogin,
      loginWithToken,
      deleteAccount,
      logout,
    }),
    [appleLogin, deleteAccount, demoLogin, googleLogin, loading, loginWithToken, logout, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
