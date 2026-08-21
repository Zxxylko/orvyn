import type { ApiEnvelope } from '../types';
import { api } from './api';

export const EXPENSE_CATEGORIES = ['rent', 'food', 'laundry', 'coffee', 'developer_sub', 'other'] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface LivingExpense {
  id: string;
  user_id: string;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  expense_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface FinanceSummary {
  total_spend: number;
  monthly_limit: number;
  remaining_budget: number;
  categories: Record<ExpenseCategory, number>;
  insights: string[];
}

export interface ExpenseInput {
  amount: number;
  category: ExpenseCategory;
  description?: string | null;
  expense_date: string;
}

export interface HealthLog {
  id: string;
  user_id: string;
  hydration_ml: number;
  caffeine_mg: number;
  screen_time_minutes: number;
  sleep_hours: number;
  log_date: string;
  created_at?: string;
  updated_at?: string;
}

export interface HealthAlert {
  type: 'info' | 'warning' | 'danger';
  category: 'hydration' | 'caffeine' | 'sleep' | 'screentime';
  message: string;
}

export interface HealthSnapshot {
  hydration_ml: number;
  caffeine_mg: number;
  screen_time_minutes: number;
  sleep_hours: number;
  alerts: HealthAlert[];
}

export interface HealthLogInput {
  log_date: string;
  hydration_ml?: number;
  caffeine_mg?: number;
  screen_time_minutes?: number;
  sleep_hours?: number;
  accumulate?: boolean;
}

export const WHATSAPP_FEATURE_KEYS = [
  'daily_briefing',
  'deadline_reminders',
  'task_capture',
  'quick_actions',
  'campus_updates',
  'progress_checkins',
  'burnout_checkins',
  'habit_health',
  'finance_logging',
  'weekly_review',
] as const;

export type WhatsAppFeatureKey = (typeof WHATSAPP_FEATURE_KEYS)[number];

export interface ReminderSchedule {
  daily_briefing_time: string;
  deadline_lead_minutes: number[];
  progress_checkin_time: string;
  burnout_checkin_time: string;
  habit_checkin_time: string;
  weekly_review_day: number;
  weekly_review_time: string;
}

export interface WhatsAppSettings {
  phone_number: string | null;
  verified: boolean;
  verification_expires_at: string | null;
  enabled: boolean;
  timezone: string;
  daily_briefing_time: string;
  reminder_lead_minutes: number;
  reminder_schedule: ReminderSchedule;
  features: Record<WhatsAppFeatureKey, boolean>;
  consented: boolean;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

export interface WhatsAppServiceState {
  online: boolean;
  connected: boolean;
  status: string;
  qr: string | null;
  phone?: string | null;
}

export interface WhatsAppAiState {
  provider: string;
  online: boolean;
  model: string | null;
}

export interface WhatsAppIntegrationState {
  settings: WhatsAppSettings;
  service: WhatsAppServiceState;
  ai: WhatsAppAiState;
}

export interface WhatsAppSettingsInput {
  phone_number: string | null;
  enabled: boolean;
  timezone: string;
  daily_briefing_time: string;
  reminder_lead_minutes: number;
  reminder_schedule: ReminderSchedule;
  features: Record<WhatsAppFeatureKey, boolean>;
  consent?: boolean;
}

export interface WhatsAppConnectState {
  connected: boolean;
  status: string;
  qr: string | null;
}

export interface WhatsAppVerificationRequestInput {
  phone_number: string;
}

export interface WhatsAppVerificationConfirmInput {
  code: string;
}

export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  daily_briefing_time: '07:00',
  deadline_lead_minutes: [180],
  progress_checkin_time: '14:00',
  burnout_checkin_time: '16:00',
  habit_checkin_time: '18:00',
  weekly_review_day: 7,
  weekly_review_time: '19:00',
};

export const DEFAULT_WHATSAPP_FEATURES: Record<WhatsAppFeatureKey, boolean> = {
  daily_briefing: true,
  deadline_reminders: true,
  task_capture: true,
  quick_actions: true,
  campus_updates: true,
  progress_checkins: true,
  burnout_checkins: true,
  habit_health: true,
  finance_logging: true,
  weekly_review: true,
};

type ApiNumber = number | string;

interface RawLivingExpense extends Omit<LivingExpense, 'amount'> {
  amount: ApiNumber;
}

interface RawFinanceSummary extends Omit<FinanceSummary, 'total_spend' | 'monthly_limit' | 'remaining_budget' | 'categories'> {
  total_spend: ApiNumber;
  monthly_limit: ApiNumber;
  remaining_budget: ApiNumber;
  categories: Record<ExpenseCategory, ApiNumber>;
}

interface RawHealthLog extends Omit<HealthLog, 'sleep_hours'> {
  sleep_hours: ApiNumber;
}

function toNumber(value: ApiNumber | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeExpense(expense: RawLivingExpense): LivingExpense {
  return { ...expense, amount: toNumber(expense.amount) };
}

function normalizeSummary(summary: RawFinanceSummary): FinanceSummary {
  return {
    ...summary,
    total_spend: toNumber(summary.total_spend),
    monthly_limit: toNumber(summary.monthly_limit),
    remaining_budget: toNumber(summary.remaining_budget),
    categories: {
      rent: toNumber(summary.categories.rent),
      food: toNumber(summary.categories.food),
      laundry: toNumber(summary.categories.laundry),
      coffee: toNumber(summary.categories.coffee),
      developer_sub: toNumber(summary.categories.developer_sub),
      other: toNumber(summary.categories.other),
    },
  };
}

function normalizeHealthLog(log: RawHealthLog): HealthLog {
  return { ...log, sleep_hours: toNumber(log.sleep_hours) };
}

export function normalizeWhatsAppSettings(incoming: Partial<WhatsAppSettings>): WhatsAppSettings {
  const incomingSchedule = incoming.reminder_schedule ?? DEFAULT_REMINDER_SCHEDULE;
  const deadlineLeadMinutes = incomingSchedule.deadline_lead_minutes?.length
    ? [...incomingSchedule.deadline_lead_minutes].sort((first, second) => second - first)
    : [incoming.reminder_lead_minutes ?? 180];

  return {
    phone_number: incoming.phone_number ?? null,
    verified: incoming.verified ?? false,
    verification_expires_at: incoming.verification_expires_at ?? null,
    enabled: incoming.enabled ?? false,
    timezone: incoming.timezone ?? 'Asia/Jakarta',
    daily_briefing_time: incoming.daily_briefing_time ?? incomingSchedule.daily_briefing_time ?? '07:00',
    reminder_lead_minutes: incoming.reminder_lead_minutes ?? Math.max(...deadlineLeadMinutes),
    reminder_schedule: {
      ...DEFAULT_REMINDER_SCHEDULE,
      ...incomingSchedule,
      deadline_lead_minutes: deadlineLeadMinutes,
    },
    features: {
      ...DEFAULT_WHATSAPP_FEATURES,
      ...(incoming.features ?? {}),
    },
    consented: incoming.consented ?? false,
    last_inbound_at: incoming.last_inbound_at ?? null,
    last_outbound_at: incoming.last_outbound_at ?? null,
  };
}

export const financeApi = {
  async getSummary(): Promise<FinanceSummary> {
    const response = await api.get<ApiEnvelope<RawFinanceSummary>>('/finance/summary');
    return normalizeSummary(response.data.data);
  },

  async updateBudget(monthlyLimit: number): Promise<number> {
    const response = await api.patch<ApiEnvelope<{ monthly_limit: ApiNumber }>>('/finance/budget', {
      monthly_limit: monthlyLimit,
    });
    return toNumber(response.data.data.monthly_limit);
  },

  async getExpenses(limit = 50): Promise<LivingExpense[]> {
    const response = await api.get<ApiEnvelope<RawLivingExpense[]>>('/finance/expenses', { params: { limit } });
    return response.data.data.map(normalizeExpense);
  },

  async createExpense(input: ExpenseInput): Promise<LivingExpense> {
    const response = await api.post<ApiEnvelope<RawLivingExpense>>('/finance/expenses', input);
    return normalizeExpense(response.data.data);
  },

  async updateExpense(id: string, input: ExpenseInput): Promise<LivingExpense> {
    const response = await api.put<ApiEnvelope<RawLivingExpense>>(`/finance/expenses/${id}`, input);
    return normalizeExpense(response.data.data);
  },

  async deleteExpense(id: string): Promise<void> {
    await api.delete(`/finance/expenses/${id}`);
  },
};

export const healthApi = {
  async getSnapshot(): Promise<HealthSnapshot> {
    const response = await api.get<ApiEnvelope<HealthSnapshot>>('/health/snapshot');
    return {
      ...response.data.data,
      hydration_ml: toNumber(response.data.data.hydration_ml),
      caffeine_mg: toNumber(response.data.data.caffeine_mg),
      screen_time_minutes: toNumber(response.data.data.screen_time_minutes),
      sleep_hours: toNumber(response.data.data.sleep_hours),
    };
  },

  async getLogs(days = 30): Promise<HealthLog[]> {
    const response = await api.get<ApiEnvelope<RawHealthLog[]>>('/health/logs', { params: { days } });
    return response.data.data.map(normalizeHealthLog);
  },

  async log(input: HealthLogInput): Promise<HealthLog> {
    const response = await api.post<ApiEnvelope<RawHealthLog>>('/health/logs', input);
    return normalizeHealthLog(response.data.data);
  },

  async updateLog(id: string, input: Omit<HealthLogInput, 'accumulate'>): Promise<HealthLog> {
    const response = await api.put<ApiEnvelope<RawHealthLog>>(`/health/logs/${id}`, input);
    return normalizeHealthLog(response.data.data);
  },

  async deleteLog(id: string): Promise<void> {
    await api.delete(`/health/logs/${id}`);
  },
};

export const whatsappApi = {
  async getState(): Promise<WhatsAppIntegrationState> {
    const response = await api.get<ApiEnvelope<Omit<WhatsAppIntegrationState, 'settings'> & { settings: Partial<WhatsAppSettings> }>>('/integrations/whatsapp');
    return {
      ...response.data.data,
      settings: normalizeWhatsAppSettings(response.data.data.settings),
    };
  },

  async updateSettings(input: WhatsAppSettingsInput): Promise<WhatsAppSettings> {
    const response = await api.patch<ApiEnvelope<Partial<WhatsAppSettings>>>('/integrations/whatsapp', input);
    return normalizeWhatsAppSettings(response.data.data);
  },

  async requestVerification(input: WhatsAppVerificationRequestInput): Promise<void> {
    await api.post('/integrations/whatsapp/verification/request', input);
  },

  async confirmVerification(input: WhatsAppVerificationConfirmInput): Promise<void> {
    await api.post('/integrations/whatsapp/verification/confirm', input);
  },

  async connect(): Promise<WhatsAppConnectState> {
    const response = await api.post<ApiEnvelope<WhatsAppConnectState>>('/integrations/whatsapp/connect');
    return response.data.data;
  },

  async sendTest(): Promise<string> {
    const response = await api.post<{ message: string }>('/integrations/whatsapp/test');
    return response.data.message;
  },
};
