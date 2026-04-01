import {
  CandidateAdmissionStatus,
  Prisma,
  Role,
  StudentAcademicMembershipStatus,
  StudentStatus,
  VerificationStatus,
} from '@prisma/client';
import { ApiError } from '../utils/api';
import prisma from '../utils/prisma';

type CandidateStudentActivationContext = {
  userId: number;
  candidateAdmissionId?: number | null;
};

type CandidateStudentActivationResult = {
  userId: number;
  username: string;
  nisn: string | null;
  nis: string;
  academicYearId: number | null;
  academicYearName: string | null;
};

type ActivationTx = Prisma.TransactionClient;
const ENTRY_LEVEL_CLASS_LEVEL = 'X';

function buildAcademicYearNisPrefix(academicYearName?: string | null, fallbackDate = new Date()) {
  const normalized = String(academicYearName || '').trim();
  const slashMatch = normalized.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (slashMatch) {
    return `${slashMatch[1].slice(-2)}${slashMatch[2].slice(-2)}`;
  }

  const dashMatch = normalized.match(/(\d{4})\s*-\s*(\d{4})/);
  if (dashMatch) {
    return `${dashMatch[1].slice(-2)}${dashMatch[2].slice(-2)}`;
  }

  const startYear = fallbackDate.getFullYear();
  return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`;
}

function parseNisSequence(nis: string, prefix: string) {
  const match = String(nis || '').trim().match(new RegExp(`^${prefix.replace('.', '\\.')}\\.(\\d+)$`));
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) ? sequence : null;
}

async function generateOfficialStudentNis(
  tx: ActivationTx,
  params: {
    academicYearName?: string | null;
    fallbackDate?: Date;
  },
) {
  const prefix = `${buildAcademicYearNisPrefix(params.academicYearName, params.fallbackDate)}.10`;
  const rows = await tx.user.findMany({
    where: {
      role: Role.STUDENT,
      nis: {
        startsWith: `${prefix}.`,
      },
    },
    select: {
      nis: true,
    },
  });

  const maxSequence = rows.reduce((currentMax, row) => {
    const next = parseNisSequence(String(row.nis || ''), prefix);
    return next && next > currentMax ? next : currentMax;
  }, 0);

  return `${prefix}.${String(maxSequence + 1).padStart(3, '0')}`;
}

async function resolveOfficialStudentClassId(
  tx: ActivationTx,
  params: {
    activeAcademicYearId: number | null;
    existingClassId: number | null;
    desiredMajorId: number | null;
  },
) {
  if (!params.activeAcademicYearId) {
    return params.existingClassId ?? null;
  }

  if (params.existingClassId) {
    const existingClass = await tx.class.findUnique({
      where: { id: params.existingClassId },
      select: {
        id: true,
        academicYearId: true,
      },
    });

    if (existingClass?.academicYearId === params.activeAcademicYearId) {
      return existingClass.id;
    }
  }

  if (!params.desiredMajorId) {
    return null;
  }

  const entryLevelClasses = await tx.class.findMany({
    where: {
      academicYearId: params.activeAcademicYearId,
      majorId: params.desiredMajorId,
      level: ENTRY_LEVEL_CLASS_LEVEL,
    },
    select: {
      id: true,
      name: true,
      students: {
        where: {
          role: Role.STUDENT,
          studentStatus: StudentStatus.ACTIVE,
        },
        select: {
          id: true,
        },
      },
    },
  });

  if (!entryLevelClasses.length) {
    return null;
  }

  const selectedClass = entryLevelClasses
    .map((item) => ({
      id: item.id,
      name: item.name,
      currentStudentCount: item.students.length,
    }))
    .sort(
      (left, right) =>
        left.currentStudentCount - right.currentStudentCount || left.name.localeCompare(right.name, 'id'),
    )[0];

  return selectedClass?.id ?? null;
}

async function activateCandidateAsOfficialStudentInTx(
  tx: ActivationTx,
  params: CandidateStudentActivationContext,
): Promise<CandidateStudentActivationResult> {
  const user = await tx.user.findUnique({
    where: { id: params.userId },
    select: {
      id: true,
      username: true,
      role: true,
      nis: true,
      nisn: true,
      classId: true,
      studentStatus: true,
      candidateAdmission: {
        select: {
          id: true,
          status: true,
          acceptedAt: true,
          reviewedAt: true,
          desiredMajorId: true,
        },
      },
    },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan.');
  }

  if (user.role !== Role.CALON_SISWA && user.role !== Role.STUDENT) {
    throw new ApiError(400, 'Pengguna tidak berada pada jalur calon siswa / siswa.');
  }

  const admission =
    user.candidateAdmission && (!params.candidateAdmissionId || user.candidateAdmission.id === params.candidateAdmissionId)
      ? user.candidateAdmission
      : await tx.candidateAdmission.findUnique({
          where: { id: Number(params.candidateAdmissionId || 0) },
          select: {
          id: true,
          userId: true,
          status: true,
          acceptedAt: true,
          reviewedAt: true,
          desiredMajorId: true,
        },
      });

  if (!admission || ('userId' in admission && admission.userId !== user.id)) {
    throw new ApiError(404, 'Pendaftaran calon siswa tidak ditemukan.');
  }

  if (admission.status !== CandidateAdmissionStatus.ACCEPTED) {
    throw new ApiError(400, 'Setujui status pendaftaran menjadi ACCEPTED sebelum mengaktifkan akun siswa resmi.');
  }

  const activeAcademicYear = await tx.academicYear.findFirst({
    where: { isActive: true },
    orderBy: {
      semester1Start: 'desc',
    },
    select: {
      id: true,
      name: true,
      isActive: true,
      semester1Start: true,
    },
  });

  const referenceDate = admission.acceptedAt || new Date();
  const officialNis =
    typeof user.nis === 'string' && user.nis.trim().length > 0
      ? user.nis.trim()
      : await generateOfficialStudentNis(tx, {
          academicYearName: activeAcademicYear?.name,
          fallbackDate: referenceDate,
        });

  const username = user.nisn?.trim() ? user.nisn.trim() : user.username;
  const resolvedClassId = await resolveOfficialStudentClassId(tx, {
    activeAcademicYearId: activeAcademicYear?.id || null,
    existingClassId: user.classId ?? null,
    desiredMajorId: admission.desiredMajorId ?? null,
  });

  await tx.user.update({
    where: { id: user.id },
    data: {
      role: Role.STUDENT,
      username,
      nis: officialNis,
      classId: resolvedClassId,
      studentStatus: 'ACTIVE',
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  if (activeAcademicYear) {
    await tx.studentAcademicMembership.updateMany({
      where: {
        studentId: user.id,
        isCurrent: true,
        academicYearId: {
          not: activeAcademicYear.id,
        },
      },
      data: {
        isCurrent: false,
      },
    });

    await tx.studentAcademicMembership.upsert({
      where: {
        studentId_academicYearId: {
          studentId: user.id,
          academicYearId: activeAcademicYear.id,
        },
      },
      create: {
        studentId: user.id,
        academicYearId: activeAcademicYear.id,
        classId: resolvedClassId,
        status: StudentAcademicMembershipStatus.ACTIVE,
        isCurrent: true,
        startedAt: admission.acceptedAt || activeAcademicYear.semester1Start || new Date(),
        endedAt: null,
      },
      update: {
        classId: resolvedClassId,
        status: StudentAcademicMembershipStatus.ACTIVE,
        isCurrent: true,
        endedAt: null,
        ...(admission.acceptedAt || activeAcademicYear.semester1Start
          ? {
              startedAt: admission.acceptedAt || activeAcademicYear.semester1Start,
            }
          : {}),
      },
    });
  }

  await tx.candidateAdmission.update({
    where: {
      id: admission.id,
    },
    data: {
      status: CandidateAdmissionStatus.ACCEPTED,
      reviewedAt: admission.reviewedAt || referenceDate,
      acceptedAt: admission.acceptedAt || referenceDate,
    },
  });

  return {
    userId: user.id,
    username,
    nisn: user.nisn?.trim() || null,
    nis: officialNis,
    academicYearId: activeAcademicYear?.id || null,
    academicYearName: activeAcademicYear?.name || null,
  };
}

export async function activateCandidateAsOfficialStudent(
  params: CandidateStudentActivationContext,
): Promise<CandidateStudentActivationResult> {
  return prisma.$transaction((tx) => activateCandidateAsOfficialStudentInTx(tx, params));
}

export async function activateCandidateAsOfficialStudentWithTx(
  tx: ActivationTx,
  params: CandidateStudentActivationContext,
): Promise<CandidateStudentActivationResult> {
  return activateCandidateAsOfficialStudentInTx(tx, params);
}
