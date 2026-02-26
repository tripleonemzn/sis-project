import { apiClient } from '../../lib/api/client';
import {
  PacketItemAnalysisResponse,
  PacketSubmissionsResponse,
  SessionDetailResponse,
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

type PacketItemAnalysisApiResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: PacketItemAnalysisResponse;
};

type PacketSubmissionsApiResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: PacketSubmissionsResponse;
};

type SessionDetailApiResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: SessionDetailResponse;
};

export type ExamProgramCode = string;
export type ExamProgramBaseType = string;
export type ExamProgramGradeComponentType = string;
export type ExamProgramGradeEntryMode = string;
export type ExamProgramReportSlot = string;

export type ExamGradeComponentItem = {
  id?: number;
  code: string;
  label: string;
  type: ExamProgramGradeComponentType;
  typeCode?: string;
  entryMode: ExamProgramGradeEntryMode;
  entryModeCode?: string;
  reportSlot: ExamProgramReportSlot;
  reportSlotCode?: string;
  includeInFinalScore: boolean;
  description: string | null;
  order: number;
  isActive: boolean;
};

export type ExamProgramItem = {
  id?: number;
  code: ExamProgramCode;
  baseType: ExamProgramBaseType;
  baseTypeCode?: string;
  gradeComponentType: ExamProgramGradeComponentType;
  gradeComponentTypeCode?: string;
  gradeComponentCode: string;
  gradeComponentLabel: string;
  gradeEntryMode: ExamProgramGradeEntryMode;
  gradeEntryModeCode?: string;
  label: string;
  shortLabel: string;
  description: string;
  fixedSemester: 'ODD' | 'EVEN' | null;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
  source: 'default' | 'custom';
};

type ExamProgramsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    roleContext: 'teacher' | 'student' | 'all';
    programs: ExamProgramItem[];
  };
};

type ExamProgramsUpdateResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    programs: ExamProgramItem[];
  };
};

type ExamGradeComponentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    components: ExamGradeComponentItem[];
  };
};

type ExamGradeComponentsUpdateResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    components: ExamGradeComponentItem[];
  };
};

export const examApi = {
  async getExamGradeComponents(params?: { academicYearId?: number; includeInactive?: boolean }) {
    const response = await apiClient.get<ExamGradeComponentsResponse>('/exams/components', {
      params: {
        academicYearId: params?.academicYearId,
        includeInactive: params?.includeInactive,
      },
    });
    return response.data.data;
  },
  async updateExamGradeComponents(payload: {
    academicYearId?: number;
    components: Array<{
      id?: number | null;
      code: string;
      label?: string;
      type?: ExamProgramGradeComponentType;
      typeCode?: string;
      entryMode?: ExamProgramGradeEntryMode;
      entryModeCode?: string;
      reportSlot?: ExamProgramReportSlot;
      reportSlotCode?: string;
      includeInFinalScore?: boolean;
      description?: string | null;
      order?: number;
      isActive?: boolean;
    }>;
  }) {
    const response = await apiClient.put<ExamGradeComponentsUpdateResponse>('/exams/components', payload);
    return response.data.data;
  },
  async getExamPrograms(params?: {
    academicYearId?: number;
    roleContext?: 'teacher' | 'student' | 'all';
    includeInactive?: boolean;
  }) {
    const response = await apiClient.get<ExamProgramsResponse>('/exams/programs', {
      params: {
        academicYearId: params?.academicYearId,
        roleContext: params?.roleContext,
        includeInactive: params?.includeInactive,
      },
    });

    return response.data.data;
  },
  async updateExamPrograms(payload: {
    academicYearId?: number;
    programs: Array<{
      id?: number | null;
      code: ExamProgramCode;
      baseType?: ExamProgramBaseType;
      baseTypeCode?: string;
      gradeComponentType?: ExamProgramGradeComponentType;
      gradeComponentTypeCode?: string;
      gradeComponentCode?: string;
      gradeComponentLabel?: string | null;
      gradeEntryMode?: ExamProgramGradeEntryMode;
      gradeEntryModeCode?: string;
      label?: string;
      shortLabel?: string | null;
      description?: string | null;
      fixedSemester?: 'ODD' | 'EVEN' | 'GANJIL' | 'GENAP' | null;
      order?: number;
      isActive?: boolean;
      showOnTeacherMenu?: boolean;
      showOnStudentMenu?: boolean;
    }>;
  }) {
    const response = await apiClient.put<ExamProgramsUpdateResponse>('/exams/programs', payload);
    return response.data.data;
  },
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
    type?: string;
    programCode?: string;
  }) {
    const response = await apiClient.get<TeacherPacketsResponse>('/exams/packets', {
      params: {
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
        type: params?.type,
        programCode: params?.programCode,
        _t: Date.now(),
      },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
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
  async getPacketItemAnalysis(packetId: number, params?: { classId?: number }) {
    const response = await apiClient.get<PacketItemAnalysisApiResponse>(
      `/exams/packets/${packetId}/item-analysis`,
      { params },
    );
    return response.data.data;
  },
  async syncPacketItemAnalysis(packetId: number, params?: { classId?: number }) {
    const response = await apiClient.post<PacketItemAnalysisApiResponse>(
      `/exams/packets/${packetId}/item-analysis/sync`,
      undefined,
      { params },
    );
    return response.data.data;
  },
  async getPacketSubmissions(
    packetId: number,
    params?: { classId?: number; status?: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT' },
  ) {
    const response = await apiClient.get<PacketSubmissionsApiResponse>(
      `/exams/packets/${packetId}/submissions`,
      { params },
    );
    return response.data.data;
  },
  async getSessionDetail(sessionId: number) {
    const response = await apiClient.get<SessionDetailApiResponse>(`/exams/sessions/${sessionId}/detail`);
    return response.data.data;
  },
  async getTeacherSchedules(params?: {
    academicYearId?: number;
    examType?: string;
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
