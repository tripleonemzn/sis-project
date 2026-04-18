import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Layout, Loader2, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { academicYearService } from '../../../services/academicYear.service';
import { teacherAssignmentService } from '../../../services/teacherAssignment.service';
import {
  examService,
  normalizeExamProgramCode,
  type ExamFinanceClearanceMode,
  type ExamGradeComponent,
  type ExamProgram,
  type ExamProgramBaseType,
  type ExamProgramGradeEntryMode,
  type ExamProgramGradeComponentType,
  type ExamProgramReportSlot,
  type ExamStudentResultPublishMode,
} from '../../../services/exam.service';

type ProgramFormRow = {
  rowId: string;
  configId?: number;
  code: string;
  baseType: ExamProgramBaseType;
  baseTypeCode: string;
  gradeComponentType: ExamProgramGradeComponentType;
  gradeComponentTypeCode: string;
  gradeComponentCode: string;
  gradeComponentLabel: string;
  gradeEntryMode: ExamProgramGradeEntryMode;
  gradeEntryModeCode: string;
  label: string;
  shortLabel: string;
  description: string;
  fixedSemester: 'ODD' | 'EVEN' | null;
  order: number;
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
  targetClassLevels: string[];
  allowedSubjectIds: number[];
  allowedAuthorIds: number[];
  studentResultPublishMode: ExamStudentResultPublishMode;
  studentResultPublishAt: string;
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
  financeClearanceNotes: string;
  source: 'default' | 'custom' | 'new';
};

type GradeComponentFormRow = {
  rowId: string;
  componentId?: number;
  code: string;
  label: string;
  type: ExamProgramGradeComponentType;
  typeCode: string;
  entryMode: ExamProgramGradeEntryMode;
  entryModeCode: string;
  reportSlot: ExamProgramReportSlot;
  reportSlotCode: string;
  includeInFinalScore: boolean;
  description: string;
  order: number;
  isActive: boolean;
};

type AddProgramDraft = {
  code: string;
  label: string;
  shortLabel: string;
  description: string;
  gradeComponentCode: string;
  fixedSemester: '' | 'ODD' | 'EVEN';
  isActive: boolean;
  showOnTeacherMenu: boolean;
  showOnStudentMenu: boolean;
  targetClassLevels: string[];
  allowedSubjectIds: number[];
  allowedAuthorIds: number[];
  studentResultPublishMode: ExamStudentResultPublishMode;
  studentResultPublishAt: string;
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
  financeClearanceNotes: string;
};

type AddComponentDraft = {
  code: string;
  label: string;
  description: string;
  typeCode: string;
  entryModeCode: string;
  reportSlotCode: string;
  includeInFinalScore: boolean;
  isActive: boolean;
};

type SubjectAssignmentRow = {
  subjectId: number;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  classLevel: string;
};

const GRADE_ENTRY_MODE_OPTIONS: Array<{ value: ExamProgramGradeEntryMode; label: string }> = [
  { value: 'NF_SERIES', label: 'NF Bertahap (NF1-NF6)' },
  { value: 'SINGLE_SCORE', label: 'Satu Nilai (Single)' },
];

const REPORT_SLOT_OPTIONS: Array<{ value: ExamProgramReportSlot; label: string }> = [
  { value: 'NONE', label: 'Tidak masuk rapor' },
  { value: 'FORMATIF', label: 'Formatif' },
  { value: 'SBTS', label: 'SBTS' },
  { value: 'SAS', label: 'SAS/SAT' },
  { value: 'SAT', label: 'SAT' },
  { value: 'US_THEORY', label: 'US Teori' },
  { value: 'US_PRACTICE', label: 'US Praktik' },
];

const COMPONENT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'FORMATIVE', label: 'Formatif' },
  { value: 'MIDTERM', label: 'Tengah Semester' },
  { value: 'FINAL', label: 'Akhir Semester' },
  { value: 'SKILL', label: 'Keterampilan' },
  { value: 'US_THEORY', label: 'US Teori' },
  { value: 'US_PRACTICE', label: 'US Praktik' },
  { value: 'CUSTOM', label: 'Custom' },
];

const TARGET_CLASS_LEVEL_OPTIONS = [
  { value: 'X', label: 'Kelas X' },
  { value: 'XI', label: 'Kelas XI' },
  { value: 'XII', label: 'Kelas XII' },
  { value: 'CALON_SISWA', label: 'Calon Siswa' },
];

const FINANCE_CLEARANCE_MODE_OPTIONS: Array<{ value: ExamFinanceClearanceMode; label: string; hint: string }> = [
  { value: 'BLOCK_ANY_OUTSTANDING', label: 'Blok Semua Tunggakan', hint: 'Ujian diblok jika masih ada outstanding.' },
  { value: 'BLOCK_OVERDUE_ONLY', label: 'Blok Jika Overdue', hint: 'Hanya tunggakan yang lewat jatuh tempo yang memblokir.' },
  { value: 'BLOCK_AMOUNT_THRESHOLD', label: 'Blok Di Atas Nominal', hint: 'Blok jika outstanding mencapai ambang nominal.' },
  { value: 'BLOCK_OVERDUE_OR_AMOUNT', label: 'Blok Overdue / Nominal', hint: 'Blok jika overdue atau nominal outstanding melewati ambang.' },
  { value: 'WARN_ONLY', label: 'Peringatan Saja', hint: 'Status keuangan ditampilkan, tetapi tidak memblokir ujian.' },
  { value: 'IGNORE', label: 'Abaikan Finance', hint: 'Program ujian tidak memakai clearance finance.' },
];
const DEFAULT_FINANCE_CLEARANCE_MODE: ExamFinanceClearanceMode = 'BLOCK_ANY_OUTSTANDING';
const DEFAULT_STUDENT_RESULT_PUBLISH_MODE: ExamStudentResultPublishMode = 'DIRECT';

const STUDENT_RESULT_PUBLISH_MODE_OPTIONS: Array<{
  value: ExamStudentResultPublishMode;
  label: string;
  hint: string;
}> = [
  {
    value: 'DIRECT',
    label: 'Langsung',
    hint: 'Nilai program langsung tampil ke siswa setelah sinkronisasi selesai.',
  },
  {
    value: 'SCHEDULED',
    label: 'Tanggal Tertentu',
    hint: 'Nilai program dibuka pada titimangsa yang Anda atur di program ini.',
  },
  {
    value: 'REPORT_DATE',
    label: 'Ikuti Tanggal Rapor Semester',
    hint: 'Nilai program baru tampil saat tanggal rapor semester tiba.',
  },
];

function normalizeAcademicClassLevel(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (value === '10' || value === 'X') return 'X';
  if (value === '11' || value === 'XI') return 'XI';
  if (value === '12' || value === 'XII') return 'XII';
  return '';
}

function normalizeTargetLevelToken(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (!value) return '';
  const normalizedClassLevel = normalizeAcademicClassLevel(value);
  if (normalizedClassLevel) return normalizedClassLevel;
  if (value === 'CALON_SISWA' || value === 'CALONSISWA' || value === 'CANDIDATE') return 'CALON_SISWA';
  return '';
}

function normalizeClassLevels(raw: unknown): string[] {
  const source = Array.isArray(raw) ? raw : [];
  const deduped = new Set<string>();
  source.forEach((item) => {
    const level = normalizeTargetLevelToken(item);
    if (level) deduped.add(level);
  });
  return Array.from(deduped);
}

function formatTargetScopeLabel(value: string): string {
  if (value === 'X') return 'Kelas X';
  if (value === 'XI') return 'Kelas XI';
  if (value === 'XII') return 'Kelas XII';
  if (value === 'CALON_SISWA') return 'Calon Siswa';
  return value;
}

function normalizeFinanceClearanceMode(raw: unknown): ExamFinanceClearanceMode {
  const normalized = normalizeExamProgramCode(raw) as ExamFinanceClearanceMode;
  return FINANCE_CLEARANCE_MODE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_FINANCE_CLEARANCE_MODE;
}

function normalizeStudentResultPublishMode(raw: unknown): ExamStudentResultPublishMode {
  const normalized = normalizeExamProgramCode(raw) as ExamStudentResultPublishMode;
  return STUDENT_RESULT_PUBLISH_MODE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_STUDENT_RESULT_PUBLISH_MODE;
}

function normalizeDateInputValue(raw: unknown): string {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return '';
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return raw.toISOString().slice(0, 10);
  }
  return '';
}

function shouldShowStudentResultPublishDate(mode: ExamStudentResultPublishMode) {
  return mode === 'SCHEDULED';
}

function getStudentResultPublishSummary(row: {
  studentResultPublishMode: ExamStudentResultPublishMode;
  studentResultPublishAt: string;
}) {
  const mode = normalizeStudentResultPublishMode(row.studentResultPublishMode);
  const option = STUDENT_RESULT_PUBLISH_MODE_OPTIONS.find((item) => item.value === mode);
  if (mode === 'SCHEDULED') {
    return row.studentResultPublishAt
      ? `${option?.label || mode} • ${row.studentResultPublishAt}`
      : `${option?.label || mode} • tanggal belum diatur`;
  }
  return option?.label || mode;
}

function normalizeFinanceAmount(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

function normalizeFinanceOverdueCount(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.round(parsed));
}

function shouldShowFinanceThresholdAmount(mode: ExamFinanceClearanceMode) {
  return mode === 'BLOCK_AMOUNT_THRESHOLD' || mode === 'BLOCK_OVERDUE_OR_AMOUNT';
}

function shouldShowFinanceOverdueCount(mode: ExamFinanceClearanceMode) {
  return mode === 'BLOCK_OVERDUE_ONLY' || mode === 'BLOCK_OVERDUE_OR_AMOUNT';
}

function getFinanceClearanceModeLabel(mode: unknown) {
  const normalized = normalizeFinanceClearanceMode(mode);
  return (
    FINANCE_CLEARANCE_MODE_OPTIONS.find((option) => option.value === normalized)?.label ||
    DEFAULT_FINANCE_CLEARANCE_MODE
  );
}

function getFinanceClearanceSummary(row: {
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
}) {
  const label = getFinanceClearanceModeLabel(row.financeClearanceMode);
  const details: string[] = [];
  if (shouldShowFinanceThresholdAmount(row.financeClearanceMode)) {
    details.push(`Ambang Rp ${new Intl.NumberFormat('id-ID').format(Math.round(row.financeMinOutstandingAmount || 0))}`);
  }
  if (shouldShowFinanceOverdueCount(row.financeClearanceMode)) {
    details.push(`Min overdue ${Math.max(1, Math.round(row.financeMinOverdueInvoices || 1))}`);
  }
  return details.length > 0 ? `${label} • ${details.join(' • ')}` : label;
}

function normalizeNumericIds(raw: unknown): number[] {
  const source = Array.isArray(raw) ? raw : [];
  const deduped = new Set<number>();
  source.forEach((item) => {
    const parsed = Number(item);
    if (Number.isFinite(parsed) && parsed > 0) {
      deduped.add(Math.round(parsed));
    }
  });
  return Array.from(deduped);
}

function getComponentTypeLabel(code: string): string {
  const normalized = normalizeComponentCode(code);
  const option = COMPONENT_TYPE_OPTIONS.find((item) => item.value === normalized);
  return option?.label || normalized || '-';
}

function getEntryModeLabel(code: string): string {
  const normalized = normalizeComponentCode(code);
  const option = GRADE_ENTRY_MODE_OPTIONS.find((item) => item.value === normalized);
  return option?.label || normalized || '-';
}

function getReportSlotLabel(code: string): string {
  const normalized = normalizeComponentCode(code);
  const option = REPORT_SLOT_OPTIONS.find((item) => item.value === normalized);
  return option?.label || normalized || '-';
}

function defaultGradeComponentCodeByBaseType(baseType: ExamProgramBaseType): string {
  if (baseType === 'FORMATIF') return 'FORMATIVE';
  if (baseType === 'SBTS') return 'MIDTERM';
  if (baseType === 'SAS' || baseType === 'SAT') return 'FINAL';
  if (baseType === 'US_PRACTICE') return 'US_PRACTICE';
  if (baseType === 'US_THEORY') return 'US_THEORY';
  return 'CUSTOM_COMPONENT';
}

function normalizeComponentCode(raw: unknown): string {
  return normalizeExamProgramCode(raw);
}

function resolveEntryModeByCode(
  code: string,
  fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE',
): ExamProgramGradeEntryMode {
  const normalized = normalizeComponentCode(code);
  if (normalized === 'NF_SERIES') return 'NF_SERIES';
  if (normalized === 'SINGLE_SCORE') return 'SINGLE_SCORE';
  return fallback;
}

function resolveReportSlotByCode(
  code: string,
  fallback: ExamProgramReportSlot = 'NONE',
): ExamProgramReportSlot {
  const normalized = normalizeComponentCode(code);
  if (normalized === 'FORMATIF') return 'FORMATIF';
  if (normalized === 'SBTS') return 'SBTS';
  if (normalized === 'SAS') return 'SAS';
  if (normalized === 'SAT') return 'SAT';
  if (normalized === 'US_THEORY') return 'US_THEORY';
  if (normalized === 'US_PRACTICE') return 'US_PRACTICE';
  if (normalized === 'NONE') return 'NONE';
  return fallback;
}

function inferGradeEntryModeByCode(code: string, fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE'): ExamProgramGradeEntryMode {
  if (code === 'FORMATIVE') return 'NF_SERIES';
  if (code) return 'SINGLE_SCORE';
  return fallback;
}

function inferGradeComponentTypeByCode(
  code: string,
  fallback: ExamProgramGradeComponentType = 'CUSTOM',
): ExamProgramGradeComponentType {
  if (code === 'FORMATIVE') return 'FORMATIVE';
  if (code === 'MIDTERM') return 'MIDTERM';
  if (code === 'FINAL') return 'FINAL';
  if (code === 'SKILL') return 'SKILL';
  if (code === 'US_PRACTICE') return 'US_PRACTICE';
  if (code === 'US_THEORY') return 'US_THEORY';
  return fallback;
}

function defaultReportSlotByCode(code: string): ExamProgramReportSlot {
  if (code === 'FORMATIVE') return 'FORMATIF';
  if (code === 'MIDTERM') return 'SBTS';
  if (code === 'FINAL') return 'SAS';
  if (code === 'US_THEORY') return 'US_THEORY';
  if (code === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string }; status?: number }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { status?: number } };
    return typeof normalized.response?.status === 'number' ? normalized.response.status : null;
  }
  return null;
}

function defaultIncludeInFinalScoreBySlot(slot: ExamProgramReportSlot): boolean {
  return slot === 'FORMATIF' || slot === 'SBTS' || slot === 'SAS' || slot === 'SAT';
}

function inferBaseTypeByComponentCode(
  componentCode: string,
  fixedSemester: 'ODD' | 'EVEN' | null,
  fallback: ExamProgramBaseType,
): ExamProgramBaseType {
  if (componentCode === 'FORMATIVE') return 'FORMATIF';
  if (componentCode === 'MIDTERM') return 'SBTS';
  if (componentCode === 'FINAL') return fixedSemester === 'EVEN' ? 'SAT' : 'SAS';
  if (componentCode === 'US_PRACTICE') return 'US_PRACTICE';
  if (componentCode === 'US_THEORY') return 'US_THEORY';
  return fallback;
}

function sortRows(rows: ProgramFormRow[]): ProgramFormRow[] {
  return [...rows]
    .map((row) => ({ ...row }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

function sortComponentRows(rows: GradeComponentFormRow[]): GradeComponentFormRow[] {
  return [...rows]
    .map((row) => ({ ...row }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

function normalizeComponentRows(components: ExamGradeComponent[]): GradeComponentFormRow[] {
  if (!Array.isArray(components) || components.length === 0) return [];
  return sortComponentRows(
    components.map((component, index) => {
      const code = normalizeComponentCode(component.code);
      const typeCode = normalizeComponentCode(component.typeCode || component.type || code);
      const entryModeCode = normalizeComponentCode(component.entryModeCode || component.entryMode || inferGradeEntryModeByCode(code));
      const reportSlotCode = normalizeComponentCode(component.reportSlotCode || component.reportSlot || defaultReportSlotByCode(code));
      return {
        rowId: `component-${component.id ?? index}-${code}`,
        componentId: component.id,
        code,
        label: String(component.label || '').trim(),
        type: component.type || inferGradeComponentTypeByCode(typeCode, inferGradeComponentTypeByCode(code)),
        typeCode,
        entryMode: component.entryMode || resolveEntryModeByCode(entryModeCode, inferGradeEntryModeByCode(code)),
        entryModeCode,
        reportSlot: component.reportSlot || resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code)),
        reportSlotCode,
        includeInFinalScore:
          component.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code))),
        description: String(component.description || '').trim(),
        order: Number.isFinite(component.order) ? Number(component.order) : (index + 1) * 10,
        isActive: Boolean(component.isActive),
      };
    }),
  );
}

function fallbackComponentRowsFromPrograms(programRows: ProgramFormRow[]): GradeComponentFormRow[] {
  const seedRows = programRows.map((row) => ({
    code: normalizeComponentCode(row.gradeComponentCode),
    label: String(row.gradeComponentLabel || row.gradeComponentCode || '').trim(),
    type: row.gradeComponentType || inferGradeComponentTypeByCode(row.gradeComponentTypeCode || row.gradeComponentCode),
    typeCode: normalizeComponentCode(row.gradeComponentTypeCode || row.gradeComponentType || row.gradeComponentCode),
    entryMode: row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeEntryModeCode || row.gradeComponentCode),
    entryModeCode: normalizeComponentCode(row.gradeEntryModeCode || row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeComponentCode)),
    reportSlot: defaultReportSlotByCode(row.gradeComponentCode),
    reportSlotCode: defaultReportSlotByCode(row.gradeComponentCode),
    includeInFinalScore: defaultIncludeInFinalScoreBySlot(defaultReportSlotByCode(row.gradeComponentCode)),
    order: row.order,
    description: '',
  }));
  const merged = seedRows.filter((item) => Boolean(item.code));
  const deduped = new Map<string, GradeComponentFormRow>();
  merged.forEach((item, index) => {
    deduped.set(item.code, {
      rowId: `component-fallback-${index}-${item.code}`,
      componentId: undefined,
      code: item.code,
      label: item.label || item.code,
      type: item.type,
      typeCode: item.typeCode,
      entryMode: item.entryMode,
      entryModeCode: item.entryModeCode,
      reportSlot: item.reportSlot,
      reportSlotCode: item.reportSlotCode,
      includeInFinalScore: item.includeInFinalScore,
      description: item.description,
      order: item.order || (index + 1) * 10,
      isActive: true,
    });
  });
  return sortComponentRows(Array.from(deduped.values()));
}

function createNewComponentRow(currentRows: GradeComponentFormRow[]): GradeComponentFormRow {
  const maxOrder = currentRows.reduce((acc, row) => Math.max(acc, row.order), 0);
  return {
    rowId: `component-new-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    componentId: undefined,
    code: '',
    label: '',
    type: 'CUSTOM',
    typeCode: 'CUSTOM',
    entryMode: 'SINGLE_SCORE',
    entryModeCode: 'SINGLE_SCORE',
    reportSlot: 'NONE',
    reportSlotCode: 'NONE',
    includeInFinalScore: false,
    description: '',
    order: maxOrder + 10,
    isActive: true,
  };
}

function fallbackRows(): ProgramFormRow[] {
  return [];
}

function normalizeRows(programs: ExamProgram[]): ProgramFormRow[] {
  if (!Array.isArray(programs) || programs.length === 0) return [];

  return sortRows(
    programs.map((program, index) => {
      const normalizedCode = normalizeExamProgramCode(program.code);
      const identity = program.id ?? (normalizedCode || index);
      const normalizedComponentCode = normalizeComponentCode(
        program.gradeComponentCode || defaultGradeComponentCodeByBaseType(program.baseType),
      );
      const baseTypeCode = normalizeComponentCode(program.baseTypeCode || program.baseType || normalizedCode);
      const gradeComponentTypeCode = normalizeComponentCode(
        program.gradeComponentTypeCode || program.gradeComponentType || normalizedComponentCode,
      );
      const gradeEntryModeCode = normalizeComponentCode(
        program.gradeEntryModeCode || program.gradeEntryMode || inferGradeEntryModeByCode(normalizedComponentCode),
      );
      const fixedSemester = program.fixedSemester || null;
      const derivedBaseType = inferBaseTypeByComponentCode(
        normalizedComponentCode,
        fixedSemester,
        baseTypeCode || program.baseType,
      );
      return {
        rowId: `program-${identity}`,
        configId: program.id,
        code: normalizedCode,
        baseType: derivedBaseType,
        baseTypeCode,
        gradeComponentType: program.gradeComponentType || inferGradeComponentTypeByCode(gradeComponentTypeCode, inferGradeComponentTypeByCode(normalizedComponentCode)),
        gradeComponentTypeCode,
        gradeComponentCode: normalizedComponentCode,
        gradeComponentLabel: String(
          program.gradeComponentLabel || program.shortLabel || program.label || '',
        ).trim(),
        gradeEntryMode: program.gradeEntryMode || resolveEntryModeByCode(gradeEntryModeCode, inferGradeEntryModeByCode(normalizedComponentCode)),
        gradeEntryModeCode,
        label: String(program.label || '').trim(),
        shortLabel: String(program.shortLabel || '').trim(),
        description: String(program.description || '').trim(),
        fixedSemester,
        order: Number.isFinite(program.order) ? Number(program.order) : (index + 1) * 10,
        isActive: Boolean(program.isActive),
        showOnTeacherMenu: Boolean(program.showOnTeacherMenu),
        showOnStudentMenu: Boolean(program.showOnStudentMenu),
        targetClassLevels: normalizeClassLevels(program.targetClassLevels),
        allowedSubjectIds: normalizeNumericIds(program.allowedSubjectIds),
        allowedAuthorIds: normalizeNumericIds(program.allowedAuthorIds),
        studentResultPublishMode: normalizeStudentResultPublishMode(program.studentResultPublishMode),
        studentResultPublishAt: normalizeDateInputValue(program.studentResultPublishAt),
        financeClearanceMode: normalizeFinanceClearanceMode(program.financeClearanceMode),
        financeMinOutstandingAmount: normalizeFinanceAmount(program.financeMinOutstandingAmount),
        financeMinOverdueInvoices: normalizeFinanceOverdueCount(program.financeMinOverdueInvoices),
        financeClearanceNotes: String(program.financeClearanceNotes || '').trim(),
        source: program.source,
      };
    }),
  );
}

function createNewRow(currentRows: ProgramFormRow[], componentRows: GradeComponentFormRow[]): ProgramFormRow {
  const maxOrder = currentRows.reduce((acc, row) => Math.max(acc, row.order), 0);
  const defaultComponent =
    componentRows.find((item) => item.code === 'FORMATIVE') || componentRows.find((item) => item.isActive) || null;
  const defaultComponentCode = defaultComponent?.code || 'FORMATIVE';
  const defaultComponentTypeCode = normalizeComponentCode(
    defaultComponent?.typeCode || defaultComponent?.type || defaultComponentCode,
  );
  const defaultComponentType = defaultComponent?.type || inferGradeComponentTypeByCode(defaultComponentTypeCode, inferGradeComponentTypeByCode(defaultComponentCode));
  const defaultEntryModeCode = normalizeComponentCode(
    defaultComponent?.entryModeCode || defaultComponent?.entryMode || inferGradeEntryModeByCode(defaultComponentCode),
  );
  const defaultEntryMode = defaultComponent?.entryMode || resolveEntryModeByCode(defaultEntryModeCode, inferGradeEntryModeByCode(defaultComponentCode));
  const defaultComponentLabel = defaultComponent?.label || 'Formatif';
  const defaultBaseTypeCode = inferBaseTypeByComponentCode(defaultComponentCode, null, 'FORMATIF');
  return {
    rowId: `new-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    configId: undefined,
    code: '',
    baseType: defaultBaseTypeCode,
    baseTypeCode: defaultBaseTypeCode,
    gradeComponentType: defaultComponentType,
    gradeComponentTypeCode: defaultComponentTypeCode,
    gradeComponentCode: defaultComponentCode,
    gradeComponentLabel: defaultComponentLabel,
    gradeEntryMode: defaultEntryMode,
    gradeEntryModeCode: defaultEntryModeCode,
    label: '',
    shortLabel: '',
    description: '',
    fixedSemester: null,
    order: maxOrder + 10,
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
    targetClassLevels: [],
    allowedSubjectIds: [],
    allowedAuthorIds: [],
    studentResultPublishMode: DEFAULT_STUDENT_RESULT_PUBLISH_MODE,
    studentResultPublishAt: '',
    financeClearanceMode: DEFAULT_FINANCE_CLEARANCE_MODE,
    financeMinOutstandingAmount: 0,
    financeMinOverdueInvoices: 1,
    financeClearanceNotes: '',
    source: 'new',
  };
}

export default function ExamProgramManagementPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [academicYearId, setAcademicYearId] = useState<number | null>(null);
  const [rows, setRows] = useState<ProgramFormRow[]>([]);
  const [componentRows, setComponentRows] = useState<GradeComponentFormRow[]>([]);
  const [editingComponentRowId, setEditingComponentRowId] = useState<string | null>(null);
  const [endpointUnavailable, setEndpointUnavailable] = useState<boolean>(false);
  const [componentsEndpointUnavailable, setComponentsEndpointUnavailable] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [savingComponents, setSavingComponents] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [isAddProgramModalOpen, setIsAddProgramModalOpen] = useState<boolean>(false);
  const [isAddComponentModalOpen, setIsAddComponentModalOpen] = useState<boolean>(false);
  const [subjectAssignmentRows, setSubjectAssignmentRows] = useState<SubjectAssignmentRow[]>([]);
  const [activeTab, setActiveTabState] = useState<'PROGRAM' | 'COMPONENT'>(
    String(searchParams.get('programTab') || '').toLowerCase() === 'component' ? 'COMPONENT' : 'PROGRAM',
  );
  const [editingProgramRowId, setEditingProgramRowId] = useState<string | null>(null);
  const [programDraft, setProgramDraft] = useState<AddProgramDraft>({
    code: '',
    label: '',
    shortLabel: '',
    description: '',
    gradeComponentCode: 'FORMATIVE',
    fixedSemester: '',
    isActive: true,
    showOnTeacherMenu: true,
    showOnStudentMenu: true,
    targetClassLevels: [],
    allowedSubjectIds: [],
    allowedAuthorIds: [],
    studentResultPublishMode: DEFAULT_STUDENT_RESULT_PUBLISH_MODE,
    studentResultPublishAt: '',
    financeClearanceMode: DEFAULT_FINANCE_CLEARANCE_MODE,
    financeMinOutstandingAmount: 0,
    financeMinOverdueInvoices: 1,
    financeClearanceNotes: '',
  });
  const [componentDraft, setComponentDraft] = useState<AddComponentDraft>({
    code: '',
    label: '',
    description: '',
    typeCode: 'CUSTOM',
    entryModeCode: 'SINGLE_SCORE',
    reportSlotCode: 'NONE',
    includeInFinalScore: false,
    isActive: true,
  });
  const [showComponentAdvanced, setShowComponentAdvanced] = useState<boolean>(false);
  const selectedTargetLevels = useMemo(
    () => normalizeClassLevels(programDraft.targetClassLevels),
    [programDraft.targetClassLevels],
  );
  const selectedAcademicLevels = useMemo(
    () =>
      selectedTargetLevels
        .map((level) => normalizeAcademicClassLevel(level))
        .filter((level): level is string => Boolean(level)),
    [selectedTargetLevels],
  );
  const subjectOptions = useMemo(() => {
    const levelSet = new Set(selectedAcademicLevels);
    const relevantRows = subjectAssignmentRows.filter((row) =>
      levelSet.size === 0 ? true : levelSet.has(row.classLevel),
    );
    const subjectsMap = new Map<
      number,
      { id: number; name: string; code: string; teacherNames: Set<string> }
    >();
    relevantRows.forEach((row) => {
      const existing = subjectsMap.get(row.subjectId);
      if (existing) {
        if (row.teacherName) existing.teacherNames.add(row.teacherName);
        return;
      }
      subjectsMap.set(row.subjectId, {
        id: row.subjectId,
        name: row.subjectName,
        code: row.subjectCode,
        teacherNames: row.teacherName ? new Set([row.teacherName]) : new Set<string>(),
      });
    });

    return Array.from(subjectsMap.values())
      .map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        teacherNames: Array.from(item.teacherNames).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedAcademicLevels, subjectAssignmentRows]);

  const setActiveTab = useCallback(
    (next: 'PROGRAM' | 'COMPONENT') => {
      setActiveTabState(next);
      const params = new URLSearchParams(searchParams);
      params.set('programTab', next === 'COMPONENT' ? 'component' : 'program');
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  useEffect(() => {
    const nextTab =
      String(searchParams.get('programTab') || '').toLowerCase() === 'component' ? 'COMPONENT' : 'PROGRAM';
    if (nextTab !== activeTab) {
      setActiveTabState(nextTab);
    }
  }, [activeTab, searchParams]);

  const openAddProgramModal = useCallback(() => {
    const baseRow = createNewRow(rows, componentRows);
    setProgramDraft({
      code: '',
      label: '',
      shortLabel: '',
      description: '',
      gradeComponentCode: baseRow.gradeComponentCode || 'FORMATIVE',
      fixedSemester: '',
      isActive: true,
      showOnTeacherMenu: true,
      showOnStudentMenu: true,
      targetClassLevels: [],
      allowedSubjectIds: [],
      allowedAuthorIds: [],
      studentResultPublishMode: DEFAULT_STUDENT_RESULT_PUBLISH_MODE,
      studentResultPublishAt: '',
      financeClearanceMode: DEFAULT_FINANCE_CLEARANCE_MODE,
      financeMinOutstandingAmount: 0,
      financeMinOverdueInvoices: 1,
      financeClearanceNotes: '',
    });
    setEditingProgramRowId(null);
    setIsAddProgramModalOpen(true);
  }, [componentRows, rows]);

  const closeProgramModal = useCallback(() => {
    setIsAddProgramModalOpen(false);
    setEditingProgramRowId(null);
  }, []);

  const openEditProgramModal = useCallback(
    (rowId: string) => {
      const target = rows.find((item) => item.rowId === rowId);
      if (!target) return;
      setProgramDraft({
        code: target.code,
        label: target.label,
        shortLabel: target.shortLabel || '',
        description: target.description || '',
        gradeComponentCode: normalizeComponentCode(target.gradeComponentCode || 'FORMATIVE'),
        fixedSemester: target.fixedSemester || '',
        isActive: target.isActive,
        showOnTeacherMenu: target.showOnTeacherMenu,
        showOnStudentMenu: target.showOnStudentMenu,
        targetClassLevels: normalizeClassLevels(target.targetClassLevels),
        allowedSubjectIds: normalizeNumericIds(target.allowedSubjectIds),
        allowedAuthorIds: normalizeNumericIds(target.allowedAuthorIds),
        studentResultPublishMode: normalizeStudentResultPublishMode(target.studentResultPublishMode),
        studentResultPublishAt: normalizeDateInputValue(target.studentResultPublishAt),
        financeClearanceMode: normalizeFinanceClearanceMode(target.financeClearanceMode),
        financeMinOutstandingAmount: normalizeFinanceAmount(target.financeMinOutstandingAmount),
        financeMinOverdueInvoices: normalizeFinanceOverdueCount(target.financeMinOverdueInvoices),
        financeClearanceNotes: String(target.financeClearanceNotes || '').trim(),
      });
      setEditingProgramRowId(rowId);
      setIsAddProgramModalOpen(true);
    },
    [rows],
  );

  const openAddComponentModal = useCallback(() => {
    setComponentDraft({
      code: '',
      label: '',
      description: '',
      typeCode: 'CUSTOM',
      entryModeCode: 'SINGLE_SCORE',
      reportSlotCode: 'NONE',
      includeInFinalScore: false,
      isActive: true,
    });
    setShowComponentAdvanced(false);
    setEditingComponentRowId(null);
    setIsAddComponentModalOpen(true);
  }, []);

  const closeComponentModal = useCallback(() => {
    setIsAddComponentModalOpen(false);
    setEditingComponentRowId(null);
    setShowComponentAdvanced(false);
  }, []);

  const openEditComponentModal = useCallback(
    (rowId: string) => {
      const target = componentRows.find((item) => item.rowId === rowId);
      if (!target) return;
      const draft = {
        code: target.code,
        label: target.label,
        description: target.description || '',
        typeCode: normalizeComponentCode(target.typeCode || target.type || target.code),
        entryModeCode: normalizeComponentCode(target.entryModeCode || target.entryMode || 'SINGLE_SCORE'),
        reportSlotCode: normalizeComponentCode(target.reportSlotCode || target.reportSlot || 'NONE'),
        includeInFinalScore: target.includeInFinalScore,
        isActive: target.isActive,
      };
      setComponentDraft(draft);
      setShowComponentAdvanced(false);
      setEditingComponentRowId(rowId);
      setIsAddComponentModalOpen(true);
    },
    [componentRows],
  );

  const loadPrograms = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const activeYearRes = await academicYearService.getActive();
      const activeYear = activeYearRes?.data;
      if (!activeYear?.id) {
        throw new Error('Tahun ajaran aktif tidak ditemukan.');
      }

      setAcademicYearId(Number(activeYear.id));
      setEndpointUnavailable(false);
      setComponentsEndpointUnavailable(false);

      try {
        const assignmentRes = await teacherAssignmentService.list({
          academicYearId: Number(activeYear.id),
          limit: 1000,
          scope: 'CURRICULUM',
        });
        const assignments = assignmentRes?.data?.assignments || [];
        const normalizedRows: SubjectAssignmentRow[] = assignments
          .map((assignment) => {
            const subjectId = Number(assignment?.subject?.id || 0);
            if (!subjectId) return null;
            return {
              subjectId,
              subjectName: String(assignment?.subject?.name || '').trim(),
              subjectCode: String(assignment?.subject?.code || '').trim(),
              teacherName: String(assignment?.teacher?.name || '').trim(),
              classLevel: normalizeAcademicClassLevel(assignment?.class?.level),
            } as SubjectAssignmentRow;
          })
          .filter((item): item is SubjectAssignmentRow => Boolean(item));
        setSubjectAssignmentRows(normalizedRows);
      } catch (assignmentError) {
        console.error('Gagal memuat opsi mapel/guru untuk scope program ujian', assignmentError);
        setSubjectAssignmentRows([]);
      }

      let nextRows: ProgramFormRow[] = [];
      try {
        const programsRes = await examService.getPrograms({
          academicYearId: Number(activeYear.id),
          roleContext: 'all',
          includeInactive: true,
        });
        nextRows = normalizeRows(programsRes?.data?.programs || []);
        setEndpointUnavailable(false);
      } catch (endpointError: unknown) {
        if (Number(getErrorStatus(endpointError)) === 404) {
          nextRows = fallbackRows();
          setEndpointUnavailable(true);
        } else {
          throw endpointError;
        }
      }
      setRows(nextRows);
      setEditingComponentRowId(null);

      try {
        const componentsRes = await examService.getGradeComponents({
          academicYearId: Number(activeYear.id),
          includeInactive: true,
        });
        const nextComponents = normalizeComponentRows(componentsRes?.data?.components || []);
        setComponentRows(nextComponents);
        setComponentsEndpointUnavailable(false);
      } catch (componentError: unknown) {
        if (Number(getErrorStatus(componentError)) === 404) {
          const fallbackComponents = fallbackComponentRowsFromPrograms(nextRows);
          setComponentRows(fallbackComponents);
          setComponentsEndpointUnavailable(true);
        } else {
          throw componentError;
        }
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err, 'Gagal memuat konfigurasi program ujian.');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrograms();
  }, [loadPrograms]);

  const persistComponentRows = useCallback(
    async (rowsToPersist: GradeComponentFormRow[], successMessage: string): Promise<boolean> => {
      if (!academicYearId) {
        toast.error('Tahun ajaran aktif tidak ditemukan.');
        return false;
      }
      if (componentsEndpointUnavailable) {
        toast.error('Endpoint master komponen nilai belum tersedia di backend.');
        return false;
      }

      const normalizedComponents = rowsToPersist.map((row) => {
        const code = normalizeComponentCode(row.code);
        const typeCode = normalizeComponentCode(row.typeCode || row.type || code);
        const entryModeCode = normalizeComponentCode(
          row.entryModeCode || row.entryMode || inferGradeEntryModeByCode(code),
        );
        const reportSlotCode = normalizeComponentCode(
          row.reportSlotCode || row.reportSlot || defaultReportSlotByCode(code),
        );
        const type = inferGradeComponentTypeByCode(typeCode, row.type || inferGradeComponentTypeByCode(code));
        const entryMode = resolveEntryModeByCode(
          entryModeCode,
          row.entryMode || inferGradeEntryModeByCode(code),
        );
        const reportSlot = resolveReportSlotByCode(
          reportSlotCode,
          row.reportSlot || defaultReportSlotByCode(code),
        );
        return {
          ...row,
          code,
          type,
          typeCode,
          entryMode,
          entryModeCode,
          reportSlot,
          reportSlotCode,
          includeInFinalScore: Boolean(row.includeInFinalScore),
          label: String(row.label || '').trim(),
          description: String(row.description || '').trim(),
        };
      });

      const hasEmptyCode = normalizedComponents.some((row) => !row.code);
      if (hasEmptyCode) {
        toast.error('Kode komponen nilai wajib diisi.');
        return false;
      }

      const hasEmptyLabel = normalizedComponents.some((row) => !row.label);
      if (hasEmptyLabel) {
        toast.error('Label komponen nilai wajib diisi.');
        return false;
      }

      const dedupe = new Set<string>();
      for (const row of normalizedComponents) {
        if (dedupe.has(row.code)) {
          toast.error(`Kode komponen nilai duplikat: ${row.code}`);
          return false;
        }
        dedupe.add(row.code);
      }

      setSavingComponents(true);
      try {
        const response = await examService.updateGradeComponents({
          academicYearId,
          components: normalizedComponents.map((row) => ({
            id: row.componentId ?? null,
            code: row.code,
            label: row.label,
            type: row.type,
            typeCode: row.typeCode,
            entryMode: row.entryMode,
            entryModeCode: row.entryModeCode,
            reportSlot: row.reportSlot,
            reportSlotCode: row.reportSlotCode,
            includeInFinalScore: row.includeInFinalScore,
            description: row.description || null,
            order: row.order,
            isActive: row.isActive,
          })),
        });

        const nextComponents = normalizeComponentRows(response?.data?.components || []);
        setComponentRows(nextComponents);
        setEditingComponentRowId(null);
        await loadPrograms();
        toast.success(successMessage);
        return true;
      } catch (err: unknown) {
        const message = getErrorMessage(err, 'Gagal menyimpan master komponen nilai.');
        toast.error(message);
        return false;
      } finally {
        setSavingComponents(false);
      }
    },
    [academicYearId, componentsEndpointUnavailable, loadPrograms],
  );

  const persistProgramRows = useCallback(
    async (rowsToPersist: ProgramFormRow[], successMessage: string): Promise<boolean> => {
      if (!academicYearId) {
        toast.error('Tahun ajaran aktif tidak ditemukan.');
        return false;
      }

      if (endpointUnavailable) {
        toast.error('Endpoint program ujian belum tersedia di backend. Jalankan update backend terlebih dahulu.');
        return false;
      }

      const componentMap = new Map(
        componentRows.map((component) => [normalizeComponentCode(component.code), component]),
      );

      const normalizedRows = rowsToPersist.map((row) => {
        const normalizedComponentCode = normalizeComponentCode(row.gradeComponentCode);
        const selectedComponent = componentMap.get(normalizedComponentCode);
        const gradeComponentTypeCode = normalizeComponentCode(
          selectedComponent?.typeCode ||
            row.gradeComponentTypeCode ||
            selectedComponent?.type ||
            row.gradeComponentType ||
            normalizedComponentCode,
        );
        const gradeEntryModeCode = normalizeComponentCode(
          selectedComponent?.entryModeCode ||
            row.gradeEntryModeCode ||
            selectedComponent?.entryMode ||
            row.gradeEntryMode ||
            inferGradeEntryModeByCode(normalizedComponentCode),
        );
        const baseTypeCode = normalizeComponentCode(
          row.baseTypeCode ||
            inferBaseTypeByComponentCode(
              normalizedComponentCode,
              row.fixedSemester,
              row.baseType || 'FORMATIF',
            ),
        );
        return {
          ...row,
          code: normalizeExamProgramCode(row.code),
          baseType: inferBaseTypeByComponentCode(
            normalizedComponentCode,
            row.fixedSemester,
            row.baseType || baseTypeCode || 'FORMATIF',
          ),
          baseTypeCode,
          gradeComponentType:
            selectedComponent?.type ||
            inferGradeComponentTypeByCode(gradeComponentTypeCode, row.gradeComponentType),
          gradeComponentTypeCode,
          gradeComponentCode: normalizedComponentCode,
          gradeComponentLabel: String(
            selectedComponent?.label || row.gradeComponentLabel || normalizedComponentCode,
          ).trim(),
          gradeEntryMode:
            selectedComponent?.entryMode ||
            resolveEntryModeByCode(
              gradeEntryModeCode,
              row.gradeEntryMode || inferGradeEntryModeByCode(normalizedComponentCode),
            ),
          gradeEntryModeCode,
          label: String(row.label || '').trim(),
          shortLabel: String(row.shortLabel || '').trim(),
          description: String(row.description || '').trim(),
          targetClassLevels: normalizeClassLevels(row.targetClassLevels),
          allowedSubjectIds: normalizeNumericIds(row.allowedSubjectIds),
          allowedAuthorIds: [],
          studentResultPublishMode: normalizeStudentResultPublishMode(row.studentResultPublishMode),
          studentResultPublishAt: normalizeDateInputValue(row.studentResultPublishAt),
          financeClearanceMode: normalizeFinanceClearanceMode(row.financeClearanceMode),
          financeMinOutstandingAmount: normalizeFinanceAmount(row.financeMinOutstandingAmount),
          financeMinOverdueInvoices: normalizeFinanceOverdueCount(row.financeMinOverdueInvoices),
          financeClearanceNotes: String(row.financeClearanceNotes || '').trim(),
        };
      });

      const hasEmptyCode = normalizedRows.some((row) => !row.code);
      if (hasEmptyCode) {
        toast.error('Kode program ujian wajib diisi.');
        return false;
      }

      const hasEmptyLabel = normalizedRows.some((row) => !row.label);
      if (hasEmptyLabel) {
        toast.error('Label program ujian wajib diisi.');
        return false;
      }

      const hasEmptyComponentCode = normalizedRows.some((row) => !row.gradeComponentCode);
      if (hasEmptyComponentCode) {
        toast.error('Kode komponen nilai wajib diisi.');
        return false;
      }

      const missingComponentRef = normalizedRows.some((row) => !componentMap.has(row.gradeComponentCode));
      if (missingComponentRef) {
        toast.error('Komponen nilai belum terdaftar di Master Komponen Nilai.');
        return false;
      }

      const dedupe = new Set<string>();
      for (const row of normalizedRows) {
        if (dedupe.has(row.code)) {
          toast.error(`Kode program duplikat: ${row.code}`);
          return false;
        }
        if (row.studentResultPublishMode === 'SCHEDULED' && !row.studentResultPublishAt) {
          toast.error(`Tanggal publikasi siswa untuk program ${row.code} wajib diisi.`);
          return false;
        }
        dedupe.add(row.code);
      }

      setSaving(true);
      try {
        const response = await examService.updatePrograms({
          academicYearId,
          programs: normalizedRows.map((row) => ({
            id: row.configId ?? null,
            code: row.code,
            baseType: row.baseType,
            baseTypeCode: row.baseTypeCode,
            gradeComponentType: row.gradeComponentType,
            gradeComponentTypeCode: row.gradeComponentTypeCode,
            gradeComponentCode: row.gradeComponentCode,
            gradeComponentLabel: row.gradeComponentLabel || null,
            gradeEntryMode: row.gradeEntryMode,
            gradeEntryModeCode: row.gradeEntryModeCode,
            label: row.label,
            shortLabel: row.shortLabel || null,
            description: row.description || null,
            fixedSemester: row.fixedSemester,
            order: Number.isFinite(row.order) ? row.order : 0,
            isActive: row.isActive,
            showOnTeacherMenu: row.showOnTeacherMenu,
            showOnStudentMenu: row.showOnStudentMenu,
            targetClassLevels: row.targetClassLevels,
            allowedSubjectIds: row.allowedSubjectIds,
            allowedAuthorIds: [],
            studentResultPublishMode: row.studentResultPublishMode,
            studentResultPublishAt: row.studentResultPublishAt || null,
            financeClearanceMode: row.financeClearanceMode,
            financeMinOutstandingAmount: row.financeMinOutstandingAmount,
            financeMinOverdueInvoices: row.financeMinOverdueInvoices,
            financeClearanceNotes: row.financeClearanceNotes || null,
          })),
        });

        const nextRows = normalizeRows(response?.data?.programs || []);
        setRows(nextRows);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['sidebar-exam-programs'] }),
          queryClient.invalidateQueries({ queryKey: ['teacher-exam-programs'] }),
        ]);
        toast.success(successMessage);
        return true;
      } catch (err: unknown) {
        const message = getErrorMessage(err, 'Gagal menyimpan konfigurasi program ujian.');
        toast.error(message);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [academicYearId, componentRows, endpointUnavailable, queryClient],
  );

  const submitAddProgram = useCallback(async () => {
    const code = normalizeExamProgramCode(programDraft.code);
    const label = String(programDraft.label || '').trim();
    if (!code) {
      toast.error('Kode program wajib diisi.');
      return;
    }
    if (!label) {
      toast.error('Label menu wajib diisi.');
      return;
    }
    if (
      rows.some(
        (row) => row.rowId !== editingProgramRowId && normalizeExamProgramCode(row.code) === code,
      )
    ) {
      toast.error(`Kode program "${code}" sudah ada.`);
      return;
    }

    const selectedComponent =
      componentRows.find(
        (item) => normalizeComponentCode(item.code) === normalizeComponentCode(programDraft.gradeComponentCode),
      ) || componentRows[0];
    const gradeComponentCode = normalizeComponentCode(
      selectedComponent?.code || programDraft.gradeComponentCode || 'FORMATIVE',
    );
    const gradeComponentTypeCode = normalizeComponentCode(
      selectedComponent?.typeCode || selectedComponent?.type || gradeComponentCode,
    );
    const gradeEntryModeCode = normalizeComponentCode(
      selectedComponent?.entryModeCode || selectedComponent?.entryMode || inferGradeEntryModeByCode(gradeComponentCode),
    );
    const fixedSemester = programDraft.fixedSemester ? (programDraft.fixedSemester as 'ODD' | 'EVEN') : null;
    const baseTypeCode = inferBaseTypeByComponentCode(gradeComponentCode, fixedSemester, 'FORMATIF');
    const patch: Partial<ProgramFormRow> = {
      code,
      label,
      shortLabel: String(programDraft.shortLabel || '').trim(),
      description: String(programDraft.description || '').trim(),
      gradeComponentCode,
      gradeComponentTypeCode,
      gradeComponentType: selectedComponent?.type || inferGradeComponentTypeByCode(gradeComponentTypeCode),
      gradeComponentLabel: String(selectedComponent?.label || gradeComponentCode).trim(),
      gradeEntryModeCode,
      gradeEntryMode: selectedComponent?.entryMode || resolveEntryModeByCode(gradeEntryModeCode),
      fixedSemester,
      baseTypeCode,
      baseType: baseTypeCode,
      isActive: programDraft.isActive,
      showOnTeacherMenu: programDraft.showOnTeacherMenu,
      showOnStudentMenu: programDraft.showOnStudentMenu,
      targetClassLevels: normalizeClassLevels(programDraft.targetClassLevels),
      allowedSubjectIds: normalizeNumericIds(programDraft.allowedSubjectIds),
      allowedAuthorIds: [],
      studentResultPublishMode: normalizeStudentResultPublishMode(programDraft.studentResultPublishMode),
      studentResultPublishAt: normalizeDateInputValue(programDraft.studentResultPublishAt),
      financeClearanceMode: normalizeFinanceClearanceMode(programDraft.financeClearanceMode),
      financeMinOutstandingAmount: normalizeFinanceAmount(programDraft.financeMinOutstandingAmount),
      financeMinOverdueInvoices: normalizeFinanceOverdueCount(programDraft.financeMinOverdueInvoices),
      financeClearanceNotes: String(programDraft.financeClearanceNotes || '').trim(),
    };

    if (patch.studentResultPublishMode === 'SCHEDULED' && !patch.studentResultPublishAt) {
      toast.error('Tanggal publikasi siswa wajib diisi jika mode publikasi memakai tanggal tertentu.');
      return;
    }

    const nextRows = editingProgramRowId
      ? sortRows(rows.map((row) => (row.rowId === editingProgramRowId ? { ...row, ...patch } : row)))
      : sortRows([
          ...rows,
          {
            ...createNewRow(rows, componentRows),
            ...patch,
            configId: undefined,
            source: 'new',
          } as ProgramFormRow,
        ]);

    const ok = await persistProgramRows(
      nextRows,
      editingProgramRowId ? 'Program ujian berhasil diperbarui.' : 'Program ujian berhasil ditambahkan.',
    );
    if (ok) {
      closeProgramModal();
    }
  }, [closeProgramModal, componentRows, editingProgramRowId, persistProgramRows, programDraft, rows]);

  const submitAddComponent = useCallback(async () => {
    if (!academicYearId) {
      toast.error('Tahun ajaran aktif tidak ditemukan.');
      return;
    }
    if (componentsEndpointUnavailable) {
      toast.error('Endpoint master komponen nilai belum tersedia di backend.');
      return;
    }

    const code = normalizeComponentCode(componentDraft.code);
    const label = String(componentDraft.label || '').trim();
    if (!code) {
      toast.error('Kode komponen wajib diisi.');
      return;
    }
    if (!label) {
      toast.error('Label komponen wajib diisi.');
      return;
    }
    if (
      componentRows.some(
        (row) => row.rowId !== editingComponentRowId && normalizeComponentCode(row.code) === code,
      )
    ) {
      toast.error(`Kode komponen "${code}" sudah ada.`);
      return;
    }

    const typeCode = normalizeComponentCode(componentDraft.typeCode || inferGradeComponentTypeByCode(code, 'CUSTOM'));
    const entryModeCode = normalizeComponentCode(componentDraft.entryModeCode || inferGradeEntryModeByCode(code, 'SINGLE_SCORE'));
    const reportSlotCode = normalizeComponentCode(componentDraft.reportSlotCode || defaultReportSlotByCode(code));
    const reportSlot = resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code));

    const patch: Partial<GradeComponentFormRow> = {
      code,
      label,
      description: String(componentDraft.description || '').trim(),
      typeCode,
      type: inferGradeComponentTypeByCode(typeCode, inferGradeComponentTypeByCode(code, 'CUSTOM')),
      entryModeCode,
      entryMode: resolveEntryModeByCode(entryModeCode, inferGradeEntryModeByCode(code, 'SINGLE_SCORE')),
      reportSlotCode,
      reportSlot,
      includeInFinalScore:
        componentDraft.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(reportSlot),
      isActive: componentDraft.isActive,
    };

    const nextRows = editingComponentRowId
      ? sortComponentRows(componentRows.map((row) => (row.rowId === editingComponentRowId ? { ...row, ...patch } : row)))
      : sortComponentRows([
          ...componentRows,
          {
            ...createNewComponentRow(componentRows),
            ...patch,
            componentId: undefined,
          } as GradeComponentFormRow,
        ]);

    const normalizedComponents = nextRows.map((row) => {
      const normalizedCode = normalizeComponentCode(row.code);
      const normalizedTypeCode = normalizeComponentCode(row.typeCode || row.type || normalizedCode);
      const normalizedEntryModeCode = normalizeComponentCode(
        row.entryModeCode || row.entryMode || inferGradeEntryModeByCode(normalizedCode),
      );
      const normalizedReportSlotCode = normalizeComponentCode(
        row.reportSlotCode || row.reportSlot || defaultReportSlotByCode(normalizedCode),
      );
      const normalizedType = inferGradeComponentTypeByCode(
        normalizedTypeCode,
        row.type || inferGradeComponentTypeByCode(normalizedCode),
      );
      const normalizedEntryMode = resolveEntryModeByCode(
        normalizedEntryModeCode,
        row.entryMode || inferGradeEntryModeByCode(normalizedCode),
      );
      const normalizedReportSlot = resolveReportSlotByCode(
        normalizedReportSlotCode,
        row.reportSlot || defaultReportSlotByCode(normalizedCode),
      );
      return {
        ...row,
        code: normalizedCode,
        label: String(row.label || '').trim(),
        description: String(row.description || '').trim(),
        type: normalizedType,
        typeCode: normalizedTypeCode,
        entryMode: normalizedEntryMode,
        entryModeCode: normalizedEntryModeCode,
        reportSlot: normalizedReportSlot,
        reportSlotCode: normalizedReportSlotCode,
        includeInFinalScore: Boolean(row.includeInFinalScore),
      };
    });

    const ok = await persistComponentRows(
      normalizedComponents,
      editingComponentRowId
        ? 'Komponen nilai berhasil diperbarui.'
        : 'Komponen nilai baru berhasil ditambahkan.',
    );
    if (ok) {
      closeComponentModal();
    }
  }, [
    academicYearId,
    closeComponentModal,
    componentDraft,
    componentRows,
    componentsEndpointUnavailable,
    editingComponentRowId,
    persistComponentRows,
  ]);

  const removeRow = useCallback(
    async (rowId: string) => {
      const nextRows = sortRows(rows.filter((row) => row.rowId !== rowId));
      await persistProgramRows(nextRows, 'Program ujian berhasil dihapus.');
    },
    [persistProgramRows, rows],
  );

  const removeComponentRow = useCallback(
    async (rowId: string) => {
      const nextRows = sortComponentRows(componentRows.filter((row) => row.rowId !== rowId));
      await persistComponentRows(nextRows, 'Komponen nilai berhasil dihapus.');
    },
    [componentRows, persistComponentRows],
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-white p-6">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Memuat program ujian...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-100 bg-red-50 p-6 space-y-3">
        <p className="text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadPrograms()}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          <RefreshCw className="w-4 h-4" />
          Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {endpointUnavailable ? (
        <div className="order-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Endpoint `Program Ujian` belum tersedia di backend. Data tidak bisa dimuat dari server.
          </p>
        </div>
      ) : null}

      {componentsEndpointUnavailable ? (
        <div className="order-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">
            Endpoint `Master Komponen Nilai` belum tersedia di backend. Data tidak bisa dimuat dari server.
          </p>
        </div>
      ) : null}

      <div className="order-5 bg-white">
        <div className="flex overflow-x-auto gap-4 border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('PROGRAM')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors text-[13px] ${
              activeTab === 'PROGRAM'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Layout className="h-4 w-4" />
            Program Ujian
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('COMPONENT')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 whitespace-nowrap transition-colors text-[13px] ${
              activeTab === 'COMPONENT'
                ? 'border-blue-600 text-blue-600 font-medium'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ClipboardList className="h-4 w-4" />
            Master Komponen Nilai
          </button>
        </div>
      </div>

      <div
        id="master-komponen-section"
        className={`order-6 rounded-xl border border-gray-200 bg-white p-4 space-y-4 ${
          activeTab === 'COMPONENT' ? '' : 'hidden'
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Master Komponen Nilai</h3>
            <p className="text-xs text-gray-500">Kelola daftar komponen nilai yang dipakai di Program Ujian.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openAddComponentModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              Tambah Komponen
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
          <span className="font-semibold">Panduan Aturan Komponen:</span>{' '}
          <span className="font-medium">Tipe</span> = kategori fungsi nilai,{' '}
          <span className="font-medium">Input</span> = cara guru mengisi (bertahap/satu nilai),{' '}
          <span className="font-medium">Slot rapor</span> = posisi komponen pada kalkulasi rapor,{' '}
          <span className="font-medium">Status</span> = aktif/tidak dan ikut nilai akhir atau tidak.
        </div>

        {componentRows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Belum ada komponen nilai. Tambahkan komponen dulu sebelum membuat Program Ujian.
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-10">No</th>
                  <th className="px-3 py-2 w-[36%]">Komponen</th>
                  <th className="px-3 py-2 w-[28%]">Aturan Komponen</th>
                  <th className="px-3 py-2 w-[10%]">Urutan</th>
                  <th className="px-3 py-2 w-[16%]">Status</th>
                  <th className="px-3 py-2 text-right w-[10%]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {componentRows.map((component, index) => (
                  <tr key={component.rowId} className="align-top">
                    <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-gray-900">{component.label || '-'}</p>
                      <p className="text-gray-500">Kode: {component.code || '-'}</p>
                      <p className="text-gray-500 line-clamp-1">{component.description || '-'}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      <p>Tipe: {getComponentTypeLabel(component.typeCode || component.type || '')}</p>
                      <p>Input: {getEntryModeLabel(component.entryModeCode || component.entryMode || '')}</p>
                      <p>Slot rapor: {getReportSlotLabel(component.reportSlotCode || component.reportSlot || '')}</p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{component.order}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            component.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {component.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            component.includeInFinalScore
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {component.includeInFinalScore ? 'Nilai akhir: Ya' : 'Nilai akhir: Tidak'}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditComponentModal(component.rowId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                          title="Edit komponen"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeComponentRow(component.rowId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                          title="Hapus komponen"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div
        id="program-ujian-section"
        className={`order-5 rounded-xl border border-gray-200 bg-white p-4 space-y-3 ${
          activeTab === 'PROGRAM' ? '' : 'hidden'
        }`}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Program Ujian</h3>
            <p className="text-xs text-gray-500">
              Data ditampilkan ringkas agar mudah dibaca. Detail ubah lewat tombol edit.
            </p>
          </div>
          <button
            type="button"
            onClick={openAddProgramModal}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus className="w-4 h-4" />
            Tambah Program
          </button>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
          <span className="font-semibold">Panduan:</span> gunakan popup <span className="font-medium">Tambah/Edit Program</span>{' '}
          untuk mengubah data. Tabel ini hanya ringkasan agar tidak membingungkan.
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-sm text-gray-600">
            Belum ada konfigurasi program ujian. Klik <span className="font-semibold">Tambah Program</span> untuk mulai membuat.
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200">
            <table className="w-full table-fixed text-xs">
              <thead className="bg-gray-50">
                <tr className="text-left uppercase tracking-wide text-gray-500">
                  <th className="px-3 py-2 w-10">No</th>
                  <th className="px-3 py-2 w-[42%]">Program Ujian</th>
                  <th className="px-3 py-2 w-[23%]">Komponen</th>
                  <th className="px-3 py-2 w-[11%]">Semester</th>
                  <th className="px-3 py-2 w-[14%]">Status</th>
                  <th className="px-3 py-2 text-right w-[10%]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, index) => (
                  <tr key={row.rowId} className="align-top">
                    <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-gray-900">{row.label || '-'}</p>
                      <p className="text-gray-500">Kode: {row.code || '-'}</p>
                      <p className="text-gray-500">Publikasi siswa: {getStudentResultPublishSummary(row)}</p>
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-800">{row.gradeComponentLabel || '-'}</p>
                      <p className="text-gray-500">{row.gradeComponentCode || '-'}</p>
                      <p className="text-gray-500">
                        Tingkat:{' '}
                        {row.targetClassLevels.length > 0
                          ? row.targetClassLevels.map((item) => formatTargetScopeLabel(item)).join(', ')
                          : 'Semua tingkat'}
                      </p>
                      <p className="text-gray-500">
                        Mapel: {row.allowedSubjectIds.length > 0 ? `${row.allowedSubjectIds.length} dipilih` : 'Semua'}
                      </p>
                      <p className="text-gray-500">Finance: {getFinanceClearanceSummary(row)}</p>
                      <p className="text-gray-500">Pembuat: Sesuai assignment mapel aktif</p>
                    </td>
                    <td className="px-3 py-2 text-gray-700">
                      {row.fixedSemester === 'ODD'
                        ? 'Ganjil'
                        : row.fixedSemester === 'EVEN'
                          ? 'Genap'
                          : 'Otomatis'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            row.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {row.isActive ? 'Aktif' : 'Nonaktif'}
                        </span>
                        {row.showOnTeacherMenu ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Guru</span>
                        ) : null}
                        {row.showOnStudentMenu ? (
                          <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">Siswa</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditProgramModal(row.rowId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-blue-200 text-blue-700 hover:bg-blue-50"
                          title="Edit program"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeRow(row.rowId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-600 hover:bg-red-50"
                          title="Hapus program"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isAddProgramModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {editingProgramRowId ? 'Edit Program Ujian' : 'Tambah Program Ujian'}
                </h4>
                <p className="text-xs text-gray-500">
                  {editingProgramRowId
                    ? 'Perubahan langsung tersimpan ke database saat klik Simpan.'
                    : 'Program baru langsung tersimpan ke database saat klik Simpan.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeProgramModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                title="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid max-h-[calc(92vh-132px)] grid-cols-1 gap-3 overflow-y-auto p-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Kode Program</span>
                <input
                  value={programDraft.code}
                  onChange={(event) =>
                    setProgramDraft((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: PSAJ"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Label Menu</span>
                <input
                  value={programDraft.label}
                  onChange={(event) => setProgramDraft((prev) => ({ ...prev, label: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: Penilaian Sumatif Akhir Jenjang"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Label Singkat</span>
                <input
                  value={programDraft.shortLabel}
                  onChange={(event) => setProgramDraft((prev) => ({ ...prev, shortLabel: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: PSAJ"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Komponen Nilai</span>
                <select
                  value={programDraft.gradeComponentCode}
                  onChange={(event) =>
                    setProgramDraft((prev) => ({
                      ...prev,
                      gradeComponentCode: normalizeComponentCode(event.target.value),
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {componentRows.map((component) => (
                    <option key={component.rowId} value={component.code}>
                      {component.code} - {component.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Semester Tetap</span>
                <select
                  value={programDraft.fixedSemester}
                  onChange={(event) =>
                    setProgramDraft((prev) => ({
                      ...prev,
                      fixedSemester: event.target.value as '' | 'ODD' | 'EVEN',
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Otomatis</option>
                  <option value="ODD">Ganjil</option>
                  <option value="EVEN">Genap</option>
                </select>
              </label>
              <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-700">Target Tingkat Kelas (opsional)</p>
                <p className="text-[11px] text-gray-500">
                  Kosongkan jika program berlaku untuk semua tingkat.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {TARGET_CLASS_LEVEL_OPTIONS.map((option) => {
                    const checked = programDraft.targetClassLevels.includes(option.value);
                    return (
                      <label
                        key={option.value}
                        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            setProgramDraft((prev) => {
                              const current = new Set(normalizeClassLevels(prev.targetClassLevels));
                              if (event.target.checked) current.add(option.value);
                              else current.delete(option.value);
                              return { ...prev, targetClassLevels: Array.from(current) };
                            })
                          }
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {option.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-700">Mapel Diizinkan (opsional)</p>
                <p className="text-[11px] text-gray-500">
                  Default kategori baru: semua mapel (tanpa pembatasan). Jika dipilih, hanya mapel ini yang bisa dipakai saat buat paket ujian.
                </p>
                <div className="mt-2 max-h-28 overflow-y-auto rounded-lg border border-gray-100">
                  {subjectOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-500">
                      {selectedTargetLevels.length > 0
                        ? `Tidak ada assignment mapel pada tingkat ${selectedTargetLevels.join(', ')}.`
                        : 'Belum ada data mapel dari assignment guru.'}
                    </p>
                  ) : (
                    <div className="space-y-1 p-2">
                      {subjectOptions.map((subject) => {
                        const checked = programDraft.allowedSubjectIds.includes(subject.id);
                        return (
                          <label key={subject.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(event) =>
                                setProgramDraft((prev) => {
                                  const current = new Set(normalizeNumericIds(prev.allowedSubjectIds));
                                  if (event.target.checked) current.add(subject.id);
                                  else current.delete(subject.id);
                                  return { ...prev, allowedSubjectIds: Array.from(current) };
                                })
                              }
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-xs text-gray-500">{subject.code}</span>
                            <span className="text-sm text-gray-700">
                              {subject.name}
                              {subject.teacherNames.length > 0 ? ` -- ${subject.teacherNames.join(', ')}` : ''}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">Publikasi Hasil ke Siswa</p>
                <p className="text-[11px] text-amber-800">
                  Atur kapan nilai program ini boleh terbaca di menu Nilai Saya siswa.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                  {STUDENT_RESULT_PUBLISH_MODE_OPTIONS.map((option) => {
                    const active = programDraft.studentResultPublishMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setProgramDraft((prev) => ({
                            ...prev,
                            studentResultPublishMode: option.value,
                            studentResultPublishAt:
                              option.value === 'SCHEDULED' ? prev.studentResultPublishAt : '',
                          }))
                        }
                        className={`rounded-lg border px-3 py-2 text-left ${
                          active
                            ? 'border-amber-300 bg-white shadow-sm'
                            : 'border-amber-100 bg-white/70 hover:border-amber-200'
                        }`}
                      >
                        <p className="text-xs font-semibold text-gray-900">{option.label}</p>
                        <p className="mt-1 text-[11px] text-gray-600">{option.hint}</p>
                      </button>
                    );
                  })}
                </div>
                {shouldShowStudentResultPublishDate(programDraft.studentResultPublishMode) ? (
                  <label className="mt-3 block space-y-1">
                    <span className="text-xs font-medium text-gray-600">Tanggal Publikasi Siswa</span>
                    <input
                      type="date"
                      value={programDraft.studentResultPublishAt}
                      onChange={(event) =>
                        setProgramDraft((prev) => ({
                          ...prev,
                          studentResultPublishAt: normalizeDateInputValue(event.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                ) : null}
              </div>
              <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-medium text-amber-900">Policy Clearance Finance</p>
                <p className="text-[11px] text-amber-800">
                  Atur apakah program ujian ini harus membaca status tunggakan siswa sebelum ujian dimulai.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {FINANCE_CLEARANCE_MODE_OPTIONS.map((option) => {
                    const active = programDraft.financeClearanceMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setProgramDraft((prev) => ({
                            ...prev,
                            financeClearanceMode: option.value,
                          }))
                        }
                        className={`rounded-lg border px-3 py-2 text-left ${
                          active
                            ? 'border-amber-300 bg-white shadow-sm'
                            : 'border-amber-100 bg-white/70 hover:border-amber-200'
                        }`}
                      >
                        <p className="text-xs font-semibold text-gray-900">{option.label}</p>
                        <p className="mt-1 text-[11px] text-gray-600">{option.hint}</p>
                      </button>
                    );
                  })}
                </div>
                {(shouldShowFinanceThresholdAmount(programDraft.financeClearanceMode) ||
                  shouldShowFinanceOverdueCount(programDraft.financeClearanceMode)) && (
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    {shouldShowFinanceThresholdAmount(programDraft.financeClearanceMode) ? (
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600">Ambang Outstanding</span>
                        <input
                          type="number"
                          min={0}
                          value={programDraft.financeMinOutstandingAmount}
                          onChange={(event) =>
                            setProgramDraft((prev) => ({
                              ...prev,
                              financeMinOutstandingAmount: normalizeFinanceAmount(event.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Contoh: 500000"
                        />
                      </label>
                    ) : null}
                    {shouldShowFinanceOverdueCount(programDraft.financeClearanceMode) ? (
                      <label className="space-y-1">
                        <span className="text-xs font-medium text-gray-600">Minimal Invoice Overdue</span>
                        <input
                          type="number"
                          min={1}
                          value={programDraft.financeMinOverdueInvoices}
                          onChange={(event) =>
                            setProgramDraft((prev) => ({
                              ...prev,
                              financeMinOverdueInvoices: normalizeFinanceOverdueCount(event.target.value),
                            }))
                          }
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                          placeholder="Contoh: 1"
                        />
                      </label>
                    ) : null}
                  </div>
                )}
                <label className="mt-3 block space-y-1">
                  <span className="text-xs font-medium text-gray-600">Catatan Policy (opsional)</span>
                  <textarea
                    value={programDraft.financeClearanceNotes}
                    onChange={(event) =>
                      setProgramDraft((prev) => ({ ...prev, financeClearanceNotes: event.target.value }))
                    }
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Contoh: Ujian akhir jenjang wajib clear minimal daftar ulang."
                  />
                </label>
              </div>
              <div className="md:col-span-2 xl:col-span-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-xs font-medium text-emerald-800">Pembuat Soal Mengikuti Assignment</p>
                <p className="text-[11px] text-emerald-700">
                  Tidak ada pilih guru manual. Guru hanya bisa membuat ujian jika memang memiliki assignment mapel pada tahun ajaran aktif.
                </p>
              </div>
              <div className="md:col-span-2 xl:col-span-4 grid gap-2 sm:grid-cols-3">
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={programDraft.isActive}
                    onChange={(event) =>
                      setProgramDraft((prev) => ({ ...prev, isActive: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Aktif
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={programDraft.showOnTeacherMenu}
                    onChange={(event) =>
                      setProgramDraft((prev) => ({ ...prev, showOnTeacherMenu: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Tampil di Guru
                </label>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={programDraft.showOnStudentMenu}
                    onChange={(event) =>
                      setProgramDraft((prev) => ({ ...prev, showOnStudentMenu: event.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Tampil di Siswa (menu ujian)
                </label>
              </div>
              <label className="space-y-1 md:col-span-2 xl:col-span-4">
                <span className="text-xs font-medium text-gray-600">Deskripsi</span>
                <textarea
                  rows={2}
                  value={programDraft.description}
                  onChange={(event) => setProgramDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Penjelasan singkat tujuan program ujian"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={closeProgramModal}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitAddProgram}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingProgramRowId ? 'Simpan Perubahan' : 'Simpan Program'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isAddComponentModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {editingComponentRowId ? 'Edit Komponen Nilai' : 'Tambah Komponen Nilai'}
                </h4>
                <p className="text-xs text-gray-500">
                  {editingComponentRowId
                    ? 'Perbarui aturan komponen nilai melalui form ini.'
                    : 'Atur komponen yang akan dipakai oleh Program Ujian.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeComponentModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50"
                title="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800 md:col-span-2">
                Komponen baru selalu dibuat sebagai <span className="font-semibold">custom</span>. Isi kode, nama,
                lalu sesuaikan mode lanjutan jika memang dibutuhkan.
              </div>

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Kode Komponen</span>
                <input
                  value={componentDraft.code}
                  onChange={(event) =>
                    setComponentDraft((prev) => ({ ...prev, code: normalizeComponentCode(event.target.value) }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: FORMATIVE"
                />
                <p className="text-[11px] text-gray-500">
                  Dipakai sistem sebagai identitas unik komponen dan penghubung ke Program Ujian.
                </p>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-gray-600">Nama Komponen</span>
                <input
                  value={componentDraft.label}
                  onChange={(event) => setComponentDraft((prev) => ({ ...prev, label: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Contoh: Formatif"
                />
                <p className="text-[11px] text-gray-500">
                  Nama yang ditampilkan ke pengguna (dropdown nilai, label komponen, dan ringkasan UI).
                </p>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-gray-600">Deskripsi</span>
                <textarea
                  rows={2}
                  value={componentDraft.description}
                  onChange={(event) => setComponentDraft((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="Deskripsi singkat komponen nilai"
                />
                <p className="text-[11px] text-gray-500">
                  Catatan internal agar tim paham tujuan komponen ini (opsional).
                </p>
              </label>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 md:col-span-2">
                <p className="font-medium text-gray-800">Preview Dampak Komponen</p>
                <p>Input nilai: {componentDraft.entryModeCode || '-'}</p>
                <p>Masuk slot rapor: {componentDraft.reportSlotCode || '-'}</p>
                <p>Ikut hitung nilai akhir: {componentDraft.includeInFinalScore ? 'Ya' : 'Tidak'}</p>
              </div>

              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={componentDraft.isActive}
                  onChange={(event) => setComponentDraft((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Aktif
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={componentDraft.includeInFinalScore}
                  onChange={(event) =>
                    setComponentDraft((prev) => ({
                      ...prev,
                      includeInFinalScore: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Ikut Nilai Akhir
              </label>

              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowComponentAdvanced((prev) => !prev)}
                  className="text-xs font-medium text-blue-700 hover:underline"
                >
                  {showComponentAdvanced ? 'Sembunyikan mode lanjutan' : 'Tampilkan mode lanjutan'}
                </button>
                {showComponentAdvanced ? (
                  <p className="mt-1 text-[11px] text-gray-500">
                    Mode lanjutan dibatasi pilihan sistem agar konfigurasi tetap valid.
                  </p>
                ) : null}
              </div>

              {showComponentAdvanced ? (
                <>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">Tipe Komponen</span>
                    <select
                      value={componentDraft.typeCode}
                      onChange={(event) =>
                        setComponentDraft((prev) => ({ ...prev, typeCode: normalizeComponentCode(event.target.value) }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {COMPONENT_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">Mode Input</span>
                    <select
                      value={componentDraft.entryModeCode}
                      onChange={(event) =>
                        setComponentDraft((prev) => ({
                          ...prev,
                          entryModeCode: normalizeComponentCode(event.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {GRADE_ENTRY_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-gray-600">Slot Rapor</span>
                    <select
                      value={componentDraft.reportSlotCode}
                      onChange={(event) =>
                        setComponentDraft((prev) => ({
                          ...prev,
                          reportSlotCode: normalizeComponentCode(event.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {REPORT_SLOT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-4 py-3">
              <button
                type="button"
                onClick={closeComponentModal}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={submitAddComponent}
                disabled={savingComponents || componentsEndpointUnavailable}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  savingComponents || componentsEndpointUnavailable
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {savingComponents ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingComponentRowId ? 'Simpan Perubahan' : 'Simpan Komponen'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}
