import { createContext, useContext } from 'react';
import type { User } from '@/types/user';

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  firebaseLogin: (idToken: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
