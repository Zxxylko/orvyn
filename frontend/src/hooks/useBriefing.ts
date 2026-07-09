import { useState, useCallback } from 'react';
import type { AIBriefing } from '@/types/briefing';
import { briefingApi, getApiErrorMessage } from '@/lib/api';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { useRealtime } from './useRealtime';

export function useBriefing() {
  const [briefing, setBriefing] = useState<AIBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTodayBriefing = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await briefingApi.getToday();
      if (response.data?.data) {
        setBriefing(response.data.data);
      }
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        // Safe to ignore, user might not have a briefing generated yet
        setBriefing(null);
      } else {
        const msg = getApiErrorMessage(err, 'Failed to load today\'s briefing');
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const generateBriefing = async () => {
    setGenerating(true);
    setError(null);
    try {
      const response = await briefingApi.generate();
      if (response.data?.data) {
        setBriefing(response.data.data);
        toast.success('AI Briefing generated for today!');
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to generate briefing');
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  // Hook up real-time listener for daily AI briefing updates
  useRealtime({
    onBriefingGenerated: useCallback((newBriefing: AIBriefing) => {
      setBriefing(newBriefing);
    }, []),
  });

  return {
    briefing,
    loading,
    generating,
    error,
    fetchTodayBriefing,
    generateBriefing,
  };
}
