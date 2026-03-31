import { apiClient } from '../../lib/api/client';
import type {
  MobileCandidateAdmissionDetail,
  MobileCandidateAdmissionStatus,
} from '../candidateAdmission/types';
import type { ExtracurricularCategory } from '../extracurricular/category';

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

type PaginatedResult<T> = {
  items: T[];
  pagination: Pagination;
};

export type AdminUser = {
  id: number;
  username: string;
  name: string;
  role:
    | 'ADMIN'
    | 'TEACHER'
    | 'STUDENT'
    | 'PRINCIPAL'
    | 'STAFF'
    | 'PARENT'
    | 'CALON_SISWA'
    | 'UMUM'
    | 'EXAMINER'
    | 'EXTRACURRICULAR_TUTOR';
  nis?: string | null;
  nisn?: string | null;
  nip?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  classId?: number | null;
  verificationStatus?: string | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT' | null;
  additionalDuties?: string[] | null;
  managedMajorId?: number | null;
  managedMajors?: Array<{
    id: number;
    name: string;
    code: string;
  }>;
  examinerMajorId?: number | null;
  examinerMajor?: {
    id: number;
    name: string;
    code: string;
  } | null;
  studentClass?: {
    id: number;
    name: string;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
  children?: Array<{
    id: number;
    name: string;
    username?: string | null;
    nisn?: string | null;
  }>;
  documents?: Array<{
    id?: number;
    title?: string;
    fileUrl: string;
    category?: string;
    name?: string;
    type?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminMajor = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  _count?: {
    classes?: number;
  };
};

export type AdminSubject = {
  id: number;
  code: string;
  name: string;
  category?: {
    id: number;
    name: string;
    code: string;
  } | null;
  kkms?: Array<{
    classLevel: 'X' | 'XI' | 'XII';
    kkm: number;
    academicYearId?: number | null;
  }>;
  _count?: {
    children?: number;
    teacherAssignments?: number;
  };
};

export type AdminSubjectCategory = {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  _count?: {
    subjects?: number;
  };
};

export type AdminClass = {
  id: number;
  name: string;
  level: string;
  major?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
    isActive: boolean;
  } | null;
  teacher?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  president?: {
    id: number;
    name: string;
  } | null;
  _count?: {
    students?: number;
  };
};

export type AdminClassDetailStudent = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
  studentStatus?: string | null;
};

export type AdminClassDetail = AdminClass & {
  majorId?: number;
  academicYearId?: number;
  teacherId?: number | null;
  presidentId?: number | null;
  students?: AdminClassDetailStudent[];
};

export type AdminTrainingClass = {
  id: number;
  name: string;
  description?: string | null;
  academicYearId?: number;
  instructorId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxCapacity?: number | null;
  isActive?: boolean;
  academicYear?: {
    id: number;
    name: string;
    isActive?: boolean;
  } | null;
  instructor?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  _count?: {
    materials?: number;
    assignments?: number;
    exams?: number;
    enrollments?: number;
  };
};

export type AdminAcademicYear = {
  id: number;
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive: boolean;
  pklEligibleGrades?: string | null;
};

export type AdminAcademicFeatureFlags = {
  academicPromotionV2Enabled: boolean;
  academicYearRolloverEnabled: boolean;
};

export type AdminAcademicYearRolloverComponentSelection = {
  classPreparation: boolean;
  teacherAssignments: boolean;
  scheduleTimeConfig: boolean;
  academicEvents: boolean;
  reportDates: boolean;
  subjectKkms: boolean;
  examGradeComponents: boolean;
  examProgramConfigs: boolean;
  examProgramSessions: boolean;
};

export type AdminAcademicYearRolloverWorkspace = {
  sourceAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: string;
    semester1End: string;
    semester2Start: string;
    semester2End: string;
  };
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: string;
    semester1End: string;
    semester2Start: string;
    semester2End: string;
  };
  targetDraftSuggestion: {
    name: string;
    semester1Start: string;
    semester1End: string;
    semester2Start: string;
    semester2End: string;
  };
  validation: {
    readyToApply: boolean;
    errors: string[];
    warnings: string[];
  };
  components: {
    classPreparation: {
      key: 'classPreparation';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        homeroomCarryCount: number;
        homeroomExistingFillCount: number;
        homeroomKeepExistingCount: number;
        homeroomMissingSourceCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceClassId: number;
        sourceClassName: string;
        sourceLevel: string;
        studentCount: number;
        major: {
          id: number;
          code: string;
          name: string;
        };
        targetLevel: string;
        targetClassName: string;
        targetClassId: number | null;
        sourceHomeroomTeacher: {
          id: number;
          name: string;
          username: string;
        } | null;
        targetHomeroomTeacher: {
          id: number;
          name: string;
          username: string;
        } | null;
        homeroomAction:
          | 'CARRY_FORWARD_ON_CREATE'
          | 'FILL_EXISTING_EMPTY'
          | 'KEEP_EXISTING'
          | 'NO_SOURCE_HOMEROOM';
        action: 'CREATE' | 'SKIP_EXISTING';
      }>;
    };
    teacherAssignments: {
      key: 'teacherAssignments';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoTargetClassCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceAssignmentId: number;
        sourceClassId: number;
        sourceClassName: string;
        sourceClassLevel: string;
        targetClassId: number | null;
        targetClassName: string | null;
        teacher: {
          id: number;
          name: string;
          username: string;
        };
        subject: {
          id: number;
          name: string;
          code: string;
        };
        kkm: number;
        action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_TARGET_CLASS';
        reason: string | null;
      }>;
    };
    scheduleTimeConfig: {
      key: 'scheduleTimeConfig';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoSourceCount: number;
      };
      errors: string[];
      warnings: string[];
      item: {
        action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_SOURCE';
        sourceAcademicYearId: number | null;
        targetAcademicYearId: number;
      };
    };
    academicEvents: {
      key: 'academicEvents';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipOutsideTargetRangeCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceEventId: number;
        title: string;
        type: string;
        semester: string | null;
        isHoliday: boolean;
        sourceStartDate: string;
        sourceEndDate: string;
        targetStartDate: string | null;
        targetEndDate: string | null;
        action: 'CREATE' | 'SKIP_DUPLICATE' | 'SKIP_OUTSIDE_TARGET_RANGE';
        reason: string | null;
      }>;
    };
    reportDates: {
      key: 'reportDates';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipOutsideTargetRangeCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceReportDateId: number;
        semester: string;
        reportType: string;
        place: string;
        sourceDate: string;
        targetDate: string | null;
        targetReportDateId: number | null;
        targetPlace: string | null;
        action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_OUTSIDE_TARGET_RANGE';
        reason: string | null;
      }>;
    };
    subjectKkms: {
      key: 'subjectKkms';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        globalFallbackCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceSubjectKkmId: number;
        sourceAcademicYearId: number | null;
        sourceScope: 'ACADEMIC_YEAR' | 'GLOBAL_FALLBACK';
        subject: {
          id: number;
          code: string;
          name: string;
        };
        classLevel: string;
        sourceKkm: number;
        targetSubjectKkmId: number | null;
        targetKkm: number | null;
        action: 'CREATE' | 'SKIP_EXISTING';
        reason: string | null;
      }>;
    };
    examGradeComponents: {
      key: 'examGradeComponents';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceComponentId: number;
        code: string;
        label: string;
        type: string;
        entryMode: string;
        reportSlot: string;
        includeInFinalScore: boolean;
        targetComponentId: number | null;
        action: 'CREATE' | 'SKIP_EXISTING';
        reason: string | null;
      }>;
    };
    examProgramConfigs: {
      key: 'examProgramConfigs';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        missingGradeComponentCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceProgramId: number;
        code: string;
        displayLabel: string;
        baseType: string;
        fixedSemester: string | null;
        gradeComponentCode: string;
        targetProgramId: number | null;
        targetHasGradeComponent: boolean;
        action: 'CREATE' | 'SKIP_EXISTING';
        reason: string | null;
      }>;
    };
    examProgramSessions: {
      key: 'examProgramSessions';
      label: string;
      description: string;
      selectedByDefault: boolean;
      ready: boolean;
      summary: {
        sourceItems: number;
        createCount: number;
        existingCount: number;
        skipNoTargetProgramCount: number;
      };
      errors: string[];
      warnings: string[];
      items: Array<{
        sourceSessionId: number;
        programCode: string;
        label: string;
        normalizedLabel: string;
        displayOrder: number;
        targetSessionId: number | null;
        action: 'CREATE' | 'SKIP_EXISTING' | 'SKIP_NO_TARGET_PROGRAM';
        reason: string | null;
      }>;
    };
  };
  notes: string[];
};

export type AdminAcademicYearRolloverTargetResult = {
  created: boolean;
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
    semester1Start: string;
    semester1End: string;
    semester2Start: string;
    semester2End: string;
  };
  targetDraftSuggestion: AdminAcademicYearRolloverWorkspace['targetDraftSuggestion'];
  notes: string[];
};

export type AdminAcademicYearRolloverApplyResult = {
  targetAcademicYear: AdminAcademicYearRolloverWorkspace['targetAcademicYear'];
  applied: {
    classPreparation: {
      created: number;
      skippedExisting: number;
      homeroomCarriedOnCreate: number;
      homeroomFilledExisting: number;
      homeroomKeptExisting: number;
      homeroomMissingSource: number;
    };
    teacherAssignments: {
      created: number;
      skippedExisting: number;
      skippedNoTargetClass: number;
    };
    scheduleTimeConfig: {
      created: number;
      skippedExisting: number;
      skippedNoSource: number;
    };
    academicEvents: {
      created: number;
      skippedExisting: number;
      skippedOutsideTargetRange: number;
    };
    reportDates: {
      created: number;
      skippedExisting: number;
      skippedOutsideTargetRange: number;
    };
    subjectKkms: {
      created: number;
      skippedExisting: number;
      globalFallbackCount: number;
    };
    examGradeComponents: {
      created: number;
      skippedExisting: number;
    };
    examProgramConfigs: {
      created: number;
      skippedExisting: number;
      missingGradeComponentCount: number;
    };
    examProgramSessions: {
      created: number;
      skippedExisting: number;
      skippedNoTargetProgram: number;
    };
  };
  workspace: AdminAcademicYearRolloverWorkspace;
};

export type AdminAcademicPromotionAction = 'PROMOTE' | 'GRADUATE';

export type AdminAcademicPromotionWorkspaceClass = {
  sourceClassId: number;
  sourceClassName: string;
  sourceLevel: string;
  studentCount: number;
  major: {
    id: number;
    code: string;
    name: string;
  };
  action: AdminAcademicPromotionAction;
  expectedTargetLevel: string | null;
  targetClassId: number | null;
  targetClassName: string | null;
  suggestedTargetClassId: number | null;
  mappingSource: 'SAVED' | 'SUGGESTED' | 'EMPTY' | 'GRADUATE';
  targetCurrentStudentCount: number | null;
  targetOptions: Array<{
    id: number;
    name: string;
    level: string;
    currentStudentCount: number;
    major: {
      id: number;
      code: string;
      name: string;
    };
  }>;
  validation: {
    errors: string[];
    warnings: string[];
  };
};

export type AdminAcademicPromotionWorkspace = {
  sourceAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  targetAcademicYear: {
    id: number;
    name: string;
    isActive: boolean;
  };
  summary: {
    totalClasses: number;
    totalStudents: number;
    promotableClasses: number;
    graduatingClasses: number;
    promotedStudents: number;
    graduatedStudents: number;
    configuredPromoteClasses: number;
  };
  validation: {
    readyToCommit: boolean;
    errors: string[];
    warnings: string[];
  };
  classes: AdminAcademicPromotionWorkspaceClass[];
  recentRuns: Array<{
    id: number;
    status: 'COMMITTED' | 'FAILED' | 'ROLLED_BACK';
    totalClasses: number;
    totalStudents: number;
    promotedStudents: number;
    graduatedStudents: number;
    activateTargetYear: boolean;
    committedAt: string | null;
    createdAt: string;
    createdBy: {
      id: number;
      name: string;
      username: string;
    } | null;
    rolledBackAt: string | null;
    rolledBackBy: {
      id: number | null;
      name: string | null;
      username: string | null;
    } | null;
    canRollback: boolean;
    rollbackBlockedReason: string | null;
  }>;
};

export type AdminAcademicPromotionCommitResult = {
  run: {
    id: number;
    sourceAcademicYearId: number;
    targetAcademicYearId: number;
    status: 'COMMITTED' | 'FAILED';
    activateTargetYear: boolean;
    totalClasses: number;
    totalStudents: number;
    promotedStudents: number;
    graduatedStudents: number;
    committedAt: string | null;
    createdAt: string;
  };
  summary: AdminAcademicPromotionWorkspace['summary'];
  validation: AdminAcademicPromotionWorkspace['validation'];
};

export type AdminAcademicPromotionRollbackResult = {
  run: {
    id: number;
    sourceAcademicYearId: number;
    targetAcademicYearId: number;
    status: 'ROLLED_BACK';
    activateTargetYear: boolean;
    totalClasses: number;
    totalStudents: number;
    promotedStudents: number;
    graduatedStudents: number;
    committedAt: string | null;
    createdAt: string;
    rolledBackAt: string;
    rolledBackBy: {
      id: number | null;
      name: string | null;
      username: string | null;
    } | null;
  };
  rollback: {
    restoredStudents: number;
    revertedPromotedStudents: number;
    revertedGraduatedStudents: number;
  };
};

export type AdminTeacherAssignment = {
  id: number;
  teacher?: { id: number; name: string; username: string } | null;
  subject?: { id: number; name: string; code: string } | null;
  class?: {
    id: number;
    name: string;
    level: string;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
    _count?: {
      students?: number;
    };
  } | null;
  academicYear?: { id: number; name: string } | null;
  _count?: {
    scheduleEntries?: number;
  };
};

export type AdminScheduleDayOfWeek =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY';

export type AdminSchedulePeriodType = 'TEACHING' | 'UPACARA' | 'ISTIRAHAT' | 'TADARUS' | 'OTHER';

export type AdminScheduleTimeConfigPayload = {
  periodTimes: Record<string, Record<number, string>>;
  periodNotes: Record<string, Record<number, string>>;
  periodTypes?: Record<string, Record<number, AdminSchedulePeriodType>>;
};

export type AdminScheduleTimeConfig = {
  id: number;
  academicYearId: number;
  config: AdminScheduleTimeConfigPayload;
  createdAt: string;
  updatedAt: string;
};

export type AdminScheduleEntry = {
  id: number;
  academicYearId: number;
  classId: number;
  teacherAssignmentId: number;
  dayOfWeek: AdminScheduleDayOfWeek;
  period: number;
  teachingHour?: number | null;
  room?: string | null;
  createdAt?: string;
  updatedAt?: string;
  teacherAssignment: {
    id: number;
    teacher: {
      id: number;
      name: string;
      username: string;
    };
    subject: {
      id: number;
      name: string;
      code: string;
    };
    class: {
      id: number;
      name: string;
      level: string;
      major?: {
        id: number;
        name: string;
        code: string;
      } | null;
    };
    academicYear?: {
      id: number;
      name: string;
    } | null;
  };
};

export type AdminTeachingLoadDetail = {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  classCount: number;
  sessionCount: number;
  hours: number;
};

export type AdminTeachingLoadTeacher = {
  teacherId: number;
  teacherName: string;
  teacherUsername: string;
  totalClasses: number;
  totalSubjects: number;
  totalSessions: number;
  totalHours: number;
  details: AdminTeachingLoadDetail[];
};

export type AdminTeacherAssignmentPayload = {
  academicYearId: number;
  teacherId: number;
  subjectId: number;
  classIds: number[];
};

export type AdminBkkApplicationStatus =
  | 'SUBMITTED'
  | 'REVIEWING'
  | 'SHORTLISTED'
  | 'PARTNER_INTERVIEW'
  | 'HIRED'
  | 'INTERVIEW'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'WITHDRAWN';

export type AdminBkkApplicationSummary = {
  total: number;
  submitted: number;
  reviewing: number;
  shortlisted: number;
  partnerInterview: number;
  interview: number;
  hired: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
};

export type AdminBkkApplication = {
  id: number;
  status: AdminBkkApplicationStatus;
  reviewerNotes?: string | null;
  partnerReferenceCode?: string | null;
  partnerHandoffNotes?: string | null;
  partnerDecisionNotes?: string | null;
  appliedAt: string;
  reviewedAt?: string | null;
  shortlistedAt?: string | null;
  partnerInterviewAt?: string | null;
  finalizedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  applicant: {
    id: number;
    name: string;
    username: string;
    phone?: string | null;
    email?: string | null;
    verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  };
  profile?: {
    id: number;
    educationLevel?: string | null;
    graduationYear?: number | null;
    schoolName?: string | null;
    major?: string | null;
    skills?: string | null;
    experienceSummary?: string | null;
    cvUrl?: string | null;
    portfolioUrl?: string | null;
    linkedinUrl?: string | null;
    updatedAt?: string | null;
  } | null;
  vacancy: {
    id: number;
    title: string;
    companyName?: string | null;
    deadline?: string | null;
    isOpen: boolean;
    industryPartner?: {
      id: number;
      name: string;
      city?: string | null;
      sector?: string | null;
    } | null;
  };
};

export type AdminBkkApplicationsResult = {
  applications: AdminBkkApplication[];
  total: number;
  page: number;
  totalPages: number;
  summary: AdminBkkApplicationSummary;
};

export type AdminCandidateAdmissionSummary = {
  total: number;
  draft: number;
  submitted: number;
  underReview: number;
  needsRevision: number;
  testScheduled: number;
  passedTest: number;
  failedTest: number;
  accepted: number;
  rejected: number;
};

export type AdminCandidateAdmissionsResult = {
  applications: MobileCandidateAdmissionDetail[];
  total: number;
  page: number;
  totalPages: number;
  summary: AdminCandidateAdmissionSummary;
};

export type AdminExtracurricular = {
  id: number;
  name: string;
  description?: string | null;
  category?: ExtracurricularCategory;
  tutorAssignments?: Array<{
    id: number;
    tutor?: {
      name: string;
    } | null;
  }>;
};

export type AdminExamType =
  | 'FORMATIF'
  | 'SBTS'
  | 'SAS'
  | 'SAT'
  | 'US_PRACTICE'
  | 'US_THEORY';

export type AdminExamQuestionType =
  | 'MULTIPLE_CHOICE'
  | 'COMPLEX_MULTIPLE_CHOICE'
  | 'TRUE_FALSE'
  | 'ESSAY'
  | 'MATCHING';

export type AdminExamQuestion = {
  id: number;
  type?: AdminExamQuestionType | string;
  content?: string;
  points?: number | null;
  answerKey?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  options?: Array<{
    id?: string;
    content?: string;
    isCorrect?: boolean;
  }>;
  bank?: {
    id: number;
    title?: string;
    semester?: 'ODD' | 'EVEN' | null;
    classLevel?: string | null;
    subject?: {
      id: number;
      name: string;
      code: string;
    } | null;
    academicYear?: {
      id: number;
      name: string;
    } | null;
    author?: {
      name?: string;
      username?: string;
    } | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminExamPacket = {
  id: number;
  title: string;
  description?: string | null;
  type?: AdminExamType | string;
  semester?: 'ODD' | 'EVEN' | null;
  duration?: number | null;
  kkm?: number | null;
  subjectId?: number;
  academicYearId?: number;
  subject?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
  } | null;
  author?: {
    id?: number;
    name?: string;
    username?: string;
  } | null;
  _count?: {
    schedules?: number;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type AdminExamSchedule = {
  id: number;
  startTime: string;
  endTime: string;
  isActive?: boolean;
  room?: string | null;
  semester?: 'ODD' | 'EVEN' | null;
  subject?: {
    id: number;
    name: string;
    code: string;
  } | null;
  academicYear?: {
    id: number;
    name: string;
  } | null;
  proctor?: {
    id: number;
    name: string;
    username?: string;
  } | null;
  _count?: {
    sessions?: number;
  };
  class?: {
    id: number;
    name: string;
  } | null;
  packet?: {
    id: number;
    title: string;
    type?: AdminExamType | string;
    semester?: string;
    duration?: number;
    subject?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
};

export type AdminAttendanceLateSummary = {
  recap: Array<{
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    semester1Late: number;
    semester2Late: number;
    totalLate: number;
  }>;
  meta?: {
    classId?: number;
    academicYearId?: number;
  };
};

export type AdminAttendanceSemesterFilter = 'ALL' | 'ODD' | 'EVEN';

export type AdminAttendanceDailyRecap = {
  recap: Array<{
    student: {
      id: number;
      name: string;
      nis?: string | null;
      nisn?: string | null;
    };
    present: number;
    late: number;
    sick: number;
    permission: number;
    absent: number;
    total: number;
    percentage: number;
  }>;
  meta?: {
    classId?: number;
    academicYearId?: number;
    semester?: string | null;
    dateRange?: {
      start?: string;
      end?: string;
    };
  };
};

export type AdminAcademicEventType =
  | 'LIBUR_NASIONAL'
  | 'LIBUR_SEKOLAH'
  | 'UJIAN_PTS'
  | 'UJIAN_PAS'
  | 'UJIAN_PAT'
  | 'MPLS'
  | 'RAPOR'
  | 'KEGIATAN_SEKOLAH'
  | 'LAINNYA';

export type AdminAcademicEventSemester = 'ODD' | 'EVEN';

export type AdminAcademicEvent = {
  id: number;
  academicYearId: number;
  title: string;
  type: AdminAcademicEventType;
  startDate: string;
  endDate: string;
  semester?: AdminAcademicEventSemester | null;
  isHoliday: boolean;
  description?: string | null;
};

export type AdminClassReportSummary = {
  class?: {
    id: number;
    name: string;
    level?: string;
  };
  subjects?: Array<{
    subject?: {
      id: number;
      code?: string;
      name?: string;
    };
  }>;
  students?: Array<{
    student?: {
      id: number;
      name: string;
    };
    subjects?: unknown[];
  }>;
  meta?: {
    academicYearId?: number;
  };
};

export type AdminClassRankingRow = {
  rank: number;
  totalScore: number;
  averageScore: number;
  subjectCount: number;
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
};

export type AdminClassRankingsResponse = {
  className?: string;
  academicYear?: string;
  semester?: 'ODD' | 'EVEN';
  homeroomTeacher?: {
    id?: number;
    name?: string;
    username?: string;
    nip?: string | null;
  } | null;
  principalName?: string;
  principalNip?: string;
  rankings?: AdminClassRankingRow[];
};

export type AdminUserWritePayload = {
  username?: string;
  password?: string;
  name?: string;
  role?:
    | 'ADMIN'
    | 'TEACHER'
    | 'STUDENT'
    | 'PRINCIPAL'
    | 'STAFF'
    | 'PARENT'
    | 'CALON_SISWA'
    | 'UMUM'
    | 'EXAMINER'
    | 'EXTRACURRICULAR_TUTOR';
  nip?: string | null;
  nis?: string | null;
  nisn?: string | null;
  gender?: 'MALE' | 'FEMALE' | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  photo?: string | null;
  classId?: number | null;
  studentStatus?: 'ACTIVE' | 'GRADUATED' | 'MOVED' | 'DROPPED_OUT';
  additionalDuties?: string[];
  managedMajorIds?: number[];
  examinerMajorId?: number | null;
  childNisns?: string[];
  verificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED';
};

export type AdminUserCreatePayload = Required<
  Pick<AdminUserWritePayload, 'username' | 'password' | 'name' | 'role'>
> &
  Omit<AdminUserWritePayload, 'verificationStatus'>;

type MobileBinaryFile = {
  uri: string;
  name?: string;
  type?: string;
};

type MobileImportFile = MobileBinaryFile;

type ReactNativeUploadPart = {
  uri: string;
  name: string;
  type: string;
};

type AdminImportResult = Record<string, unknown>;

function appendMobileFile(
  formData: FormData,
  field: string,
  file: MobileBinaryFile,
  fallbackName: string,
  fallbackType: string,
) {
  const uploadPart: ReactNativeUploadPart = {
    uri: file.uri,
    name: file.name || fallbackName,
    type: file.type || fallbackType,
  };
  formData.append(field, uploadPart as unknown as Blob);
}

export type AdminSlideshowSlide = {
  id: string;
  filename: string;
  url: string;
  description: string;
  order: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminMajorPayload = {
  name: string;
  code: string;
  description?: string | null;
};

export type AdminSubjectCategoryPayload = {
  code: string;
  name: string;
  description?: string | null;
};

export type AdminSubjectPayload = {
  name: string;
  code: string;
  description?: string | null;
  parentId?: number | null;
  subjectCategoryId?: number;
  kkmX?: number | null;
  kkmXI?: number | null;
  kkmXII?: number | null;
};

export type AdminClassPayload = {
  name: string;
  level: string;
  majorId: number;
  academicYearId: number;
  teacherId?: number | null;
};

export type AdminTrainingClassPayload = {
  name: string;
  description?: string | null;
  academicYearId: number;
  instructorId?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  maxCapacity?: number | null;
  isActive?: boolean;
};

export type AdminExtracurricularPayload = {
  name: string;
  description?: string | null;
  category: ExtracurricularCategory;
};

export type AdminAcademicYearPayload = {
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive?: boolean;
  pklEligibleGrades?: string | null;
};

export type AdminAcademicEventPayload = {
  academicYearId: number;
  title: string;
  type: AdminAcademicEventType;
  startDate: string;
  endDate: string;
  semester?: AdminAcademicEventSemester | null;
  isHoliday?: boolean;
  description?: string | null;
};

const normalizePagination = (
  raw: Partial<Pagination> | undefined,
  fallbackLimit: number,
  fallbackTotal: number,
): Pagination => {
  const limit = Number(raw?.limit) > 0 ? Number(raw?.limit) : Math.max(1, fallbackLimit);
  const total = Number(raw?.total) >= 0 ? Number(raw?.total) : Math.max(0, fallbackTotal);
  const page = Number(raw?.page) > 0 ? Number(raw?.page) : 1;
  const totalPages = Number(raw?.totalPages) > 0 ? Number(raw?.totalPages) : Math.max(1, Math.ceil(total / limit) || 1);
  return { page, limit, total, totalPages };
};

const toPaginated = <T,>(
  rawItems: T[] | undefined,
  rawPagination: Partial<Pagination> | undefined,
  fallbackLimit: number,
): PaginatedResult<T> => {
  const items = Array.isArray(rawItems) ? rawItems : [];
  return {
    items,
    pagination: normalizePagination(rawPagination, fallbackLimit, items.length),
  };
};

export const adminApi = {
  async listUsers(params?: { role?: string; verificationStatus?: string }) {
    const response = await apiClient.get<ApiEnvelope<AdminUser[]>>('/users', {
      params,
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createUser(payload: AdminUserCreatePayload) {
    const response = await apiClient.post<ApiEnvelope<AdminUser>>('/users', payload);
    return response.data?.data;
  },

  async listMajors(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ majors: AdminMajor[]; pagination: Pagination }>
    >('/majors', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return toPaginated(response.data?.data?.majors, response.data?.data?.pagination, params?.limit ?? 100);
  },

  async createMajor(payload: AdminMajorPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminMajor>>('/majors', payload);
    return response.data?.data;
  },

  async updateMajor(id: number, payload: Partial<AdminMajorPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminMajor>>(`/majors/${id}`, payload);
    return response.data?.data;
  },

  async deleteMajor(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/majors/${id}`);
    return response.data?.data;
  },

  async listSubjects(params?: { page?: number; limit?: number; search?: string; subjectCategoryId?: number }) {
    const response = await apiClient.get<
      ApiEnvelope<{ subjects: AdminSubject[]; pagination: Pagination }>
    >('/subjects', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
        subjectCategoryId: params?.subjectCategoryId,
      },
    });
    return toPaginated(
      response.data?.data?.subjects,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createSubject(payload: AdminSubjectPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminSubject>>('/subjects', payload);
    return response.data?.data;
  },

  async updateSubject(id: number, payload: Partial<AdminSubjectPayload>) {
    const response = await apiClient.patch<ApiEnvelope<AdminSubject>>(`/subjects/${id}`, payload);
    return response.data?.data;
  },

  async deleteSubject(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/subjects/${id}`);
    return response.data?.data;
  },

  async listSubjectCategories() {
    const response = await apiClient.get<ApiEnvelope<AdminSubjectCategory[]>>('/subject-categories');
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createSubjectCategory(payload: AdminSubjectCategoryPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminSubjectCategory>>('/subject-categories', payload);
    return response.data?.data;
  },

  async updateSubjectCategory(id: number, payload: Partial<AdminSubjectCategoryPayload>) {
    const response = await apiClient.patch<ApiEnvelope<AdminSubjectCategory>>(`/subject-categories/${id}`, payload);
    return response.data?.data;
  },

  async deleteSubjectCategory(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/subject-categories/${id}`);
    return response.data?.data;
  },

  async listExtracurriculars(params?: {
    page?: number;
    limit?: number;
    search?: string;
    category?: ExtracurricularCategory;
  }) {
    const response = await apiClient.get<
      ApiEnvelope<{ extracurriculars: AdminExtracurricular[]; pagination: Pagination }>
    >('/extracurriculars', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
        category: params?.category,
      },
    });
    return toPaginated(
      response.data?.data?.extracurriculars,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createExtracurricular(payload: AdminExtracurricularPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminExtracurricular>>('/extracurriculars', payload);
    return response.data?.data;
  },

  async updateExtracurricular(id: number, payload: Partial<AdminExtracurricularPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminExtracurricular>>(`/extracurriculars/${id}`, payload);
    return response.data?.data;
  },

  async deleteExtracurricular(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/extracurriculars/${id}`);
    return response.data?.data;
  },

  async listClasses(params?: {
    page?: number;
    limit?: number;
    search?: string;
    level?: string;
    majorId?: number;
    academicYearId?: number;
    teacherId?: number;
  }) {
    const response = await apiClient.get<
      ApiEnvelope<{ classes: AdminClass[]; pagination: Pagination }>
    >('/classes', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
        level: params?.level,
        majorId: params?.majorId,
        academicYearId: params?.academicYearId,
        teacherId: params?.teacherId,
      },
    });
    return toPaginated(response.data?.data?.classes, response.data?.data?.pagination, params?.limit ?? 100);
  },

  async createClass(payload: AdminClassPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminClass>>('/classes', payload);
    return response.data?.data;
  },

  async updateClass(id: number, payload: AdminClassPayload) {
    const response = await apiClient.put<ApiEnvelope<AdminClass>>(`/classes/${id}`, payload);
    return response.data?.data;
  },

  async deleteClass(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/classes/${id}`);
    return response.data?.data;
  },

  async listTrainingClasses(params?: { page?: number; limit?: number; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ trainingClasses: AdminTrainingClass[]; pagination: Pagination }>
    >('/training-classes', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 100,
        search: params?.search,
      },
    });
    return toPaginated(
      response.data?.data?.trainingClasses,
      response.data?.data?.pagination,
      params?.limit ?? 100,
    );
  },

  async createTrainingClass(payload: AdminTrainingClassPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminTrainingClass>>('/training-classes', payload);
    return response.data?.data;
  },

  async updateTrainingClass(id: number, payload: Partial<AdminTrainingClassPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminTrainingClass>>(`/training-classes/${id}`, payload);
    return response.data?.data;
  },

  async deleteTrainingClass(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/training-classes/${id}`);
    return response.data?.data;
  },

  async getClassById(id: number) {
    const response = await apiClient.get<ApiEnvelope<AdminClassDetail>>(`/classes/${id}`);
    return response.data?.data;
  },

  async listAcademicYears(params?: { page?: number; limit?: number; isActive?: boolean; search?: string }) {
    const response = await apiClient.get<
      ApiEnvelope<{ academicYears: AdminAcademicYear[]; pagination: Pagination }>
    >('/academic-years', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 50,
        isActive: params?.isActive,
        search: params?.search,
      },
    });
    return toPaginated(
      response.data?.data?.academicYears,
      response.data?.data?.pagination,
      params?.limit ?? 50,
    );
  },

  async getActiveAcademicYear() {
    const response = await apiClient.get<ApiEnvelope<AdminAcademicYear & { semester?: 'ODD' | 'EVEN' }>>(
      '/academic-years/active',
    );
    return response.data?.data;
  },

  async getAcademicFeatureFlags() {
    const response = await apiClient.get<ApiEnvelope<AdminAcademicFeatureFlags>>('/academic-years/features');
    return response.data?.data;
  },

  async createAcademicYearRolloverTarget(
    sourceAcademicYearId: number,
    payload?: {
      name?: string;
      semester1Start?: string;
      semester1End?: string;
      semester2Start?: string;
      semester2End?: string;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYearRolloverTargetResult>>(
      `/academic-years/${sourceAcademicYearId}/rollover-v1/target`,
      payload || {},
    );
    return response.data?.data;
  },

  async getAcademicYearRolloverWorkspace(sourceAcademicYearId: number, targetAcademicYearId: number) {
    const response = await apiClient.get<ApiEnvelope<AdminAcademicYearRolloverWorkspace>>(
      `/academic-years/${sourceAcademicYearId}/rollover-v1`,
      {
        params: { targetAcademicYearId },
      },
    );
    return response.data?.data;
  },

  async applyAcademicYearRollover(
    sourceAcademicYearId: number,
    payload: {
      targetAcademicYearId: number;
      components?: Partial<AdminAcademicYearRolloverComponentSelection>;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYearRolloverApplyResult>>(
      `/academic-years/${sourceAcademicYearId}/rollover-v1/apply`,
      payload,
    );
    return response.data?.data;
  },

  async createAcademicYear(payload: AdminAcademicYearPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYear>>('/academic-years', payload);
    return response.data?.data;
  },

  async updateAcademicYear(id: number, payload: AdminAcademicYearPayload) {
    const response = await apiClient.put<ApiEnvelope<AdminAcademicYear>>(`/academic-years/${id}`, payload);
    return response.data?.data;
  },

  async deleteAcademicYear(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/academic-years/${id}`);
    return response.data?.data;
  },

  async listTeacherAssignments(params: { academicYearId: number; page?: number; limit?: number }) {
    const response = await apiClient.get<
      ApiEnvelope<{ assignments: AdminTeacherAssignment[]; pagination: Pagination }>
    >('/teacher-assignments', {
      params: {
        academicYearId: params.academicYearId,
        page: params.page ?? 1,
        limit: params.limit ?? 100,
      },
    });
    return toPaginated(
      response.data?.data?.assignments,
      response.data?.data?.pagination,
      params.limit ?? 100,
    );
  },

  async listBkkApplications(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: AdminBkkApplicationStatus | 'ALL';
    vacancyId?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminBkkApplicationsResult>>('/humas/applications', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 25,
        search: params?.search,
        status: params?.status,
        vacancyId: params?.vacancyId,
      },
    });
    const payload = response.data?.data;
    return {
      applications: Array.isArray(payload?.applications) ? payload.applications : [],
      total: Number(payload?.total || 0),
      page: Number(payload?.page || params?.page || 1),
      totalPages: Number(payload?.totalPages || 1),
      summary: {
        total: Number(payload?.summary?.total || 0),
        submitted: Number(payload?.summary?.submitted || 0),
        reviewing: Number(payload?.summary?.reviewing || 0),
        shortlisted: Number(payload?.summary?.shortlisted || 0),
        partnerInterview: Number(payload?.summary?.partnerInterview || 0),
        interview: Number(payload?.summary?.interview || 0),
        hired: Number(payload?.summary?.hired || 0),
        accepted: Number(payload?.summary?.accepted || 0),
        rejected: Number(payload?.summary?.rejected || 0),
        withdrawn: Number(payload?.summary?.withdrawn || 0),
      },
    } satisfies AdminBkkApplicationsResult;
  },

  async listCandidateAdmissions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    status?: MobileCandidateAdmissionStatus | 'ALL';
    desiredMajorId?: number | 'ALL';
    publishedOnly?: boolean;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminCandidateAdmissionsResult>>('/candidate-admissions', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 12,
        search: params?.search,
        status: params?.status,
        desiredMajorId: params?.desiredMajorId,
        publishedOnly: params?.publishedOnly,
      },
    });
    const payload = response.data?.data;
    return {
      applications: Array.isArray(payload?.applications) ? payload.applications : [],
      total: Number(payload?.total || 0),
      page: Number(payload?.page || params?.page || 1),
      totalPages: Number(payload?.totalPages || 1),
      summary: {
        total: Number(payload?.summary?.total || 0),
        draft: Number(payload?.summary?.draft || 0),
        submitted: Number(payload?.summary?.submitted || 0),
        underReview: Number(payload?.summary?.underReview || 0),
        needsRevision: Number(payload?.summary?.needsRevision || 0),
        testScheduled: Number(payload?.summary?.testScheduled || 0),
        passedTest: Number(payload?.summary?.passedTest || 0),
        failedTest: Number(payload?.summary?.failedTest || 0),
        accepted: Number(payload?.summary?.accepted || 0),
        rejected: Number(payload?.summary?.rejected || 0),
      },
    } satisfies AdminCandidateAdmissionsResult;
  },

  async getCandidateAdmissionById(id: number) {
    const response = await apiClient.get<ApiEnvelope<MobileCandidateAdmissionDetail>>(`/candidate-admissions/${id}`);
    return response.data?.data;
  },

  async reviewCandidateAdmission(
    id: number,
    payload: {
      status: MobileCandidateAdmissionStatus;
      reviewNotes?: string;
      decisionTitle?: string;
      decisionSummary?: string;
      decisionNextSteps?: string;
      publishDecision?: boolean;
    },
  ) {
    const response = await apiClient.patch<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      `/candidate-admissions/${id}/review`,
      payload,
    );
    return response.data?.data;
  },

  async saveCandidateAdmissionAssessmentBoard(
    id: number,
    payload: {
      items: Array<{
        componentCode: 'LITERACY_COLOR' | 'INTERVIEW' | 'PHYSICAL';
        score?: number | null;
        maxScore?: number | null;
        weight?: number | null;
        passingScore?: number | null;
        notes?: string | null;
        assessedAt?: string | null;
      }>;
    },
  ) {
    const response = await apiClient.patch<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      `/candidate-admissions/${id}/assessment-board`,
      payload,
    );
    return response.data?.data;
  },

  async acceptCandidateAdmissionAsStudent(id: number) {
    const response = await apiClient.post<ApiEnvelope<MobileCandidateAdmissionDetail>>(
      `/candidate-admissions/${id}/accept-student`,
    );
    return response.data?.data;
  },

  async upsertTeacherAssignments(payload: AdminTeacherAssignmentPayload) {
    const response = await apiClient.post<ApiEnvelope<{ assignments: AdminTeacherAssignment[] }>>(
      '/teacher-assignments',
      payload,
    );
    return response.data?.data?.assignments || [];
  },

  async deleteTeacherAssignment(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/teacher-assignments/${id}`);
    return response.data?.data;
  },

  async getTeachingLoadSummary(params: { academicYearId: number; teacherId?: number }) {
    const response = await apiClient.get<ApiEnvelope<{ teachers: AdminTeachingLoadTeacher[] }>>(
      '/schedules/teaching-summary',
      {
        params: {
          academicYearId: params.academicYearId,
          teacherId: params.teacherId,
        },
      },
    );
    return response.data?.data?.teachers || [];
  },

  async listSchedules(params: { academicYearId: number; classId?: number; teacherId?: number }) {
    const response = await apiClient.get<ApiEnvelope<{ entries: AdminScheduleEntry[] }>>('/schedules', {
      params: {
        academicYearId: params.academicYearId,
        classId: params.classId,
        teacherId: params.teacherId,
      },
    });
    return response.data?.data?.entries || [];
  },

  async createScheduleEntry(payload: {
    academicYearId: number;
    classId: number;
    teacherAssignmentId: number;
    dayOfWeek: AdminScheduleDayOfWeek;
    period: number;
    room?: string | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<AdminScheduleEntry>>('/schedules', payload);
    return response.data?.data;
  },

  async deleteScheduleEntry(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/schedules/${id}`);
    return response.data?.data;
  },

  async getScheduleTimeConfig(academicYearId?: number) {
    const response = await apiClient.get<{
      success: boolean;
      data: AdminScheduleTimeConfig | null;
      academicYearId?: number;
    }>('/schedule-time-configs', {
      params: academicYearId ? { academicYearId } : undefined,
    });
    return response.data?.data || null;
  },

  async saveScheduleTimeConfig(payload: {
    academicYearId: number;
    config: AdminScheduleTimeConfigPayload;
  }) {
    const response = await apiClient.post<{
      success: boolean;
      message?: string;
      data: AdminScheduleTimeConfig;
    }>('/schedule-time-configs', payload);
    return response.data?.data;
  },

  async listExamQuestions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: AdminExamQuestionType | string;
    subjectId?: number;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<
      ApiEnvelope<{
        questions: AdminExamQuestion[];
        meta: Pagination;
      }>
    >('/exams/questions', {
      params: {
        page: params?.page ?? 1,
        limit: params?.limit ?? 20,
        search: params?.search,
        type: params?.type,
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
      },
    });
    return toPaginated(
      response.data?.data?.questions,
      response.data?.data?.meta,
      params?.limit ?? 20,
    );
  },

  async listExamPackets(params?: {
    type?: AdminExamType | string;
    subjectId?: number;
    academicYearId?: number;
    semester?: 'ODD' | 'EVEN';
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminExamPacket[]>>('/exams/packets', {
      params: {
        type: params?.type,
        subjectId: params?.subjectId,
        academicYearId: params?.academicYearId,
        semester: params?.semester,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async listExamSchedules(params?: {
    examType?: AdminExamType | string;
    academicYearId?: number;
    classId?: number;
    packetId?: number;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminExamSchedule[]>>('/exams/schedules', {
      params: {
        examType: params?.examType,
        academicYearId: params?.academicYearId,
        classId: params?.classId,
        packetId: params?.packetId,
      },
    });
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async createExamSchedule(payload: {
    packetId: number;
    classIds: number[];
    startTime: string;
    endTime: string;
    proctorId?: number;
    room?: string | null;
  }) {
    const response = await apiClient.post<ApiEnvelope<AdminExamSchedule[]>>('/exams/schedules', payload);
    return Array.isArray(response.data?.data) ? response.data.data : [];
  },

  async updateExamSchedule(
    id: number,
    payload: {
      startTime?: string;
      endTime?: string;
      proctorId?: number | null;
      room?: string | null;
      isActive?: boolean;
    },
  ) {
    const response = await apiClient.patch<ApiEnvelope<AdminExamSchedule>>(`/exams/schedules/${id}`, payload);
    return response.data?.data;
  },

  async deleteExamSchedule(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/exams/schedules/${id}`);
    return response.data?.data;
  },

  async getLateSummaryByClass(params: { classId: number; academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<AdminAttendanceLateSummary>>('/attendances/daily/late-summary', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data;
  },

  async getDailyAttendanceRecap(params: {
    classId: number;
    academicYearId?: number;
    semester?: AdminAttendanceSemesterFilter;
  }) {
    const response = await apiClient.get<ApiEnvelope<AdminAttendanceDailyRecap>>('/attendances/daily/recap', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data?.data;
  },

  async getClassReportSummary(params: { classId: number; academicYearId?: number }) {
    const response = await apiClient.get<ApiEnvelope<AdminClassReportSummary>>('/reports/report-cards', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
      },
    });
    return response.data?.data;
  },

  async getClassRankings(params: { classId: number; academicYearId?: number; semester: 'ODD' | 'EVEN' }) {
    const response = await apiClient.get<ApiEnvelope<AdminClassRankingsResponse>>('/reports/rankings', {
      params: {
        classId: params.classId,
        academicYearId: params.academicYearId,
        semester: params.semester,
      },
    });
    return response.data?.data;
  },

  async listAcademicEvents(params: {
    academicYearId: number;
    semester?: AdminAcademicEventSemester;
    type?: AdminAcademicEventType;
  }) {
    const response = await apiClient.get<ApiEnvelope<{ events: AdminAcademicEvent[] }>>('/academic-events', {
      params: {
        academicYearId: params.academicYearId,
        semester: params.semester,
        type: params.type,
      },
    });
    return response.data?.data?.events || [];
  },

  async createAcademicEvent(payload: AdminAcademicEventPayload) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicEvent>>('/academic-events', payload);
    return response.data?.data;
  },

  async updateAcademicEvent(id: number, payload: Partial<AdminAcademicEventPayload>) {
    const response = await apiClient.put<ApiEnvelope<AdminAcademicEvent>>(`/academic-events/${id}`, payload);
    return response.data?.data;
  },

  async deleteAcademicEvent(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/academic-events/${id}`);
    return response.data?.data;
  },

  async listSlideshowSlides() {
    const response = await apiClient.get<
      ApiEnvelope<{ slides: AdminSlideshowSlide[]; settings?: { slideIntervalMs?: number } }>
    >('/gallery/slides');
    return {
      slides: Array.isArray(response.data?.data?.slides) ? response.data.data.slides : [],
      settings: response.data?.data?.settings,
    };
  },

  async uploadSlideshowSlide(
    file: MobileBinaryFile,
    payload?: {
      description?: string;
      isActive?: boolean;
    },
  ) {
    const formData = new FormData();
    appendMobileFile(formData, 'file', file, `slide-${Date.now()}.jpg`, 'image/jpeg');
    if (typeof payload?.description === 'string') {
      formData.append('description', payload.description);
    }
    if (typeof payload?.isActive === 'boolean') {
      formData.append('isActive', payload.isActive ? 'true' : 'false');
    }

    const response = await apiClient.post<
      ApiEnvelope<{ slide: AdminSlideshowSlide; slides: AdminSlideshowSlide[] }>
    >('/gallery/slides/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data?.data;
  },

  async updateSlideshowSlide(
    id: string,
    payload: Partial<Pick<AdminSlideshowSlide, 'description' | 'isActive' | 'order'>>,
  ) {
    const response = await apiClient.patch<
      ApiEnvelope<{ slide: AdminSlideshowSlide; slides: AdminSlideshowSlide[] }>
    >(`/gallery/slides/${id}`, payload);
    return response.data?.data;
  },

  async reorderSlideshowSlides(ids: string[]) {
    const response = await apiClient.patch<ApiEnvelope<{ slides: AdminSlideshowSlide[] }>>(
      '/gallery/slides/reorder',
      { ids },
    );
    return response.data?.data;
  },

  async deleteSlideshowSlide(id: string) {
    const response = await apiClient.delete<ApiEnvelope<{ deletedId: string; slides: AdminSlideshowSlide[] }>>(
      `/gallery/slides/${id}`,
    );
    return response.data?.data;
  },

  async updateSlideshowSettings(settings: { slideIntervalMs: number }) {
    const response = await apiClient.patch<ApiEnvelope<{ settings: { slideIntervalMs: number } }>>(
      '/gallery/settings',
      settings,
    );
    return response.data?.data;
  },

  async updateUser(id: number, payload: AdminUserWritePayload) {
    const response = await apiClient.put<ApiEnvelope<AdminUser>>(`/users/${id}`, payload);
    return response.data?.data;
  },

  async deleteUser(id: number) {
    const response = await apiClient.delete<ApiEnvelope<null>>(`/users/${id}`);
    return response.data?.data;
  },

  async verifyUsersBulk(userIds: number[]) {
    const response = await apiClient.post<ApiEnvelope<{ updatedCount: number }>>('/users/verify-bulk', {
      userIds,
    });
    return response.data?.data;
  },

  async importTeachers(file: MobileImportFile) {
    const formData = new FormData();
    appendMobileFile(
      formData,
      'file',
      file,
      `teachers-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const response = await apiClient.post<ApiEnvelope<AdminImportResult>>('/data/teachers/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async importStudents(file: MobileImportFile) {
    const formData = new FormData();
    appendMobileFile(
      formData,
      'file',
      file,
      `students-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const response = await apiClient.post<ApiEnvelope<AdminImportResult>>('/data/students/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async importParents(file: MobileImportFile) {
    const formData = new FormData();
    appendMobileFile(
      formData,
      'file',
      file,
      `parents-${Date.now()}.xlsx`,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    const response = await apiClient.post<ApiEnvelope<AdminImportResult>>('/data/parents/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data?.data;
  },

  async activateAcademicYear(id: number) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicYear>>(`/academic-years/${id}/activate`);
    return response.data?.data;
  },

  async getAcademicPromotionWorkspace(sourceAcademicYearId: number, targetAcademicYearId: number) {
    const response = await apiClient.get<ApiEnvelope<AdminAcademicPromotionWorkspace>>(
      `/academic-years/${sourceAcademicYearId}/promotion-v2`,
      {
        params: { targetAcademicYearId },
      },
    );
    return response.data?.data;
  },

  async saveAcademicPromotionMappings(
    sourceAcademicYearId: number,
    payload: {
      targetAcademicYearId: number;
      mappings: Array<{
        sourceClassId: number;
        targetClassId: number | null;
      }>;
    },
  ) {
    const response = await apiClient.put<ApiEnvelope<AdminAcademicPromotionWorkspace>>(
      `/academic-years/${sourceAcademicYearId}/promotion-v2/mappings`,
      payload,
    );
    return response.data?.data;
  },

  async commitAcademicPromotion(
    sourceAcademicYearId: number,
    payload: {
      targetAcademicYearId: number;
      activateTargetYear?: boolean;
    },
  ) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicPromotionCommitResult>>(
      `/academic-years/${sourceAcademicYearId}/promotion-v2/commit`,
      payload,
    );
    return response.data?.data;
  },

  async rollbackAcademicPromotionRun(sourceAcademicYearId: number, runId: number) {
    const response = await apiClient.post<ApiEnvelope<AdminAcademicPromotionRollbackResult>>(
      `/academic-years/${sourceAcademicYearId}/promotion-v2/runs/${runId}/rollback`,
    );
    return response.data?.data;
  },
};
