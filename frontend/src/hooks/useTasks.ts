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
      toast.success('Tugas berhasil dibuat.');
      return newTask;
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to create task');
      toast.error(message);
      throw err;
    }
  }, []);

  const updateTask = useCallback(async (id: string, data: Partial<Task>, options?: { silent?: boolean }) => {
    const previousTask = tasks.find((task) => task.id === id);
    setTasks((prev) => prev.map((task) => task.id === id
      ? { ...task, ...data, updated_at: new Date().toISOString() }
      : task));

    try {
      const response = await taskApi.updateTask(id, data);
      const updatedTask = response.data.data;
      setTasks((prev) =>
        prev.map((task) => (task.id === id ? updatedTask : task))
      );
      if (!options?.silent) toast.success('Perubahan tugas tersimpan.');
      return updatedTask;
    } catch (err: unknown) {
      if (previousTask) {
        const rollbackTask = previousTask;
        setTasks((prev) => prev.map((task) => (task.id === id ? rollbackTask : task)));
      }
      const message = getApiErrorMessage(err, 'Failed to update task');
      toast.error(message);
      throw err;
    }
  }, [tasks]);

  const deleteTask = useCallback(async (id: string) => {
    const deletedIndex = tasks.findIndex((task) => task.id === id);
    const deletedTask = tasks[deletedIndex];
    setTasks((prev) => prev.filter((task) => task.id !== id));

    try {
      await taskApi.deleteTask(id);
      toast.success('Tugas berhasil dihapus.');
    } catch (err: unknown) {
      if (deletedTask) {
        const rollbackTask = deletedTask;
        setTasks((prev) => {
          if (prev.some((task) => task.id === rollbackTask.id)) return prev;
          const next = [...prev];
          next.splice(Math.max(0, deletedIndex), 0, rollbackTask);
          return next;
        });
      }
      const message = getApiErrorMessage(err, 'Failed to delete task');
      toast.error(message);
      throw err;
    }
  }, [tasks]);

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
