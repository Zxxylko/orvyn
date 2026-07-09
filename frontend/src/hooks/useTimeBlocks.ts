import { useState, useCallback, useRef } from 'react';
import type { TimeBlock, CreateTimeBlockData, UpdateTimeBlockData } from '@/types/timeblock';
import { getApiErrorMessage, timeBlockApi } from '@/lib/api';
import { toast } from 'sonner';

export function useTimeBlocks() {
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep track of the last-fetched date range so optimizeSchedule can re-fetch the same window
  const currentRange = useRef<{ start?: string; end?: string }>({});

  const fetchTimeBlocks = useCallback(async (start_date?: string, end_date?: string) => {
    setLoading(true);
    setError(null);
    currentRange.current = { start: start_date, end: end_date };
    try {
      const response = await timeBlockApi.getTimeBlocks({ start_date, end_date });
      if (response.data?.data) {
        setTimeBlocks(response.data.data);
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to fetch calendar time blocks');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTimeBlock = async (data: CreateTimeBlockData) => {
    try {
      const response = await timeBlockApi.createTimeBlock(data);
      if (response.data?.data) {
        const newBlock = response.data.data;
        setTimeBlocks((prev) => [...prev, newBlock]);
        toast.success(response.data.message || 'Block scheduled successfully!');
        return newBlock;
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Failed to create time block');
      toast.error(msg);
      throw err;
    }
  };

  const updateTimeBlock = async (id: string, data: UpdateTimeBlockData) => {
    // Optimistic update
    const previousBlocks = [...timeBlocks];
    setTimeBlocks((prev) =>
      prev.map((block) => (block.id === id ? { ...block, ...data } as TimeBlock : block))
    );

    try {
      const response = await timeBlockApi.updateTimeBlock(id, data);
      if (response.data?.data) {
        const updated = response.data.data;
        setTimeBlocks((prev) => prev.map((b) => (b.id === id ? updated : b)));
        toast.success('Time block updated');
        return updated;
      }
    } catch (err: unknown) {
      setTimeBlocks(previousBlocks); // Rollback
      const msg = getApiErrorMessage(err, 'Failed to update time block');
      toast.error(msg);
      throw err;
    }
  };

  const deleteTimeBlock = async (id: string) => {
    // Optimistic delete
    const previousBlocks = [...timeBlocks];
    setTimeBlocks((prev) => prev.filter((block) => block.id !== id));

    try {
      await timeBlockApi.deleteTimeBlock(id);
      toast.success('Time block removed');
    } catch (err: unknown) {
      setTimeBlocks(previousBlocks); // Rollback
      const msg = getApiErrorMessage(err, 'Failed to delete time block');
      toast.error(msg);
      throw err;
    }
  };

  const optimizeSchedule = async () => {
    setLoading(true);
    try {
      const response = await timeBlockApi.optimizeSchedule();
      if (response.data?.data) {
        toast.success(response.data.message || 'Schedule optimized successfully!');
        // Re-fetch for the currently viewed week
        await fetchTimeBlocks(currentRange.current.start, currentRange.current.end);
      }
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Schedule optimization failed');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return {
    timeBlocks,
    loading,
    error,
    fetchTimeBlocks,
    createTimeBlock,
    updateTimeBlock,
    deleteTimeBlock,
    optimizeSchedule,
  };
}
