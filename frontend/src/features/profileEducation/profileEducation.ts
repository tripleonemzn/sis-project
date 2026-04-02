import type { UserRole } from '../../types/auth';

export const STUDENT_PROFILE_EDUCATION_LEVELS = ['TK', 'SD', 'SMP_MTS'] as const;
export const NON_STUDENT_PROFILE_EDUCATION_LEVELS = ['SLTA', 'D1', 'D2', 'D3', 'D4_S1', 'S2', 'S3'] as const;
export const PROFILE_EDUCATION_LEVELS = [
  ...STUDENT_PROFILE_EDUCATION_LEVELS,
  ...NON_STUDENT_PROFILE_EDUCATION_LEVELS,
] as const;
export const PROFILE_EDUCATION_HIGHER_LEVELS = ['D3', 'D4_S1', 'S2', 'S3'] as const;
export const PROFILE_EDUCATION_DOCUMENT_KINDS = ['IJAZAH', 'SKHUN', 'TRANSKRIP'] as const;

export type ProfileEducationTrack = 'STUDENT' | 'NON_STUDENT';
export type ProfileEducationLevel = (typeof PROFILE_EDUCATION_LEVELS)[number];
export type ProfileEducationDocumentKind = (typeof PROFILE_EDUCATION_DOCUMENT_KINDS)[number];

export type ProfileEducationDocument = {
  kind: ProfileEducationDocumentKind;
  label: string;
  fileUrl: string;
  originalName?: string | null;
  mimeType?: string | null;
  size?: number | null;
  uploadedAt?: string | null;
};

export type ProfileEducationHistory = {
  level: ProfileEducationLevel;
  institutionName: string;
  faculty: string;
  studyProgram: string;
  gpa: string;
  degree: string;
  documents: ProfileEducationDocument[];
};

const LEVEL_LABELS: Record<ProfileEducationLevel, string> = {
  TK: 'TK',
  SD: 'SD',
  SMP_MTS: 'SMP/MTs',
  SLTA: 'SLTA/Sederajat',
  D1: 'D1',
  D2: 'D2',
  D3: 'D3',
  D4_S1: 'D4/S1',
  S2: 'S2',
  S3: 'S3',
};

const LEGACY_LEVEL_MAP: Record<string, ProfileEducationLevel> = {
  TK: 'TK',
  'TK / SEDERAJAT': 'TK',
  SD: 'SD',
  'SD / SEDERAJAT': 'SD',
  SMP: 'SMP_MTS',
  'SMP / SEDERAJAT': 'SMP_MTS',
  'SMP/SEDERAJAT': 'SMP_MTS',
  MTS: 'SMP_MTS',
  'SMP/MTS': 'SMP_MTS',
  'SMP/MTS / SEDERAJAT': 'SMP_MTS',
  SLTA: 'SLTA',
  'SLTA/SEDERAJAT': 'SLTA',
  'SLTA / SEDERAJAT': 'SLTA',
  SMA: 'SLTA',
  SMK: 'SLTA',
  'SMA / SMK / SEDERAJAT': 'SLTA',
  'SMA/SMK/SEDERAJAT': 'SLTA',
  D1: 'D1',
  D2: 'D2',
  D3: 'D3',
  'D4/S1': 'D4_S1',
  'D4 / S1': 'D4_S1',
  S1: 'D4_S1',
  S2: 'S2',
  S3: 'S3',
};

const DOCUMENT_LABELS: Record<ProfileEducationDocumentKind, string> = {
  IJAZAH: 'Ijazah',
  SKHUN: 'SKHUN / Dokumen Sejenis',
  TRANSKRIP: 'Transkrip Nilai',
};

const normalizeText = (value?: string | null) => String(value || '').trim();

export function resolveProfileEducationTrackForRole(role?: UserRole | string | null): ProfileEducationTrack {
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (normalizedRole === 'STUDENT' || normalizedRole === 'CALON_SISWA') {
    return 'STUDENT';
  }
  return 'NON_STUDENT';
}

export function getEducationLevelLabel(level: ProfileEducationLevel) {
  return LEVEL_LABELS[level];
}

export function getEducationLevelsForTrack(track: ProfileEducationTrack) {
  return track === 'STUDENT'
    ? [...STUDENT_PROFILE_EDUCATION_LEVELS]
    : [...NON_STUDENT_PROFILE_EDUCATION_LEVELS];
}

export function levelUsesHigherEducationFields(level: ProfileEducationLevel) {
  return PROFILE_EDUCATION_HIGHER_LEVELS.includes(level as (typeof PROFILE_EDUCATION_HIGHER_LEVELS)[number]);
}

export function getAllowedDocumentKindsForLevel(
  track: ProfileEducationTrack,
  level: ProfileEducationLevel,
): ProfileEducationDocumentKind[] {
  if (track === 'STUDENT') {
    return ['IJAZAH', 'SKHUN'];
  }
  if (levelUsesHigherEducationFields(level)) {
    return ['IJAZAH', 'TRANSKRIP'];
  }
  return ['IJAZAH'];
}

export function getEducationDocumentLabel(kind: ProfileEducationDocumentKind) {
  return DOCUMENT_LABELS[kind];
}

export function getEducationInstitutionLabel(level: ProfileEducationLevel) {
  return levelUsesHigherEducationFields(level) ? 'Nama Perguruan Tinggi' : 'Nama Sekolah';
}

export function createEmptyEducationHistory(level: ProfileEducationLevel): ProfileEducationHistory {
  return {
    level,
    institutionName: '',
    faculty: '',
    studyProgram: '',
    gpa: '',
    degree: '',
    documents: [],
  };
}

export function getEducationLevelFromLegacyLabel(label?: string | null): ProfileEducationLevel | null {
  const normalized = normalizeText(label).toUpperCase();
  if (!normalized) return null;
  return LEGACY_LEVEL_MAP[normalized] || null;
}

export function sanitizeEducationHistories(
  histories: ProfileEducationHistory[],
  track: ProfileEducationTrack,
): ProfileEducationHistory[] {
  const allowedLevels = new Set(getEducationLevelsForTrack(track));
  const normalizedByLevel = new Map<ProfileEducationLevel, ProfileEducationHistory>();

  for (const entry of histories) {
    if (!allowedLevels.has(entry.level)) continue;
    const allowedKinds = new Set(getAllowedDocumentKindsForLevel(track, entry.level));
    const documentMap = new Map<ProfileEducationDocumentKind, ProfileEducationDocument>();

    for (const rawDocument of entry.documents || []) {
      if (!allowedKinds.has(rawDocument.kind)) continue;
      if (!normalizeText(rawDocument.fileUrl)) continue;
      documentMap.set(rawDocument.kind, {
        kind: rawDocument.kind,
        label: normalizeText(rawDocument.label) || getEducationDocumentLabel(rawDocument.kind),
        fileUrl: normalizeText(rawDocument.fileUrl),
        originalName: normalizeText(rawDocument.originalName) || null,
        mimeType: normalizeText(rawDocument.mimeType) || null,
        size: typeof rawDocument.size === 'number' ? rawDocument.size : null,
        uploadedAt: normalizeText(rawDocument.uploadedAt) || null,
      });
    }

    normalizedByLevel.set(entry.level, {
      level: entry.level,
      institutionName: normalizeText(entry.institutionName),
      faculty: levelUsesHigherEducationFields(entry.level) ? normalizeText(entry.faculty) : '',
      studyProgram:
        track === 'STUDENT' || levelUsesHigherEducationFields(entry.level)
          ? normalizeText(entry.studyProgram)
          : '',
      gpa: levelUsesHigherEducationFields(entry.level) ? normalizeText(entry.gpa) : '',
      degree: levelUsesHigherEducationFields(entry.level) ? normalizeText(entry.degree) : '',
      documents: Array.from(documentMap.values()),
    });
  }

  return getEducationLevelsForTrack(track).map((level) =>
    normalizedByLevel.get(level) || createEmptyEducationHistory(level),
  );
}

export function buildEducationHistoryState(args: {
  track: ProfileEducationTrack;
  histories?: ProfileEducationHistory[] | null;
  legacyHighestEducation?: string | null;
  legacyInstitutionName?: string | null;
  legacyStudyProgram?: string | null;
}) {
  const normalizedHistories = sanitizeEducationHistories(args.histories || [], args.track);
  const hasAnyHistory = normalizedHistories.some((entry) => hasEducationHistoryContent(entry));
  if (hasAnyHistory) {
    return normalizedHistories;
  }

  const fallbackLevel = getEducationLevelFromLegacyLabel(args.legacyHighestEducation);
  if (!fallbackLevel) {
    return normalizedHistories;
  }

  return normalizedHistories.map((entry) =>
    entry.level === fallbackLevel
      ? {
          ...entry,
          institutionName: normalizeText(args.legacyInstitutionName),
          studyProgram: normalizeText(args.legacyStudyProgram),
        }
      : entry,
  );
}

export function hasEducationHistoryContent(entry: ProfileEducationHistory) {
  return Boolean(
    normalizeText(entry.institutionName) ||
      normalizeText(entry.faculty) ||
      normalizeText(entry.studyProgram) ||
      normalizeText(entry.gpa) ||
      normalizeText(entry.degree) ||
      entry.documents.length > 0,
  );
}

export function resolveEducationSummaryFromHistories(
  histories: ProfileEducationHistory[],
  track: ProfileEducationTrack,
) {
  const sanitized = sanitizeEducationHistories(histories, track).filter((entry) => hasEducationHistoryContent(entry));
  const order = getEducationLevelsForTrack(track) as ProfileEducationLevel[];
  const highestEntry = [...sanitized]
    .sort((left, right) => order.indexOf(left.level) - order.indexOf(right.level))
    .at(-1);

  return {
    highestEducation: highestEntry ? getEducationLevelLabel(highestEntry.level) : '',
    institutionName: highestEntry?.institutionName || '',
    studyProgram: highestEntry?.studyProgram || '',
    completedLevels: sanitized.length,
  };
}
