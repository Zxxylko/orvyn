import type { NavigatorScreenParams } from '@react-navigation/native';

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface User {
  id: string;
  firebase_uid?: string;
  name: string;
  email: string;
  email_verified_at: string | null;
  preferences?: {
    theme?: 'light' | 'dark';
    notifications_enabled?: boolean;
  };
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  duration_minutes: number;
  difficulty: number;
  category: string;
  tags: string[] | null;
  ai_processed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HabitCheckIn {
  id: string;
  check_in_date: string;
  value: number;
  note: string | null;
}

export interface Habit {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string;
  target_per_day: number;
  unit: string;
  color: string;
  is_active: boolean;
  current_streak: number;
  longest_streak: number;
  checked_in_today: boolean;
  check_ins: HabitCheckIn[];
  created_at: string;
  updated_at: string;
}

export interface AnalyticsSnapshot {
  burnout_risk_index: number;
  burnout_level: 'low' | 'medium' | 'high';
  flow_state_score: number;
  current_streak: number;
  longest_streak: number;
  chronotype: 'early_bird' | 'night_owl' | 'standard';
  peak_hours: number[];
  active_tasks: number;
  overdue_tasks: number;
  completed_this_week: number;
  focus_minutes_this_week: number;
  avg_focus_rating: number;
  hcf: Record<string, number>;
}

export interface ApiEnvelope<T> {
  data: T;
  message?: string;
}

export type RootTabParamList = {
  Beranda: undefined;
  Tugas: undefined;
  Jadwal: NavigatorScreenParams<ScheduleStackParamList> | undefined;
  Hub: NavigatorScreenParams<HubStackParamList> | undefined;
  Akun: undefined;
};

export type ScheduleStackParamList = {
  Agenda: undefined;
  Focus: undefined;
};

export type HubStackParamList = {
  HubHome: undefined;
  Briefing: undefined;
  Academic: undefined;
  Campus: undefined;
  Finance: undefined;
  Health: undefined;
  Habits: undefined;
  PushNotifications: undefined;
  WhatsApp: undefined;
};
