import api from './api';

export interface TrainingClassCounts {
  materials: number;
  assignments: number;
  exams: number;
  enrollments: number;
}

export interface TrainingClass {
  id: number;
  name: string;
  description?: string | null;
  academicYearId: number;
  academicYear?: { id: number; name: string };
  instructorId?: number | null;
  instructor?: { id: number; name: string; username: string };
  startDate?: string | null;
  endDate?: string | null;
  maxCapacity?: number | null;
  isActive?: boolean;
  _count?: TrainingClassCounts;
}

export const trainingClassService = {
  list: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await api.get('/training-classes', { params });
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/training-classes/${id}`);
    return response.data;
  },
  create: async (
    data: Omit<
      TrainingClass,
      'id' | 'academicYear' | 'instructor' | '_count'
    >
  ) => {
    const response = await api.post('/training-classes', data);
    return response.data;
  },
  update: async (id: number, data: Partial<TrainingClass>) => {
    const response = await api.put(`/training-classes/${id}`, data);
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/training-classes/${id}`);
    return response.data;
  },
  addParticipant: async (trainingClassId: number, studentId: number) => {
    const response = await api.post(`/training-classes/${trainingClassId}/participants`, {
      studentId,
    });
    return response.data;
  },
  removeParticipant: async (trainingClassId: number, enrollmentId: number) => {
    const response = await api.delete(
      `/training-classes/${trainingClassId}/participants/${enrollmentId}`
    );
    return response.data;
  },
};
