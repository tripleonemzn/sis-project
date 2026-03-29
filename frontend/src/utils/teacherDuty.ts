import { getAdvisorDutyLabel, isAdvisorDuty } from './advisorDuty';

type MajorLike = {
  id: number;
  name: string;
};

export type TeacherDutyOption = {
  value: string;
  label: string;
};

const STATIC_TEACHER_DUTY_OPTIONS: TeacherDutyOption[] = [
  { value: 'WAKASEK_KURIKULUM', label: 'Wakasek Kurikulum' },
  { value: 'SEKRETARIS_KURIKULUM', label: 'Sekretaris Kurikulum' },
  { value: 'WAKASEK_KESISWAAN', label: 'Wakasek Kesiswaan' },
  { value: 'SEKRETARIS_KESISWAAN', label: 'Sekretaris Kesiswaan' },
  { value: 'WAKASEK_SARPRAS', label: 'Wakasek Sarpras' },
  { value: 'SEKRETARIS_SARPRAS', label: 'Sekretaris Sarpras' },
  { value: 'WAKASEK_HUMAS', label: 'Wakasek Humas' },
  { value: 'SEKRETARIS_HUMAS', label: 'Sekretaris Humas' },
  { value: 'PEMBINA_EKSKUL', label: 'Pembina Ekstrakurikuler' },
  { value: 'PEMBINA_OSIS', label: 'Pembina OSIS' },
  { value: 'KEPALA_LAB', label: 'Kepala Lab' },
  { value: 'KEPALA_PERPUSTAKAAN', label: 'Kepala Perpustakaan' },
  { value: 'BP_BK', label: 'BP/BK' },
  { value: 'IT_CENTER', label: 'IT-Center' },
];

export function buildTeacherDutyOptions(majors: MajorLike[] = []): TeacherDutyOption[] {
  return [
    ...STATIC_TEACHER_DUTY_OPTIONS,
    ...majors.map((major) => ({
      value: `KAPROG:${major.id}`,
      label: `Kepala Kompetensi ${major.name}`,
    })),
  ];
}

export function formatTeacherDutyLabel(
  duty: string,
  options?: {
    majorName?: string | null;
  },
): string {
  const normalized = String(duty || '').trim().toUpperCase();

  if (isAdvisorDuty(normalized)) {
    return getAdvisorDutyLabel(normalized);
  }

  if (normalized === 'BP_BK') {
    return 'BP/BK';
  }

  if (normalized === 'KAPROG') {
    return options?.majorName ? `Kepala Kompetensi ${options.majorName}` : 'Kepala Kompetensi';
  }

  return normalized
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
