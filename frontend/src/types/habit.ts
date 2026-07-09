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

export interface CreateHabitData {
  name: string;
  description?: string;
  category?: string;
  target_per_day?: number;
  unit?: string;
  color?: string;
}
