import { useState, useEffect, useCallback } from 'react';
import type { HealthSnapshot, HealthLog } from '@/types/telu';
import { getApiErrorMessage, healthApi } from '@/lib/api';
import { toast } from 'sonner';

export function useHealth() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot | null>(null);
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      const response = await healthApi.getSnapshot();
      setSnapshot(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch health snapshot', err);
    }
  }, []);

  const fetchLogs = useCallback(async (days = 7) => {
    try {
      const response = await healthApi.getLogs({ days });
      setLogs(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch health logs', err);
    }
  }, []);

  const loadAllHealthData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchSnapshot(), fetchLogs()]);
    } catch {
      setError('Failed to load health indicators');
    } finally {
      setLoading(false);
    }
  }, [fetchSnapshot, fetchLogs]);

  const logHealth = useCallback(async (data: {
    log_date: string;
    hydration_ml?: number;
    caffeine_mg?: number;
    screen_time_minutes?: number;
    sleep_hours?: number;
    accumulate?: boolean;
  }) => {
    try {
      const response = await healthApi.logHealth(data);
      toast.success(response.data.message || 'Wellness log recorded.');
      // Refresh current states
      fetchSnapshot();
      fetchLogs();
      return response.data.data;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update health metrics');
      toast.error(msg);
      throw err;
    }
  }, [fetchSnapshot, fetchLogs]);

  const updateLog = useCallback(async (id: string, data: Partial<{
    log_date: string;
    hydration_ml: number;
    caffeine_mg: number;
    screen_time_minutes: number;
    sleep_hours: number;
  }>) => {
    try {
      const response = await healthApi.updateLog(id, data);
      const updatedLog = response.data.data;
      setLogs((prev) => prev.map((log) => log.id === id ? updatedLog : log));
      toast.success(response.data.message || 'Wellness log updated.');
      fetchSnapshot();
      return updatedLog;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update health log');
      toast.error(msg);
      throw err;
    }
  }, [fetchSnapshot]);

  const deleteLog = useCallback(async (id: string) => {
    try {
      await healthApi.deleteLog(id);
      setLogs((prev) => prev.filter((log) => log.id !== id));
      toast.success('Wellness log deleted.');
      fetchSnapshot();
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to delete health log');
      toast.error(msg);
      throw err;
    }
  }, [fetchSnapshot]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAllHealthData();
    });
  }, [loadAllHealthData]);

  return {
    snapshot,
    logs,
    loading,
    error,
    refreshHealth: loadAllHealthData,
    logHealth,
    updateLog,
    deleteLog,
  };
}
