import type { ApiEnvelope } from '../types';
import { api } from './api';

export const PUSH_FEATURE_KEYS = [
  'daily_briefing',
  'deadline_reminders',
  'progress_checkins',
  'burnout_checkins',
  'habit_health',
  'campus_departure_reminders',
  'weekly_review',
] as const;

export type PushFeatureKey = (typeof PUSH_FEATURE_KEYS)[number];

export interface PushReminderSchedule {
  daily_briefing_time: string;
  deadline_lead_minutes: number[];
  progress_checkin_time: string;
  burnout_checkin_time: string;
  habit_checkin_time: string;
  weekly_review_day: number;
  weekly_review_time: string;
}

export interface PushNotificationSettings {
  enabled: boolean;
  timezone: string;
  daily_briefing_time: string;
  reminder_lead_minutes: number;
  reminder_schedule: PushReminderSchedule;
  features: Record<PushFeatureKey, boolean>;
}

export interface PushDevice {
  id: string;
  token_hint: string;
  platform: 'android' | 'ios';
  device_name: string | null;
  app_version: string | null;
  enabled: boolean;
  last_seen_at: string | null;
  has_error: boolean;
}

export interface PushNotificationState {
  settings: PushNotificationSettings;
  devices: PushDevice[];
  provider: {
    enabled: boolean;
    ready: boolean;
  };
}

const DEFAULT_SCHEDULE: PushReminderSchedule = {
  daily_briefing_time: '07:00',
  deadline_lead_minutes: [180],
  progress_checkin_time: '14:00',
  burnout_checkin_time: '16:00',
  habit_checkin_time: '18:00',
  weekly_review_day: 7,
  weekly_review_time: '19:00',
};

const DEFAULT_FEATURES: Record<PushFeatureKey, boolean> = {
  daily_briefing: true,
  deadline_reminders: true,
  progress_checkins: true,
  burnout_checkins: true,
  habit_health: true,
  campus_departure_reminders: true,
  weekly_review: true,
};

type RawSettings = Partial<Omit<PushNotificationSettings, 'reminder_schedule' | 'features'>> & {
  reminder_schedule?: Partial<PushReminderSchedule>;
  features?: Partial<Record<PushFeatureKey, boolean>>;
};

function normalizeSettings(settings: RawSettings): PushNotificationSettings {
  const deadlineLeads = settings.reminder_schedule?.deadline_lead_minutes?.length
    ? [...settings.reminder_schedule.deadline_lead_minutes].sort((first, second) => second - first)
    : [settings.reminder_lead_minutes ?? 180];

  return {
    enabled: settings.enabled ?? false,
    timezone: settings.timezone ?? 'Asia/Jakarta',
    daily_briefing_time: settings.daily_briefing_time
      ?? settings.reminder_schedule?.daily_briefing_time
      ?? '07:00',
    reminder_lead_minutes: settings.reminder_lead_minutes ?? Math.max(...deadlineLeads),
    reminder_schedule: {
      ...DEFAULT_SCHEDULE,
      ...settings.reminder_schedule,
      deadline_lead_minutes: deadlineLeads,
    },
    features: {
      ...DEFAULT_FEATURES,
      ...settings.features,
    },
  };
}

export const pushNotificationApi = {
  async getState(): Promise<PushNotificationState> {
    const response = await api.get<ApiEnvelope<Omit<PushNotificationState, 'settings'> & { settings: RawSettings }>>('/push-notifications');

    return {
      ...response.data.data,
      settings: normalizeSettings(response.data.data.settings),
    };
  },

  async update(settings: PushNotificationSettings): Promise<PushNotificationSettings> {
    const response = await api.patch<ApiEnvelope<RawSettings>>('/push-notifications', {
      enabled: settings.enabled,
      timezone: settings.timezone,
      reminder_schedule: settings.reminder_schedule,
      features: settings.features,
    });

    return normalizeSettings(response.data.data);
  },

  async sendTest(): Promise<string> {
    const response = await api.post<{ message: string }>('/push-notifications/test');
    return response.data.message;
  },
};
