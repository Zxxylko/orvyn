import axios, { isAxiosError } from 'axios';
import type { CreateTimeBlockData, UpdateTimeBlockData } from '@/types/timeblock';
import type { CreateHabitData } from '@/types/habit';
import type { CreateCampusScheduleData } from '@/types/campus';
import type { User } from '@/types/user';

function resolveApiConfig() {
  const envUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';
  let baseUrl = envUrl;

  if (typeof window !== 'undefined' && window.location) {
    try {
      const url = new URL(envUrl, window.location.origin);
      if (
        (window.location.hostname === '127.0.0.1' && url.hostname === 'localhost') ||
        (window.location.hostname === 'localhost' && url.hostname === '127.0.0.1')
      ) {
        url.hostname = window.location.hostname;
        baseUrl = url.toString();
      }
    } catch {
      // fallback to original
    }
  }

  const origin = typeof window !== 'undefined'
    ? new URL(baseUrl, window.location.origin).origin
    : 'http://localhost:8000';

  const csrfUrl = import.meta.env.VITE_CSRF_COOKIE_URL || `${origin}/sanctum/csrf-cookie`;

  return { baseUrl, origin, csrfUrl };
}

const { baseUrl: API_BASE_URL, csrfUrl: CSRF_COOKIE_URL } = resolveApiConfig();

export const AUTH_EXPIRED_EVENT = 'orvyn:auth-expired';

interface ApiDataResponse<T> {
  data: T;
  message?: string;
}

interface AuthLoginData {
  user: User;
}

export interface BroadcastAuthorization {
  auth: string;
  channel_data?: string;
  shared_secret?: string;
}

export interface AuthSession {
  id: number;
  device_name: string;
  abilities: string[];
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string | null;
  is_current: boolean;
}

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

const csrfClient = axios.create({
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

export function getXsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(?:XSRF-TOKEN)=([^;]*)'));
  return match ? decodeURIComponent(match[2]) : null;
}

let csrfReady = false;
let csrfRequest: Promise<void> | null = null;

export function ensureCsrfCookie(forceRefresh = false): Promise<void> {
  if (forceRefresh) {
    csrfReady = false;
  }

  if (csrfReady && getXsrfCookie()) {
    return Promise.resolve();
  }

  if (!csrfRequest) {
    csrfRequest = csrfClient
      .get(CSRF_COOKIE_URL)
      .then(() => {
        csrfReady = true;
      })
      .finally(() => {
        csrfRequest = null;
      });
  }

  return csrfRequest;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    if (error.response?.status === 429) {
      const retryAfter = Number(error.response.headers['retry-after']);
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        return `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(retryAfter)} detik.`;
      }

      return 'Terlalu banyak percobaan. Coba lagi sebentar lagi.';
    }

    const message = (error.response?.data as { message?: unknown } | undefined)?.message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return fallback;
}

api.interceptors.request.use(
  async (config) => {
    const method = config.method?.toLowerCase() ?? 'get';
    if (!['get', 'head', 'options'].includes(method)) {
      await ensureCsrfCookie();
      const token = getXsrfCookie();
      if (token && config.headers) {
        config.headers['X-XSRF-TOKEN'] = token;
      }
      window.dispatchEvent(new CustomEvent('orvyn:sync-start'));
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    if (response.config.method && response.config.method.toLowerCase() !== 'get') {
      window.dispatchEvent(new CustomEvent('orvyn:sync-success'));
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 419 && error.config && !error.config._csrfRetried) {
      error.config._csrfRetried = true;
      await ensureCsrfCookie(true);
      return api(error.config);
    }

    if (error.config?.method && error.config.method.toLowerCase() !== 'get') {
      window.dispatchEvent(new CustomEvent('orvyn:sync-error'));
    }
    if (error.response?.status === 401) {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

// API methods
export const authApi = {
  demoLogin: async () => {
    await ensureCsrfCookie(true);
    return api.post<ApiDataResponse<AuthLoginData>>('/auth/demo-login', undefined, {
      headers: {
        'X-Client-Platform': 'web',
        'X-Device-Name': 'ORVYN Web',
      },
    });
  },
  firebaseLogin: async (idToken: string) => {
    await ensureCsrfCookie(true);
    return api.post<ApiDataResponse<AuthLoginData>>('/auth/firebase', {
      id_token: idToken,
    }, {
      headers: {
        'X-Client-Platform': 'web',
        'X-Device-Name': 'ORVYN Web',
      },
    });
  },
  logout: async () => {
    const response = await api.post('/auth/logout');
    csrfReady = false;
    return response;
  },
  sessions: () => api.get<{ data: AuthSession[]; message: string }>('/auth/sessions'),
  revokeSession: (id: number) => api.delete(`/auth/sessions/${id}`),
  logoutAll: () => api.post('/auth/logout-all'),
};

export const userDataApi = {
  exportData: () => api.get('/user/export', { responseType: 'blob' }),
  deleteAccount: (confirmation: string, idToken: string) => api.delete('/user', {
    data: {
      confirmation,
      id_token: idToken,
    },
  }),
};

export async function authorizeBroadcast(
  endpoint: string,
  socketId: string,
  channelName: string,
): Promise<BroadcastAuthorization> {
  await ensureCsrfCookie();
  const response = await api.post<BroadcastAuthorization>(endpoint, {
    socket_id: socketId,
    channel_name: channelName,
  });

  return response.data;
}

export const taskApi = {
  // Get all tasks
  getTasks: (params?: { status?: string; active?: boolean; overdue?: boolean }) => {
    return api.get('/tasks', { params });
  },

  // Get single task
  getTask: (id: string) => {
    return api.get(`/tasks/${id}`);
  },

  // Create task manually
  createTask: (data: {
    title: string;
    description?: string;
    deadline?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    duration_minutes?: number;
    difficulty?: number;
    category?: string;
    tags?: string[];
  }) => {
    return api.post('/tasks', data);
  },

  // Smart parse natural language
  smartParse: (input: string) => {
    return api.post('/tasks/smart-parse', { input });
  },

  // Update task
  updateTask: (id: string, data: Partial<{
    title: string;
    description: string | null;
    deadline: string | null;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high' | 'critical';
    duration_minutes: number | null;
    difficulty: number | null;
    category: string | null;
    tags: string[];
  }>) => {
    return api.put(`/tasks/${id}`, data);
  },

  // Delete task
  deleteTask: (id: string) => {
    return api.delete(`/tasks/${id}`);
  },
};

// TimeBlock API methods
export const timeBlockApi = {
  // Get all time blocks for date range
  getTimeBlocks: (params?: { start_date?: string; end_date?: string }) => {
    return api.get('/time-blocks', { params });
  },

  // Get single block
  getTimeBlock: (id: string) => {
    return api.get(`/time-blocks/${id}`);
  },

  // Create block
  createTimeBlock: (data: CreateTimeBlockData) => {
    return api.post('/time-blocks', data);
  },

  // Update block
  updateTimeBlock: (id: string, data: UpdateTimeBlockData) => {
    return api.put(`/time-blocks/${id}`, data);
  },

  // Delete block
  deleteTimeBlock: (id: string) => {
    return api.delete(`/time-blocks/${id}`);
  },

  // Auto schedule / optimize
  optimizeSchedule: () => {
    return api.post('/time-blocks/optimize');
  },
};

// Briefing API methods
export const briefingApi = {
  // Get today's briefing
  getToday: () => {
    return api.get('/briefing/today');
  },

  // Generate today's briefing
  generate: () => {
    return api.post('/briefing/generate');
  },
};

// Analytics API methods
export const analyticsApi = {
  // Get live analytics snapshot
  getSnapshot: () => {
    return api.get('/analytics/snapshot');
  },

  // Get peak productivity hours analysis
  getPeakHours: () => {
    return api.get('/analytics/peak-hours');
  },

  // Get recent focus logs
  getFocusLogs: (params?: { days?: number }) => {
    return api.get('/focus-logs', { params });
  },

  // Log completed focus/Pomodoro session
  logFocusSession: (data: {
    task_id?: string | null;
    planned_minutes: number;
    actual_minutes: number;
    focus_rating: number;
    completed: boolean;
    session_type?: string;
    started_at: string;
    ended_at?: string | null;
  }) => {
    return api.post('/focus-logs', data);
  },

  // Get student profile details
  getProfile: () => {
    return api.get('/profile');
  },

  // Update profile parameters
  updateProfile: (data: {
    preferred_start_hour?: number;
    preferred_end_hour?: number;
    max_daily_focus_minutes?: number;
  }) => {
    return api.patch('/profile', data);
  },
};

// Habit Streak API methods
export const habitApi = {
  getHabits: () => {
    return api.get('/habits');
  },
  createHabit: (data: CreateHabitData) => {
    return api.post('/habits', data);
  },
  updateHabit: (id: string, data: Partial<CreateHabitData & { is_active: boolean }>) => {
    return api.put(`/habits/${id}`, data);
  },
  deleteHabit: (id: string) => {
    return api.delete(`/habits/${id}`);
  },
  checkIn: (id: string, data?: { date?: string; value?: number; note?: string }) => {
    return api.post(`/habits/${id}/check-ins`, data ?? {});
  },
  uncheck: (id: string, date?: string) => {
    return api.delete(`/habits/${id}/check-ins`, { data: date ? { date } : {} });
  },
};

// Campus Life API methods
export const campusApi = {
  getSchedules: (params?: { day_of_week?: number; active?: boolean }) => {
    return api.get('/campus-schedules', { params });
  },
  createSchedule: (data: CreateCampusScheduleData) => {
    return api.post('/campus-schedules', data);
  },
  updateSchedule: (id: string, data: Partial<CreateCampusScheduleData>) => {
    return api.put(`/campus-schedules/${id}`, data);
  },
  deleteSchedule: (id: string) => {
    return api.delete(`/campus-schedules/${id}`);
  },
};

// Academic API methods (Tel-U Academic Tracker)
export const academicApi = {
  getTasks: () => {
    return api.get('/academic-tasks');
  },
  createTask: (data: {
    course_name: string;
    task_type: 'tp' | 'praktikum' | 'jurnal' | 'tubes' | 'exam';
    title: string;
    description?: string;
    deadline?: string;
    status?: 'todo' | 'in_progress' | 'completed';
    lms_url?: string;
  }) => {
    return api.post('/academic-tasks', data);
  },
  updateTask: (id: string, data: Partial<{
    course_name: string;
    task_type: 'tp' | 'praktikum' | 'jurnal' | 'tubes' | 'exam';
    title: string;
    description: string | null;
    deadline: string | null;
    status: 'todo' | 'in_progress' | 'completed';
    lms_url: string | null;
  }>) => {
    return api.put(`/academic-tasks/${id}`, data);
  },
  deleteTask: (id: string) => {
    return api.delete(`/academic-tasks/${id}`);
  },
};

// Finance API methods (Bandung Finance Engine)
export const financeApi = {
  getSummary: () => {
    return api.get('/finance/summary');
  },
  updateBudget: (data: { monthly_limit: number }) => {
    return api.patch('/finance/budget', data);
  },
  getExpenses: (params?: { limit?: number }) => {
    return api.get('/finance/expenses', { params });
  },
  logExpense: (data: {
    amount: number;
    category: 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';
    description?: string;
    expense_date: string;
  }) => {
    return api.post('/finance/expenses', data);
  },
  updateExpense: (id: string, data: Partial<{
    amount: number;
    category: 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';
    description: string | null;
    expense_date: string;
  }>) => {
    return api.put(`/finance/expenses/${id}`, data);
  },
  deleteExpense: (id: string) => {
    return api.delete(`/finance/expenses/${id}`);
  },
};

// Health API methods (CS Student Health Guard)
export const healthApi = {
  getSnapshot: () => {
    return api.get('/health/snapshot');
  },
  getLogs: (params?: { days?: number }) => {
    return api.get('/health/logs', { params });
  },
  logHealth: (data: {
    log_date: string;
    hydration_ml?: number;
    caffeine_mg?: number;
    screen_time_minutes?: number;
    sleep_hours?: number;
    accumulate?: boolean;
  }) => {
    return api.post('/health/logs', data);
  },
  updateLog: (id: string, data: Partial<{
    log_date: string;
    hydration_ml: number;
    caffeine_mg: number;
    screen_time_minutes: number;
    sleep_hours: number;
  }>) => {
    return api.put(`/health/logs/${id}`, data);
  },
  deleteLog: (id: string) => {
    return api.delete(`/health/logs/${id}`);
  },
};

// User API methods
export const userApi = {
  // Get current logged-in user details
  me: () => {
    return api.get<ApiDataResponse<User>>('/user/me');
  },
};

export const whatsappApi = {
  getSettings: () => api.get('/integrations/whatsapp'),
  updateSettings: (data: {
    phone_number: string | null;
    enabled: boolean;
    timezone: string;
    daily_briefing_time: string;
    reminder_lead_minutes: number;
    reminder_schedule: {
      daily_briefing_time: string;
      deadline_lead_minutes: number[];
      progress_checkin_time: string;
      burnout_checkin_time: string;
      habit_checkin_time: string;
      weekly_review_day: number;
      weekly_review_time: string;
    };
    features: Record<string, boolean>;
    consent?: boolean;
  }) => api.patch('/integrations/whatsapp', data),
  connect: () => api.post('/integrations/whatsapp/connect'),
  requestVerification: (data: { phone_number: string }) =>
    api.post('/integrations/whatsapp/verification/request', data),
  confirmVerification: (data: { code: string }) =>
    api.post('/integrations/whatsapp/verification/confirm', data),
  sendTest: () => api.post('/integrations/whatsapp/test'),
};

export interface GoogleWorkspaceStatus {
  connected: boolean;
  google_email: string;
  google_name: string;
  avatar_url?: string | null;
  services: {
    calendar: {
      enabled: boolean;
      name: string;
      description: string;
      last_synced_at?: string;
      synced_items_count: number;
    };
    meet: {
      enabled: boolean;
      name: string;
      description: string;
      active_rooms: number;
    };
    drive: {
      enabled: boolean;
      name: string;
      description: string;
      synced: boolean;
    };
    tasks: {
      enabled: boolean;
      name: string;
      description: string;
      synced_items_count: number;
    };
  };
}

export const googleIntegrationApi = {
  getStatus: () => api.get<ApiDataResponse<GoogleWorkspaceStatus>>('/integrations/google/status'),
  syncCalendar: () =>
    api.post<ApiDataResponse<{
      synced_count: number;
      synced_at: string;
      events: Array<{
        id: string;
        title: string;
        type: string;
        day_of_week?: number;
        start_time: string;
        end_time: string;
        room?: string;
        category?: string;
        google_calendar_url: string;
      }>;
      message: string;
    }>>('/integrations/google/calendar/sync'),
  createMeet: (data: { title: string; start_time?: string | null; duration_minutes?: number }) =>
    api.post<ApiDataResponse<{
      title: string;
      meet_code: string;
      meet_url: string;
      instant_new_meet_url: string;
      calendar_event_url: string;
      scheduled_start: string;
      duration_minutes: number;
      created_by: string;
      message: string;
    }>>('/integrations/google/meet/create', data),
  exportDrive: (data: { title: string; content: string; type?: 'doc' | 'sheet' | 'note' }) =>
    api.post<ApiDataResponse<{
      title: string;
      type: string;
      google_docs_create_url: string;
      google_drive_url: string;
      content_length: number;
      exported_at: string;
      message: string;
    }>>('/integrations/google/drive/export', data),
  syncTasks: () =>
    api.post<ApiDataResponse<{
      synced_count: number;
      synced_at: string;
      items: Array<{
        id: string;
        title: string;
        notes?: string;
        due?: string | null;
        priority?: string;
        type: string;
      }>;
      google_tasks_web_url: string;
      message: string;
    }>>('/integrations/google/tasks/sync'),
};

export default api;
