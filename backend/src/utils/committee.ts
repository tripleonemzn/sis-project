import { CommitteeEventStatus, CommitteeFeatureCode } from '@prisma/client';
import prisma from './prisma';
import { ApiError } from './api';

export type CommitteeActorProfile = {
  id: number;
  role: string;
  ptkType: string | null;
  additionalDuties: string[];
  name: string;
  username: string;
};

export type CommitteeFeatureDefinition = {
  code: CommitteeFeatureCode;
  label: string;
  description: string;
  section: 'program' | 'jadwal' | 'ruang' | 'mengawas' | 'denah' | 'kartu';
};

function normalizeCode(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

export function normalizeCommitteeCode(value?: string | null) {
  return normalizeCode(value).replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

export function normalizeProgramCode(value?: string | null) {
  return normalizeCommitteeCode(value);
}

export function normalizeRequesterDutyCode(value?: string | null) {
  return normalizeCode(value);
}

export function isHeadTuStaffProfile(profile?: Pick<CommitteeActorProfile, 'role' | 'ptkType'> | null) {
  if (!profile) return false;
  if (profile.role !== 'STAFF') return false;
  const ptkType = normalizeCode(profile.ptkType);
  return ptkType === 'KEPALA_TU' || ptkType === 'KEPALA_TATA_USAHA';
}

export async function getCommitteeActorProfile(userId: number): Promise<CommitteeActorProfile> {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
      name: true,
      username: true,
    },
  });

  if (!profile) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  return {
    id: profile.id,
    role: profile.role,
    ptkType: profile.ptkType || null,
    additionalDuties: Array.isArray(profile.additionalDuties)
      ? profile.additionalDuties.map((item) => normalizeRequesterDutyCode(item))
      : [],
    name: profile.name,
    username: profile.username,
  };
}

export async function assertCommitteeRequesterAccess(
  userId: number,
  options: { allowAdmin?: boolean } = {},
) {
  const profile = await getCommitteeActorProfile(userId);
  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }
  if (profile.role === 'TEACHER') {
    return profile;
  }
  throw new ApiError(403, 'Akses pengajuan kepanitiaan hanya untuk guru.');
}

export async function assertPrincipalCommitteeAccess(
  userId: number,
  options: { allowAdmin?: boolean } = {},
) {
  const profile = await getCommitteeActorProfile(userId);
  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }
  if (profile.role === 'PRINCIPAL') {
    return profile;
  }
  throw new ApiError(403, 'Akses persetujuan kepanitiaan hanya untuk Kepala Sekolah.');
}

export async function assertHeadTuCommitteeAccess(
  userId: number,
  options: { allowAdmin?: boolean } = {},
) {
  const profile = await getCommitteeActorProfile(userId);
  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }
  if (isHeadTuStaffProfile(profile)) {
    return profile;
  }
  throw new ApiError(403, 'Akses SK kepanitiaan hanya untuk Kepala TU.');
}

export async function getActiveAcademicYearOrThrow() {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  if (!activeAcademicYear) {
    throw new ApiError(400, 'Tahun ajaran aktif belum tersedia.');
  }

  return activeAcademicYear;
}

export const COMMITTEE_FEATURE_DEFINITIONS: CommitteeFeatureDefinition[] = [
  {
    code: CommitteeFeatureCode.EXAM_PROGRAM,
    label: 'Program Ujian',
    description: 'Akses tab Program Ujian pada workspace kepanitiaan.',
    section: 'program',
  },
  {
    code: CommitteeFeatureCode.EXAM_SCHEDULE,
    label: 'Jadwal Ujian',
    description: 'Akses tab Jadwal Ujian sesuai program kegiatan.',
    section: 'jadwal',
  },
  {
    code: CommitteeFeatureCode.EXAM_ROOMS,
    label: 'Ruang Ujian',
    description: 'Kelola penempatan ruang ujian sesuai program kegiatan.',
    section: 'ruang',
  },
  {
    code: CommitteeFeatureCode.EXAM_PROCTOR,
    label: 'Jadwal Mengawas',
    description: 'Kelola pembagian jadwal mengawas panitia.',
    section: 'mengawas',
  },
  {
    code: CommitteeFeatureCode.EXAM_LAYOUT,
    label: 'Generate Denah Ruang',
    description: 'Susun dan kelola denah ruang ujian.',
    section: 'denah',
  },
  {
    code: CommitteeFeatureCode.EXAM_CARD,
    label: 'Kartu Ujian',
    description: 'Generate dan cek kartu ujian siswa.',
    section: 'kartu',
  },
];

const COMMITTEE_FEATURE_DEFINITION_MAP = new Map(
  COMMITTEE_FEATURE_DEFINITIONS.map((definition) => [definition.code, definition]),
);

export function getCommitteeFeatureDefinition(code: CommitteeFeatureCode) {
  const definition = COMMITTEE_FEATURE_DEFINITION_MAP.get(code);
  if (!definition) {
    throw new ApiError(500, `Definisi fitur kepanitiaan ${code} belum tersedia.`);
  }
  return definition;
}

export function buildCommitteeGroupLabel(title?: string | null) {
  const normalized = String(title || '').trim();
  if (!normalized) return 'PANITIA KEGIATAN';
  const uppercased = normalized.toUpperCase();
  return uppercased.startsWith('PANITIA ') ? uppercased : `PANITIA ${uppercased}`;
}

export function buildCommitteeFeatureWebPath(params: {
  eventId: number;
  featureCode: CommitteeFeatureCode;
  committeeLabel?: string | null;
}) {
  const definition = getCommitteeFeatureDefinition(params.featureCode);
  const searchParams = new URLSearchParams();
  searchParams.set('section', definition.section);
  if (params.committeeLabel) {
    searchParams.set('committeeLabel', String(params.committeeLabel).trim());
  }
  return `/teacher/committee-events/${params.eventId}/exams?${searchParams.toString()}`;
}

export function isCommitteeEditableByRequester(status: CommitteeEventStatus) {
  return status === CommitteeEventStatus.DRAFT || status === CommitteeEventStatus.DITOLAK_KEPSEK;
}

