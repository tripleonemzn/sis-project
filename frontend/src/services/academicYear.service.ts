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
  invalidateActiveCache: () => {
    clearActiveYearCache();
  },
};
