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
    status: 'COMMITTED' | 'FAILED';
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
  invalidateActiveCache: () => {
    clearActiveYearCache();
  },
};
