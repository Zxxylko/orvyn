import axios, { isAxiosError } from 'axios';
import type { CreateTimeBlockData, UpdateTimeBlockData } from '@/types/timeblock';
import type { CreateHabitData } from '@/types/habit';
import type { CreateCampusScheduleData } from '@/types/campus';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

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

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (config.method && config.method.toLowerCase() !== 'get') {
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
  (error) => {
    if (error.config?.method && error.config.method.toLowerCase() !== 'get') {
      window.dispatchEvent(new CustomEvent('orvyn:sync-error'));
    }
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('auth_token');
      // Only redirect if we are not already on login page
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

// API methods
export const authApi = {
  demoLogin: () => {
    return api.post('/auth/demo-login');
  },
};

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
    return api.get('/user/me');
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
  sendTest: () => api.post('/integrations/whatsapp/test'),
};

export default api;
