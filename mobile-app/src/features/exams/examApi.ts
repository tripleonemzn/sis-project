import { apiClient } from '../../lib/api/client';
import {
  ExamScheduleMakeupAccessSummary,
  ExamScheduleMakeupOverview,
  ExamScheduleSessionResetSummary,
  ExamProgramSession,
  ExamSittingDetail,
  ExamSittingListItem,
  ExamSittingRoom,
  ExamSittingRoomSlot,
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
  UnassignedExamSittingSchedule,
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

type TeacherPacketReviewReplyResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    packetId: number;
    questionId: string;
    questionNumber: number;
    reviewFeedback: Record<string, unknown> | null;
  };
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

type ProgramSessionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    sessions: ExamProgramSession[];
  };
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

type TeacherScheduleResetResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: ExamScheduleSessionResetSummary;
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

type ExamSittingRoomSlotsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    slots: ExamSittingRoomSlot[];
    unassignedSchedules: UnassignedExamSittingSchedule[];
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

type ExamRestrictionsResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    restrictions: ExamRestrictionItem[];
    meta: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
};

type ExamRestrictionMutationResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    id: number;
    studentId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    examType?: string;
    programCode?: string;
    isBlocked: boolean;
    reason: string | null;
  };
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
export type ExamStudentResultPublishMode = 'DIRECT' | 'SCHEDULED' | 'REPORT_DATE';
export type ExamProgramReportDateItem = {
  semester: 'ODD' | 'EVEN';
  reportType: string;
  place: string;
  date: string | null;
};

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
  studentResultPublishMode?: ExamStudentResultPublishMode;
  studentResultPublishAt?: string | null;
  financeClearanceMode?: ExamFinanceClearanceMode;
  financeMinOutstandingAmount?: number;
  financeMinOverdueInvoices?: number;
  financeClearanceNotes?: string | null;
  source: 'default' | 'custom';
};

export type ExamRestrictionItem = {
  student: {
    id: number;
    nisn: string | null;
    name: string;
  };
  isBlocked: boolean;
  reason: string | null;
  manualBlocked: boolean;
  autoBlocked: boolean;
  flags: {
    belowKkm: boolean;
    financeOutstanding: boolean;
    financeOverdue: boolean;
    financeBlocked: boolean;
  };
  details: {
    belowKkmSubjects: Array<{
      subjectId: number;
      subjectName: string;
      score: number;
      kkm: number;
    }>;
    outstandingAmount: number;
    outstandingInvoices: number;
    overdueInvoices: number;
    financeClearanceMode?: ExamFinanceClearanceMode;
    financeMinOutstandingAmount?: number;
    financeMinOverdueInvoices?: number;
    financeClearanceNotes?: string | null;
  };
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

type ExamProgramReportDatesResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    academicYearId: number;
    reportDates: ExamProgramReportDateItem[];
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
      studentResultPublishMode?: ExamStudentResultPublishMode;
      studentResultPublishAt?: string | null;
      financeClearanceMode?: ExamFinanceClearanceMode;
      financeMinOutstandingAmount?: number;
      financeMinOverdueInvoices?: number;
      financeClearanceNotes?: string | null;
    }>;
  }) {
    const response = await apiClient.put<ExamProgramsUpdateResponse>('/exams/programs', payload);
    return response.data.data;
  },
  async getExamReportDates(params?: { academicYearId?: number }) {
    const response = await apiClient.get<ExamProgramReportDatesResponse>('/exams/report-dates', {
      params: {
        academicYearId: params?.academicYearId,
      },
    });
    return response.data.data;
  },
  async updateExamReportDates(payload: {
    academicYearId?: number;
    reportDates: Array<{
      semester: 'ODD' | 'EVEN';
      reportType: string;
      place?: string | null;
      date?: string | null;
    }>;
  }) {
    const response = await apiClient.put<ExamProgramReportDatesResponse>('/exams/report-dates', payload);
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

  async replyPacketReviewFeedback(packetId: number, payload: { questionId: string; teacherResponse: string }) {
    const response = await apiClient.patch<TeacherPacketReviewReplyResponse>(
      `/exams/packets/${packetId}/review-feedback/reply`,
      payload,
    );
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
  async getProgramSessions(params: { academicYearId: number; programCode: string }) {
    const response = await apiClient.get<ProgramSessionsResponse>('/exams/program-sessions', {
      params: {
        academicYearId: params.academicYearId,
        programCode: params.programCode,
      },
    });
    return Array.isArray(response.data?.data?.sessions) ? response.data.data.sessions : [];
  },
  async updateTeacherSchedule(
    scheduleId: number,
    payload: {
      startTime?: string;
      endTime?: string;
      periodNumber?: number | null;
      proctorId?: number;
      room?: string | null;
      isActive?: boolean;
      sessionId?: number | null;
      subjectId?: number;
      classId?: number | null;
      semester?: 'ODD' | 'EVEN';
      packetId?: number | null;
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
  async resetTeacherScheduleSession(
    scheduleId: number,
    payload: {
      studentId: number;
      reason: string;
    },
  ) {
    const response = await apiClient.post<TeacherScheduleResetResponse>(
      `/exams/schedules/${scheduleId}/reset-session`,
      payload,
    );
    return response.data.data;
  },
  async deleteTeacherSchedule(scheduleId: number) {
    const response = await apiClient.delete<TeacherScheduleMutationResponse>(`/exams/schedules/${scheduleId}`);
    return response.data.data;
  },
  async getExamSittings(params?: {
    academicYearId?: number;
    examType?: string;
    programCode?: string;
    semester?: 'ODD' | 'EVEN';
    date?: string;
  }) {
    const response = await apiClient.get<ExamSittingsResponse>('/exam-sittings', {
      params: {
        academicYearId: params?.academicYearId,
        examType: params?.examType,
        programCode: params?.programCode,
        semester: params?.semester,
        date: params?.date,
      },
    });
    return response.data.data || [];
  },
  async getExamSittingRoomSlots(params: {
    academicYearId: number;
    examType?: string;
    programCode?: string;
    semester?: 'ODD' | 'EVEN';
    date?: string;
  }) {
    const response = await apiClient.get<ExamSittingRoomSlotsResponse>('/exam-sittings/room-slots', {
      params: {
        academicYearId: params.academicYearId,
        examType: params.examType,
        programCode: params.programCode,
        semester: params.semester,
        date: params.date,
      },
    });
    return {
      slots: Array.isArray(response.data?.data?.slots) ? response.data.data.slots : [],
      unassignedSchedules: Array.isArray(response.data?.data?.unassignedSchedules)
        ? response.data.data.unassignedSchedules
        : [],
    };
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
  async updateExamSittingProctor(sittingId: number, proctorId: number | null) {
    const response = await apiClient.patch<ExamSittingMutationResponse>(`/exam-sittings/${sittingId}/proctor`, {
      proctorId,
    });
    return response.data.data;
  },
  async updateExamSittingRoomSlotProctor(slot: ExamSittingRoomSlot, proctorId: number | null) {
    const response = await apiClient.patch<{
      statusCode: number;
      success: boolean;
      message: string;
      data: {
        key: string;
        proctorId: number | null;
        proctor: {
          id: number;
          name: string;
        } | null;
      };
    }>('/exam-sittings/room-slots/proctor', {
      sittingId: slot.sittingId,
      academicYearId: slot.academicYearId,
      examType: slot.examType,
      semester: slot.semester,
      roomName: slot.roomName,
      startTime: slot.startTime,
      endTime: slot.endTime,
      periodNumber: slot.periodNumber,
      sessionId: slot.sessionId,
      sessionLabel: slot.sessionLabel,
      subjectId: slot.subjectId,
      subjectName: slot.subjectName,
      proctorId,
    });
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
  async getExamRestrictions(params: {
    classId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    examType?: string;
    programCode?: string;
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const response = await apiClient.get<ExamRestrictionsResponse>('/exams/restrictions', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
        examType: params.examType,
        programCode: params.programCode,
        page: params.page ?? 1,
        limit: params.limit ?? 250,
        search: params.search,
      },
    });
    return response.data.data;
  },
  async updateExamRestriction(payload: {
    studentId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    examType?: string;
    programCode?: string;
    isBlocked: boolean;
    reason?: string;
  }) {
    const response = await apiClient.put<ExamRestrictionMutationResponse>('/exams/restrictions', payload);
    return response.data.data;
  },
};
