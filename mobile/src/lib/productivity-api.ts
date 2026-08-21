import { isAxiosError } from 'axios';
import type { ApiEnvelope } from '../types';
import type {
  AIBriefing,
  FocusLog,
  FocusLogInput,
  TimeBlock,
  TimeBlockInput,
  TimeBlockUpdate,
} from '../types/productivity';
import { api } from './api';

export const productivityApi = {
  briefing: {
    today: async (): Promise<AIBriefing | null> => {
      try {
        const response = await api.get<ApiEnvelope<AIBriefing>>('/briefing/today');
        return response.data.data;
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
    generate: async (): Promise<AIBriefing> => {
      const response = await api.post<ApiEnvelope<AIBriefing>>('/briefing/generate');
      return response.data.data;
    },
  },
  timeBlocks: {
    list: async (params?: { start_date?: string; end_date?: string }): Promise<TimeBlock[]> => {
      const response = await api.get<ApiEnvelope<TimeBlock[]>>('/time-blocks', { params });
      return response.data.data;
    },
    create: async (input: TimeBlockInput): Promise<TimeBlock> => {
      const response = await api.post<ApiEnvelope<TimeBlock>>('/time-blocks', input);
      return response.data.data;
    },
    update: async (id: string, input: TimeBlockUpdate): Promise<TimeBlock> => {
      const response = await api.put<ApiEnvelope<TimeBlock>>(`/time-blocks/${id}`, input);
      return response.data.data;
    },
    remove: async (id: string): Promise<void> => {
      await api.delete(`/time-blocks/${id}`);
    },
    optimize: async (): Promise<{ blocks: TimeBlock[]; message: string }> => {
      const response = await api.post<ApiEnvelope<TimeBlock[]>>('/time-blocks/optimize');
      return {
        blocks: response.data.data,
        message: response.data.message ?? 'Jadwal berhasil dirapikan.',
      };
    },
  },
  focus: {
    list: async (days = 7): Promise<FocusLog[]> => {
      const response = await api.get<ApiEnvelope<FocusLog[]>>('/focus-logs', { params: { days } });
      return response.data.data;
    },
    log: async (input: FocusLogInput): Promise<FocusLog> => {
      const response = await api.post<ApiEnvelope<FocusLog>>('/focus-logs', input);
      return response.data.data;
    },
  },
};
