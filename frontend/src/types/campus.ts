export type CampusClassType = 'lecture' | 'lab' | 'project' | 'exam' | 'seminar';

export interface CampusSchedule {
  id: string;
  user_id: string;
  course_name: string;
  course_code: string | null;
  lecturer: string | null;
  building: string | null;
  room: string | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_type: CampusClassType;
  commute_minutes: number;
  prep_minutes: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateCampusScheduleData {
  course_name: string;
  course_code?: string;
  lecturer?: string;
  building?: string;
  room?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  class_type?: CampusClassType;
  commute_minutes?: number;
  prep_minutes?: number;
  notes?: string;
  is_active?: boolean;
}
