import { ApiError } from './api';
import prisma from './prisma';

export type ExamRequesterProfile = {
  id: number;
  role: string;
  ptkType: string | null;
  additionalDuties: string[];
  name: string;
  username: string;
};

function normalizeCode(value?: string | null) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .toUpperCase();
}

export function hasCurriculumExamManagementDuty(duties?: string[] | null) {
  const normalizedDuties = (duties || []).map((item) => normalizeCode(item));
  return normalizedDuties.includes('WAKASEK_KURIKULUM') || normalizedDuties.includes('SEKRETARIS_KURIKULUM');
}

export async function getExamRequesterProfile(userId: number): Promise<ExamRequesterProfile> {
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
      ? profile.additionalDuties.map((item) => normalizeCode(item))
      : [],
    name: profile.name,
    username: profile.username,
  };
}

export async function assertCurriculumExamManagerAccess(
  userId: number,
  options: { allowAdmin?: boolean } = {},
) {
  const profile = await getExamRequesterProfile(userId);

  if (profile.role === 'ADMIN' && options.allowAdmin) {
    return profile;
  }

  if (profile.role === 'TEACHER' && hasCurriculumExamManagementDuty(profile.additionalDuties)) {
    return profile;
  }

  throw new ApiError(403, 'Akses hanya untuk Wakasek Kurikulum atau Sekretaris Kurikulum.');
}
