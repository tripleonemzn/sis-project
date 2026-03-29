export type ExtracurricularCategory = 'EXTRACURRICULAR' | 'OSIS';

export const EXTRACURRICULAR_CATEGORY_OPTIONS: Array<{
  value: ExtracurricularCategory;
  label: string;
  description: string;
}> = [
  {
    value: 'EXTRACURRICULAR',
    label: 'Ekstrakurikuler',
    description: 'Kegiatan minat dan bakat siswa.',
  },
  {
    value: 'OSIS',
    label: 'OSIS',
    description: 'Organisasi siswa intra sekolah.',
  },
];

export function resolveExtracurricularCategory(raw: unknown): ExtracurricularCategory {
  return String(raw || '').trim().toUpperCase() === 'OSIS' ? 'OSIS' : 'EXTRACURRICULAR';
}

export function isOsisExtracurricularCategory(raw: unknown): boolean {
  return resolveExtracurricularCategory(raw) === 'OSIS';
}

export function isRegularExtracurricularCategory(raw: unknown): boolean {
  return resolveExtracurricularCategory(raw) === 'EXTRACURRICULAR';
}

export function getExtracurricularCategoryLabel(raw: unknown): string {
  return isOsisExtracurricularCategory(raw) ? 'OSIS' : 'Ekstrakurikuler';
}
