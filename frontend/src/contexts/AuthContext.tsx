import React, { useCallback, useEffect, useState } from 'react';
import type { User } from '@/types/user';
import { authApi, userApi } from '@/lib/api';
import { AuthContext } from './auth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
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
      console.error('Failed to fetch user:', error);
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      if (token) {
        void fetchUser();
      } else {
        setUser(null);
        setLoading(false);
      }
    });
  }, [fetchUser, token]);

  const login = async (newToken: string) => {
    setLoading(true);
    const oldToken = localStorage.getItem('auth_token');
    localStorage.setItem('auth_token', newToken);
    try {
      const response = await userApi.me();
      if (response.data?.data) {
        setToken(newToken);
        setUser(response.data.data);
      } else {
        throw new Error('Invalid user data');
      }
    } catch (error) {
      if (oldToken) {
        localStorage.setItem('auth_token', oldToken);
      } else {
        localStorage.removeItem('auth_token');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const demoLogin = async () => {
    setLoading(true);
    const oldToken = localStorage.getItem('auth_token');

    try {
      const response = await authApi.demoLogin();
      const data = response.data?.data as { token?: string; user?: User } | undefined;

      if (!data?.token || !data?.user) {
        throw new Error('Invalid demo login response');
      }

      localStorage.setItem('auth_token', data.token);
      setToken(data.token);
      setUser(data.user);
    } catch (error) {
      if (oldToken) {
        localStorage.setItem('auth_token', oldToken);
      } else {
        localStorage.removeItem('auth_token');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const refreshUser = async () => {
    if (token) {
      await fetchUser();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        demoLogin,
        logout,
        isAuthenticated: !!token && !!user,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
