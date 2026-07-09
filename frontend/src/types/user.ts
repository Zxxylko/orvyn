export interface User {
  id: string;
  firebase_uid?: string;
  name: string;
  email: string;
  email_verified_at: string | null;
  preferences: {
    theme?: 'light' | 'dark';
    notifications_enabled?: boolean;
  };
  created_at: string;
  updated_at: string;
}
