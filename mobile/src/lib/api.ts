import axios, { isAxiosError } from 'axios';
import { Platform } from 'react-native';
import type { AnalyticsSnapshot, ApiEnvelope, Habit, Task, TaskStatus, User } from '../types';
import { installApiReadCache } from './api-cache';
import { getAccessToken } from './token-store';

const fallbackHost = Platform.OS === 'android' ? '10.0.2.2' : '127.0.0.1';
const buildEnvironment = (
  process.env.EXPO_PUBLIC_ORVYN_BUILD_ENV || 'development'
).trim().toLowerCase();
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';

export const API_BASE_URL = (
  configuredApiUrl || `http://${fallbackHost}:8000/api/v1`
).replace(/\/$/, '');

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    normalized === 'localhost'
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
  ) {
    return true;
  }

  const octets = normalized.split('.').map(Number);
  const firstOctet = octets[0];
  const secondOctet = octets[1];

  return octets.length === 4
    && octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && firstOctet === 172
    && secondOctet !== undefined
    && secondOctet >= 16
    && secondOctet <= 31;
}

if (buildEnvironment === 'production') {
  if (!configuredApiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is required for production builds.');
  }

  const productionApiUrl = new URL(API_BASE_URL);
  if (
    productionApiUrl.protocol !== 'https:'
    || productionApiUrl.username
    || productionApiUrl.password
    || productionApiUrl.search
    || productionApiUrl.hash
    || (productionApiUrl.port !== '' && productionApiUrl.port !== '443')
    || productionApiUrl.pathname.replace(/\/$/, '') !== '/api/v1'
    || isPrivateOrLocalHostname(productionApiUrl.hostname)
  ) {
    throw new Error('Production API URL must be a public HTTPS /api/v1 endpoint.');
  }
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

installApiReadCache(api);

export function getApiErrorMessage(error: unknown, fallback = 'Terjadi kendala. Coba lagi.') {
  if (isAxiosError(error)) {
    if (!error.response) {
      return `Tidak dapat terhubung ke ORVYN API (${API_BASE_URL}). Periksa alamat server dan jaringan.`;
    }

    if (error.response.status === 401) return 'Sesi sudah berakhir. Silakan masuk kembali.';
    if (error.response.status === 403) return 'Akun ini tidak memiliki izin untuk aksi tersebut.';
    if (error.response.status === 429) return 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.';

    const payload = error.response.data as { message?: unknown; errors?: Record<string, string[]> } | undefined;
    const validationMessage = payload?.errors ? Object.values(payload.errors)[0]?.[0] : undefined;
    if (validationMessage) return validationMessage;
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
  }

  return fallback;
}

export const authApi = {
  demoLogin: () => api.post<ApiEnvelope<{ token: string; user: User }>>('/auth/demo-login', undefined, {
    headers: { 'X-Device-Name': `ORVYN Mobile ${Platform.OS}` },
  }),
  firebaseLogin: (idToken: string) => api.post<ApiEnvelope<{ token: string; user: User }>>('/auth/firebase', {
    id_token: idToken,
  }, {
    headers: { 'X-Device-Name': `ORVYN Mobile ${Platform.OS}` },
  }),
  me: () => api.get<ApiEnvelope<User>>('/user/me'),
  logout: () => api.post('/auth/logout'),
  deleteAccount: (confirmation: string, idToken: string) => api.delete('/user', {
    data: {
      confirmation,
      id_token: idToken,
    },
  }),
};

export const taskApi = {
  list: (params?: { active?: boolean; status?: TaskStatus; overdue?: boolean }) =>
    api.get<ApiEnvelope<Task[]>>('/tasks', { params }),
  get: (id: string) => api.get<ApiEnvelope<Task>>(`/tasks/${id}`),
  create: (data: Pick<Task, 'title'> & Partial<Pick<Task, 'description' | 'deadline' | 'status' | 'priority' | 'duration_minutes' | 'difficulty' | 'category' | 'tags'>>) =>
    api.post<ApiEnvelope<Task>>('/tasks', data),
  smartCreate: (input: string) => api.post<ApiEnvelope<Task>>('/tasks/smart-parse', { input }),
  update: (id: string, data: Partial<Pick<Task, 'title' | 'description' | 'deadline' | 'status' | 'priority' | 'duration_minutes' | 'difficulty' | 'category' | 'tags'>>) =>
    api.put<ApiEnvelope<Task>>(`/tasks/${id}`, data),
  remove: (id: string) => api.delete<{ message: string }>(`/tasks/${id}`),
};

export const analyticsApi = {
  snapshot: () => api.get<ApiEnvelope<AnalyticsSnapshot>>('/analytics/snapshot'),
};

export const habitApi = {
  list: () => api.get<ApiEnvelope<Habit[]>>('/habits'),
  create: (name: string) => api.post<ApiEnvelope<Habit>>('/habits', {
    name,
    category: 'health',
    target_per_day: 1,
    unit: 'session',
    color: 'pink',
  }),
  update: (id: string, data: Partial<Pick<Habit, 'name' | 'description' | 'category' | 'target_per_day' | 'unit' | 'color' | 'is_active'>>) =>
    api.put<ApiEnvelope<Habit>>(`/habits/${id}`, data),
  remove: (id: string) => api.delete<{ message: string }>(`/habits/${id}`),
  checkIn: (id: string, date: string) => api.post<ApiEnvelope<Habit>>(`/habits/${id}/check-ins`, { date }),
  uncheck: (id: string, date: string) => api.delete<ApiEnvelope<Habit>>(`/habits/${id}/check-ins`, { data: { date } }),
};
