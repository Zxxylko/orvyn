import { useState, useEffect, useCallback } from 'react';
import type { AnalyticsSnapshot, FocusLog, PeakHoursData, StudentProfile } from '@/types/analytics';
import { analyticsApi, getApiErrorMessage } from '@/lib/api';
import { toast } from 'sonner';

export function useAnalytics() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [focusLogs, setFocusLogs] = useState<FocusLog[]>([]);
  const [peakHoursData, setPeakHoursData] = useState<PeakHoursData | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSnapshot = useCallback(async () => {
    try {
      setError(null);
      const response = await analyticsApi.getSnapshot();
      setSnapshot(response.data.data);
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to fetch analytics snapshot');
      setError(msg);
      console.error(err);
    }
  }, []);

  const fetchFocusLogs = useCallback(async (days = 30) => {
    try {
      const response = await analyticsApi.getFocusLogs({ days });
      setFocusLogs(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch focus logs', err);
    }
  }, []);

  const fetchPeakHours = useCallback(async () => {
    try {
      const response = await analyticsApi.getPeakHours();
      setPeakHoursData(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch peak hours data', err);
    }
  }, []);

  const fetchProfile = useCallback(async () => {
    try {
      const response = await analyticsApi.getProfile();
      setProfile(response.data.data);
    } catch (err: unknown) {
      console.error('Failed to fetch student profile', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchSnapshot(),
      fetchFocusLogs(),
      fetchPeakHours(),
      fetchProfile(),
    ]);
    setLoading(false);
  }, [fetchSnapshot, fetchFocusLogs, fetchPeakHours, fetchProfile]);

  const logFocusSession = useCallback(async (data: {
    task_id?: string | null;
    planned_minutes: number;
    actual_minutes: number;
    focus_rating: number;
    completed: boolean;
    session_type?: string;
    started_at: string;
    ended_at?: string | null;
  }) => {
    try {
      const response = await analyticsApi.logFocusSession(data);
      toast.success(response.data.message || 'Focus session logged!');
      // Refresh analytics in background to keep stats in sync
      fetchSnapshot();
      fetchFocusLogs();
      fetchPeakHours();
      fetchProfile();
      return response.data.data;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to log focus session');
      toast.error(msg);
      throw err;
    }
  }, [fetchSnapshot, fetchFocusLogs, fetchPeakHours, fetchProfile]);

  const updateProfile = useCallback(async (data: {
    preferred_start_hour?: number;
    preferred_end_hour?: number;
    max_daily_focus_minutes?: number;
  }) => {
    try {
      const response = await analyticsApi.updateProfile(data);
      setProfile(response.data.data);
      toast.success('Scheduling preferences updated!');
      // Refresh snapshot in case daily capacity limit changed CLM ratios
      fetchSnapshot();
      return response.data.data;
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to update profile preferences');
      toast.error(msg);
      throw err;
    }
  }, [fetchSnapshot]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadAllData();
    });
  }, [loadAllData]);

  return {
    snapshot,
    focusLogs,
    peakHoursData,
    profile,
    loading,
    error,
    refreshAnalytics: loadAllData,
    logFocusSession,
    updateProfile,
  };
}
