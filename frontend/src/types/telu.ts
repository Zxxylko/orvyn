export type AcademicTaskType = 'tp' | 'praktikum' | 'jurnal' | 'tubes' | 'exam';
export type AcademicTaskStatus = 'todo' | 'in_progress' | 'completed';

export interface AcademicTask {
  id: string;
  user_id: string;
  course_name: string;
  task_type: AcademicTaskType;
  title: string;
  description: string | null;
  deadline: string | null;
  status: AcademicTaskStatus;
  lms_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ExpenseCategory = 'rent' | 'food' | 'laundry' | 'coffee' | 'developer_sub' | 'other';

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
