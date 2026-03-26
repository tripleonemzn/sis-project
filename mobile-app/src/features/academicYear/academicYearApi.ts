import { apiClient } from '../../lib/api/client';

type ActiveAcademicYearResponse = {
  statusCode: number;
  success: boolean;
  message: string;
  data: {
    id: number;
    name: string;
    isActive: boolean;
    semester?: 'ODD' | 'EVEN';
    pklEligibleGrades?: string | null;
  };
};

type ActiveAcademicYear = ActiveAcademicYearResponse['data'];

const ACTIVE_YEAR_CACHE_TTL_MS = 2 * 60 * 1000;
let activeYearCache: { value: ActiveAcademicYear; cachedAt: number } | null = null;
let activeYearInFlight: Promise<ActiveAcademicYear> | null = null;

const clearActiveYearCache = () => {
  activeYearCache = null;
  activeYearInFlight = null;
};

export const academicYearApi = {
  async getActive(options?: { force?: boolean; allowStaleOnError?: boolean }) {
    const force = Boolean(options?.force);
    const allowStaleOnError = Boolean(options?.allowStaleOnError);

    if (!force && activeYearCache && Date.now() - activeYearCache.cachedAt < ACTIVE_YEAR_CACHE_TTL_MS) {
      return activeYearCache.value;
    }

    if (!force && activeYearInFlight) {
      return activeYearInFlight;
    }

    activeYearInFlight = apiClient
      .get<ActiveAcademicYearResponse>('/academic-years/active')
      .then((response) => {
        const value = response.data.data;
        activeYearCache = { value, cachedAt: Date.now() };
        return value;
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
  },
  invalidateActiveCache() {
    clearActiveYearCache();
  },
};
