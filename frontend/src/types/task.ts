export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskCategory = 'academics' | 'personal' | 'health' | 'social' | 'work';


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
  category: TaskCategory;
  tags: string[];
  ai_processed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskFormData {
  title: string;
  description?: string;
  deadline?: string;
  priority?: TaskPriority;
  duration_minutes?: number;
  difficulty?: number;
  category?: TaskCategory;
  tags?: string[];
}
