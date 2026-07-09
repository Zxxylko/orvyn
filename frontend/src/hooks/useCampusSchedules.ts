import { useCallback, useEffect, useState } from 'react';
import { campusApi, getApiErrorMessage } from '@/lib/api';
import type { CampusSchedule, CreateCampusScheduleData } from '@/types/campus';
import { toast } from 'sonner';

export function useCampusSchedules() {
  const [schedules, setSchedules] = useState<CampusSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await campusApi.getSchedules();
      setSchedules(response.data.data);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, 'Failed to fetch campus schedules');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createSchedule = useCallback(async (data: CreateCampusScheduleData) => {
    try {
      const response = await campusApi.createSchedule(data);
      const schedule = response.data.data;
      setSchedules((prev) => [...prev, schedule].sort(sortSchedules));
      toast.success('Campus schedule added.');
      return schedule;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to create campus schedule'));
      throw err;
    }
  }, []);

  const updateSchedule = useCallback(async (id: string, data: Partial<CreateCampusScheduleData>) => {
    try {
      const response = await campusApi.updateSchedule(id, data);
      const schedule = response.data.data;
      setSchedules((prev) => prev.map((item) => (item.id === id ? schedule : item)).sort(sortSchedules));
      toast.success('Campus schedule updated.');
      return schedule;
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to update campus schedule'));
      throw err;
    }
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    try {
      await campusApi.deleteSchedule(id);
      setSchedules((prev) => prev.filter((item) => item.id !== id));
      toast.success('Campus schedule deleted.');
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to delete campus schedule'));
      throw err;
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void fetchSchedules();
    });
  }, [fetchSchedules]);

  return {
    schedules,
    loading,
    error,
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
  };
}

function sortSchedules(a: CampusSchedule, b: CampusSchedule) {
  if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
  return a.start_time.localeCompare(b.start_time);
}
