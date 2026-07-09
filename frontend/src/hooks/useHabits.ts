import { useCallback, useEffect, useState } from 'react';
import { getApiErrorMessage, habitApi } from '@/lib/api';
import type { CreateHabitData, Habit } from '@/types/habit';
import { toast } from 'sonner';

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHabits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await habitApi.getHabits();
      setHabits(response.data.data);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to fetch habits');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createHabit = useCallback(async (data: CreateHabitData) => {
    try {
      const response = await habitApi.createHabit(data);
      const habit = response.data.data;
      setHabits((prev) => [...prev, habit]);
      toast.success('Habit created.');
      return habit;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to create habit'));
      throw err;
    }
  }, []);

  const updateHabit = useCallback(async (id: string, data: Partial<CreateHabitData & { is_active: boolean }>) => {
    try {
      const response = await habitApi.updateHabit(id, data);
      const habit = response.data.data;
      setHabits((prev) => prev.map((item) => (item.id === id ? habit : item)));
      toast.success('Habit updated.');
      return habit;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to update habit'));
      throw err;
    }
  }, []);

  const deleteHabit = useCallback(async (id: string) => {
    try {
      await habitApi.deleteHabit(id);
      setHabits((prev) => prev.filter((item) => item.id !== id));
      toast.success('Habit deleted.');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to delete habit'));
      throw err;
    }
  }, []);

  const checkInHabit = useCallback(async (id: string) => {
    try {
      const response = await habitApi.checkIn(id);
      const habit = response.data.data;
      setHabits((prev) => prev.map((item) => (item.id === id ? habit : item)));
      toast.success('Streak updated.');
      return habit;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to check in habit'));
      throw err;
    }
  }, []);

  const uncheckHabit = useCallback(async (id: string) => {
    try {
      const response = await habitApi.uncheck(id);
      const habit = response.data.data;
      setHabits((prev) => prev.map((item) => (item.id === id ? habit : item)));
      toast.success('Check-in removed.');
      return habit;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to remove check-in'));
      throw err;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchHabits();
    });
  }, [fetchHabits]);

  return {
    habits,
    loading,
    error,
    fetchHabits,
    createHabit,
    updateHabit,
    deleteHabit,
    checkInHabit,
    uncheckHabit,
  };
}
