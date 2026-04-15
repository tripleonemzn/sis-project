import { Role } from '@prisma/client';
import { z } from 'zod';

export const STUDENT_PROFILE_EDUCATION_LEVELS = ['TK', 'SD', 'SMP_MTS'] as const;
export const NON_STUDENT_PROFILE_EDUCATION_LEVELS = ['SLTA', 'D3', 'D4_S1', 'S2', 'S3', 'CERTIFICATION'] as const;
export const PROFILE_EDUCATION_SUMMARY_LEVELS = ['SLTA', 'D3', 'D4_S1', 'S2', 'S3'] as const;
export const PROFILE_EDUCATION_LEVELS = [
  ...STUDENT_PROFILE_EDUCATION_LEVELS,
  ...NON_STUDENT_PROFILE_EDUCATION_LEVELS,
] as const;
export const PROFILE_EDUCATION_HIGHER_LEVELS = ['D3', 'D4_S1', 'S2', 'S3'] as const;
export const PROFILE_EDUCATION_DOCUMENT_KINDS = ['IJAZAH', 'SKHUN', 'TRANSKRIP', 'SERTIFIKAT'] as const;

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
  institutionName?: string | null;
  faculty?: string | null;
  studyProgram?: string | null;
  gpa?: string | null;
  degree?: string | null;
  nrg?: string | null;
  documents: ProfileEducationDocument[];
};

const MAX_PROFILE_EDUCATION_FILE_SIZE = 500 * 1024;

const PROFILE_EDUCATION_LEVEL_LABELS: Record<ProfileEducationLevel, string> = {
  TK: 'TK',
  SD: 'SD',
  SMP_MTS: 'SMP/MTs',
  SLTA: 'SLTA/Sederajat',
  D3: 'D3',
  D4_S1: 'D4/S1',
  S2: 'S2',
  S3: 'S3',
  CERTIFICATION: 'Sertifikasi',
};

const PROFILE_EDUCATION_DOCUMENT_LABELS: Record<ProfileEducationDocumentKind, string> = {
  IJAZAH: 'Ijazah',
  SKHUN: 'SKHUN / Dokumen Sejenis',
  TRANSKRIP: 'Transkrip Nilai',
  SERTIFIKAT: 'Sertifikat',
};

const normalizeOptionalText = (value: unknown) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
};

const optionalTextSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => normalizeOptionalText(value));

const optionalFileSizeSchema = z
  .union([z.number().int().nonnegative(), z.null(), z.undefined()])
  .optional()
  .nullable()
  .refine((value) => value == null || value <= MAX_PROFILE_EDUCATION_FILE_SIZE, {
    message: 'Ukuran file pendidikan maksimal 500KB',
  });

const educationDocumentSchema = z.object({
  kind: z.enum(PROFILE_EDUCATION_DOCUMENT_KINDS),
  label: optionalTextSchema,
  fileUrl: z.string().trim().min(1, 'URL file pendidikan wajib diisi'),
  originalName: optionalTextSchema,
  mimeType: optionalTextSchema,
  size: optionalFileSizeSchema,
  uploadedAt: optionalTextSchema,
});

const educationHistorySchema = z.object({
  level: z.enum(PROFILE_EDUCATION_LEVELS),
  institutionName: optionalTextSchema,
  faculty: optionalTextSchema,
  studyProgram: optionalTextSchema,
  gpa: optionalTextSchema,
  degree: optionalTextSchema,
  nrg: optionalTextSchema,
  documents: z.array(educationDocumentSchema).optional().default([]),
});

export const educationHistoriesSchema = z
  .array(educationHistorySchema)
  .optional()
  .nullable()
  .transform((value) => (Array.isArray(value) ? value : []));

export function resolveProfileEducationTrack(role?: Role | string | null): ProfileEducationTrack {
  const normalizedRole = String(role || '').trim().toUpperCase();
  if (normalizedRole === Role.STUDENT || normalizedRole === Role.CALON_SISWA) {
    return 'STUDENT';
  }
  return 'NON_STUDENT';
}

export function getEducationLevelLabel(level: ProfileEducationLevel) {
  return PROFILE_EDUCATION_LEVEL_LABELS[level];
}

export function levelUsesHigherEducationFields(level: ProfileEducationLevel) {
  return PROFILE_EDUCATION_HIGHER_LEVELS.includes(level as (typeof PROFILE_EDUCATION_HIGHER_LEVELS)[number]);
}

export function levelUsesCertificationFields(level: ProfileEducationLevel) {
  return level === 'CERTIFICATION';
}

export function getEducationLevelsForTrack(track: ProfileEducationTrack) {
  return track === 'STUDENT'
    ? [...STUDENT_PROFILE_EDUCATION_LEVELS]
    : [...NON_STUDENT_PROFILE_EDUCATION_LEVELS];
}

export function getAllowedEducationDocumentKinds(
  track: ProfileEducationTrack,
  level: ProfileEducationLevel,
): ProfileEducationDocumentKind[] {
  if (track === 'STUDENT') {
    return ['IJAZAH', 'SKHUN'];
  }
  if (levelUsesCertificationFields(level)) {
    return ['SERTIFIKAT'];
  }
  if (levelUsesHigherEducationFields(level)) {
    return ['IJAZAH', 'TRANSKRIP'];
  }
  return ['IJAZAH'];
}

export function getEducationDocumentLabel(kind: ProfileEducationDocumentKind) {
  return PROFILE_EDUCATION_DOCUMENT_LABELS[kind];
}

function hasEducationHistoryContent(entry: ProfileEducationHistory) {
  return Boolean(
    normalizeOptionalText(entry.institutionName) ||
      normalizeOptionalText(entry.faculty) ||
      normalizeOptionalText(entry.studyProgram) ||
      normalizeOptionalText(entry.gpa) ||
      normalizeOptionalText(entry.degree) ||
      normalizeOptionalText(entry.nrg) ||
      entry.documents.length > 0,
  );
}

export function normalizeEducationHistories(
  input: Array<z.infer<typeof educationHistorySchema>>,
  track: ProfileEducationTrack,
): ProfileEducationHistory[] {
  const levelOrder = getEducationLevelsForTrack(track);
  const allowedLevels = new Set(levelOrder);
  const normalizedByLevel = new Map<ProfileEducationLevel, ProfileEducationHistory>();

  for (const rawEntry of input) {
    if (!allowedLevels.has(rawEntry.level)) continue;

    const allowedDocumentKinds = new Set(getAllowedEducationDocumentKinds(track, rawEntry.level));
    const documentMap = new Map<ProfileEducationDocumentKind, ProfileEducationDocument>();

    for (const rawDocument of rawEntry.documents || []) {
      if (!allowedDocumentKinds.has(rawDocument.kind)) continue;
      documentMap.set(rawDocument.kind, {
        kind: rawDocument.kind,
        label: normalizeOptionalText(rawDocument.label) || getEducationDocumentLabel(rawDocument.kind),
        fileUrl: rawDocument.fileUrl,
        originalName: normalizeOptionalText(rawDocument.originalName),
        mimeType: normalizeOptionalText(rawDocument.mimeType),
        size: rawDocument.size ?? null,
        uploadedAt: normalizeOptionalText(rawDocument.uploadedAt),
      });
    }

    const normalizedEntry: ProfileEducationHistory = {
      level: rawEntry.level,
      institutionName: normalizeOptionalText(rawEntry.institutionName),
      faculty:
        levelUsesHigherEducationFields(rawEntry.level) && !levelUsesCertificationFields(rawEntry.level)
          ? normalizeOptionalText(rawEntry.faculty)
          : null,
      studyProgram:
        track === 'STUDENT' || levelUsesHigherEducationFields(rawEntry.level) || levelUsesCertificationFields(rawEntry.level)
          ? normalizeOptionalText(rawEntry.studyProgram)
          : null,
      gpa:
        levelUsesHigherEducationFields(rawEntry.level) && !levelUsesCertificationFields(rawEntry.level)
          ? normalizeOptionalText(rawEntry.gpa)
          : null,
      degree:
        levelUsesHigherEducationFields(rawEntry.level) || levelUsesCertificationFields(rawEntry.level)
          ? normalizeOptionalText(rawEntry.degree)
          : null,
      nrg: levelUsesCertificationFields(rawEntry.level) ? normalizeOptionalText(rawEntry.nrg) : null,
      documents: Array.from(documentMap.values()),
    };

    if (hasEducationHistoryContent(normalizedEntry)) {
      normalizedByLevel.set(rawEntry.level, normalizedEntry);
    }
  }

  return levelOrder
    .map((level) => normalizedByLevel.get(level))
    .filter((entry): entry is ProfileEducationHistory => Boolean(entry));
}

export function deriveEducationSummary(
  educationHistories: ProfileEducationHistory[],
  track: ProfileEducationTrack,
) {
  const levelOrder =
    track === 'STUDENT'
      ? (getEducationLevelsForTrack(track) as ProfileEducationLevel[])
      : ([...PROFILE_EDUCATION_SUMMARY_LEVELS] as ProfileEducationLevel[]);
  const summaryCandidates = educationHistories.filter((entry) => levelOrder.includes(entry.level));
  const highestEntry = [...summaryCandidates]
    .sort((left, right) => levelOrder.indexOf(left.level) - levelOrder.indexOf(right.level))
    .at(-1);

  return {
    highestEducation: highestEntry ? getEducationLevelLabel(highestEntry.level) : null,
    institutionName: highestEntry?.institutionName || null,
    studyProgram: highestEntry?.studyProgram || null,
  };
}
