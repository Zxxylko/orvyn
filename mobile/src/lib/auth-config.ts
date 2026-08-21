function readPublicConfig(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const MOBILE_BUILD_ENVIRONMENT = (
  readPublicConfig(process.env.EXPO_PUBLIC_ORVYN_BUILD_ENV) || 'development'
).toLowerCase();

export const IS_PRODUCTION_BUILD = MOBILE_BUILD_ENVIRONMENT === 'production';

export const firebaseMobileConfig = {
  apiKey: readPublicConfig(process.env.EXPO_PUBLIC_FIREBASE_API_KEY),
  authDomain: readPublicConfig(process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN),
  projectId: readPublicConfig(process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID),
  appId: readPublicConfig(process.env.EXPO_PUBLIC_FIREBASE_APP_ID),
};

export const googleOAuthConfig = {
  webClientId: readPublicConfig(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID),
  iosClientId: readPublicConfig(process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID),
};

export const GOOGLE_LOGIN_ENABLED = [
  ...Object.values(firebaseMobileConfig),
  ...Object.values(googleOAuthConfig),
].every((value) => value.length > 0);

// Diagnostic login paths are opt-in and can never be enabled in a production binary.
export const DEMO_LOGIN_ENABLED = !IS_PRODUCTION_BUILD
  && readPublicConfig(process.env.EXPO_PUBLIC_DEMO_LOGIN_ENABLED) === 'true';

export const MANUAL_TOKEN_LOGIN_ENABLED = !IS_PRODUCTION_BUILD
  && readPublicConfig(process.env.EXPO_PUBLIC_MANUAL_TOKEN_LOGIN_ENABLED) === 'true';

