import { SafeAuthError } from './auth-error';

export function getFirebaseIdTokenFromApple(): Promise<string> {
  return Promise.reject(new SafeAuthError('Login Apple tersedia melalui aplikasi ORVYN di iOS.'));
}
