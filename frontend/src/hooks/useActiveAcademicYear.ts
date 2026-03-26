import { useQuery } from '@tanstack/react-query';
import { academicYearService } from '../services/academicYear.service';
import type { AcademicYear } from '../services/academicYear.service';

type AcademicYearLike = Partial<AcademicYear> & {
  academicYearId?: number;
  semester?: 'ODD' | 'EVEN';
};

function extractAcademicYearPayload(res: unknown): AcademicYearLike | null {
  if (!res) return null;
  if (typeof res !== 'object') return null;
  const payload = res as {
    id?: number;
    name?: string;
    data?: {
      id?: number;
      data?: { id?: number };
      academicYear?: { id?: number };
    };
  };
  if (payload.id && payload.name) return payload as AcademicYearLike;
  if (payload.data?.id) return payload.data as AcademicYearLike;
  if (payload.data?.data?.id) return payload.data.data as AcademicYearLike;
  if (payload.data?.academicYear?.id) return payload.data.academicYear as AcademicYearLike;
  return null;
}

function toAcademicYearArray(value: unknown): AcademicYearLike[] {
  return Array.isArray(value) ? (value as AcademicYearLike[]) : [];
}

function isValidYear(year: AcademicYearLike | null | undefined): year is AcademicYearLike {
  return Boolean(year && typeof year === 'object' && (year.id || year.academicYearId));
}

function ensureResolvedSemester(year: AcademicYearLike): AcademicYearLike {
  if (year.semester === 'ODD' || year.semester === 'EVEN') return year;
  const now = new Date();
  const sem2Start = year.semester2Start ? new Date(year.semester2Start) : null;
  const sem2End = year.semester2End ? new Date(year.semester2End) : null;
  const isValidWindow =
    !!sem2Start &&
    !!sem2End &&
    !Number.isNaN(sem2Start.getTime()) &&
    !Number.isNaN(sem2End.getTime());
  return {
    ...year,
    semester: isValidWindow && now >= sem2Start! && now <= sem2End! ? 'EVEN' : 'ODD',
  };
}

export const useActiveAcademicYear = () => {
  return useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      // Primary source: dedicated active endpoint
      try {
        const res = await academicYearService.getActiveSafe();
        const extracted = extractAcademicYearPayload(res);
        if (isValidYear(extracted)) {
          return ensureResolvedSemester(extracted);
        }
      } catch {
        // fallback below
      }

      // Secondary source: list endpoint filtered active
      const listRes = await academicYearService.list({ page: 1, limit: 20, isActive: true });
      const list = [
        ...toAcademicYearArray(listRes?.data?.academicYears),
        ...toAcademicYearArray(listRes?.academicYears),
        ...toAcademicYearArray(listRes?.data?.data?.academicYears),
      ];
      const activeFromList = list.find((item: AcademicYearLike) => item?.isActive) || list[0] || null;
      if (isValidYear(activeFromList)) {
        return ensureResolvedSemester(activeFromList);
      }

      throw new Error('Gagal mendapatkan data Tahun Ajaran aktif.');
    },
    retry: 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
};
