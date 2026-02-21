import { apiClient } from '../../lib/api/client';
import {
  StudentExamItem,
  StudentExamSession,
  StudentExamStartPayload,
  TeacherExamPacket,
  TeacherExamPacketDetail,
  TeacherExamPacketMutationPayload,
  TeacherExamSchedule,
} from './types';

type StudentExamsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentExamItem[];
};

type TeacherPacketsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherExamPacket[];
};

type StudentExamStartResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentExamStartPayload;
};

type StudentExamSubmitResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentExamSession;
};

type TeacherPacketDetailResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherExamPacketDetail;
};

type TeacherPacketMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherExamPacketDetail;
};

type TeacherSchedulesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherExamSchedule[];
};

type TeacherScheduleMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: TeacherExamSchedule | null;
};

export const examApi = {
  async getStudentAvailableExams() {
    const response = await apiClient.get<StudentExamsResponse>('/exams/available');
    return response.data.data || [];
  },
  async startStudentExam(scheduleId: number) {
    const response = await apiClient.get<StudentExamStartResponse>(`/exams/${scheduleId}/start`, {
      params: { _t: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
    return response.data.data;
  },
  async submitStudentAnswers(payload: {
    scheduleId: number;
    answers: Record<string, unknown>;
    isFinalSubmit: boolean;
  }) {
    const response = await apiClient.post<StudentExamSubmitResponse>(`/exams/${payload.scheduleId}/answers`, {
      answers: payload.answers,
      finish: payload.isFinalSubmit,
      is_final_submit: payload.isFinalSubmit,
    });
    return response.data.data;
  },
  async getTeacherPackets(params?: {
    subjectId?: number;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
    type?: 'FORMATIF' | 'SBTS' | 'SAS' | 'SAT';
  }) {
    const response = await apiClient.get<TeacherPacketsResponse>('/exams/packets', {
      params: {
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
        type: params?.type,
      },
    });
    return response.data.data || [];
  },
  async getTeacherPacketById(packetId: number) {
    const response = await apiClient.get<TeacherPacketDetailResponse>(`/exams/packets/${packetId}`);
    return response.data.data;
  },
  async createTeacherPacket(payload: TeacherExamPacketMutationPayload) {
    const response = await apiClient.post<TeacherPacketMutationResponse>('/exams/packets', payload);
    return response.data.data;
  },
  async updateTeacherPacket(packetId: number, payload: TeacherExamPacketMutationPayload) {
    const response = await apiClient.put<TeacherPacketMutationResponse>(`/exams/packets/${packetId}`, payload);
    return response.data.data;
  },
  async getTeacherSchedules(params?: {
    academicYearId?: number;
    examType?: 'FORMATIF' | 'SBTS' | 'SAS' | 'SAT';
    packetId?: number;
    classId?: number;
  }) {
    const response = await apiClient.get<TeacherSchedulesResponse>('/exams/schedules', {
      params: {
        academicYearId: params?.academicYearId,
        examType: params?.examType,
        packetId: params?.packetId,
        classId: params?.classId,
      },
    });
    return response.data.data || [];
  },
  async updateTeacherSchedule(
    scheduleId: number,
    payload: {
      startTime?: string;
      endTime?: string;
      proctorId?: number;
      room?: string | null;
      isActive?: boolean;
    },
  ) {
    const response = await apiClient.patch<TeacherScheduleMutationResponse>(
      `/exams/schedules/${scheduleId}`,
      payload,
    );
    return response.data.data;
  },
  async deleteTeacherSchedule(scheduleId: number) {
    const response = await apiClient.delete<TeacherScheduleMutationResponse>(`/exams/schedules/${scheduleId}`);
    return response.data.data;
  },
};
