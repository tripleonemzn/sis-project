import prisma from './prisma';
import { ApiError } from './api';

export type AcademicYearLifecycleStage = 'ACTIVE' | 'ARCHIVED' | 'FUTURE' | 'INACTIVE';
export type ArchiveAccessModule = 'REPORTS' | 'FINAL_LEDGER';
export type ArchiveAccessGrant =
  | 'ACTIVE_YEAR'
  | 'NON_ARCHIVE_YEAR'
  | 'ADMIN'
  | 'PRINCIPAL'
  | 'DUTY'
  | 'HISTORICAL_HOMEROOM';

type ArchiveActorProfile = {
  id: number;
  role: string;
  duties: string[];
};

type AcademicYearEnvelope = {
  id: number;
  name: string;
  isActive: boolean;
  semester1Start: Date;
  semester1End: Date;
  semester2Start: Date;
  semester2End: Date;
};

const curriculumArchiveDutyAllowlist = new Set(['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM']);

const archiveDutyAllowlistByModule: Record<ArchiveAccessModule, Set<string>> = {
  REPORTS: curriculumArchiveDutyAllowlist,
  FINAL_LEDGER: curriculumArchiveDutyAllowlist,
};

const homeroomOwnedModules = new Set<ArchiveAccessModule>(['REPORTS']);

const academicYearSelect = {
  id: true,
  name: true,
  isActive: true,
  semester1Start: true,
  semester1End: true,
  semester2Start: true,
  semester2End: true,
} as const;

const normalizeCode = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase();

const normalizeDutyList = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => normalizeCode(item))
    .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index);
};

export const resolveAcademicYearLifecycleStage = (params: {
  academicYear: AcademicYearEnvelope;
  activeAcademicYear?: AcademicYearEnvelope | null;
  referenceDate?: Date;
}): AcademicYearLifecycleStage => {
  const { academicYear, activeAcademicYear } = params;
  const referenceDate = params.referenceDate || new Date();

  if (academicYear.isActive) return 'ACTIVE';

  if (activeAcademicYear) {
    if (academicYear.semester2End.getTime() < activeAcademicYear.semester1Start.getTime()) {
      return 'ARCHIVED';
    }
    if (academicYear.semester1Start.getTime() > activeAcademicYear.semester2End.getTime()) {
      return 'FUTURE';
    }
  }

  if (academicYear.semester2End.getTime() < referenceDate.getTime()) {
    return 'ARCHIVED';
  }
  if (academicYear.semester1Start.getTime() > referenceDate.getTime()) {
    return 'FUTURE';
  }

  return 'INACTIVE';
};

export const getArchiveActorProfile = async (
  actorId: number,
): Promise<ArchiveActorProfile | null> => {
  if (!Number.isFinite(actorId) || actorId <= 0) return null;

  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: {
      id: true,
      role: true,
      additionalDuties: true,
    },
  });

  if (!actor) return null;

  return {
    id: actor.id,
    role: normalizeCode(actor.role),
    duties: normalizeDutyList(actor.additionalDuties),
  };
};

export const resolveAcademicYearArchiveEnvelope = async (
  academicYearId: number,
): Promise<{
  academicYear: AcademicYearEnvelope;
  activeAcademicYear: AcademicYearEnvelope | null;
  stage: AcademicYearLifecycleStage;
}> => {
  const [academicYear, activeAcademicYear] = await Promise.all([
    prisma.academicYear.findUnique({
      where: { id: academicYearId },
      select: academicYearSelect,
    }),
    prisma.academicYear.findFirst({
      where: { isActive: true },
      select: academicYearSelect,
    }),
  ]);

  if (!academicYear) {
    throw new ApiError(404, 'Tahun ajaran tidak ditemukan.');
  }

  return {
    academicYear,
    activeAcademicYear,
    stage: resolveAcademicYearLifecycleStage({ academicYear, activeAcademicYear }),
  };
};

const hasHistoricalHomeroomOwnership = async (params: {
  actorId: number;
  academicYearId: number;
  classId?: number | null;
  studentId?: number | null;
}) => {
  const { actorId, academicYearId, classId, studentId } = params;

  if (Number.isFinite(Number(classId)) && Number(classId) > 0) {
    const matchingClass = await prisma.class.findFirst({
      where: {
        id: Number(classId),
        academicYearId,
        teacherId: actorId,
      },
      select: { id: true },
    });
    if (matchingClass) return true;
  }

  if (Number.isFinite(Number(studentId)) && Number(studentId) > 0) {
    const membership = await prisma.studentAcademicMembership.findFirst({
      where: {
        studentId: Number(studentId),
        academicYearId,
        class: {
          teacherId: actorId,
          academicYearId,
        },
      },
      select: { id: true },
    });
    if (membership) return true;
  }

  return false;
};

export const ensureAcademicYearArchiveReadAccess = async (params: {
  actorId: number;
  actorRole?: string | null;
  academicYearId: number;
  module: ArchiveAccessModule;
  classId?: number | null;
  studentId?: number | null;
}) => {
  const actorId = Number(params.actorId);
  if (!Number.isFinite(actorId) || actorId <= 0) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const envelope = await resolveAcademicYearArchiveEnvelope(params.academicYearId);
  if (envelope.stage === 'ACTIVE') {
    return {
      ...envelope,
      isArchiveYear: false,
      grantedBy: 'ACTIVE_YEAR' as ArchiveAccessGrant,
    };
  }

  if (envelope.stage !== 'ARCHIVED') {
    return {
      ...envelope,
      isArchiveYear: false,
      grantedBy: 'NON_ARCHIVE_YEAR' as ArchiveAccessGrant,
    };
  }

  const requestedRole = normalizeCode(params.actorRole);
  if (requestedRole === 'ADMIN') {
    return {
      ...envelope,
      isArchiveYear: true,
      grantedBy: 'ADMIN' as ArchiveAccessGrant,
    };
  }

  if (requestedRole === 'PRINCIPAL') {
    return {
      ...envelope,
      isArchiveYear: true,
      grantedBy: 'PRINCIPAL' as ArchiveAccessGrant,
    };
  }

  const actorProfile = await getArchiveActorProfile(actorId);
  if (!actorProfile) {
    throw new ApiError(404, 'Profil pengguna tidak ditemukan.');
  }

  if (actorProfile.role === 'ADMIN') {
    return {
      ...envelope,
      isArchiveYear: true,
      grantedBy: 'ADMIN' as ArchiveAccessGrant,
    };
  }

  if (actorProfile.role === 'PRINCIPAL') {
    return {
      ...envelope,
      isArchiveYear: true,
      grantedBy: 'PRINCIPAL' as ArchiveAccessGrant,
    };
  }

  const allowedDuties = archiveDutyAllowlistByModule[params.module] || new Set<string>();
  if (actorProfile.duties.some((duty) => allowedDuties.has(duty))) {
    return {
      ...envelope,
      isArchiveYear: true,
      grantedBy: 'DUTY' as ArchiveAccessGrant,
    };
  }

  if (actorProfile.role === 'TEACHER' && homeroomOwnedModules.has(params.module)) {
    const hasOwnership = await hasHistoricalHomeroomOwnership({
      actorId: actorProfile.id,
      academicYearId: params.academicYearId,
      classId: params.classId || null,
      studentId: params.studentId || null,
    });

    if (hasOwnership) {
      return {
        ...envelope,
        isArchiveYear: true,
        grantedBy: 'HISTORICAL_HOMEROOM' as ArchiveAccessGrant,
      };
    }
  }

  throw new ApiError(
    403,
    'Akses arsip tahun ajaran ini hanya tersedia untuk pemilik historis atau pejabat yang berwenang.',
  );
};
