export interface HealthMetrics {
  burnout_risk: 'low' | 'medium' | 'high';
  workload_balance: 'underloaded' | 'balanced' | 'overloaded';
  stress_level: number;
  cognitive_load?: number;
}

export interface AIBriefing {
  id: string;
  user_id: string;
  briefing_date: string;
  summary_content: string;
  health_metrics: HealthMetrics;
  recommended_adjustments: string[];
  context?: {
    tasks_count: number;
    overdue_count: number;
    upcoming_deadlines: Array<{ title: string; deadline: string | null }>;
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
  };
  created_at?: string;
  updated_at?: string;
}
