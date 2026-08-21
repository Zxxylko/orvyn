export const ACADEMIC_TASK_TYPES = ['tp', 'praktikum', 'jurnal', 'tubes', 'exam'] as const;
export const ACADEMIC_TASK_STATUSES = ['todo', 'in_progress', 'completed'] as const;

export type AcademicTaskType = (typeof ACADEMIC_TASK_TYPES)[number];
export type AcademicTaskStatus = (typeof ACADEMIC_TASK_STATUSES)[number];

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
  mirrored_task_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AcademicTaskInput {
  course_name: string;
  task_type: AcademicTaskType;
  title: string;
  description: string | null;
  deadline: string | null;
  status: AcademicTaskStatus;
  lms_url: string | null;
}

export const CAMPUS_CLASS_TYPES = ['lecture', 'lab', 'project', 'exam', 'seminar'] as const;

export type CampusClassType = (typeof CAMPUS_CLASS_TYPES)[number];

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

export interface CampusScheduleInput {
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
}

export interface CampusScheduleQuery {
  day_of_week?: number;
  active?: boolean;
}
