import React, { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import type { User } from '@/types/user';
import { AUTH_EXPIRED_EVENT, authApi, userApi } from '@/lib/api';
import { AuthContext } from './auth';

const LEGACY_BEARER_STORAGE_KEY = ['auth', 'token'].join('_');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await userApi.me();
      if (response.data?.data) {
        setUser(response.data.data);
      } else {
        setUser(null);
      }
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setUser(null);
      } else {
        console.error('Failed to fetch user:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem(LEGACY_BEARER_STORAGE_KEY);

    let active = true;
    const expireSession = () => {
      setUser(null);
      setLoading(false);
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, expireSession);
    queueMicrotask(() => {
      if (active) {
        void fetchUser();
      }
    });

    return () => {
      active = false;
      window.removeEventListener(AUTH_EXPIRED_EVENT, expireSession);
    };
  }, [fetchUser]);

  const firebaseLogin = async (idToken: string) => {
    setLoading(true);

    try {
      const response = await authApi.firebaseLogin(idToken);
      const authenticatedUser = response.data?.data?.user;

      if (!authenticatedUser) {
        throw new Error('Invalid Firebase login response');
      }

      setUser(authenticatedUser);
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async () => {
    setLoading(true);

    try {
      const response = await authApi.demoLogin();
      const authenticatedUser = response.data?.data?.user;

      if (!authenticatedUser) {
        throw new Error('Invalid demo login response');
      }

      setUser(authenticatedUser);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);

    try {
      await authApi.logout();
      setUser(null);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        setUser(null);
        return;
      }

      throw error;
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    setLoading(true);
    await fetchUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        firebaseLogin,
        demoLogin,
        logout,
        isAuthenticated: user !== null,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
