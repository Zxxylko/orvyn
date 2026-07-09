import type { Task } from './task';

export interface HcfBreakdown {
  coding: number;
  theory: number;
  admin: number;
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
  hcf: HcfBreakdown;
}

export interface FocusLog {
  id: string;
  user_id: string;
  task_id: string | null;
  planned_minutes: number;
  actual_minutes: number;
  focus_rating: number;
  completed: boolean;
  session_type: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
  task?: Task;
}

export interface PeakHoursData {
  peak_hours: number[];
  chronotype: 'early_bird' | 'night_owl' | 'standard';
  confidence: number;
  heatmap: Record<number, number>;
}

export interface StudentProfile {
  id: string;
  user_id: string;
  preferred_chronotype: string;
  coding_hcf: number;
  theory_hcf: number;
  admin_hcf: number;
  current_streak: number;
  longest_streak: number;
  burnout_risk_index: number;
  flow_state_score: number;
  preferred_start_hour: number;
  preferred_end_hour: number;
  max_daily_focus_minutes: number;
  last_active_date: string | null;
}
