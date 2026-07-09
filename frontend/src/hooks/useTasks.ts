import { useState, useEffect, useCallback } from 'react';
import { getApiErrorMessage, taskApi } from '@/lib/api';
import type { Task } from '@/types/task';
import { toast } from 'sonner';
import { useRealtime } from './useRealtime';

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await taskApi.getTasks();
      setTasks(response.data.data);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to fetch tasks');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTask = useCallback(async (input: string) => {
    try {
      const response = await taskApi.smartParse(input);
      const newTask = response.data.data;
      // Real-time listener will append, but we can do it optimistically/manually to avoid duplicates
      setTasks((prev) => {
        if (prev.some((t) => t.id === newTask.id)) return prev;
        return [...prev, newTask];
      });
      toast.success('Task created successfully!');
      return newTask;
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to create task');
      toast.error(message);
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (id: string, data: Partial<Task>) => {
    try {
      const response = await taskApi.updateTask(id, data);
      const updatedTask = response.data.data;
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? updatedTask : task))
      );
      toast.success('Task updated!');
      return updatedTask;
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to update task');
      toast.error(message);
      throw err;
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      await taskApi.deleteTask(id);
      setTasks((prev) => prev.filter((task) => task.id !== id));
      toast.success('Task deleted!');
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to delete task');
      toast.error(message);
      throw err;
    }
  }, []);

  const toggleTaskStatus = useCallback(async (id: string, customStatus?: 'pending' | 'in_progress' | 'completed' | 'cancelled') => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;

    const newStatus = customStatus || (task.status === 'completed' ? 'pending' : 'completed');
    await updateTask(id, { status: newStatus });
  }, [tasks, updateTask]);

  // Hook up real-time listener for task changes
  useRealtime({
    onTaskCreated: useCallback((task: Task) => {
      setTasks((prev) => {
        if (prev.some((t) => t.id === task.id)) return prev;
        return [...prev, task];
      });
    }, []),
    onTaskUpdated: useCallback((task: Task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    }, []),
    onTaskDeleted: useCallback((taskId: string) => {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }, []),
  });

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
    toggleTaskStatus,
  };
}
