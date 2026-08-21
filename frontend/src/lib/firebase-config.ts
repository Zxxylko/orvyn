function readPublicConfig(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export const firebaseWebConfig = {
  apiKey: readPublicConfig(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: readPublicConfig(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: readPublicConfig(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: readPublicConfig(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: readPublicConfig(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: readPublicConfig(import.meta.env.VITE_FIREBASE_APP_ID),
};

export const firebaseLoginEnabled = Object
  .values(firebaseWebConfig)
  .every((value) => value.length > 0);
