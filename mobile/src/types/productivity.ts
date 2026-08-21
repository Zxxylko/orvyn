export type TimeBlockType = 'task' | 'break' | 'class' | 'personal' | 'study';

export interface TimeBlockTaskSummary {
  id: string;
  title: string;
  category?: string | null;
}

export interface TimeBlock {
  id: string;
  user_id: string;
  task_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  block_type: TimeBlockType;
  task?: TimeBlockTaskSummary | null;
  created_at?: string;
  updated_at?: string;
}

export interface TimeBlockInput {
  label: string;
  start_time: string;
  end_time: string;
  task_id?: string | null;
  is_locked?: boolean;
  block_type?: TimeBlockType;
}

export type TimeBlockUpdate = Partial<TimeBlockInput>;

export interface BriefingHealthMetrics {
  burnout_risk: 'low' | 'medium' | 'high';
  workload_balance: 'underloaded' | 'balanced' | 'overloaded';
  stress_level: number;
  cognitive_load?: number;
}

export interface BriefingContext {
  tasks_count: number;
  overdue_count: number;
  upcoming_deadlines: Array<{
    title: string;
    deadline: string | null;
  }>;
  completion_rate: number;
  avg_difficulty: number;
  today_schedule: Array<{
    label: string;
    type: string;
    start: string | null;
    end: string | null;
  }>;
  health_today: {
    hydration_ml: number;
    caffeine_mg: number;
    screen_time_minutes: number;
    sleep_hours: number;
  } | null;
  monthly_spend: number;
  academic_deadlines: Array<{
    course: string;
    title: string;
    type: string;
    deadline: string | null;
  }>;
}

export interface AIBriefing {
  id: string;
  user_id: string;
  briefing_date: string;
  summary_content: string;
  health_metrics: BriefingHealthMetrics;
  recommended_adjustments: string[];
  context?: BriefingContext;
  created_at?: string;
  updated_at?: string;
}

export type FocusSessionType = 'pomodoro' | 'deep_work' | 'review';

export interface FocusLogInput {
  task_id?: string | null;
  planned_minutes: number;
  actual_minutes: number;
  focus_rating: number;
  completed: boolean;
  session_type?: FocusSessionType;
  started_at: string;
  ended_at?: string | null;
}

export interface FocusLog extends FocusLogInput {
  id: string;
  user_id: string;
  task_id: string | null;
  session_type: FocusSessionType;
  task?: TimeBlockTaskSummary | null;
  created_at?: string;
  updated_at?: string;
}

