import type { ApiEnvelope } from '../types';
import { api } from './api';
import type {
  AcademicTask,
  AcademicTaskInput,
  CampusSchedule,
  CampusScheduleInput,
  CampusScheduleQuery,
} from './student-types';

export const academicTaskApi = {
  list: () => api.get<ApiEnvelope<AcademicTask[]>>('/academic-tasks'),
  create: (data: AcademicTaskInput) => api.post<ApiEnvelope<AcademicTask>>('/academic-tasks', data),
  update: (id: string, data: Partial<AcademicTaskInput>) =>
    api.put<ApiEnvelope<AcademicTask>>(`/academic-tasks/${id}`, data),
  remove: (id: string) => api.delete<{ message: string }>(`/academic-tasks/${id}`),
};

export const campusScheduleApi = {
  list: (params?: CampusScheduleQuery) =>
    api.get<ApiEnvelope<CampusSchedule[]>>('/campus-schedules', { params }),
  create: (data: CampusScheduleInput) =>
    api.post<ApiEnvelope<CampusSchedule>>('/campus-schedules', data),
  update: (id: string, data: Partial<CampusScheduleInput>) =>
    api.put<ApiEnvelope<CampusSchedule>>(`/campus-schedules/${id}`, data),
  remove: (id: string) => api.delete<{ message: string }>(`/campus-schedules/${id}`),
};
