import type { ConfigContext, ExpoConfig } from 'expo/config';
import { readFileSync, statSync } from 'node:fs';

function isPrivateOrReservedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const octets = normalized.split('.').map(Number);
  const isPrivate172 = octets.length === 4
    && octets[0] === 172
    && (octets[1] ?? 0) >= 16
    && (octets[1] ?? 0) <= 31;

  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.local')
    || normalized.endsWith('.test')
    || normalized.endsWith('.example')
    || normalized.endsWith('.invalid')
    || normalized === '::1'
    || normalized === '0.0.0.0'
    || normalized.startsWith('127.')
    || normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || normalized.startsWith('169.254.')
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe80:')
    || isPrivate172;
}

function validateGoogleServicesFile(
  filePath: string,
  expectedProjectId: string,
  expectedWebClientId: string,
): void {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile() || stats.size <= 0 || stats.size > 64 * 1024) {
      throw new Error('invalid file');
    }

    const document = JSON.parse(readFileSync(filePath, 'utf8')) as {
      project_info?: { project_id?: unknown };
      client?: Array<{
        client_info?: {
          android_client_info?: { package_name?: unknown };
        };
        oauth_client?: Array<{
          client_id?: unknown;
          client_type?: unknown;
          android_info?: {
            package_name?: unknown;
            certificate_hash?: unknown;
          };
        }>;
      }>;
    };
    const clients = Array.isArray(document.client) ? document.client : [];
    const orvynClient = clients.find(
      (client) => client.client_info?.android_client_info?.package_name === 'app.orvyn.mobile',
    );
    const oauthClients = Array.isArray(orvynClient?.oauth_client) ? orvynClient.oauth_client : [];
    const hasSignedAndroidClient = oauthClients.some((client) => (
      client.client_type === 1
      && client.android_info?.package_name === 'app.orvyn.mobile'
      && typeof client.client_id === 'string'
      && /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(client.client_id)
      && typeof client.android_info.certificate_hash === 'string'
      && /^[A-Fa-f0-9]{40}$/.test(client.android_info.certificate_hash)
    ));
    const hasMatchingWebClient = oauthClients.some((client) => (
      client.client_type === 3 && client.client_id === expectedWebClientId
    ));

    if (
      document.project_info?.project_id !== expectedProjectId
      || !orvynClient
      || !hasSignedAndroidClient
      || !hasMatchingWebClient
    ) {
      throw new Error('configuration mismatch');
    }
  } catch {
    throw new Error(
      'GOOGLE_SERVICES_JSON must be a valid Firebase Android configuration for app.orvyn.mobile, its release signing certificate, and the configured Web OAuth client.',
    );
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const buildEnvironment = (
    process.env.EXPO_PUBLIC_ORVYN_BUILD_ENV
    ?? process.env.ORVYN_BUILD_ENV
    ?? 'development'
  ).trim().toLowerCase();
  const allowLocalHttp = buildEnvironment !== 'production';
  const plugins = (config.plugins ?? []).filter((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    return name !== 'expo-build-properties'
      && name !== 'expo-notifications'
      && name !== 'react-native-nitro-google-signin'
      && name !== 'expo-apple-authentication';
  });
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID?.trim() ?? '';
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim() ?? '';
  const iosClientSuffix = '.apps.googleusercontent.com';

  if (buildEnvironment === 'production') {
    const requiredVariables = [
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      'EXPO_PUBLIC_FIREBASE_APP_ID',
      'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
      'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
      'GOOGLE_SERVICES_JSON',
    ] as const;
    const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());

    if (missingVariables.length > 0) {
      throw new Error(`Missing production mobile configuration: ${missingVariables.join(', ')}`);
    }

    const apiUrl = new URL(process.env.EXPO_PUBLIC_API_URL!);
    if (
      apiUrl.protocol !== 'https:'
      || (apiUrl.port !== '' && apiUrl.port !== '443')
      || apiUrl.username
      || apiUrl.password
      || apiUrl.search
      || apiUrl.hash
      || apiUrl.pathname.replace(/\/$/, '') !== '/api/v1'
      || isPrivateOrReservedHostname(apiUrl.hostname)
    ) {
      throw new Error('EXPO_PUBLIC_API_URL must be a public HTTPS /api/v1 endpoint for production.');
    }

    const oauthClientPattern = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
    const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!.trim();
    if (!oauthClientPattern.test(iosClientId) || !oauthClientPattern.test(webClientId) || iosClientId === webClientId) {
      throw new Error('Production requires distinct, valid Google Web and iOS OAuth client IDs.');
    }

    const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY!.trim();
    const firebaseAuthDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN!.trim();
    const firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID!.trim();
    const firebaseAppId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID!.trim();
    const authDomainUrl = new URL(`https://${firebaseAuthDomain}`);

    if (
      !/^AIza[A-Za-z0-9_-]{20,}$/.test(firebaseApiKey)
      || authDomainUrl.hostname !== firebaseAuthDomain
      || authDomainUrl.pathname !== '/'
      || isPrivateOrReservedHostname(authDomainUrl.hostname)
      || !/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(firebaseProjectId)
      || !/^1:\d+:web:[a-f0-9]+$/i.test(firebaseAppId)
    ) {
      throw new Error('Firebase public configuration is invalid for production.');
    }
    validateGoogleServicesFile(googleServicesFile, firebaseProjectId, webClientId);

    if (process.env.EXPO_PUBLIC_DEMO_LOGIN_ENABLED === 'true' || process.env.EXPO_PUBLIC_MANUAL_TOKEN_LOGIN_ENABLED === 'true') {
      throw new Error('Diagnostic login methods cannot be enabled in production.');
    }
  }

  const reversedIosClientId = iosClientId.endsWith(iosClientSuffix)
    ? `com.googleusercontent.apps.${iosClientId.slice(0, -iosClientSuffix.length)}`
    : 'com.googleusercontent.apps.orvyn-development-placeholder';

  return {
    ...config,
    name: config.name ?? 'ORVYN',
    slug: config.slug ?? 'orvyn',
    ios: {
      ...config.ios,
      usesAppleSignIn: true,
      ...(allowLocalHttp
        ? {
            infoPlist: {
              ...config.ios?.infoPlist,
              NSAppTransportSecurity: {
                NSAllowsLocalNetworking: true,
              },
            },
          }
        : {}),
    },
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    plugins: [
      ...plugins,
      [
        'expo-notifications',
        {
          icon: './assets/android-icon-monochrome.png',
          color: '#22D3EE',
          defaultChannel: 'orvyn-reminders',
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            usesCleartextTraffic: allowLocalHttp,
          },
        },
      ],
      [
        'react-native-nitro-google-signin',
        {
          iosUrlScheme: reversedIosClientId,
        },
      ],
      'expo-apple-authentication',
    ],
    extra: {
      ...config.extra,
      buildEnvironment,
    },
  };
};
