import type { Task } from './task';

export interface TimeBlock {
  id: string;
  user_id: string;
  task_id: string | null;
  label: string;
  start_time: string;
  end_time: string;
  is_locked: boolean;
  block_type: 'task' | 'break' | 'class' | 'personal' | 'study';
  task?: Task;
  created_at?: string;
  updated_at?: string;
}

export interface CreateTimeBlockData {
  label: string;
  start_time: string;
  end_time: string;
  task_id?: string | null;
  is_locked?: boolean;
  block_type?: 'task' | 'break' | 'class' | 'personal' | 'study';
}

export interface UpdateTimeBlockData {
  label?: string;
  start_time?: string;
  end_time?: string;
  task_id?: string | null;
  is_locked?: boolean;
  block_type?: 'task' | 'break' | 'class' | 'personal' | 'study';
}
