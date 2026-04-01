export const ADVISOR_DUTIES = ['PEMBINA_EKSKUL', 'PEMBINA_OSIS'] as const;

export type AdvisorDuty = (typeof ADVISOR_DUTIES)[number];

const ADVISOR_DUTY_META: Record<
  AdvisorDuty,
  {
    label: string;
    equipmentLabel: string;
    equipmentTitle: string;
    workProgramTitle: string;
    workProgramSubtitle: string;
  }
> = {
  PEMBINA_EKSKUL: {
    label: 'Pembina Ekstrakurikuler',
    equipmentLabel: 'alat ekskul',
    equipmentTitle: 'Alat Ekskul',
    workProgramTitle: 'Program Kerja',
    workProgramSubtitle:
      'Kelola program kerja, pengajuan alat, dan LPJ program kerja ekstrakurikuler.',
  },
  PEMBINA_OSIS: {
    label: 'Pembina OSIS',
    equipmentLabel: 'alat OSIS',
    equipmentTitle: 'Alat OSIS',
    workProgramTitle: 'Program Kerja OSIS',
    workProgramSubtitle: 'Kelola program kerja, pengajuan alat, dan LPJ program kerja OSIS.',
  },
};

export function normalizeDutyCode(value: unknown): string {
  return String(value || '').trim().toUpperCase();
}

export function isAdvisorDuty(value: unknown): value is AdvisorDuty {
  return ADVISOR_DUTIES.includes(normalizeDutyCode(value) as AdvisorDuty);
}

export function resolveTutorAdvisorDuty(value: unknown): AdvisorDuty {
  return normalizeDutyCode(value) === 'PEMBINA_OSIS' ? 'PEMBINA_OSIS' : 'PEMBINA_EKSKUL';
}

export function getAdvisorDutyMeta(value: unknown) {
  const normalized = normalizeDutyCode(value) as AdvisorDuty;
  if (!isAdvisorDuty(normalized)) return null;
  return ADVISOR_DUTY_META[normalized];
}

export function getAdvisorEquipmentLabel(value: unknown): string {
  return getAdvisorDutyMeta(value)?.equipmentLabel || 'alat pembina';
}

export function getAdvisorEquipmentTitle(value: unknown): string {
  return getAdvisorDutyMeta(value)?.equipmentTitle || 'Alat Pembina';
}

export function formatWorkProgramDutyLabel(value: unknown): string {
  return (
    getAdvisorDutyMeta(value)?.label ||
    normalizeDutyCode(value)
      .split('_')
      .filter((part) => part.length > 0)
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ') ||
    '-'
  );
}
