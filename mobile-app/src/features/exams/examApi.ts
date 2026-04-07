import { apiClient } from '../../lib/api/client';
import {
  ExamScheduleMakeupAccessSummary,
  ExamScheduleMakeupOverview,
  ExamSittingDetail,
  ExamSittingListItem,
  ExamSittingRoom,
  ExamSittingUpsertPayload,
  PacketItemAnalysisResponse,
  PacketSubmissionsResponse,
  SessionDetailResponse,
  StudentExamPlacement,
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
  data?: unknown;
  exams?: unknown;
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

type TeacherScheduleMakeupOverviewResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamScheduleMakeupOverview;
};

type TeacherScheduleMakeupMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamScheduleMakeupAccessSummary | null;
};

type ExamSittingsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamSittingListItem[];
};

type ExamSittingDetailResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamSittingDetail;
};

type ExamSittingMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamSittingListItem | null;
};

type ExamSittingAssignedStudentsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    studentIds: number[];
  };
};

type StudentExamPlacementsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: StudentExamPlacement[];
};

type ExamRoomListResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamSittingRoom[];
};

type StudentUserListResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: Array<{
    id: number;
    name: string;
    username?: string | null;
    studentClass?: {
      name?: string | null;
    } | null;
    class?: {
      name?: string | null;
    } | null;
  }>;
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

function parseStudentExamsPayload(payload: unknown): StudentExamItem[] | null {
  if (Array.isArray(payload)) return payload as StudentExamItem[];
  if (!payload || typeof payload !== 'object') return null;

  const payloadRecord = payload as { exams?: unknown; data?: unknown };
  if (Array.isArray(payloadRecord.exams)) return payloadRecord.exams as StudentExamItem[];
  if (Array.isArray(payloadRecord.data)) return payloadRecord.data as StudentExamItem[];

  if (payloadRecord.data && typeof payloadRecord.data === 'object') {
    const nestedData = payloadRecord.data as { exams?: unknown };
    if (Array.isArray(nestedData.exams)) return nestedData.exams as StudentExamItem[];
  }

  return null;
}

export type ExamProgramCode = string;
export type ExamProgramBaseType = string;
export type ExamProgramGradeComponentType = string;
export type ExamProgramGradeEntryMode = string;
export type ExamProgramReportSlot = string;
export type ExamFinanceClearanceMode = string;

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
  targetClassLevels?: string[];
  allowedSubjectIds?: number[];
  allowedAuthorIds?: number[];
  financeClearanceMode?: ExamFinanceClearanceMode;
  financeMinOutstandingAmount?: number;
  financeMinOverdueInvoices?: number;
  financeClearanceNotes?: string | null;
  source: 'default' | 'custom';
};

type ExamProgramsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    roleContext: 'teacher' | 'student' | 'candidate' | 'applicant' | 'all';
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
    roleContext?: 'teacher' | 'student' | 'candidate' | 'applicant' | 'all';
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
      targetClassLevels?: string[];
      allowedSubjectIds?: number[];
      allowedAuthorIds?: number[];
      financeClearanceMode?: ExamFinanceClearanceMode;
      financeMinOutstandingAmount?: number;
      financeMinOverdueInvoices?: number;
      financeClearanceNotes?: string | null;
    }>;
  }) {
    const response = await apiClient.put<ExamProgramsUpdateResponse>('/exams/programs', payload);
    return response.data.data;
  },
  async getStudentAvailableExams() {
    const response = await apiClient.get<StudentExamsResponse>('/exams/available', {
      params: { _t: Date.now() },
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    });
    const parsedFromData = parseStudentExamsPayload(response.data.data);
    if (parsedFromData) return parsedFromData;

    const parsedFromEnvelope = parseStudentExamsPayload(response.data);
    if (parsedFromEnvelope) return parsedFromEnvelope;

    return [];
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
  async getPacketItemAnalysis(
    packetId: number,
    params?: { classId?: number; includeContentHtml?: boolean },
  ) {
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
    params?: {
      classId?: number;
      status?: 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';
      page?: number;
      limit?: number;
    },
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
  async getTeacherScheduleMakeupAccess(scheduleId: number) {
    const response = await apiClient.get<TeacherScheduleMakeupOverviewResponse>(
      `/exams/schedules/${scheduleId}/makeup-access`,
    );
    return response.data.data;
  },
  async upsertTeacherScheduleMakeupAccess(
    scheduleId: number,
    payload: {
      studentId: number;
      date: string;
      startTime: string;
      endTime: string;
      reason?: string;
    },
  ) {
    const response = await apiClient.put<TeacherScheduleMakeupMutationResponse>(
      `/exams/schedules/${scheduleId}/makeup-access`,
      payload,
    );
    return response.data.data;
  },
  async revokeTeacherScheduleMakeupAccess(scheduleId: number, studentId: number) {
    const response = await apiClient.delete<{
      statusCode: number;
      success: boolean;
      message: string;
      data: null;
    }>(`/exams/schedules/${scheduleId}/makeup-access/${studentId}`);
    return response.data;
  },
  async deleteTeacherSchedule(scheduleId: number) {
    const response = await apiClient.delete<TeacherScheduleMutationResponse>(`/exams/schedules/${scheduleId}`);
    return response.data.data;
  },
  async getExamSittings(params?: {
    academicYearId?: number;
    examType?: string;
    programCode?: string;
    date?: string;
  }) {
    const response = await apiClient.get<ExamSittingsResponse>('/exam-sittings', {
      params: {
        academicYearId: params?.academicYearId,
        examType: params?.examType,
        programCode: params?.programCode,
        date: params?.date,
      },
    });
    return response.data.data || [];
  },
  async getExamSittingDetail(sittingId: number) {
    const response = await apiClient.get<ExamSittingDetailResponse>(`/exam-sittings/${sittingId}`);
    return response.data.data;
  },
  async getMyExamSittings() {
    const response = await apiClient.get<StudentExamPlacementsResponse>('/exam-sittings/my-sitting');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },
  async createExamSitting(payload: ExamSittingUpsertPayload & { studentIds?: number[] }) {
    const response = await apiClient.post<ExamSittingMutationResponse>('/exam-sittings', payload);
    return response.data.data;
  },
  async updateExamSitting(sittingId: number, payload: ExamSittingUpsertPayload) {
    const response = await apiClient.put<ExamSittingMutationResponse>(`/exam-sittings/${sittingId}`, payload);
    return response.data.data;
  },
  async updateExamSittingStudents(sittingId: number, studentIds: number[]) {
    const response = await apiClient.put<{ statusCode: number; success: boolean; message: string; data: null }>(
      `/exam-sittings/${sittingId}/students`,
      { studentIds },
    );
    return response.data;
  },
  async deleteExamSitting(sittingId: number) {
    const response = await apiClient.delete<{ statusCode: number; success: boolean; message: string; data: null }>(
      `/exam-sittings/${sittingId}`,
    );
    return response.data;
  },
  async getExamSittingAssignedStudentIds(params?: {
    academicYearId?: number;
    examType?: string;
    programCode?: string;
    date?: string;
  }) {
    const response = await apiClient.get<ExamSittingAssignedStudentsResponse>('/exam-sittings/assigned-students', {
      params: {
        academicYearId: params?.academicYearId,
        examType: params?.examType,
        programCode: params?.programCode,
        date: params?.date,
      },
    });
    return response.data.data?.studentIds || [];
  },
  async getExamEligibleRooms() {
    const response = await apiClient.get<ExamRoomListResponse>('/inventory/rooms');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },
  async getStudentsByClass(classId: number) {
    const response = await apiClient.get<StudentUserListResponse>('/users', {
      params: {
        role: 'STUDENT',
        class_id: classId,
        limit: 500,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },
};
