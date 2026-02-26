import { Request, Response } from 'express';
import { ExamType, GradeComponentType, GradeEntryMode, ReportComponentSlot, Semester } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

type ExamProgramDefinition = {
  code: string;
  baseType: ExamType;
  baseTypeCode: string;
  gradeComponentType: GradeComponentType;
  gradeComponentTypeCode: string;
  gradeComponentCode: string;
  gradeComponentLabel: string;
  gradeEntryMode: GradeEntryMode;
  gradeEntryModeCode: string;
  label: string;
  shortLabel: string;
  description: string;
  fixedSemester: Semester | null;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
};

type NormalizedExamProgramPayload = {
  id?: number | null;
  code: string;
  baseType: ExamType;
  baseTypeCode: string;
  gradeComponentType: GradeComponentType;
  gradeComponentTypeCode: string;
  gradeComponentCode: string;
  gradeComponentLabel: string;
  gradeEntryMode: GradeEntryMode;
  gradeEntryModeCode: string;
  displayLabel: string;
  shortLabel: string;
  description: string;
  fixedSemester: Semester | null;
  displayOrder: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
};

type ExamProgramRow = {
  id: number;
  code: string;
  baseType: ExamType;
  baseTypeCode: string | null;
  gradeComponentType: GradeComponentType;
  gradeComponentTypeCode: string | null;
  gradeComponentCode: string;
  gradeComponentLabel: string | null;
  gradeEntryMode: GradeEntryMode;
  gradeEntryModeCode: string | null;
  displayLabel: string;
  shortLabel: string | null;
  description: string | null;
  fixedSemester: Semester | null;
  displayOrder: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
};

type ExamGradeComponentDefinition = {
  code: string;
  label: string;
  type: GradeComponentType;
  typeCode: string;
  entryMode: GradeEntryMode;
  entryModeCode: string;
  reportSlot: ReportComponentSlot;
  reportSlotCode: string;
  includeInFinalScore: boolean;
  description: string | null;
  order: number;
  isActive: boolean;
};

type NormalizedExamGradeComponentPayload = {
  id?: number | null;
  code: string;
  label: string;
  type: GradeComponentType;
  typeCode: string;
  entryMode: GradeEntryMode;
  entryModeCode: string;
  reportSlot: ReportComponentSlot;
  reportSlotCode: string;
  includeInFinalScore: boolean;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
};

type ExamGradeComponentRow = {
  id: number;
  code: string;
  label: string;
  type: GradeComponentType;
  typeCode: string | null;
  entryMode: GradeEntryMode;
  entryModeCode: string | null;
  reportSlot: ReportComponentSlot;
  reportSlotCode: string | null;
  includeInFinalScore: boolean;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
};

const DEFAULT_EXAM_PROGRAMS: ExamProgramDefinition[] = [
  {
    code: 'FORMATIF',
    baseType: ExamType.FORMATIF,
    baseTypeCode: 'FORMATIF',
    gradeComponentType: GradeComponentType.FORMATIVE,
    gradeComponentTypeCode: 'FORMATIVE',
    gradeComponentCode: 'FORMATIVE',
    gradeComponentLabel: 'Formatif',
    gradeEntryMode: GradeEntryMode.NF_SERIES,
    gradeEntryModeCode: 'NF_SERIES',
    label: 'Formatif (Quiz)',
    shortLabel: 'Formatif',
    description:
      'Penilaian formatif harian. Nilai otomatis masuk NF bertahap (NF1-NF6) untuk perhitungan rerata rapor.',
    fixedSemester: null,
    order: 10,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
  },
  {
    code: 'SBTS',
    baseType: ExamType.SBTS,
    baseTypeCode: 'SBTS',
    gradeComponentType: GradeComponentType.MIDTERM,
    gradeComponentTypeCode: 'MIDTERM',
    gradeComponentCode: 'MIDTERM',
    gradeComponentLabel: 'SBTS',
    gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
    gradeEntryModeCode: 'SINGLE_SCORE',
    label: 'SBTS',
    shortLabel: 'SBTS',
    description: 'Sumatif tengah semester. Nilai tersinkron ke komponen rapor SBTS.',
    fixedSemester: null,
    order: 20,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
  },
  {
    code: 'SAS',
    baseType: ExamType.SAS,
    baseTypeCode: 'SAS',
    gradeComponentType: GradeComponentType.FINAL,
    gradeComponentTypeCode: 'FINAL',
    gradeComponentCode: 'FINAL',
    gradeComponentLabel: 'SAS/SAT',
    gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
    gradeEntryModeCode: 'SINGLE_SCORE',
    label: 'SAS',
    shortLabel: 'SAS',
    description: 'Sumatif akhir semester ganjil. Nilai tersinkron ke komponen rapor SAS.',
    fixedSemester: Semester.ODD,
    order: 30,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
  },
  {
    code: 'SAT',
    baseType: ExamType.SAT,
    baseTypeCode: 'SAT',
    gradeComponentType: GradeComponentType.FINAL,
    gradeComponentTypeCode: 'FINAL',
    gradeComponentCode: 'FINAL',
    gradeComponentLabel: 'SAS/SAT',
    gradeEntryMode: GradeEntryMode.SINGLE_SCORE,
    gradeEntryModeCode: 'SINGLE_SCORE',
    label: 'SAT',
    shortLabel: 'SAT',
    description: 'Sumatif akhir semester genap. Nilai tersinkron ke komponen rapor SAT.',
    fixedSemester: Semester.EVEN,
    order: 40,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
  },
];

const DEFAULT_GRADE_COMPONENTS: ExamGradeComponentDefinition[] = [
  {
    code: 'FORMATIVE',
    label: 'Formatif',
    type: GradeComponentType.FORMATIVE,
    typeCode: 'FORMATIVE',
    entryMode: GradeEntryMode.NF_SERIES,
    entryModeCode: 'NF_SERIES',
    reportSlot: ReportComponentSlot.FORMATIF,
    reportSlotCode: 'FORMATIF',
    includeInFinalScore: true,
    description: 'Nilai formatif bertahap (NF1-NF6).',
    order: 10,
    isActive: true,
  },
  {
    code: 'MIDTERM',
    label: 'SBTS',
    type: GradeComponentType.MIDTERM,
    typeCode: 'MIDTERM',
    entryMode: GradeEntryMode.SINGLE_SCORE,
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: ReportComponentSlot.SBTS,
    reportSlotCode: 'SBTS',
    includeInFinalScore: true,
    description: 'Nilai ujian tengah semester.',
    order: 20,
    isActive: true,
  },
  {
    code: 'FINAL',
    label: 'SAS/SAT',
    type: GradeComponentType.FINAL,
    typeCode: 'FINAL',
    entryMode: GradeEntryMode.SINGLE_SCORE,
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: ReportComponentSlot.SAS,
    reportSlotCode: 'SAS',
    includeInFinalScore: true,
    description: 'Nilai ujian akhir semester.',
    order: 30,
    isActive: true,
  },
  {
    code: 'SKILL',
    label: 'Skill',
    type: GradeComponentType.SKILL,
    typeCode: 'SKILL',
    entryMode: GradeEntryMode.SINGLE_SCORE,
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: ReportComponentSlot.NONE,
    reportSlotCode: 'NONE',
    includeInFinalScore: false,
    description: null,
    order: 40,
    isActive: true,
  },
  {
    code: 'US_PRACTICE',
    label: 'US Praktik',
    type: GradeComponentType.US_PRACTICE,
    typeCode: 'US_PRACTICE',
    entryMode: GradeEntryMode.SINGLE_SCORE,
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: ReportComponentSlot.US_PRACTICE,
    reportSlotCode: 'US_PRACTICE',
    includeInFinalScore: false,
    description: null,
    order: 50,
    isActive: true,
  },
  {
    code: 'US_THEORY',
    label: 'US Teori',
    type: GradeComponentType.US_THEORY,
    typeCode: 'US_THEORY',
    entryMode: GradeEntryMode.SINGLE_SCORE,
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: ReportComponentSlot.US_THEORY,
    reportSlotCode: 'US_THEORY',
    includeInFinalScore: false,
    description: null,
    order: 60,
    isActive: true,
  },
];

const VALID_BASE_TYPES = new Set<ExamType>([
  ExamType.FORMATIF,
  ExamType.SBTS,
  ExamType.SAS,
  ExamType.SAT,
  ExamType.US_PRACTICE,
  ExamType.US_THEORY,
]);

const VALID_GRADE_COMPONENT_TYPES = new Set<GradeComponentType>([
  GradeComponentType.FORMATIVE,
  GradeComponentType.MIDTERM,
  GradeComponentType.FINAL,
  GradeComponentType.SKILL,
  GradeComponentType.US_PRACTICE,
  GradeComponentType.US_THEORY,
  GradeComponentType.CUSTOM,
]);

const VALID_GRADE_ENTRY_MODES = new Set<GradeEntryMode>([
  GradeEntryMode.NF_SERIES,
  GradeEntryMode.SINGLE_SCORE,
]);

const VALID_REPORT_COMPONENT_SLOTS = new Set<ReportComponentSlot>([
  ReportComponentSlot.NONE,
  ReportComponentSlot.FORMATIF,
  ReportComponentSlot.SBTS,
  ReportComponentSlot.SAS,
  ReportComponentSlot.US_THEORY,
  ReportComponentSlot.US_PRACTICE,
]);

function defaultGradeComponentTypeByBaseType(baseType: ExamType): GradeComponentType {
  if (baseType === ExamType.FORMATIF) return GradeComponentType.FORMATIVE;
  if (baseType === ExamType.SBTS) return GradeComponentType.MIDTERM;
  if (baseType === ExamType.SAS || baseType === ExamType.SAT) return GradeComponentType.FINAL;
  if (baseType === ExamType.US_PRACTICE) return GradeComponentType.US_PRACTICE;
  if (baseType === ExamType.US_THEORY) return GradeComponentType.US_THEORY;
  return GradeComponentType.FORMATIVE;
}

function defaultGradeComponentCodeByBaseType(baseType: ExamType): string {
  if (baseType === ExamType.FORMATIF) return 'FORMATIVE';
  if (baseType === ExamType.SBTS) return 'MIDTERM';
  if (baseType === ExamType.SAS || baseType === ExamType.SAT) return 'FINAL';
  if (baseType === ExamType.US_PRACTICE) return 'US_PRACTICE';
  if (baseType === ExamType.US_THEORY) return 'US_THEORY';
  return 'FORMATIVE';
}

function mapExamTypeFromCode(code: string, fallback: ExamType = ExamType.FORMATIF): ExamType {
  if (code === 'FORMATIF') return ExamType.FORMATIF;
  if (code === 'SBTS') return ExamType.SBTS;
  if (code === 'SAS') return ExamType.SAS;
  if (code === 'SAT') return ExamType.SAT;
  if (code === 'US_PRACTICE') return ExamType.US_PRACTICE;
  if (code === 'US_THEORY') return ExamType.US_THEORY;
  return fallback;
}

function mapReportSlotFromCode(
  code: string,
  fallback: ReportComponentSlot = ReportComponentSlot.NONE,
): ReportComponentSlot {
  if (code === 'FORMATIF') return ReportComponentSlot.FORMATIF;
  if (code === 'SBTS') return ReportComponentSlot.SBTS;
  if (code === 'SAS') return ReportComponentSlot.SAS;
  if (code === 'US_THEORY') return ReportComponentSlot.US_THEORY;
  if (code === 'US_PRACTICE') return ReportComponentSlot.US_PRACTICE;
  if (code === 'NONE') return ReportComponentSlot.NONE;
  return fallback;
}

function mapGradeEntryModeFromCode(
  code: string,
  fallback: GradeEntryMode = GradeEntryMode.SINGLE_SCORE,
): GradeEntryMode {
  if (code === 'NF_SERIES') return GradeEntryMode.NF_SERIES;
  if (code === 'SINGLE_SCORE') return GradeEntryMode.SINGLE_SCORE;
  return fallback;
}

function defaultGradeEntryModeByCode(code: string): GradeEntryMode {
  return code === 'FORMATIVE' ? GradeEntryMode.NF_SERIES : GradeEntryMode.SINGLE_SCORE;
}

function normalizeGradeComponentCode(raw: unknown, fallback: string): string {
  const normalized = normalizeProgramCodeSeed(raw);
  const finalValue = normalized || normalizeProgramCodeSeed(fallback);
  if (!finalValue) {
    throw new ApiError(400, 'Kode komponen nilai wajib diisi.');
  }
  if (finalValue.length > 50) {
    throw new ApiError(400, 'Kode komponen nilai maksimal 50 karakter.');
  }
  return finalValue;
}

function normalizeGradeEntryMode(raw: unknown, fallback: GradeEntryMode): GradeEntryMode {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (!value) return fallback;
  if (VALID_GRADE_ENTRY_MODES.has(value as GradeEntryMode)) return value as GradeEntryMode;
  throw new ApiError(400, 'Mode input nilai tidak valid.');
}

function defaultReportSlotByCode(code: string): ReportComponentSlot {
  if (code === 'FORMATIVE') return ReportComponentSlot.FORMATIF;
  if (code === 'MIDTERM') return ReportComponentSlot.SBTS;
  if (code === 'FINAL') return ReportComponentSlot.SAS;
  if (code === 'US_THEORY') return ReportComponentSlot.US_THEORY;
  if (code === 'US_PRACTICE') return ReportComponentSlot.US_PRACTICE;
  return ReportComponentSlot.NONE;
}

function defaultIncludeInFinalScoreBySlot(slot: ReportComponentSlot): boolean {
  return slot === ReportComponentSlot.FORMATIF || slot === ReportComponentSlot.SBTS || slot === ReportComponentSlot.SAS;
}

function normalizeReportSlot(raw: unknown, fallback: ReportComponentSlot): ReportComponentSlot {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (!value) return fallback;
  if (VALID_REPORT_COMPONENT_SLOTS.has(value as ReportComponentSlot)) return value as ReportComponentSlot;
  return fallback;
}

function mapGradeComponentTypeFromCode(
  code: string,
  fallback: GradeComponentType = GradeComponentType.CUSTOM,
): GradeComponentType {
  if (code === 'FORMATIVE') return GradeComponentType.FORMATIVE;
  if (code === 'MIDTERM') return GradeComponentType.MIDTERM;
  if (code === 'FINAL') return GradeComponentType.FINAL;
  if (code === 'SKILL') return GradeComponentType.SKILL;
  if (code === 'US_PRACTICE') return GradeComponentType.US_PRACTICE;
  if (code === 'US_THEORY') return GradeComponentType.US_THEORY;
  return fallback;
}

function normalizeProgramCodeSeed(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeProgramCode(rawCode: unknown, rawLabel?: unknown): string {
  const fromCode = normalizeProgramCodeSeed(rawCode);
  if (fromCode) {
    if (fromCode.length > 50) {
      throw new ApiError(400, 'Kode program ujian maksimal 50 karakter.');
    }
    return fromCode;
  }

  const fromLabel = normalizeProgramCodeSeed(rawLabel);
  if (!fromLabel) {
    throw new ApiError(400, 'Kode program ujian wajib diisi.');
  }
  if (fromLabel.length > 50) {
    throw new ApiError(400, 'Kode program ujian maksimal 50 karakter.');
  }
  return fromLabel;
}

function normalizeBaseTypeCode(raw: unknown, fallback: string): string {
  const normalized = normalizeProgramCodeSeed(raw);
  if (normalized) return normalized;
  return normalizeProgramCodeSeed(fallback) || 'FORMATIF';
}

function normalizeBaseType(raw: unknown, fallback: ExamType): ExamType {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (!value) return fallback;
  if (value === 'QUIZ') return ExamType.FORMATIF;
  if (VALID_BASE_TYPES.has(value as ExamType)) return value as ExamType;
  return fallback;
}

function normalizeGradeComponentTypeCode(raw: unknown, fallback: string): string {
  const normalized = normalizeProgramCodeSeed(raw);
  if (normalized) return normalized;
  return normalizeProgramCodeSeed(fallback) || 'CUSTOM';
}

function normalizeGradeComponentType(raw: unknown, fallback: GradeComponentType): GradeComponentType {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (!value) return fallback;
  if (VALID_GRADE_COMPONENT_TYPES.has(value as GradeComponentType)) return value as GradeComponentType;
  return fallback;
}

function normalizeGradeEntryModeCode(raw: unknown, fallback: string): string {
  const value = String(raw || '')
    .trim()
    .toUpperCase();
  if (!value) return fallback || 'SINGLE_SCORE';
  if (value === 'NF_SERIES' || value === 'SINGLE_SCORE') return value;
  return fallback || 'SINGLE_SCORE';
}

function normalizeReportSlotCode(raw: unknown, fallback: string): string {
  const normalized = normalizeProgramCodeSeed(raw);
  if (normalized) return normalized;
  return normalizeProgramCodeSeed(fallback) || 'NONE';
}

function normalizeSemesterValue(raw: unknown): Semester | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = String(raw).trim().toUpperCase();
  if (value === 'GANJIL' || value === 'ODD') return Semester.ODD;
  if (value === 'GENAP' || value === 'EVEN') return Semester.EVEN;
  throw new ApiError(400, 'Semester tetap tidak valid. Gunakan ODD/GANJIL atau EVEN/GENAP.');
}

function normalizeText(raw: unknown, fallback: string, maxLength: number): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  const finalValue = value || fallback;
  return finalValue.slice(0, maxLength);
}

function normalizeOptionalText(raw: unknown, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return null;
  return value.slice(0, maxLength);
}

function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  return Boolean(raw);
}

function toNumber(raw: unknown, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function assertProgramSemesterCompatibility(baseType: ExamType, fixedSemester: Semester | null) {
  if (baseType === ExamType.SAS && fixedSemester === Semester.EVEN) {
    throw new ApiError(400, 'Program dengan base type SAS tidak boleh dikunci ke semester Genap.');
  }
  if (baseType === ExamType.SAT && fixedSemester === Semester.ODD) {
    throw new ApiError(400, 'Program dengan base type SAT tidak boleh dikunci ke semester Ganjil.');
  }
}

async function resolveAcademicYearId(rawAcademicYearId: unknown): Promise<number> {
  const explicitId = Number(rawAcademicYearId);
  if (Number.isFinite(explicitId) && explicitId > 0) {
    const exists = await prisma.academicYear.findUnique({
      where: { id: explicitId },
      select: { id: true },
    });
    if (!exists) {
      throw new ApiError(404, 'Tahun ajaran tidak ditemukan.');
    }
    return explicitId;
  }

  const active = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { id: 'desc' },
    select: { id: true },
  });

  if (!active) {
    throw new ApiError(404, 'Tahun ajaran aktif tidak ditemukan.');
  }

  return active.id;
}

async function assertCanManageProgramConfig(user: { id: number; role: string }) {
  if (user.role === 'ADMIN') return;

  if (user.role !== 'TEACHER') {
    throw new ApiError(403, 'Hanya Admin atau Wakasek Kurikulum yang dapat mengubah konfigurasi ujian.');
  }

  const actor = await prisma.user.findUnique({
    where: { id: Number(user.id) },
    select: { additionalDuties: true },
  });

  const duties = (actor?.additionalDuties || []).map((duty) => String(duty || '').trim().toUpperCase());
  const canManage = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');

  if (!canManage) {
    throw new ApiError(403, 'Akses ditolak. Fitur ini khusus Admin/Wakasek Kurikulum.');
  }
}

function getDefaultsByCode() {
  const map = new Map<string, ExamProgramDefinition>();
  DEFAULT_EXAM_PROGRAMS.forEach((item) => {
    map.set(item.code, item);
  });
  return map;
}

function getDefaultGradeComponentsByCode() {
  const map = new Map<string, ExamGradeComponentDefinition>();
  DEFAULT_GRADE_COMPONENTS.forEach((item) => {
    map.set(item.code, item);
  });
  return map;
}

function mapGradeComponents(rows: ExamGradeComponentRow[]): ExamGradeComponentDefinition[] {
  const defaultsByCode = getDefaultGradeComponentsByCode();
  return rows
    .map((row) => {
      const defaults = defaultsByCode.get(row.code);
      const typeCode = normalizeGradeComponentTypeCode(
        row.typeCode,
        defaults?.typeCode || row.type?.toString() || row.code,
      );
      const entryModeCode = normalizeGradeEntryModeCode(
        row.entryModeCode,
        defaults?.entryModeCode || row.entryMode?.toString() || defaultGradeEntryModeByCode(row.code),
      );
      const reportSlotCode = normalizeReportSlotCode(
        row.reportSlotCode,
        defaults?.reportSlotCode || row.reportSlot?.toString() || defaultReportSlotByCode(row.code),
      );
      return {
        code: row.code,
        label: row.label || defaults?.label || row.code.replace(/_/g, ' '),
        type: row.type || defaults?.type || mapGradeComponentTypeFromCode(typeCode),
        typeCode,
        entryMode: row.entryMode || defaults?.entryMode || defaultGradeEntryModeByCode(typeCode),
        entryModeCode,
        reportSlot: row.reportSlot || defaults?.reportSlot || mapReportSlotFromCode(reportSlotCode),
        reportSlotCode,
        includeInFinalScore:
          row.includeInFinalScore ?? defaults?.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(
            row.reportSlot || defaults?.reportSlot || defaultReportSlotByCode(row.code),
          ),
        description: row.description || defaults?.description || null,
        order: Number.isFinite(row.displayOrder) ? row.displayOrder : defaults?.order || 0,
        isActive: row.isActive,
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

async function fetchGradeComponentRows(academicYearId: number): Promise<ExamGradeComponentRow[]> {
  return prisma.examGradeComponent.findMany({
    where: { academicYearId },
    select: {
      id: true,
      code: true,
      label: true,
      type: true,
      typeCode: true,
      entryMode: true,
      entryModeCode: true,
      reportSlot: true,
      reportSlotCode: true,
      includeInFinalScore: true,
      description: true,
      displayOrder: true,
      isActive: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
}

function normalizeGradeComponentPayload(rawComponents: unknown[]): NormalizedExamGradeComponentPayload[] {
  const defaultsByCode = getDefaultGradeComponentsByCode();
  return rawComponents.map((rawItem: unknown, index: number) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const idRaw = Number(item.id);
    const id = Number.isFinite(idRaw) && idRaw > 0 ? Math.round(idRaw) : null;
    const code = normalizeGradeComponentCode(item.code, '');
    const defaults = defaultsByCode.get(code);

    const inferredType = mapGradeComponentTypeFromCode(code, GradeComponentType.CUSTOM);
    const requestedType =
      item.type === undefined || item.type === null || item.type === ''
        ? inferredType
        : normalizeGradeComponentType(item.type, inferredType);
    const typeCode = normalizeGradeComponentTypeCode(
      item.typeCode ?? item.type,
      defaults?.typeCode || code,
    );
    const type = mapGradeComponentTypeFromCode(typeCode, mapGradeComponentTypeFromCode(code, requestedType));
    const entryModeCode = normalizeGradeEntryModeCode(
      item.entryModeCode ?? item.entryMode,
      defaults?.entryModeCode || defaultGradeEntryModeByCode(typeCode),
    );
    const entryMode = normalizeGradeEntryMode(
      item.entryMode,
      mapGradeEntryModeFromCode(entryModeCode, defaults?.entryMode || defaultGradeEntryModeByCode(typeCode)),
    );
    const reportSlotCode = normalizeReportSlotCode(
      item.reportSlotCode ?? item.reportSlot,
      defaults?.reportSlotCode || defaultReportSlotByCode(typeCode),
    );
    const reportSlot = normalizeReportSlot(
      item.reportSlot,
      mapReportSlotFromCode(reportSlotCode, defaults?.reportSlot || defaultReportSlotByCode(typeCode)),
    );
    const includeInFinalScore = toBoolean(
      item.includeInFinalScore,
      defaults?.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(reportSlot),
    );
    const label = normalizeText(item.label, defaults?.label || code.replace(/_/g, ' '), 80);

    return {
      id,
      code,
      label,
      type,
      typeCode,
      entryMode,
      entryModeCode,
      reportSlot,
      reportSlotCode,
      includeInFinalScore,
      description: normalizeOptionalText(item.description, 300),
      displayOrder: toNumber(item.order, defaults?.order ?? (index + 1) * 10),
      isActive: toBoolean(item.isActive, defaults?.isActive ?? true),
    };
  });
}

async function syncMissingGradeComponentsFromPrograms(academicYearId: number) {
  const existingRows = await prisma.examGradeComponent.findMany({
    where: { academicYearId },
    select: { code: true },
  });
  const existingCodes = new Set(existingRows.map((row) => row.code));

  const programRows = await prisma.examProgramConfig.findMany({
    where: { academicYearId },
    select: {
      code: true,
      baseType: true,
      baseTypeCode: true,
      gradeComponentType: true,
      gradeComponentTypeCode: true,
      gradeComponentCode: true,
      gradeComponentLabel: true,
      gradeEntryMode: true,
      gradeEntryModeCode: true,
      displayLabel: true,
      displayOrder: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });

  if (programRows.length === 0) return;

  const defaultsByCode = getDefaultGradeComponentsByCode();
  const toCreate: Array<{
    academicYearId: number;
    code: string;
    label: string;
    type: GradeComponentType;
    typeCode: string;
    entryMode: GradeEntryMode;
    entryModeCode: string;
    reportSlot: ReportComponentSlot;
    reportSlotCode: string;
    includeInFinalScore: boolean;
    description: string | null;
    displayOrder: number;
    isActive: boolean;
  }> = [];

  for (const row of programRows) {
    const componentCode =
      normalizeProgramCodeSeed(row.gradeComponentCode) || defaultGradeComponentCodeByBaseType(row.baseType);
    if (!componentCode || existingCodes.has(componentCode)) continue;

    const defaults = defaultsByCode.get(componentCode);
    const typeCode = normalizeGradeComponentTypeCode(
      row.gradeComponentTypeCode,
      defaults?.typeCode || row.gradeComponentType?.toString() || componentCode,
    );
    const entryModeCode = normalizeGradeEntryModeCode(
      row.gradeEntryModeCode,
      defaults?.entryModeCode || row.gradeEntryMode?.toString() || defaultGradeEntryModeByCode(typeCode),
    );
    const reportSlotCode = normalizeReportSlotCode(
      defaults?.reportSlotCode,
      defaultReportSlotByCode(typeCode),
    );
    const reportSlot = mapReportSlotFromCode(reportSlotCode, defaults?.reportSlot || defaultReportSlotByCode(typeCode));
    toCreate.push({
      academicYearId,
      code: componentCode,
      label: (row.gradeComponentLabel || '').trim() || defaults?.label || componentCode.replace(/_/g, ' '),
      type: row.gradeComponentType || defaults?.type || mapGradeComponentTypeFromCode(typeCode),
      typeCode,
      entryMode: row.gradeEntryMode || defaults?.entryMode || mapGradeEntryModeFromCode(entryModeCode),
      entryModeCode,
      reportSlot,
      reportSlotCode,
      includeInFinalScore: defaults?.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(reportSlot),
      description: defaults?.description || null,
      displayOrder: Number.isFinite(row.displayOrder) ? row.displayOrder : defaults?.order || 0,
      isActive: true,
    });
    existingCodes.add(componentCode);
  }

  if (toCreate.length > 0) {
    await prisma.examGradeComponent.createMany({
      data: toCreate,
      skipDuplicates: true,
    });
  }
}

function rowToProgram(row: ExamProgramRow): ExamProgramDefinition {
  const defaultsByCode = getDefaultsByCode();
  const defaults = defaultsByCode.get(row.code);
  const baseTypeCode = normalizeBaseTypeCode(
    row.baseTypeCode,
    defaults?.baseTypeCode || row.baseType?.toString() || row.code,
  );
  const baseType = row.baseType || mapExamTypeFromCode(baseTypeCode, defaults?.baseType || ExamType.FORMATIF);
  const gradeComponentCode =
    normalizeProgramCodeSeed(row.gradeComponentCode) ||
    defaults?.gradeComponentCode ||
    defaultGradeComponentCodeByBaseType(baseType);
  const gradeComponentTypeCode = normalizeGradeComponentTypeCode(
    row.gradeComponentTypeCode,
    defaults?.gradeComponentTypeCode || row.gradeComponentType?.toString() || gradeComponentCode,
  );
  const fallbackType = defaults?.gradeComponentType || defaultGradeComponentTypeByBaseType(baseType);
  const gradeComponentType = row.gradeComponentType || mapGradeComponentTypeFromCode(gradeComponentTypeCode, fallbackType) || fallbackType;
  const gradeEntryModeCode = normalizeGradeEntryModeCode(
    row.gradeEntryModeCode,
    defaults?.gradeEntryModeCode || row.gradeEntryMode?.toString() || defaultGradeEntryModeByCode(gradeComponentCode),
  );
  const gradeEntryMode =
    row.gradeEntryMode || mapGradeEntryModeFromCode(gradeEntryModeCode, defaults?.gradeEntryMode || defaultGradeEntryModeByCode(gradeComponentCode));
  const gradeComponentLabel =
    (row.gradeComponentLabel || '').trim() ||
    defaults?.gradeComponentLabel ||
    gradeComponentCode.replace(/_/g, ' ');

  return {
    code: row.code,
    baseType,
    baseTypeCode,
    gradeComponentType,
    gradeComponentTypeCode,
    gradeComponentCode,
    gradeComponentLabel,
    gradeEntryMode,
    gradeEntryModeCode,
    label: row.displayLabel || defaults?.label || row.code,
    shortLabel: row.shortLabel || defaults?.shortLabel || row.code,
    description: row.description || defaults?.description || '',
    fixedSemester: row.fixedSemester ?? defaults?.fixedSemester ?? null,
    order: Number.isFinite(row.displayOrder) ? row.displayOrder : defaults?.order || 0,
    isActive: row.isActive,
    showOnTeacherMenu: row.showOnTeacherMenu,
    showOnStudentMenu: row.showOnStudentMenu,
  };
}

function mapPrograms(rows: ExamProgramRow[]): Array<ExamProgramDefinition & { id: number; source: 'default' | 'custom' }> {
  const defaultsByCode = getDefaultsByCode();
  return rows
    .map((row) => {
      const program = rowToProgram(row);
      const source: 'default' | 'custom' = defaultsByCode.has(program.code) ? 'default' : 'custom';
      return {
        id: row.id,
        ...program,
        source,
      };
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

async function fetchProgramRows(academicYearId: number) {
  const rows = await prisma.examProgramConfig.findMany({
    where: { academicYearId },
    select: {
      id: true,
      code: true,
      baseType: true,
      baseTypeCode: true,
      gradeComponentType: true,
      gradeComponentTypeCode: true,
      gradeComponentCode: true,
      gradeComponentLabel: true,
      gradeEntryMode: true,
      gradeEntryModeCode: true,
      displayLabel: true,
      shortLabel: true,
      description: true,
      fixedSemester: true,
      displayOrder: true,
      isActive: true,
      showOnTeacherMenu: true,
      showOnStudentMenu: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });
  return rows;
}

function normalizeProgramPayload(rawPrograms: unknown[]): NormalizedExamProgramPayload[] {
  const defaultsByCode = getDefaultsByCode();
  return rawPrograms.map((rawItem: unknown, index: number) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const idRaw = Number(item.id);
    const id = Number.isFinite(idRaw) && idRaw > 0 ? Math.round(idRaw) : null;
    const code = normalizeProgramCode(item.code, item.label);
    const defaults = defaultsByCode.get(code);
    const baseTypeCode = normalizeBaseTypeCode(
      item.baseTypeCode ?? item.baseType,
      defaults?.baseTypeCode || defaults?.baseType || ExamType.FORMATIF,
    );
    const baseType = normalizeBaseType(
      item.baseType,
      mapExamTypeFromCode(baseTypeCode, defaults?.baseType || ExamType.FORMATIF),
    );
    const defaultGradeComponentType = defaults?.gradeComponentType || defaultGradeComponentTypeByBaseType(baseType);
    const gradeComponentTypeCode = normalizeGradeComponentTypeCode(
      item.gradeComponentTypeCode ?? item.gradeComponentType,
      defaults?.gradeComponentTypeCode || defaultGradeComponentType?.toString() || 'CUSTOM',
    );
    const gradeComponentCode = normalizeGradeComponentCode(
      item.gradeComponentCode ?? item.gradeComponentType,
      defaults?.gradeComponentCode || defaultGradeComponentCodeByBaseType(baseType),
    );
    const normalizedProvidedGradeType =
      item.gradeComponentType === undefined || item.gradeComponentType === null || item.gradeComponentType === ''
        ? GradeComponentType.CUSTOM
        : normalizeGradeComponentType(item.gradeComponentType, defaultGradeComponentType);
    const gradeComponentType = mapGradeComponentTypeFromCode(
      gradeComponentTypeCode || gradeComponentCode,
      normalizedProvidedGradeType,
    );
    const gradeEntryModeCode = normalizeGradeEntryModeCode(
      item.gradeEntryModeCode ?? item.gradeEntryMode,
      defaults?.gradeEntryModeCode || defaults?.gradeEntryMode || defaultGradeEntryModeByCode(gradeComponentCode),
    );
    const gradeEntryMode = normalizeGradeEntryMode(
      item.gradeEntryMode,
      mapGradeEntryModeFromCode(
        gradeEntryModeCode,
        defaults?.gradeEntryMode || defaultGradeEntryModeByCode(gradeComponentCode),
      ),
    );
    const gradeComponentLabel = normalizeText(
      item.gradeComponentLabel,
      defaults?.gradeComponentLabel || gradeComponentCode.replace(/_/g, ' '),
      80,
    );
    const fixedSemesterFromPayload = normalizeSemesterValue(item.fixedSemester);
    const fixedSemester = fixedSemesterFromPayload ?? defaults?.fixedSemester ?? null;
    assertProgramSemesterCompatibility(baseType, fixedSemester);

    const labelFallback = defaults?.label || code.replace(/_/g, ' ');
    const shortLabelFallback = defaults?.shortLabel || labelFallback.slice(0, 40);

    return {
      id,
      code,
      baseType,
      baseTypeCode,
      gradeComponentType,
      gradeComponentTypeCode,
      gradeComponentCode,
      gradeComponentLabel,
      gradeEntryMode,
      gradeEntryModeCode,
      displayLabel: normalizeText(item.label, labelFallback, 80),
      shortLabel: normalizeOptionalText(item.shortLabel, 40) || shortLabelFallback,
      description: normalizeOptionalText(item.description, 400) || defaults?.description || '',
      fixedSemester,
      displayOrder: toNumber(item.order, defaults?.order ?? (index + 1) * 10),
      isActive: toBoolean(item.isActive, defaults?.isActive ?? true),
      showOnTeacherMenu: toBoolean(item.showOnTeacherMenu, defaults?.showOnTeacherMenu ?? true),
      showOnStudentMenu: toBoolean(item.showOnStudentMenu, defaults?.showOnStudentMenu ?? true),
    };
  });
}

export const getExamPrograms = asyncHandler(async (req: Request, res: Response) => {
  const academicYearId = await resolveAcademicYearId(req.query.academicYearId);
  const roleContextRaw = String(req.query.roleContext || 'all').trim().toLowerCase();
  const roleContext: 'teacher' | 'student' | 'all' =
    roleContextRaw === 'teacher' || roleContextRaw === 'student' ? roleContextRaw : 'all';
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

  await syncMissingGradeComponentsFromPrograms(academicYearId);
  const rows = await fetchProgramRows(academicYearId);
  let programs = mapPrograms(rows);

  if (!includeInactive) {
    programs = programs.filter((item) => item.isActive);
  }

  if (roleContext === 'teacher') {
    programs = programs.filter((item) => item.showOnTeacherMenu);
  } else if (roleContext === 'student') {
    programs = programs.filter((item) => item.showOnStudentMenu);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        roleContext,
        programs,
      },
      'Konfigurasi program ujian berhasil dimuat.',
    ),
  );
});

export const upsertExamPrograms = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user as { id: number; role: string } | undefined;
  if (!authUser?.id || !authUser?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCanManageProgramConfig(authUser);

  const academicYearId = await resolveAcademicYearId(req.body?.academicYearId);
  const rawPrograms = Array.isArray(req.body?.programs) ? req.body.programs : [];
  const normalizedPayload = rawPrograms.length > 0 ? normalizeProgramPayload(rawPrograms) : [];
  const dedupedByCode = new Map<string, NormalizedExamProgramPayload>();
  normalizedPayload.forEach((item) => {
    dedupedByCode.set(item.code, item);
  });

  const payloadRows = Array.from(dedupedByCode.values());

  await syncMissingGradeComponentsFromPrograms(academicYearId);

  const componentMap = new Map(
    (
      await prisma.examGradeComponent.findMany({
        where: { academicYearId },
        select: {
          code: true,
          label: true,
          type: true,
          typeCode: true,
          entryMode: true,
          entryModeCode: true,
        },
      })
    ).map((item) => [item.code, item]),
  );

  const missingCodes = payloadRows
    .map((row) => row.gradeComponentCode)
    .filter((code, index, arr) => arr.indexOf(code) === index)
    .filter((code) => !componentMap.has(code));

  if (missingCodes.length > 0) {
    throw new ApiError(
      400,
      `Komponen nilai belum terdaftar: ${missingCodes.join(', ')}. Tambahkan dulu di Master Komponen Nilai.`,
    );
  }

  const alignedPayloadRows = payloadRows.map((item) => {
    const component = componentMap.get(item.gradeComponentCode);
    if (!component) return item;
    return {
      ...item,
      gradeComponentType: component.type,
      gradeComponentTypeCode: component.typeCode || component.type,
      gradeComponentLabel: component.label,
      gradeEntryMode: component.entryMode,
      gradeEntryModeCode: component.entryModeCode || component.entryMode,
    };
  });

  await prisma.$transaction(async (tx) => {
    if (alignedPayloadRows.length === 0) {
      await tx.examPacket.updateMany({
        where: { academicYearId },
        data: { programCode: null },
      });
      await tx.examProgramConfig.deleteMany({
        where: { academicYearId },
      });
      return;
    }

    const existingRows = await tx.examProgramConfig.findMany({
      where: { academicYearId },
      select: {
        id: true,
        code: true,
        baseType: true,
        baseTypeCode: true,
        gradeComponentType: true,
        gradeComponentTypeCode: true,
        gradeEntryModeCode: true,
      },
    });

    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const existingByCode = new Map(existingRows.map((row) => [row.code, row]));
    const keptIds = new Set<number>();
    const codeRemaps = new Map<string, string>();

    for (const item of alignedPayloadRows) {
      let matchedRow = item.id ? existingById.get(item.id) : undefined;
      if (!matchedRow) {
        matchedRow = existingByCode.get(item.code);
      }

      if (matchedRow) {
        const conflict = existingByCode.get(item.code);
        if (conflict && conflict.id !== matchedRow.id) {
          throw new ApiError(400, `Kode program duplikat: ${item.code}`);
        }

        await tx.examProgramConfig.update({
          where: { id: matchedRow.id },
          data: {
            code: item.code,
            baseType: item.baseType,
            baseTypeCode: item.baseTypeCode,
            gradeComponentType: item.gradeComponentType,
            gradeComponentTypeCode: item.gradeComponentTypeCode,
            gradeComponentCode: item.gradeComponentCode,
            gradeComponentLabel: item.gradeComponentLabel,
            gradeEntryMode: item.gradeEntryMode,
            gradeEntryModeCode: item.gradeEntryModeCode,
            displayLabel: item.displayLabel,
            shortLabel: item.shortLabel,
            description: item.description,
            fixedSemester: item.fixedSemester,
            displayOrder: item.displayOrder,
            isActive: item.isActive,
            showOnTeacherMenu: item.showOnTeacherMenu,
            showOnStudentMenu: item.showOnStudentMenu,
          },
        });

        keptIds.add(matchedRow.id);
        if (matchedRow.code !== item.code) {
          codeRemaps.set(matchedRow.code, item.code);
          existingByCode.delete(matchedRow.code);
        }

        const updatedRef = {
          id: matchedRow.id,
          code: item.code,
          baseType: item.baseType,
          baseTypeCode: item.baseTypeCode,
          gradeComponentType: item.gradeComponentType,
          gradeComponentTypeCode: item.gradeComponentTypeCode,
          gradeEntryModeCode: item.gradeEntryModeCode,
        };
        existingById.set(matchedRow.id, updatedRef);
        existingByCode.set(item.code, updatedRef);
      } else {
        const created = await tx.examProgramConfig.create({
          data: {
            academicYearId,
            code: item.code,
            baseType: item.baseType,
            baseTypeCode: item.baseTypeCode,
            gradeComponentType: item.gradeComponentType,
            gradeComponentTypeCode: item.gradeComponentTypeCode,
            gradeComponentCode: item.gradeComponentCode,
            gradeComponentLabel: item.gradeComponentLabel,
            gradeEntryMode: item.gradeEntryMode,
            gradeEntryModeCode: item.gradeEntryModeCode,
            displayLabel: item.displayLabel,
            shortLabel: item.shortLabel,
            description: item.description,
            fixedSemester: item.fixedSemester,
            displayOrder: item.displayOrder,
            isActive: item.isActive,
            showOnTeacherMenu: item.showOnTeacherMenu,
            showOnStudentMenu: item.showOnStudentMenu,
          },
          select: {
            id: true,
            code: true,
            baseType: true,
            baseTypeCode: true,
            gradeComponentType: true,
            gradeComponentTypeCode: true,
            gradeEntryModeCode: true,
          },
        });

        keptIds.add(created.id);
        existingById.set(created.id, created);
        existingByCode.set(created.code, created);
      }
    }

    for (const [fromCode, toCode] of codeRemaps.entries()) {
      if (fromCode === toCode) continue;
      await tx.examPacket.updateMany({
        where: {
          academicYearId,
          programCode: fromCode,
        },
        data: {
          programCode: toCode,
        },
      });
    }

    const removedRows = existingRows.filter((row) => !keptIds.has(row.id));
    if (removedRows.length > 0) {
      const payloadByBaseType = new Map<ExamType, NormalizedExamProgramPayload[]>();
      alignedPayloadRows.forEach((row) => {
        const bucket = payloadByBaseType.get(row.baseType) || [];
        bucket.push(row);
        payloadByBaseType.set(row.baseType, bucket);
      });

      for (const row of removedRows) {
        const candidates = (payloadByBaseType.get(row.baseType) || []).sort(
          (a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code),
        );
        const target = candidates[0];
        if (target?.code && target.code !== row.code) {
          await tx.examPacket.updateMany({
            where: {
              academicYearId,
              programCode: row.code,
            },
            data: {
              programCode: target.code,
            },
          });
        } else {
          await tx.examPacket.updateMany({
            where: {
              academicYearId,
              programCode: row.code,
            },
            data: {
              programCode: null,
            },
          });
        }
      }

      await tx.examProgramConfig.deleteMany({
        where: {
          academicYearId,
          id: {
            in: removedRows.map((row) => row.id),
          },
        },
      });
    }
  });

  const rows = await fetchProgramRows(academicYearId);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        programs: mapPrograms(rows),
      },
      'Konfigurasi program ujian berhasil diperbarui.',
    ),
  );
});

export const getExamGradeComponents = asyncHandler(async (req: Request, res: Response) => {
  const academicYearId = await resolveAcademicYearId(req.query.academicYearId);
  const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';

  await syncMissingGradeComponentsFromPrograms(academicYearId);
  let components = mapGradeComponents(await fetchGradeComponentRows(academicYearId));

  if (!includeInactive) {
    components = components.filter((item) => item.isActive);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        components,
      },
      'Master komponen nilai berhasil dimuat.',
    ),
  );
});

export const upsertExamGradeComponents = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user as { id: number; role: string } | undefined;
  if (!authUser?.id || !authUser?.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertCanManageProgramConfig(authUser);

  const academicYearId = await resolveAcademicYearId(req.body?.academicYearId);
  const rawComponents = Array.isArray(req.body?.components) ? req.body.components : [];
  const normalizedPayload = rawComponents.length > 0 ? normalizeGradeComponentPayload(rawComponents) : [];
  const dedupedByCode = new Map<string, NormalizedExamGradeComponentPayload>();
  normalizedPayload.forEach((item) => {
    dedupedByCode.set(item.code, item);
  });
  const payloadRows = Array.from(dedupedByCode.values());

  await prisma.$transaction(async (tx) => {
    const existingRows = await tx.examGradeComponent.findMany({
      where: { academicYearId },
      select: {
        id: true,
        code: true,
        label: true,
        type: true,
        typeCode: true,
        entryMode: true,
        entryModeCode: true,
        reportSlot: true,
        reportSlotCode: true,
        includeInFinalScore: true,
        description: true,
        displayOrder: true,
        isActive: true,
      },
    });

    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const existingByCode = new Map(existingRows.map((row) => [row.code, row]));
    const keptIds = new Set<number>();
    const codeRemaps = new Map<string, string>();
    const payloadByCode = new Map(payloadRows.map((row) => [row.code, row]));

    for (const item of payloadRows) {
      let matchedRow = item.id ? existingById.get(item.id) : undefined;
      if (!matchedRow) {
        matchedRow = existingByCode.get(item.code);
      }

      if (matchedRow) {
        const conflict = existingByCode.get(item.code);
        if (conflict && conflict.id !== matchedRow.id) {
          throw new ApiError(400, `Kode komponen nilai duplikat: ${item.code}`);
        }

        await tx.examGradeComponent.update({
          where: { id: matchedRow.id },
          data: {
            code: item.code,
            label: item.label,
            type: item.type,
            typeCode: item.typeCode,
            entryMode: item.entryMode,
            entryModeCode: item.entryModeCode,
            reportSlot: item.reportSlot,
            reportSlotCode: item.reportSlotCode,
            includeInFinalScore: item.includeInFinalScore,
            description: item.description,
            displayOrder: item.displayOrder,
            isActive: item.isActive,
          },
        });

        keptIds.add(matchedRow.id);
        if (matchedRow.code !== item.code) {
          codeRemaps.set(matchedRow.code, item.code);
          existingByCode.delete(matchedRow.code);
        }

        const updatedRef = {
          id: matchedRow.id,
          code: item.code,
          label: item.label,
          type: item.type,
          typeCode: item.typeCode,
          entryMode: item.entryMode,
          entryModeCode: item.entryModeCode,
          reportSlot: item.reportSlot,
          reportSlotCode: item.reportSlotCode,
          includeInFinalScore: item.includeInFinalScore,
          description: item.description,
          displayOrder: item.displayOrder,
          isActive: item.isActive,
        };
        existingById.set(matchedRow.id, updatedRef);
        existingByCode.set(item.code, updatedRef);
      } else {
        const created = await tx.examGradeComponent.create({
          data: {
            academicYearId,
            code: item.code,
            label: item.label,
            type: item.type,
            typeCode: item.typeCode,
            entryMode: item.entryMode,
            entryModeCode: item.entryModeCode,
            reportSlot: item.reportSlot,
            reportSlotCode: item.reportSlotCode,
            includeInFinalScore: item.includeInFinalScore,
            description: item.description,
            displayOrder: item.displayOrder,
            isActive: item.isActive,
          },
          select: {
            id: true,
            code: true,
            label: true,
            type: true,
            typeCode: true,
            entryMode: true,
            entryModeCode: true,
            reportSlot: true,
            reportSlotCode: true,
            includeInFinalScore: true,
            description: true,
            displayOrder: true,
            isActive: true,
          },
        });
        keptIds.add(created.id);
        existingById.set(created.id, created);
        existingByCode.set(created.code, created);
      }
    }

    for (const [fromCode, toCode] of codeRemaps.entries()) {
      if (fromCode === toCode) continue;
      await tx.examProgramConfig.updateMany({
        where: {
          academicYearId,
          gradeComponentCode: fromCode,
        },
        data: {
          gradeComponentCode: toCode,
        },
      });
    }

    for (const [code, payload] of payloadByCode.entries()) {
      await tx.examProgramConfig.updateMany({
        where: {
          academicYearId,
          gradeComponentCode: code,
        },
        data: {
          gradeComponentType: payload.type,
          gradeComponentTypeCode: payload.typeCode,
          gradeComponentLabel: payload.label,
          gradeEntryMode: payload.entryMode,
          gradeEntryModeCode: payload.entryModeCode,
        },
      });
    }

    const removedRows = existingRows.filter((row) => !keptIds.has(row.id));
    for (const row of removedRows) {
      const usageCount = await tx.examProgramConfig.count({
        where: {
          academicYearId,
          gradeComponentCode: row.code,
        },
      });
      if (usageCount > 0) {
        throw new ApiError(
          400,
          `Komponen ${row.code} sedang dipakai di Program Ujian. Ubah program terkait dulu sebelum menghapus.`,
        );
      }
    }

    if (removedRows.length > 0) {
      await tx.examGradeComponent.deleteMany({
        where: {
          academicYearId,
          id: {
            in: removedRows.map((row) => row.id),
          },
        },
      });
    }
  });

  const rows = await fetchGradeComponentRows(academicYearId);
  return res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId,
        components: mapGradeComponents(rows),
      },
      'Master komponen nilai berhasil diperbarui.',
    ),
  );
});
