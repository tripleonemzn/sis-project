export const ADVISOR_DUTIES = ['PEMBINA_EKSKUL', 'PEMBINA_OSIS'] as const;

export type AdvisorDuty = (typeof ADVISOR_DUTIES)[number];

const ADVISOR_DUTY_SET = new Set<string>(ADVISOR_DUTIES);

const ADVISOR_DUTY_META: Record<
  AdvisorDuty,
  {
    label: string;
    equipmentLabel: string;
    equipmentTitle: string;
  }
> = {
  PEMBINA_EKSKUL: {
    label: 'Pembina Ekstrakurikuler',
    equipmentLabel: 'alat ekskul',
    equipmentTitle: 'Alat Ekskul',
  },
  PEMBINA_OSIS: {
    label: 'Pembina OSIS',
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

export function getAdvisorDutyLabel(value: unknown): string {
  return getAdvisorDutyMeta(value)?.label || String(value || '').trim().replace(/_/g, ' ');
}

export function getAdvisorEquipmentLabel(value: unknown): string {
  return getAdvisorDutyMeta(value)?.equipmentLabel || 'alat pembina';
}

export function getAdvisorEquipmentTitle(value: unknown): string {
  return getAdvisorDutyMeta(value)?.equipmentTitle || 'Alat Pembina';
}

export function resolveTutorCompatibleDuty(value: unknown): AdvisorDuty {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'PEMBINA_OSIS' ? 'PEMBINA_OSIS' : 'PEMBINA_EKSKUL';
}

export function summarizeAdvisorDuties(values: Array<string | null | undefined>) {
  const duties = Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim().toUpperCase())
        .filter((value): value is AdvisorDuty => isAdvisorDuty(value)),
    ),
  );

  if (duties.length === 1) {
    const duty = duties[0];
    return {
      label: getAdvisorDutyLabel(duty),
      equipmentLabel: getAdvisorEquipmentLabel(duty),
      equipmentTitle: getAdvisorEquipmentTitle(duty),
      duties,
    };
  }

  return {
    label: 'Pembina OSIS & Ekstrakurikuler',
    equipmentLabel: 'alat OSIS/ekskul',
    equipmentTitle: 'Alat OSIS & Ekskul',
    duties,
  };
}
