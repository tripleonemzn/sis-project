import api from './api';

export interface AcademicYear {
  id: number;
  name: string;
  semester1Start: string;
  semester1End: string;
  semester2Start: string;
  semester2End: string;
  isActive: boolean;
  pklEligibleGrades?: string | null;
}

export interface AcademicFeatureFlags {
  academicPromotionV2Enabled: boolean;
  academicYearRolloverEnabled: boolean;
}

export interface AcademicYearRolloverComponentSelection {
  classPreparation: boolean;
  teacherAssignments: boolean;
  scheduleTimeConfig: boolean;
  academicEvents: boolean;
  reportDates: boolean;
  subjectKkms: boolean;
  examGradeComponents: boolean;
  examProgramConfigs: boolean;
  examProgramSessions: boolean;
}

export interface AcademicYearRolloverWorkspace {
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
}

export interface AcademicYearRolloverTargetResult {
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
  targetDraftSuggestion: AcademicYearRolloverWorkspace['targetDraftSuggestion'];
  notes: string[];
}

export interface AcademicYearRolloverApplyResult {
  targetAcademicYear: AcademicYearRolloverWorkspace['targetAcademicYear'];
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
  workspace: AcademicYearRolloverWorkspace;
}

export type AcademicPromotionAction = 'PROMOTE' | 'GRADUATE';

export interface AcademicPromotionWorkspaceClass {
  sourceClassId: number;
  sourceClassName: string;
  sourceLevel: string;
  studentCount: number;
  major: {
    id: number;
    code: string;
    name: string;
  };
  action: AcademicPromotionAction;
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
}

export interface AcademicPromotionWorkspace {
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
  classes: AcademicPromotionWorkspaceClass[];
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
}

export interface AcademicPromotionCommitResult {
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
  summary: AcademicPromotionWorkspace['summary'];
  validation: AcademicPromotionWorkspace['validation'];
}

export interface AcademicPromotionRollbackResult {
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
}

type ActiveYearLite = {
  id: number;
  name: string;
  semester?: 'ODD' | 'EVEN' | string;
  isActive?: boolean;
  [key: string]: unknown;
};

type ActiveYearResponse = ActiveYearLite & {
  academicYear?: ActiveYearLite | null;
  academicYears?: ActiveYearLite[];
  data: ActiveYearLite & {
    academicYear?: ActiveYearLite | null;
    academicYears?: ActiveYearLite[];
    data?: {
      academicYear?: ActiveYearLite | null;
      academicYears?: ActiveYearLite[];
    };
  };
  [key: string]: unknown;
};

const ACTIVE_YEAR_CACHE_TTL_MS = 2 * 60 * 1000;
let activeYearCache: { value: ActiveYearResponse; cachedAt: number } | null = null;
let activeYearInFlight: Promise<ActiveYearResponse> | null = null;

const isActiveYearCacheFresh = () => {
  if (!activeYearCache) return false;
  return Date.now() - activeYearCache.cachedAt < ACTIVE_YEAR_CACHE_TTL_MS;
};

const setActiveYearCache = (value: ActiveYearResponse) => {
  activeYearCache = {
    value,
    cachedAt: Date.now(),
  };
};

const clearActiveYearCache = () => {
  activeYearCache = null;
  activeYearInFlight = null;
};

const getActiveInternal = async (
  options?: { force?: boolean; allowStaleOnError?: boolean },
): Promise<ActiveYearResponse> => {
  const force = Boolean(options?.force);
  const allowStaleOnError = Boolean(options?.allowStaleOnError);

  if (!force && isActiveYearCacheFresh()) {
    return activeYearCache!.value;
  }

  if (!force && activeYearInFlight) {
    return activeYearInFlight;
  }

  activeYearInFlight = api
    .get('/academic-years/active')
    .then((response) => {
      const payload = response.data as ActiveYearResponse;
      setActiveYearCache(payload);
      return payload;
    })
    .catch((error) => {
      if (allowStaleOnError && activeYearCache) {
        return activeYearCache.value;
      }
      throw error;
    })
    .finally(() => {
      activeYearInFlight = null;
    });

  return activeYearInFlight;
};

export const academicYearService = {
  list: async (params?: { page?: number; limit?: number; isActive?: boolean; search?: string }) => {
    const response = await api.get('/academic-years', { params });
    return response.data;
  },
  getActive: async () => getActiveInternal(),
  getActiveSafe: async () => getActiveInternal({ allowStaleOnError: true }),
  create: async (data: Omit<AcademicYear, 'id' | 'isActive'> & { isActive?: boolean }) => {
    const response = await api.post('/academic-years', data);
    clearActiveYearCache();
    return response.data;
  },
  update: async (id: number, data: Partial<AcademicYear>) => {
    const response = await api.put(`/academic-years/${id}`, data);
    clearActiveYearCache();
    return response.data;
  },
  remove: async (id: number) => {
    const response = await api.delete(`/academic-years/${id}`);
    clearActiveYearCache();
    return response.data;
  },
  activate: async (id: number) => {
    const response = await api.post(`/academic-years/${id}/activate`);
    clearActiveYearCache();
    return response.data;
  },
  updatePklConfig: async (pklEligibleGrades: string) => {
    const response = await api.patch('/academic-years/pkl-config', { pklEligibleGrades });
    clearActiveYearCache();
    return response.data;
  },
  getFeatureFlags: async () => {
    const response = await api.get('/academic-years/features');
    return response.data as {
      data: AcademicFeatureFlags;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  createRolloverTarget: async (
    sourceAcademicYearId: number,
    data?: {
      name?: string;
      semester1Start?: string;
      semester1End?: string;
      semester2Start?: string;
      semester2End?: string;
    },
  ) => {
    const response = await api.post(`/academic-years/${sourceAcademicYearId}/rollover-v1/target`, data || {});
    return response.data as {
      data: AcademicYearRolloverTargetResult;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  getRolloverWorkspace: async (sourceAcademicYearId: number, targetAcademicYearId: number) => {
    const response = await api.get(`/academic-years/${sourceAcademicYearId}/rollover-v1`, {
      params: { targetAcademicYearId },
    });
    return response.data as {
      data: AcademicYearRolloverWorkspace;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  applyRollover: async (
    sourceAcademicYearId: number,
    data: {
      targetAcademicYearId: number;
      components?: Partial<AcademicYearRolloverComponentSelection>;
    },
  ) => {
    const response = await api.post(`/academic-years/${sourceAcademicYearId}/rollover-v1/apply`, data);
    return response.data as {
      data: AcademicYearRolloverApplyResult;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  getPromotionWorkspace: async (sourceAcademicYearId: number, targetAcademicYearId: number) => {
    const response = await api.get(`/academic-years/${sourceAcademicYearId}/promotion-v2`, {
      params: { targetAcademicYearId },
    });
    return response.data as {
      data: AcademicPromotionWorkspace;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  savePromotionMappings: async (
    sourceAcademicYearId: number,
    data: {
      targetAcademicYearId: number;
      mappings: Array<{
        sourceClassId: number;
        targetClassId: number | null;
      }>;
    },
  ) => {
    const response = await api.put(`/academic-years/${sourceAcademicYearId}/promotion-v2/mappings`, data);
    return response.data as {
      data: AcademicPromotionWorkspace;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  commitPromotion: async (
    sourceAcademicYearId: number,
    data: {
      targetAcademicYearId: number;
      activateTargetYear?: boolean;
    },
  ) => {
    const response = await api.post(`/academic-years/${sourceAcademicYearId}/promotion-v2/commit`, data);
    clearActiveYearCache();
    return response.data as {
      data: AcademicPromotionCommitResult;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  rollbackPromotionRun: async (sourceAcademicYearId: number, runId: number) => {
    const response = await api.post(`/academic-years/${sourceAcademicYearId}/promotion-v2/runs/${runId}/rollback`);
    clearActiveYearCache();
    return response.data as {
      data: AcademicPromotionRollbackResult;
      message: string;
      success: boolean;
      statusCode: number;
    };
  },
  invalidateActiveCache: () => {
    clearActiveYearCache();
  },
};
