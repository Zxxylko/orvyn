import { useState, useEffect, useCallback } from 'react';
import type { AcademicTask } from '@/types/telu';
import { academicApi, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useAcademic() {
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await academicApi.getTasks();
      setTasks(response.data.data);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to fetch academic tasks');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (data: {
    course_name: string;
    task_type: 'tp' | 'praktikum' | 'jurnal' | 'tubes' | 'exam';
    title: string;
    description?: string;
    deadline?: string;
    status?: 'todo' | 'in_progress' | 'completed';
    lms_url?: string;
  }) => {
    try {
      const response = await academicApi.createTask(data);
      const newTask = response.data.data;
      setTasks((prev) => [...prev, newTask]);
      toast.success('Academic task logged and synced with AI Scheduler!');
      return newTask;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to create academic task');
      toast.error(msg);
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (id: string, data: Partial<AcademicTask>) => {
    try {
      const response = await academicApi.updateTask(id, data);
      const updatedTask = response.data.data;
      setTasks((prev) => prev.map((t) => (t.id === id ? updatedTask : t)));
      toast.success('Academic task updated.');
      return updatedTask;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update task');
      toast.error(msg);
      throw err;
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await academicApi.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Academic task deleted.');
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to delete task');
      toast.error(msg);
      throw err;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchTasks();
    });
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
  };
}
