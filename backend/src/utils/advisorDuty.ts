import { AdditionalDuty, ExtracurricularCategory } from '@prisma/client';
import prisma from './prisma';
import { ApiError } from './api';

export const ADVISOR_DUTIES = [
  AdditionalDuty.PEMBINA_EKSKUL,
  AdditionalDuty.PEMBINA_OSIS,
] as const;

export type AdvisorDuty = (typeof ADVISOR_DUTIES)[number];

const ADVISOR_DUTY_SET = new Set<string>(ADVISOR_DUTIES);

const ADVISOR_DUTY_META: Record<
  AdvisorDuty,
  {
    label: string;
    workProgramLabel: string;
    equipmentLabel: string;
    equipmentTitle: string;
  }
> = {
  PEMBINA_EKSKUL: {
    label: 'Pembina Ekstrakurikuler',
    workProgramLabel: 'program kerja pembina ekstrakurikuler',
    equipmentLabel: 'alat ekskul',
    equipmentTitle: 'Alat Ekskul',
  },
  PEMBINA_OSIS: {
    label: 'Pembina OSIS',
    workProgramLabel: 'program kerja pembina OSIS',
    equipmentLabel: 'alat OSIS',
    equipmentTitle: 'Alat OSIS',
  },
};

export function isAdvisorDuty(value: unknown): value is AdvisorDuty {
  return ADVISOR_DUTY_SET.has(String(value || '').trim().toUpperCase());
}

export function getAdvisorDutyMeta(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase() as AdvisorDuty;
  if (isAdvisorDuty(normalized)) {
    return ADVISOR_DUTY_META[normalized];
  }
  return null;
}

export function getAdvisorEquipmentLabel(value: unknown) {
  return getAdvisorDutyMeta(value)?.equipmentLabel || 'alat pembina';
}

export function getAdvisorWorkProgramLabel(value: unknown) {
  return getAdvisorDutyMeta(value)?.workProgramLabel || 'program kerja pembina';
}

function getAdvisorDutyFromCategory(category?: ExtracurricularCategory | null): AdvisorDuty | null {
  if (category === ExtracurricularCategory.OSIS) {
    return AdditionalDuty.PEMBINA_OSIS;
  }
  if (category === ExtracurricularCategory.EXTRACURRICULAR) {
    return AdditionalDuty.PEMBINA_EKSKUL;
  }
  return null;
}

export async function getTutorAdvisorDutySet(userId: number): Promise<Set<AdvisorDuty>> {
  const assignments = await prisma.ekstrakurikulerTutorAssignment.findMany({
    where: {
      tutorId: userId,
      isActive: true,
    },
    select: {
      ekskul: {
        select: {
          category: true,
        },
      },
    },
  });

  const duties = new Set<AdvisorDuty>();
  for (const assignment of assignments) {
    const resolvedDuty = getAdvisorDutyFromCategory(assignment.ekskul?.category);
    if (resolvedDuty === AdditionalDuty.PEMBINA_EKSKUL) {
      duties.add(resolvedDuty);
    }
  }

  return duties;
}

export async function assertTutorOwnsAdvisorDuty(userId: number, duty: unknown) {
  if (!isAdvisorDuty(duty)) {
    throw new ApiError(403, 'Tugas pembina tidak valid untuk akun tutor.');
  }

  if (String(duty || '').trim().toUpperCase() === AdditionalDuty.PEMBINA_OSIS) {
    throw new ApiError(403, 'Akses OSIS hanya tersedia untuk guru dengan duty Pembina OSIS.');
  }

  const duties = await getTutorAdvisorDutySet(userId);
  if (!duties.has(duty)) {
    const label = getAdvisorDutyMeta(duty)?.label || 'tugas pembina ini';
    throw new ApiError(403, `Akun tutor tidak memiliki assignment aktif untuk ${label}.`);
  }
}
