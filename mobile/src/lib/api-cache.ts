import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError, AxiosHeaders, isAxiosError } from 'axios';
import type {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = `@orvyn/api-cache/${CACHE_VERSION}`;
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_HEADER = 'x-orvyn-cache';
const CACHE_TIMESTAMP_HEADER = 'x-orvyn-cache-at';

const CACHEABLE_PATHS = [
  /^\/tasks(?:\/.*)?$/,
  /^\/analytics\/snapshot$/,
  /^\/habits(?:\/.*)?$/,
  /^\/time-blocks(?:\/.*)?$/,
  /^\/focus-logs(?:\/.*)?$/,
  /^\/briefing\/today$/,
  /^\/academic-tasks(?:\/.*)?$/,
  /^\/campus-schedules(?:\/.*)?$/,
  /^\/finance\/(?:summary|expenses)(?:\/.*)?$/,
  /^\/health\/(?:snapshot|logs)(?:\/.*)?$/,
];

interface CachedApiResponse {
  signature: string;
  cachedAt: string;
  data: unknown;
}

let activeScope: string | null = null;
let knownNetworkOnline: boolean | undefined;

export function setApiCacheScope(scope: string | null): void {
  activeScope = scope ? normalizeScope(scope) : null;
}

export function setKnownNetworkOnline(isOnline: boolean | undefined): void {
  knownNetworkOnline = isOnline;
}

export async function clearActiveApiCache(): Promise<void> {
  const scope = activeScope;
  if (!scope) return;

  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefix = `${CACHE_PREFIX}/${scope}/`;
    const scopedKeys = keys.filter((key) => key.startsWith(prefix));
    if (scopedKeys.length > 0) await AsyncStorage.multiRemove(scopedKeys);
  } catch {
    // Cache cleanup must never block logout.
  }
}

export function installApiReadCache(client: AxiosInstance): void {
  client.interceptors.request.use((config) => {
    if (knownNetworkOnline === false) {
      return Promise.reject(
        new AxiosError(
          'Perangkat sedang offline.',
          AxiosError.ERR_NETWORK,
          config,
        ),
      );
    }

    return config;
  });

  client.interceptors.response.use(
    async (response) => {
      if (isCacheableRequest(response.config)) {
        await writeResponse(response);
      }
      return response;
    },
    async (error: unknown) => {
      if (!isAxiosError(error) || error.response || !error.config) {
        return Promise.reject(error);
      }

      const cachedResponse = await readResponse(error.config);
      return cachedResponse ?? Promise.reject(error);
    },
  );
}

export function isCachedApiResponse(response: AxiosResponse<unknown>): boolean {
  const header = Object.entries(response.headers)
    .find(([name]) => name.toLowerCase() === CACHE_HEADER)?.[1];

  return header === 'stale';
}

async function writeResponse(response: AxiosResponse): Promise<void> {
  const storage = storageDetails(response.config);
  if (!storage) return;

  const record: CachedApiResponse = {
    signature: storage.signature,
    cachedAt: new Date().toISOString(),
    data: response.data,
  };

  try {
    await AsyncStorage.setItem(storage.key, JSON.stringify(record));
  } catch {
    // A full or unavailable cache should not make a successful request fail.
  }
}

async function readResponse(
  config: InternalAxiosRequestConfig,
): Promise<AxiosResponse | null> {
  const storage = storageDetails(config);
  if (!storage) return null;

  try {
    const raw = await AsyncStorage.getItem(storage.key);
    if (!raw) return null;

    const record = JSON.parse(raw) as CachedApiResponse;
    const cachedTime = new Date(record.cachedAt).getTime();
    if (
      record.signature !== storage.signature
      || !Number.isFinite(cachedTime)
      || Date.now() - cachedTime > CACHE_MAX_AGE_MS
    ) {
      await AsyncStorage.removeItem(storage.key);
      return null;
    }

    return {
      data: record.data,
      status: 200,
      statusText: 'OK (cached)',
      headers: AxiosHeaders.from({
        [CACHE_HEADER]: 'stale',
        [CACHE_TIMESTAMP_HEADER]: record.cachedAt,
      }),
      config,
    };
  } catch {
    return null;
  }
}

function storageDetails(config: InternalAxiosRequestConfig) {
  if (!activeScope || !isCacheableRequest(config)) return null;

  const signature = stableStringify({
    baseURL: config.baseURL ?? '',
    method: config.method?.toLowerCase() ?? 'get',
    url: normalizePath(config.url),
    params: config.params ?? null,
  });

  return {
    signature,
    key: `${CACHE_PREFIX}/${activeScope}/${hashString(signature)}`,
  };
}

function isCacheableRequest(
  config: Pick<InternalAxiosRequestConfig, 'method' | 'url'>,
): boolean {
  if ((config.method?.toLowerCase() ?? 'get') !== 'get') return false;
  const path = normalizePath(config.url);
  return CACHEABLE_PATHS.some((pattern) => pattern.test(path));
}

function normalizePath(url: string | undefined): string {
  if (!url) return '';

  try {
    return new URL(url, 'https://orvyn.local').pathname;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

function normalizeScope(scope: string): string {
  return encodeURIComponent(scope.trim());
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value) ?? 'null';
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
