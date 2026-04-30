import api from './api';

export const GradeComponentType = {
  FORMATIVE: 'FORMATIVE',
  MIDTERM: 'MIDTERM',
  FINAL: 'FINAL',
  SKILL: 'SKILL',
  US_PRACTICE: 'US_PRACTICE',
  US_THEORY: 'US_THEORY'
} as const;

export type GradeComponentType = typeof GradeComponentType[keyof typeof GradeComponentType];

export interface GradeComponent {
  id: number;
  code?: string | null;
  typeCode?: string | null;
  subjectId: number;
  name: string;
  weight: number;
  type: GradeComponentType;
  entryMode?: 'NF_SERIES' | 'SINGLE_SCORE';
  entryModeCode?: string | null;
  reportSlot?: string | null;
  reportSlotCode?: string | null;
  includeInFinalScore?: boolean;
  displayOrder?: number;
  academicYearId?: number | null;
  isActive: boolean;
}

export interface StudentGradeData {
  id: number; // user id
  username: string;
  name: string;
  nisn: string;
  grades: Record<number, {
    score?: number;
    nf1?: number;
    nf2?: number;
    nf3?: number;
    nf4?: number;
    nf5?: number;
    nf6?: number;
    formativeSeries?: number[];
  }>; // componentId -> score object
}

export interface InputGradePayload {
  grades: {
    student_id: number;
    subject_id: number;
    academic_year_id: number;
    grade_component_id: number;
    semester: string;
    score?: number | null;
    nf1?: number | null;
    nf2?: number | null;
    nf3?: number | null;
    nf4?: number | null;
    nf5?: number | null;
    nf6?: number | null;
    formative_series?: number[] | null;
    formative_slot_count?: number | null;
    description?: string;
  }[];
}

export interface StudentGradeOverviewComponent {
  code: string;
  label: string;
  type: string;
  reportSlotCode: string;
  entryMode: string;
  includeInFinalScore: boolean;
  displayOrder: number;
  release: {
    mode: 'DIRECT' | 'SCHEDULED' | 'REPORT_DATE';
    modeLabel: string;
    code: 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'HOMEROOM_BLOCKED';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
    canViewDetails: boolean;
    effectiveDate: string | null;
    source: 'DIRECT' | 'PROGRAM_DATE' | 'REPORT_DATE' | 'HOMEROOM';
  };
}

export interface StudentGradeOverviewSubjectComponent extends StudentGradeOverviewComponent {
  score: number | null;
  series: number[];
  status: 'AVAILABLE' | 'PENDING';
  source: 'REPORT_GRADE' | 'STUDENT_GRADE' | 'NONE';
}

export interface StudentGradeOverviewSubjectRow {
  subject: {
    id: number;
    code: string;
    name: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  kkm: number;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  status: 'AVAILABLE' | 'PENDING';
  componentSummary: {
    totalCount: number;
    availableCount: number;
    pendingCount: number;
  };
  components: StudentGradeOverviewSubjectComponent[];
}

export interface StudentSemesterReportSubjectRow {
  subject: {
    id: number;
    code: string;
    name: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  kkm: number;
  finalScore: number | null;
  predicate: string | null;
  description: string | null;
  status: 'AVAILABLE' | 'PENDING' | 'LOCKED';
}

export interface StudentSemesterReportData {
  semester: 'ODD' | 'EVEN';
  semesterLabel: string;
  semesterType: 'SAS' | 'SAT';
  reportDate: {
    place: string;
    date: string;
    reportType: string;
  } | null;
  release: {
    code: 'NOT_SCHEDULED' | 'SCHEDULED' | 'OPEN' | 'HOMEROOM_BLOCKED';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
    canViewDetails: boolean;
    source: 'REPORT_DATE' | 'HOMEROOM';
    effectiveDate: string | null;
  };
  status: {
    code: 'NOT_READY' | 'PARTIAL' | 'READY';
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
  };
  summary: {
    expectedSubjects: number;
    availableSubjects: number;
    missingSubjects: number;
    averageFinalScore: number | null;
  };
  attendance: {
    hadir: number;
    sakit: number;
    izin: number;
    alpha: number;
  };
  presenceSummary: {
    checkInRecorded: number;
    checkOutRecorded: number;
    openPresence: number;
    averageCheckInTime: string | null;
    averageCheckOutTime: string | null;
  };
  homeroomNote: string | null;
  subjects: StudentSemesterReportSubjectRow[];
}

export interface StudentGradeOverviewData {
  meta: {
    academicYearId: number;
    academicYearName: string;
    semester: 'ODD' | 'EVEN';
    semesterLabel: string;
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    class: {
      id: number;
      name: string;
      level: string;
      major: {
        id: number;
        name: string;
        code: string;
      } | null;
    } | null;
  };
  summary: {
    totalSubjects: number;
    subjectsWithAnyScore: number;
    availableComponents: number;
    pendingComponents: number;
    averageFinalScore: number | null;
  };
  components: StudentGradeOverviewComponent[];
  subjects: StudentGradeOverviewSubjectRow[];
  reportCard: StudentSemesterReportData;
}

export interface HomeroomResultPublicationProgramOption {
  publicationCode: string;
  label: string;
  shortLabel: string;
  baseTypeCode: string;
  fixedSemester: 'ODD' | 'EVEN' | null;
  globalRelease: StudentGradeOverviewComponent['release'];
  homeroomPublication: {
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    label: string;
    description: string;
    updatedAt: string | null;
  };
}

export interface HomeroomResultPublicationStudentRow {
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    photo?: string | null;
  };
  homeroomPublication: {
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    label: string;
    description: string;
    updatedAt: string | null;
  };
  effectiveVisibility: {
    canViewDetails: boolean;
    label: string;
    tone: 'red' | 'amber' | 'green';
    description: string;
  };
}

export interface HomeroomResultPublicationsData {
  academicYear: {
    id: number;
    name: string;
  };
  class: {
    id: number;
    name: string;
    level: string;
    major: {
      id: number;
      name: string;
      code: string;
    } | null;
  };
  programs: HomeroomResultPublicationProgramOption[];
  selectedProgram: HomeroomResultPublicationProgramOption | null;
  summary: {
    totalStudents: number;
    blockedStudents: number;
    visibleStudents: number;
    waitingWakakurStudents: number;
  };
  rows: HomeroomResultPublicationStudentRow[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export type ScoreRemedialStatus = 'DRAFT' | 'RECORDED' | 'PASSED' | 'STILL_BELOW_KKM' | 'CANCELLED' | string;
export type ScoreRemedialMethod = 'MANUAL_SCORE' | 'ASSIGNMENT' | 'QUESTION_SET' | string;

export interface ScoreRemedialExamPacketRef {
  id: number;
  title: string;
  type?: string | null;
  programCode?: string | null;
  duration?: number | null;
  publishedQuestionCount?: number | null;
}

export interface ScoreRemedialAttempt {
  id: number;
  scoreEntryId: number;
  attemptNumber: number;
  originalScore: number;
  previousEffectiveScore: number;
  remedialScore: number;
  effectiveScore: number;
  kkm: number;
  status: ScoreRemedialStatus;
  method?: ScoreRemedialMethod | null;
  activityTitle?: string | null;
  activityInstructions?: string | null;
  activityDueAt?: string | null;
  activityReferenceUrl?: string | null;
  activityExamPacketId?: number | null;
  activitySourceExamPacketId?: number | null;
  activityExamPacket?: ScoreRemedialExamPacketRef | null;
  activitySourceExamPacket?: ScoreRemedialExamPacketRef | null;
  activityStartedAt?: string | null;
  activitySubmittedAt?: string | null;
  note?: string | null;
  recordedAt: string;
  recordedById?: number | null;
}

export interface StudentRemedialActivity {
  id: number;
  scoreEntryId: number;
  attemptNumber: number;
  method: ScoreRemedialMethod;
  methodLabel: string;
  activityTitle?: string | null;
  activityInstructions?: string | null;
  activityDueAt?: string | null;
  activityReferenceUrl?: string | null;
  activityExamPacketId?: number | null;
  activitySourceExamPacketId?: number | null;
  activityExamPacket?: ScoreRemedialExamPacketRef | null;
  activitySourceExamPacket?: ScoreRemedialExamPacketRef | null;
  activityStartedAt?: string | null;
  activitySubmittedAt?: string | null;
  sourceLabel: string;
  originalScore: number;
  remedialScore: number;
  effectiveScore: number;
  kkm: number;
  status: ScoreRemedialStatus;
  statusLabel: string;
  recordedAt: string;
  semester: 'ODD' | 'EVEN';
  subject: {
    id: number;
    code: string;
    name: string;
  };
  teacher: {
    id: number;
    name: string;
  } | null;
  academicYear: {
    id: number;
    name: string;
  };
}

export interface RemedialScoreEntry {
  id: number;
  scoreEntryId: number;
  studentId: number;
  subjectId: number;
  academicYearId: number;
  semester: 'ODD' | 'EVEN';
  componentCode?: string | null;
  componentType?: string | null;
  componentTypeCode?: string | null;
  reportSlot?: string | null;
  reportSlotCode?: string | null;
  sourceType?: string | null;
  sourceKey?: string | null;
  sourceLabel: string;
  originalScore: number;
  currentEffectiveScore: number;
  kkm: number;
  isComplete: boolean;
  attemptCount: number;
  latestAttempt?: ScoreRemedialAttempt | null;
  kkmSource?: string;
  classId?: number | null;
  classLevel?: string | null;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
    classId?: number | null;
  };
  subject: {
    id: number;
    code?: string | null;
    name: string;
  };
  academicYear: {
    id: number;
    name: string;
  };
  remedials: ScoreRemedialAttempt[];
}

export const gradeService = {
  getComponents: async (params?: {
    subject_id?: number;
    academic_year_id?: number;
    assignment_id?: number;
    semester?: 'ODD' | 'EVEN' | string;
  }) => {
    const response = await api.get('/grades/components', { params });
    return response.data;
  },

  upsertComponent: async (data: Partial<GradeComponent>) => {
    const response = await api.post('/grades/components', data);
    return response.data;
  },

  getGradesByClassSubject: async (classId: number, subjectId: number, academicYearId: number, semester?: string) => {
    const params: Record<string, string | number> = { 
      class_id: classId, 
      subject_id: subjectId, 
      academic_year_id: academicYearId 
    };
    if (semester) params.semester = semester;
    const response = await api.get('/grades/student-grades', {
      params
    });
    return response.data;
  },

  getGrades: async (params: {
    academicYearId: number;
    subjectId: number;
    classId?: number; // Optional now
    studentId?: number;
    teacherId?: number;
    type?: string;
  }) => {
    const response = await api.get('/grades', { params });
    return response.data;
  },

  saveGradesBulk: async (data: {
    academicYearId: number;
    subjectId: number;
    classId?: number; // Optional now
    grades: Array<{
      studentId: number;
      type: string;
      score: number;
      feedback?: string;
    }>
  }) => {
    const response = await api.post('/grades/bulk', data);
    return response.data;
  },

  bulkInputGrades: async (payload: { grades: InputGradePayload['grades'] }) => {
    const response = await api.post('/grades/student-grades/bulk', payload);
    return response.data;
  },

  calculateGrades: async (payload: { classId: number; subjectId: number; academicYearId: number }) => {
    const response = await api.post('/grades/calculate', payload);
    return response.data;
  },

  getLeger: async (classId: number, academicYearId: number) => {
    const response = await api.get('/grades/leger', {
      params: { classId, academicYearId }
    });
    return response.data;
  },

  getReportGrades: async (params: {
    student_id?: number;
    class_id?: number;
    academic_year_id: number;
    semester: string;
    subject_id?: number;
    include_meta?: boolean | number;
  }) => {
    const response = await api.get('/grades/report-grades', { params });
    return response.data;
  },

  getStudentOverview: async (params?: {
    programSemester?: 'ODD' | 'EVEN';
    reportSemester?: 'ODD' | 'EVEN';
  }): Promise<StudentGradeOverviewData> => {
    const response = await api.get('/grades/student-overview', {
      params:
        params?.programSemester || params?.reportSemester
          ? {
              ...(params?.programSemester ? { program_semester: params.programSemester } : {}),
              ...(params?.reportSemester ? { report_semester: params.reportSemester } : {}),
            }
          : undefined,
    });
    if (!response.data?.data) {
      throw new Error('Data nilai siswa tidak tersedia.');
    }
    return response.data.data as StudentGradeOverviewData;
  },

  getHomeroomResultPublications: async (params: {
    classId: number;
    semester?: 'ODD' | 'EVEN';
    publicationCode?: string;
    page?: number;
    limit?: number;
    search?: string;
  }): Promise<HomeroomResultPublicationsData> => {
    const response = await api.get('/grades/homeroom-result-publications', {
      params: {
        classId: params.classId,
        semester: params.semester,
        publicationCode: params.publicationCode,
        page: params.page,
        limit: params.limit,
        search: params.search,
      },
    });
    if (!response.data?.data) {
      throw new Error('Data kontrol publikasi nilai wali kelas tidak tersedia.');
    }
    return response.data.data as HomeroomResultPublicationsData;
  },

  updateHomeroomResultPublication: async (payload: {
    classId: number;
    studentId: number;
    publicationCode: string;
    mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
  }) => {
    const response = await api.put('/grades/homeroom-result-publications', payload);
    return response.data;
  },

  getRemedialEligibleScores: async (params: {
    subjectId: number;
    academicYearId: number;
    semester: 'ODD' | 'EVEN';
    classId?: number;
    studentId?: number;
    componentCode?: string;
    includeAll?: boolean;
    limit?: number;
  }): Promise<RemedialScoreEntry[]> => {
    const response = await api.get('/grades/remedials/eligible', {
      params: {
        subject_id: params.subjectId,
        academic_year_id: params.academicYearId,
        semester: params.semester,
        class_id: params.classId,
        student_id: params.studentId,
        component_code: params.componentCode || undefined,
        include_all: params.includeAll ? 'true' : undefined,
        limit: params.limit,
      },
    });
    return (response.data?.data || []) as RemedialScoreEntry[];
  },

  getScoreRemedials: async (scoreEntryId: number): Promise<RemedialScoreEntry> => {
    const response = await api.get('/grades/remedials', {
      params: {
        score_entry_id: scoreEntryId,
      },
    });
    if (!response.data?.data) {
      throw new Error('Riwayat remedial tidak tersedia.');
    }
    return response.data.data as RemedialScoreEntry;
  },

  getStudentRemedialActivities: async (params?: {
    semester?: 'ODD' | 'EVEN';
    limit?: number;
  }): Promise<StudentRemedialActivity[]> => {
    const response = await api.get('/grades/remedials/student-activities', {
      params: {
        ...(params?.semester ? { semester: params.semester } : {}),
        limit: params?.limit || 100,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data as StudentRemedialActivity[] : [];
  },

  createScoreRemedial: async (payload: {
    scoreEntryId: number;
    remedialScore?: number;
    method?: ScoreRemedialMethod;
    saveAsDraft?: boolean;
    activityTitle?: string;
    activityInstructions?: string;
    activityDueAt?: string;
    activityReferenceUrl?: string;
    activityExamPacketId?: number;
    activitySourceExamPacketId?: number;
    note?: string;
  }) => {
    const response = await api.post('/grades/remedials', {
      score_entry_id: payload.scoreEntryId,
      remedial_score: payload.remedialScore,
      method: payload.method,
      save_as_draft: payload.saveAsDraft,
      activity_title: payload.activityTitle,
      activity_instructions: payload.activityInstructions,
      activity_due_at: payload.activityDueAt,
      activity_reference_url: payload.activityReferenceUrl,
      activity_exam_packet_id: payload.activityExamPacketId,
      activity_source_exam_packet_id: payload.activitySourceExamPacketId,
      note: payload.note,
    });
    return response.data;
  },
};
