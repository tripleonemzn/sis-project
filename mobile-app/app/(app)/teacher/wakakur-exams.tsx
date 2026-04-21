import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminClass, AdminSubject, AdminUser, adminApi } from '../../../src/features/admin/adminApi';
import {
  examApi,
  ExamFinanceClearanceMode,
  ExamGradeComponentItem,
  ExamProgramBaseType,
  ExamProgramCode,
  ExamProgramGradeComponentType,
  ExamProgramGradeEntryMode,
  ExamProgramReportDateItem,
  ExamProgramItem,
  ExamProgramReportSlot,
  ExamStudentResultPublishMode,
} from '../../../src/features/exams/examApi';
import {
  ExamDisplayType,
  ExamProgramSession,
  ExamScheduleMakeupOverview,
  ExamScheduleMakeupStudentRow,
  ExamSittingDetail,
  ExamSittingListItem,
  ExamSittingRoomSlot,
  TeacherExamSchedule,
} from '../../../src/features/exams/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type ExamHubSection = 'JADWAL' | 'RUANG' | 'DENAH' | 'MENGAWAS' | 'PROGRAM';
type ExamTypeFilter = 'ALL' | ExamDisplayType;
type ExamSummaryId =
  | 'schedules'
  | 'packets'
  | 'proctors'
  | 'rooms'
  | 'programs'
  | 'active-programs'
  | 'components'
  | 'active-components';
type ExamLabelMap = Record<string, string>;
type ExamSittingStudentRow = NonNullable<ExamSittingDetail['students']>[number];
type ExamProgramDraft = {
  rowId: string;
  configId?: number;
  code: ExamProgramCode;
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
  isCodeLocked: boolean;
};
type ProgramReportDateDraft = {
  key: string;
  semester: 'ODD' | 'EVEN';
  reportType: string;
  programCodes: string[];
  programLabels: string[];
  date: string;
  place: string;
};
type GradeComponentDraft = {
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

const DEFAULT_EXAM_TYPE_LABELS: Record<string, string> = {
  FORMATIF: 'Formatif (Quiz)',
  SBTS: 'SBTS',
  SAS: 'SAS',
  SAT: 'SAT',
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

const VALID_CLASS_LEVEL_SCOPE = new Set(['X', 'XI', 'XII']);
const CLASS_LEVEL_SCOPE_OPTIONS = ['X', 'XI', 'XII'] as const;
const PROGRAM_FIXED_SEMESTER_OPTIONS = [
  { key: 'AUTO', label: 'Otomatis', value: null },
  { key: 'ODD', label: 'Ganjil', value: 'ODD' },
  { key: 'EVEN', label: 'Genap', value: 'EVEN' },
] as const;
const DEFAULT_FINANCE_CLEARANCE_MODE: ExamFinanceClearanceMode = 'BLOCK_ANY_OUTSTANDING';
const DEFAULT_STUDENT_RESULT_PUBLISH_MODE: ExamStudentResultPublishMode = 'DIRECT';
const DEFAULT_REPORT_DATE_PLACE = 'Bekasi';
const REPORT_DATE_SEMESTERS: Array<'ODD' | 'EVEN'> = ['ODD', 'EVEN'];
const STUDENT_RESULT_PUBLISH_MODE_OPTIONS: Array<{
  value: ExamStudentResultPublishMode;
  label: string;
  hint: string;
}> = [
  { value: 'DIRECT', label: 'Langsung', hint: 'Nilai langsung tampil ke siswa setelah sinkronisasi selesai.' },
  { value: 'SCHEDULED', label: 'Tanggal Tertentu', hint: 'Nilai dibuka pada titimangsa yang Anda atur di program ini.' },
  {
    value: 'REPORT_DATE',
    label: 'Ikuti Tanggal Rapor Semester',
    hint: 'Nilai dibuka saat tanggal rapor semester tiba. Atur tanggalnya di Master Tanggal Rapor.',
  },
];
const FINANCE_CLEARANCE_MODE_OPTIONS: Array<{
  value: ExamFinanceClearanceMode;
  label: string;
  hint: string;
}> = [
  { value: 'BLOCK_ANY_OUTSTANDING', label: 'Blok Semua Tunggakan', hint: 'Ujian diblok jika ada outstanding.' },
  { value: 'BLOCK_OVERDUE_ONLY', label: 'Blok Jika Overdue', hint: 'Hanya tunggakan jatuh tempo yang memblokir.' },
  { value: 'BLOCK_AMOUNT_THRESHOLD', label: 'Blok Di Atas Nominal', hint: 'Blok jika outstanding melewati ambang nominal.' },
  { value: 'BLOCK_OVERDUE_OR_AMOUNT', label: 'Blok Overdue / Nominal', hint: 'Blok jika overdue atau nominal melewati ambang.' },
  { value: 'WARN_ONLY', label: 'Peringatan Saja', hint: 'Status keuangan terlihat, tetapi tidak memblokir.' },
  { value: 'IGNORE', label: 'Abaikan Finance', hint: 'Program tidak membaca clearance finance.' },
];

const DAY_LABELS: Record<'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY', string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
  SUNDAY: 'Minggu',
};

const FALLBACK_EXAM_PERIOD_OPTIONS = Array.from({ length: 16 }, (_, index) => ({
  value: String(index + 1),
  label: `Jam Ke-${index + 1}`,
  timeLabel: '',
}));

function hasCurriculumDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

function normalizeFinanceClearanceMode(raw: unknown): ExamFinanceClearanceMode {
  const normalized = normalizeProgramCode(raw) as ExamFinanceClearanceMode;
  return FINANCE_CLEARANCE_MODE_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : DEFAULT_FINANCE_CLEARANCE_MODE;
}

function normalizeStudentResultPublishMode(raw: unknown): ExamStudentResultPublishMode {
  const normalized = normalizeProgramCode(raw) as ExamStudentResultPublishMode;
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

function normalizeReportDateType(raw: unknown, semester: 'ODD' | 'EVEN'): string {
  const normalized = normalizeProgramCode(raw);
  if (normalized === 'FINAL') return semester === 'EVEN' ? 'SAT' : 'SAS';
  if (normalized === 'MIDTERM') return 'SBTS';
  if (normalized === 'FORMATIVE') return 'FORMATIF';
  if (normalized === 'US_TEORI') return 'US_THEORY';
  if (normalized === 'US_PRAKTEK') return 'US_PRACTICE';
  return normalized;
}

function formatSemesterLabel(semester: 'ODD' | 'EVEN') {
  return semester === 'ODD' ? 'Ganjil' : 'Genap';
}

function formatReportTypeLabel(reportType: string) {
  const normalized = normalizeProgramCode(reportType);
  if (normalized === 'FORMATIF') return 'Formatif';
  if (normalized === 'SBTS') return 'SBTS';
  if (normalized === 'SAS') return 'SAS';
  if (normalized === 'SAT') return 'SAT';
  if (normalized === 'US_THEORY') return 'US Teori';
  if (normalized === 'US_PRACTICE') return 'US Praktik';
  return normalized || '-';
}

function buildProgramReportDateDrafts(
  programs: ExamProgramDraft[],
  reportDates: ExamProgramReportDateItem[],
): ProgramReportDateDraft[] {
  const existingByKey = new Map(
    (reportDates || []).map((row) => [`${row.semester}:${normalizeReportDateType(row.reportType, row.semester)}`, row]),
  );
  const rows = new Map<string, ProgramReportDateDraft>();

  programs
    .filter((program) => normalizeStudentResultPublishMode(program.studentResultPublishMode) === 'REPORT_DATE')
    .forEach((program) => {
      const semesters = program.fixedSemester ? [program.fixedSemester] : REPORT_DATE_SEMESTERS;
      semesters.forEach((semester) => {
        const reportType = normalizeReportDateType(program.baseTypeCode || program.baseType || program.code, semester);
        if (!reportType) return;
        const key = `${semester}:${reportType}`;
        const existing = rows.get(key);
        const persisted = existingByKey.get(key);
        if (existing) {
          if (!existing.programCodes.includes(program.code)) existing.programCodes.push(program.code);
          if (!existing.programLabels.includes(program.label || program.code)) existing.programLabels.push(program.label || program.code);
          return;
        }
        rows.set(key, {
          key,
          semester,
          reportType,
          programCodes: [program.code],
          programLabels: [program.label || program.code],
          date: normalizeDateInputValue(persisted?.date),
          place: String(persisted?.place || DEFAULT_REPORT_DATE_PLACE).trim() || DEFAULT_REPORT_DATE_PLACE,
        });
      });
    });

  return Array.from(rows.values()).sort((a, b) => {
    const semesterOrder =
      (a.semester === 'ODD' ? 0 : 1) - (b.semester === 'ODD' ? 0 : 1);
    if (semesterOrder !== 0) return semesterOrder;
    return a.reportType.localeCompare(b.reportType);
  });
}

function snapshotProgramReportDateDrafts(rows: ProgramReportDateDraft[]) {
  return JSON.stringify(
    rows.map((row) => ({
      key: row.key,
      semester: row.semester,
      reportType: normalizeReportDateType(row.reportType, row.semester),
      programCodes: [...row.programCodes].sort((a, b) => a.localeCompare(b)),
      programLabels: [...row.programLabels].sort((a, b) => a.localeCompare(b)),
      date: normalizeDateInputValue(row.date),
      place: String(row.place || '').trim(),
    })),
  );
}

function mapProgramReportDateDraftsToPayload(rows: ProgramReportDateDraft[]): ExamProgramReportDateItem[] {
  return rows.map((row) => ({
    semester: row.semester,
    reportType: normalizeReportDateType(row.reportType, row.semester),
    place: String(row.place || '').trim() || DEFAULT_REPORT_DATE_PLACE,
    date: normalizeDateInputValue(row.date) || null,
  }));
}

function normalizeFinanceAmount(raw: unknown) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Number(parsed.toFixed(2)));
}

function normalizeFinanceOverdueCount(raw: unknown) {
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

function getFinanceClearanceSummary(row: {
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
}) {
  const option = FINANCE_CLEARANCE_MODE_OPTIONS.find(
    (item) => item.value === normalizeFinanceClearanceMode(row.financeClearanceMode),
  );
  const details: string[] = [];
  if (shouldShowFinanceThresholdAmount(row.financeClearanceMode)) {
    details.push(`Ambang Rp ${new Intl.NumberFormat('id-ID').format(Math.round(row.financeMinOutstandingAmount || 0))}`);
  }
  if (shouldShowFinanceOverdueCount(row.financeClearanceMode)) {
    details.push(`Min overdue ${Math.max(1, Math.round(row.financeMinOverdueInvoices || 1))}`);
  }
  return details.length > 0 ? `${option?.label || DEFAULT_FINANCE_CLEARANCE_MODE} • ${details.join(' • ')}` : option?.label || DEFAULT_FINANCE_CLEARANCE_MODE;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
}

function normalizeProgramCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeClassLevelScope(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<string>();
  values.forEach((item) => {
    const normalized = String(item || '').trim().toUpperCase();
    if (VALID_CLASS_LEVEL_SCOPE.has(normalized)) {
      unique.add(normalized);
    }
  });
  return Array.from(unique);
}

function normalizeClassLevelToken(raw: unknown): string {
  const value = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!value) return '';
  if (value === '10' || value === 'X') return 'X';
  if (value === '11' || value === 'XI') return 'XI';
  if (value === '12' || value === 'XII') return 'XII';
  if (value.startsWith('XII')) return 'XII';
  if (value.startsWith('XI')) return 'XI';
  if (value.startsWith('X')) return 'X';
  return '';
}

function normalizeNumericIds(values: unknown): number[] {
  if (!Array.isArray(values)) return [];
  const unique = new Set<number>();
  values.forEach((item) => {
    const parsed = Number(item);
    if (Number.isFinite(parsed) && parsed > 0) {
      unique.add(Math.trunc(parsed));
    }
  });
  return Array.from(unique);
}

function normalizeExamType(raw: string | null | undefined): ExamDisplayType {
  const value = normalizeProgramCode(raw);
  return value || 'FORMATIF';
}

function resolveScheduleExamType(schedule: TeacherExamSchedule): ExamDisplayType {
  return normalizeExamType(schedule.examType || schedule.packet?.type);
}

function resolveScheduleSubject(schedule: TeacherExamSchedule) {
  const subjectName = schedule.subject?.name || schedule.packet?.subject?.name || '-';
  const subjectCode = schedule.subject?.code || schedule.packet?.subject?.code || '-';
  return { subjectName, subjectCode };
}

function normalizeSessionLabel(raw: unknown): string {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeRoomLookupKey(raw: unknown): string {
  return String(raw || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTimeLookupKey(raw: unknown): string {
  const parsed = Date.parse(String(raw || ''));
  return Number.isFinite(parsed) ? String(parsed) : String(raw || '').trim();
}

function buildRoomSlotLookupKey(
  roomName: unknown,
  startTime: unknown,
  endTime: unknown,
  sessionLabel: unknown,
): string {
  return `${normalizeRoomLookupKey(roomName)}::${normalizeTimeLookupKey(startTime)}::${normalizeTimeLookupKey(endTime)}::${normalizeSessionLabel(sessionLabel) || '__no_session__'}`;
}

function buildRoomSessionLookupKey(roomName: unknown, sessionLabel: unknown): string {
  return `${normalizeRoomLookupKey(roomName)}::${normalizeSessionLabel(sessionLabel) || '__no_session__'}`;
}

function compareClassName(a: string, b: string): number {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareExamRoomName(a: unknown, b: unknown): number {
  const normalizeLabel = (value: unknown) =>
    String(value || '')
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const buildMeta = (value: unknown) => {
    const normalizedLabel = normalizeLabel(value);
    const upperLabel = normalizedLabel.toUpperCase().replace(/\./g, '');
    const numericRoomMatch = upperLabel.match(/^(?:RUANG|ROOM|KELAS)\s*(\d+)\s*([A-Z]*)$/);

    if (numericRoomMatch) {
      return {
        category: 0,
        roomNumber: Number(numericRoomMatch[1]),
        suffix: String(numericRoomMatch[2] || '').trim(),
        normalizedLabel,
      };
    }

    if (/^(?:LAB|LABORATORIUM)\b/.test(upperLabel)) {
      return {
        category: 1,
        roomNumber: null,
        suffix: '',
        normalizedLabel,
      };
    }

    if (/^PERPUSTAKAAN\b/.test(upperLabel)) {
      return {
        category: 2,
        roomNumber: null,
        suffix: '',
        normalizedLabel,
      };
    }

    return {
      category: 3,
      roomNumber: null,
      suffix: '',
      normalizedLabel,
    };
  };

  const left = buildMeta(a);
  const right = buildMeta(b);

  if (left.category !== right.category) return left.category - right.category;
  if (left.roomNumber !== null && right.roomNumber !== null && left.roomNumber !== right.roomNumber) {
    return left.roomNumber - right.roomNumber;
  }
  if ((left.roomNumber !== null) !== (right.roomNumber !== null)) {
    return left.roomNumber !== null ? -1 : 1;
  }

  const suffixCompare = left.suffix.localeCompare(right.suffix, 'id', {
    numeric: true,
    sensitivity: 'base',
  });
  if (suffixCompare !== 0) return suffixCompare;

  return left.normalizedLabel.localeCompare(right.normalizedLabel, 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

function extractClassNameFromSittingStudent(student: ExamSittingStudentRow): string {
  if (!student) return '';
  const fromStudentClass = String(student.studentClass?.name || '').trim();
  if (fromStudentClass) return fromStudentClass;
  const fromClass = String(student.class?.name || '').trim();
  if (fromClass) return fromClass;
  return String(student.class_name || '').trim();
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatScheduleSummary(startTime?: string | null, endTime?: string | null) {
  const startLabel = formatDateTime(startTime);
  const endLabel = formatDateTime(endTime);
  if (startLabel === '-' && endLabel === '-') return 'Jadwal belum diatur';
  if (startLabel === '-' || endLabel === '-') return 'Jadwal belum lengkap';
  return `${startLabel} - ${endLabel}`;
}

function formatSessionSummary(sessionLabel?: string | null) {
  const value = String(sessionLabel || '').trim();
  if (!value) return 'Sesi belum diatur';
  return `Sesi ${value}`;
}

function formatDayDateLabel(value?: string | null) {
  if (!value) return 'Tanggal belum diatur';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal belum diatur';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTimeRangeSummary(startTime?: string | null, endTime?: string | null) {
  const startLabel = formatTimeOnly(startTime);
  const endLabel = formatTimeOnly(endTime);
  if (startLabel === '-' && endLabel === '-') return 'Waktu belum diatur';
  if (startLabel === '-' || endLabel === '-') return 'Waktu belum lengkap';
  return `${startLabel} - ${endLabel} WIB`;
}

function getDateKey(value?: string | null) {
  if (!value) return '__no_date__';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '__no_date__';
  return date.toISOString().slice(0, 10);
}

function resolvePeriodLabel(periodNumber?: number | null) {
  const parsed = Number(periodNumber || 0);
  return Number.isInteger(parsed) && parsed > 0 ? `Jam Ke-${parsed}` : 'Slot Jadwal';
}

function getExamDayKey(
  value?: string | null,
):
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY'
  | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;

  const dayIndex = parsed.getDay();
  if (dayIndex === 1) return 'MONDAY';
  if (dayIndex === 2) return 'TUESDAY';
  if (dayIndex === 3) return 'WEDNESDAY';
  if (dayIndex === 4) return 'THURSDAY';
  if (dayIndex === 5) return 'FRIDAY';
  if (dayIndex === 6) return 'SATURDAY';
  return 'SUNDAY';
}

function getExamDayLabel(value?: string | null) {
  const key = getExamDayKey(value);
  return key ? DAY_LABELS[key] : 'Pilih tanggal dulu';
}

function composeScheduleDateTime(date: string, time: string) {
  return `${date}T${time}:00`;
}

function toInputDateValue(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function toInputTimeValue(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const hours = String(parsed.getHours()).padStart(2, '0');
  const minutes = String(parsed.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getMakeupStateMeta(state?: string | null) {
  const normalized = String(state || '').trim().toUpperCase();
  if (normalized === 'OPEN') {
    return {
      label: 'Sedang Dibuka',
      bg: '#ecfdf5',
      border: '#86efac',
      text: '#166534',
    } as const;
  }
  if (normalized === 'UPCOMING') {
    return {
      label: 'Akan Datang',
      bg: '#fff7ed',
      border: '#fdba74',
      text: '#c2410c',
    } as const;
  }
  if (normalized === 'EXPIRED') {
    return {
      label: 'Terlewat',
      bg: '#fff1f2',
      border: '#fda4af',
      text: '#be123c',
    } as const;
  }
  if (normalized === 'REVOKED') {
    return {
      label: 'Dicabut',
      bg: '#f8fafc',
      border: '#cbd5e1',
      text: '#475569',
    } as const;
  }
  return {
    label: 'Belum Diatur',
    bg: '#f8fafc',
    border: '#cbd5e1',
    text: '#475569',
  } as const;
}

function resolveExamTypeLabel(type: string, labels: ExamLabelMap): string {
  const override = labels[type];
  if (!override) return DEFAULT_EXAM_TYPE_LABELS[type] || type;
  const cleaned = String(override).trim();
  return cleaned || DEFAULT_EXAM_TYPE_LABELS[type] || type;
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

function inferGradeEntryModeByCode(code: string, fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE') {
  if (code === 'FORMATIVE') return 'NF_SERIES';
  if (code) return 'SINGLE_SCORE';
  return fallback;
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

function defaultReportSlotByCode(code: string): ExamProgramReportSlot {
  if (code === 'FORMATIVE') return 'FORMATIF';
  if (code === 'MIDTERM') return 'SBTS';
  if (code === 'FINAL') return 'SAS';
  if (code === 'US_THEORY') return 'US_THEORY';
  if (code === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
}

function defaultIncludeInFinalScoreBySlot(slot: ExamProgramReportSlot): boolean {
  const normalized = normalizeProgramCode(slot);
  return normalized === 'FORMATIF' || normalized === 'SBTS' || normalized === 'SAS' || normalized === 'SAT';
}

function resolveEntryModeByCode(
  code: string,
  fallback: ExamProgramGradeEntryMode = 'SINGLE_SCORE',
): ExamProgramGradeEntryMode {
  const normalized = normalizeProgramCode(code);
  if (normalized === 'NF_SERIES') return 'NF_SERIES';
  if (normalized === 'SINGLE_SCORE') return 'SINGLE_SCORE';
  return fallback;
}

function resolveReportSlotByCode(
  code: string,
  fallback: ExamProgramReportSlot = 'NONE',
): ExamProgramReportSlot {
  const normalized = normalizeProgramCode(code);
  if (normalized === 'FORMATIF') return 'FORMATIF';
  if (normalized === 'SBTS') return 'SBTS';
  if (normalized === 'SAS') return 'SAS';
  if (normalized === 'SAT') return 'SAT';
  if (normalized === 'US_THEORY') return 'US_THEORY';
  if (normalized === 'US_PRACTICE') return 'US_PRACTICE';
  if (normalized === 'NONE') return 'NONE';
  return fallback;
}

function normalizeProgramDrafts(programs: ExamProgramItem[]): ExamProgramDraft[] {
  return [...programs]
    .map((item, index) => {
      const normalizedCode = normalizeProgramCode(item.code);
      const componentCode = normalizeProgramCode(item.gradeComponentCode);
      const baseTypeCode = normalizeProgramCode(item.baseTypeCode || item.baseType || normalizedCode);
      const gradeComponentTypeCode = normalizeProgramCode(
        item.gradeComponentTypeCode || item.gradeComponentType || componentCode,
      );
      const gradeEntryModeCode = normalizeProgramCode(
        item.gradeEntryModeCode || item.gradeEntryMode || inferGradeEntryModeByCode(componentCode),
      );
      const fixedSemester = item.fixedSemester || null;
      return {
        rowId: `program-${item.id ?? normalizedCode ?? index}`,
        configId: item.id,
        code: normalizedCode,
        baseType: inferBaseTypeByComponentCode(componentCode, fixedSemester, baseTypeCode || item.baseType || 'FORMATIF'),
        baseTypeCode,
        gradeComponentType: item.gradeComponentType || inferGradeComponentTypeByCode(gradeComponentTypeCode, inferGradeComponentTypeByCode(componentCode)),
        gradeComponentTypeCode,
        gradeComponentCode: componentCode,
        gradeComponentLabel: String(item.gradeComponentLabel || item.shortLabel || item.label || '').trim(),
        gradeEntryMode: item.gradeEntryMode || resolveEntryModeByCode(gradeEntryModeCode, inferGradeEntryModeByCode(componentCode)),
        gradeEntryModeCode,
        label: String(item.label || '').trim(),
        shortLabel: String(item.shortLabel || '').trim(),
        description: String(item.description || '').trim(),
        fixedSemester,
        order: Number.isFinite(item.order) ? Number(item.order) : (index + 1) * 10,
        isActive: Boolean(item.isActive),
        showOnTeacherMenu: Boolean(item.showOnTeacherMenu),
        showOnStudentMenu: Boolean(item.showOnStudentMenu),
        targetClassLevels: normalizeClassLevelScope(item.targetClassLevels),
        allowedSubjectIds: normalizeNumericIds(item.allowedSubjectIds),
        allowedAuthorIds: normalizeNumericIds(item.allowedAuthorIds),
        studentResultPublishMode: normalizeStudentResultPublishMode(item.studentResultPublishMode),
        studentResultPublishAt: normalizeDateInputValue(item.studentResultPublishAt),
        financeClearanceMode: normalizeFinanceClearanceMode(item.financeClearanceMode),
        financeMinOutstandingAmount: normalizeFinanceAmount(item.financeMinOutstandingAmount),
        financeMinOverdueInvoices: normalizeFinanceOverdueCount(item.financeMinOverdueInvoices),
        financeClearanceNotes: String(item.financeClearanceNotes || '').trim(),
        source: item.source || 'custom',
        isCodeLocked: true,
      };
    })
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

function snapshotProgramDrafts(rows: ExamProgramDraft[]) {
  return JSON.stringify(
    rows.map((row) => ({
      configId: row.configId,
      code: row.code,
      baseType: row.baseType,
      baseTypeCode: row.baseTypeCode,
      gradeComponentType: row.gradeComponentType,
      gradeComponentTypeCode: row.gradeComponentTypeCode,
      gradeComponentCode: row.gradeComponentCode,
      gradeComponentLabel: row.gradeComponentLabel,
      gradeEntryMode: row.gradeEntryMode,
      gradeEntryModeCode: row.gradeEntryModeCode,
      label: row.label,
      shortLabel: row.shortLabel,
      description: row.description,
      fixedSemester: row.fixedSemester,
      order: row.order,
      isActive: row.isActive,
      showOnTeacherMenu: row.showOnTeacherMenu,
      showOnStudentMenu: row.showOnStudentMenu,
      targetClassLevels: normalizeClassLevelScope(row.targetClassLevels),
      allowedSubjectIds: normalizeNumericIds(row.allowedSubjectIds),
      allowedAuthorIds: normalizeNumericIds(row.allowedAuthorIds),
      studentResultPublishMode: normalizeStudentResultPublishMode(row.studentResultPublishMode),
      studentResultPublishAt: normalizeDateInputValue(row.studentResultPublishAt),
      financeClearanceMode: normalizeFinanceClearanceMode(row.financeClearanceMode),
      financeMinOutstandingAmount: normalizeFinanceAmount(row.financeMinOutstandingAmount),
      financeMinOverdueInvoices: normalizeFinanceOverdueCount(row.financeMinOverdueInvoices),
      financeClearanceNotes: row.financeClearanceNotes,
      source: row.source,
      isCodeLocked: row.isCodeLocked,
    })),
  );
}

function normalizeComponentDrafts(components: ExamGradeComponentItem[]): GradeComponentDraft[] {
  if (!Array.isArray(components) || components.length === 0) return [];
  return [...components]
    .map((item, index) => {
      const code = normalizeProgramCode(item.code);
      const typeCode = normalizeProgramCode(item.typeCode || item.type || code);
      const entryModeCode = normalizeProgramCode(
        item.entryModeCode || item.entryMode || inferGradeEntryModeByCode(code),
      );
      const reportSlotCode = normalizeProgramCode(
        item.reportSlotCode || item.reportSlot || defaultReportSlotByCode(code),
      );
      const reportSlot = item.reportSlot || resolveReportSlotByCode(reportSlotCode, defaultReportSlotByCode(code));
      return {
        rowId: `component-${item.id ?? index}-${code}`,
        componentId: item.id,
        code,
        label: String(item.label || code).trim(),
        type: item.type || inferGradeComponentTypeByCode(typeCode, inferGradeComponentTypeByCode(code)),
        typeCode,
        entryMode: item.entryMode || resolveEntryModeByCode(entryModeCode, inferGradeEntryModeByCode(code)),
        entryModeCode,
        reportSlot,
        reportSlotCode,
        includeInFinalScore:
          item.includeInFinalScore ?? defaultIncludeInFinalScoreBySlot(reportSlot),
        description: String(item.description || '').trim(),
        order: Number.isFinite(item.order) ? Number(item.order) : (index + 1) * 10,
        isActive: Boolean(item.isActive),
      };
    })
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

function snapshotComponentDrafts(rows: GradeComponentDraft[]) {
  return JSON.stringify(
    rows.map((row) => ({
      componentId: row.componentId,
      code: row.code,
      label: row.label,
      type: row.type,
      typeCode: row.typeCode,
      entryMode: row.entryMode,
      entryModeCode: row.entryModeCode,
      reportSlot: row.reportSlot,
      reportSlotCode: row.reportSlotCode,
      includeInFinalScore: row.includeInFinalScore,
      description: row.description,
      order: row.order,
      isActive: row.isActive,
    })),
  );
}

function createNewProgramDraft(
  rows: ExamProgramDraft[],
  components: GradeComponentDraft[],
): ExamProgramDraft {
  const maxOrder = rows.reduce((acc, row) => Math.max(acc, row.order), 0);
  const defaultComponent = components.find((item) => item.code === 'FORMATIVE') || components[0] || null;
  const componentCode = defaultComponent?.code || 'FORMATIVE';
  const componentTypeCode = normalizeProgramCode(
    defaultComponent?.typeCode || defaultComponent?.type || componentCode,
  );
  const entryModeCode = normalizeProgramCode(
    defaultComponent?.entryModeCode || defaultComponent?.entryMode || inferGradeEntryModeByCode(componentCode),
  );
  const fixedSemester = null;
  const baseTypeCode = inferBaseTypeByComponentCode(componentCode, fixedSemester, 'FORMATIF');
  return {
    rowId: createId('program-new'),
    configId: undefined,
    code: '',
    baseType: baseTypeCode,
    baseTypeCode,
    gradeComponentType: defaultComponent?.type || inferGradeComponentTypeByCode(componentTypeCode, inferGradeComponentTypeByCode(componentCode)),
    gradeComponentTypeCode: componentTypeCode,
    gradeComponentCode: componentCode,
    gradeComponentLabel: defaultComponent?.label || componentCode,
    gradeEntryMode: defaultComponent?.entryMode || resolveEntryModeByCode(entryModeCode, inferGradeEntryModeByCode(componentCode)),
    gradeEntryModeCode: entryModeCode,
    label: '',
    shortLabel: '',
    description: '',
    fixedSemester,
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
    isCodeLocked: false,
  };
}

function createNewComponentDraft(rows: GradeComponentDraft[]): GradeComponentDraft {
  const maxOrder = rows.reduce((acc, row) => Math.max(acc, row.order), 0);
  return {
    rowId: createId('component-new'),
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

const EXAM_SECTION_ITEMS: Array<{ key: ExamHubSection; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'PROGRAM', label: 'Program Ujian', iconName: 'layout' },
  { key: 'JADWAL', label: 'Jadwal Ujian', iconName: 'calendar' },
  { key: 'RUANG', label: 'Ruang Ujian', iconName: 'home' },
  { key: 'MENGAWAS', label: 'Jadwal Mengawas', iconName: 'user-check' },
  { key: 'DENAH', label: 'Generate Denah Ruang', iconName: 'grid' },
];
const CURRICULUM_EXAM_MANAGER_LABEL = 'Wakasek Kurikulum / Sekretaris Kurikulum';

export default function TeacherWakakurExamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const sectionTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(16), lineHeight: scaleLineHeight(24) }),
    [scaleFont, scaleLineHeight],
  );
  const itemTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(15), lineHeight: scaleLineHeight(22) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const paragraphTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );
  const [section, setSection] = useState<ExamHubSection>('JADWAL');
  const [activeSummaryId, setActiveSummaryId] = useState<ExamSummaryId | null>(null);
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>('ALL');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [search, setSearch] = useState('');
  const [expandedScheduleDays, setExpandedScheduleDays] = useState<string[]>([]);
  const [expandedScheduleSlots, setExpandedScheduleSlots] = useState<string[]>([]);
  const [expandedProctorDays, setExpandedProctorDays] = useState<string[]>([]);
  const [expandedProctorSlots, setExpandedProctorSlots] = useState<string[]>([]);
  const [editingAssignmentKey, setEditingAssignmentKey] = useState<string | null>(null);
  const [scheduleEditorVisible, setScheduleEditorVisible] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<TeacherExamSchedule | null>(null);
  const [scheduleEditForm, setScheduleEditForm] = useState({
    subjectId: '',
    classId: '',
    semester: 'ODD' as 'ODD' | 'EVEN',
    date: '',
    startTime: '',
    endTime: '',
    periodNumber: '',
    sessionId: '',
  });
  const [newSchedulePeriodDraft, setNewSchedulePeriodDraft] = useState('');
  const [customSchedulePeriods, setCustomSchedulePeriods] = useState<number[]>([]);
  const [selectedMakeupSchedule, setSelectedMakeupSchedule] = useState<TeacherExamSchedule | null>(null);
  const [makeupOverview, setMakeupOverview] = useState<ExamScheduleMakeupOverview | null>(null);
  const [makeupModalVisible, setMakeupModalVisible] = useState(false);
  const [loadingMakeup, setLoadingMakeup] = useState(false);
  const [savingMakeup, setSavingMakeup] = useState(false);
  const [makeupSearch, setMakeupSearch] = useState('');
  const [makeupForm, setMakeupForm] = useState({
    studentId: '',
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  });
  const [resetSessionTarget, setResetSessionTarget] = useState<ExamScheduleMakeupStudentRow | null>(null);
  const [resetSessionReason, setResetSessionReason] = useState('');
  const [resettingSession, setResettingSession] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [programDrafts, setProgramDrafts] = useState<ExamProgramDraft[]>([]);
  const [programBaseline, setProgramBaseline] = useState<string>('[]');
  const [reportDateDrafts, setReportDateDrafts] = useState<ProgramReportDateDraft[]>([]);
  const [reportDateBaseline, setReportDateBaseline] = useState<string>('[]');
  const [componentDrafts, setComponentDrafts] = useState<GradeComponentDraft[]>([]);
  const [componentBaseline, setComponentBaseline] = useState<string>('[]');
  const [codeEditBackup, setCodeEditBackup] = useState<Record<string, string>>({});
  const [programSubjectSearch, setProgramSubjectSearch] = useState<Record<string, string>>({});
  const [programAuthorSearch, setProgramAuthorSearch] = useState<Record<string, string>>({});
  const isProgramSection = section === 'PROGRAM';
  const openExamSessionCrud = () => {
    router.push('/admin/academic?section=exam-sessions' as never);
  };

  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakakur-exams-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive({ allowStaleOnError: true });
      } catch {
        return null;
      }
    },
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-programs', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: activeYearQuery.data?.id,
        roleContext: 'teacher',
      }),
  });

  const examProgramConfigQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-program-config', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: activeYearQuery.data?.id,
        roleContext: 'all',
        includeInactive: true,
      }),
  });

  const examReportDatesQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-report-dates', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamReportDates({
        academicYearId: activeYearQuery.data?.id,
      }),
  });

  const examGradeComponentsQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-components', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamGradeComponents({
        academicYearId: activeYearQuery.data?.id,
        includeInactive: true,
      }),
  });

  const examTypeLabels = useMemo<ExamLabelMap>(() => {
    const map: ExamLabelMap = {};
    const programs = examProgramsQuery.data?.programs || [];

    programs.forEach((program: ExamProgramItem) => {
      const code = normalizeProgramCode(program?.code);
      const label = String(program?.label || '').trim();
      if (!label) return;
      map[code] = label;
    });

    return map;
  }, [examProgramsQuery.data]);

  const examTypeLabel = useMemo(
    () => (type: string) => resolveExamTypeLabel(type, examTypeLabels),
    [examTypeLabels],
  );

  const schedulesQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-schedules', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => {
      const schedules = await examApi.getTeacherSchedules({
        academicYearId: activeYearQuery.data?.id,
      });
      return schedules;
    },
  });

  const queryEffectiveSemester =
    (examProgramsQuery.data?.programs || []).find(
      (program) => normalizeProgramCode(program.code) === normalizeProgramCode(examTypeFilter),
    )?.fixedSemester ||
    selectedSemester ||
    (activeYearQuery.data?.semester === 'EVEN' ? 'EVEN' : 'ODD');

  const examSittingsQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-sittings', activeYearQuery.data?.id, examTypeFilter, queryEffectiveSemester],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id) && !isProgramSection,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const sittings = await examApi.getExamSittings({
        academicYearId: activeYearQuery.data?.id,
        ...(examTypeFilter !== 'ALL'
          ? {
              examType: examTypeFilter,
              programCode: examTypeFilter,
              semester: queryEffectiveSemester,
            }
          : {}),
      });

      if (!Array.isArray(sittings) || sittings.length === 0) {
        return {
          list: [] as ExamSittingListItem[],
          details: [] as ExamSittingDetail[],
        };
      }

      const detailResults = await Promise.allSettled(
        sittings.map((sitting) => examApi.getExamSittingDetail(Number(sitting.id))),
      );

      const details = detailResults
        .filter(
          (result): result is PromiseFulfilledResult<ExamSittingDetail> =>
            result.status === 'fulfilled' && Boolean(result.value),
        )
        .map((result) => result.value);

      return {
        list: sittings,
        details,
      };
    },
  });

  const roomSlotsQuery = useQuery({
    queryKey: ['mobile-wakakur-room-slots', activeYearQuery.data?.id, examTypeFilter, examTypeFilter !== 'ALL' ? queryEffectiveSemester : 'ALL'],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id) && !isProgramSection,
    staleTime: 60 * 1000,
    queryFn: async () =>
      examApi.getExamSittingRoomSlots({
        academicYearId: Number(activeYearQuery.data?.id),
        ...(examTypeFilter !== 'ALL'
          ? {
              examType: examTypeFilter,
              programCode: examTypeFilter,
              semester: queryEffectiveSemester,
            }
          : {}),
      }),
  });

  const teachersQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-teachers'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => adminApi.listUsers({ role: 'TEACHER' }),
  });

  const subjectsQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-subjects'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => {
      const result = await adminApi.listSubjects({ page: 1, limit: 500 });
      return result.items || [];
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-classes', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id),
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 1000,
        academicYearId: activeYearQuery.data?.id,
      });
      return result.items || [];
    },
  });

  const programSessionsQuery = useQuery({
    queryKey: [
      'mobile-wakakur-program-sessions',
      activeYearQuery.data?.id,
      normalizeProgramCode(editingSchedule?.examType),
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      scheduleEditorVisible &&
      Boolean(activeYearQuery.data?.id) &&
      Boolean(normalizeProgramCode(editingSchedule?.examType)),
    staleTime: 60 * 1000,
    queryFn: async () =>
      examApi.getProgramSessions({
        academicYearId: Number(activeYearQuery.data?.id),
        programCode: normalizeProgramCode(editingSchedule?.examType),
      }),
  });

  const updateProctorMutation = useMutation({
    mutationFn: async (payload: { slot: ExamSittingRoomSlot; proctorId: number | null }) =>
      examApi.updateExamSittingRoomSlotProctor(payload.slot, payload.proctorId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-room-slots'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
      setEditingAssignmentKey(null);
      setTeacherSearch('');
      Alert.alert('Sukses', 'Pengawas ujian berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal memperbarui pengawas.';
      Alert.alert('Gagal', msg);
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => examApi.deleteTeacherSchedule(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] });
      Alert.alert('Sukses', 'Jadwal ujian berhasil dihapus.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal menghapus jadwal ujian.';
      Alert.alert('Gagal', msg);
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async (payload: {
      scheduleId: number;
      data: {
        startTime: string;
        endTime: string;
        periodNumber: number;
        sessionId: number | null;
        subjectId: number;
        classId: number | null;
        semester: 'ODD' | 'EVEN';
      };
    }) => examApi.updateTeacherSchedule(payload.scheduleId, payload.data),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-room-slots'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
      setScheduleEditorVisible(false);
      setEditingSchedule(null);
      setScheduleEditForm({
        subjectId: '',
        classId: '',
        semester: 'ODD',
        date: '',
        startTime: '',
        endTime: '',
        periodNumber: '',
        sessionId: '',
      });
      setNewSchedulePeriodDraft('');
      setCustomSchedulePeriods([]);
      Alert.alert('Sukses', 'Jadwal ujian berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal memperbarui jadwal ujian.';
      Alert.alert('Gagal', msg);
    },
  });

  const updateExamProgramsMutation = useMutation({
    mutationFn: async () => {
      const componentMap = new Map(componentDrafts.map((item) => [normalizeProgramCode(item.code), item]));
      return examApi.updateExamPrograms({
        academicYearId: activeYearQuery.data?.id,
        programs: programDrafts.map((row) => ({
          id: row.configId ?? null,
          code: normalizeProgramCode(row.code),
          baseType: inferBaseTypeByComponentCode(
            normalizeProgramCode(row.gradeComponentCode),
            row.fixedSemester,
            row.baseType || row.baseTypeCode || 'FORMATIF',
          ),
          baseTypeCode: normalizeProgramCode(
            row.baseTypeCode ||
              inferBaseTypeByComponentCode(
                normalizeProgramCode(row.gradeComponentCode),
                row.fixedSemester,
                row.baseType || 'FORMATIF',
              ),
          ),
          gradeComponentType: inferGradeComponentTypeByCode(
            normalizeProgramCode(row.gradeComponentTypeCode || row.gradeComponentType || row.gradeComponentCode),
            row.gradeComponentType || inferGradeComponentTypeByCode(normalizeProgramCode(row.gradeComponentCode)),
          ),
          gradeComponentTypeCode: normalizeProgramCode(
            row.gradeComponentTypeCode || row.gradeComponentType || row.gradeComponentCode,
          ),
          gradeComponentCode: normalizeProgramCode(row.gradeComponentCode),
          gradeComponentLabel: row.gradeComponentLabel || null,
          gradeEntryMode: resolveEntryModeByCode(
            normalizeProgramCode(row.gradeEntryModeCode || row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeComponentCode)),
            row.gradeEntryMode || inferGradeEntryModeByCode(normalizeProgramCode(row.gradeComponentCode)),
          ),
          gradeEntryModeCode: normalizeProgramCode(
            row.gradeEntryModeCode || row.gradeEntryMode || inferGradeEntryModeByCode(row.gradeComponentCode),
          ),
          label: row.label.trim(),
          shortLabel: row.shortLabel.trim() || null,
          description: row.description.trim() || null,
          fixedSemester: row.fixedSemester,
          order: Number.isFinite(row.order) ? row.order : 0,
          isActive: row.isActive,
          showOnTeacherMenu: row.showOnTeacherMenu,
          showOnStudentMenu: row.showOnStudentMenu,
          targetClassLevels: normalizeClassLevelScope(row.targetClassLevels),
          allowedSubjectIds: normalizeNumericIds(row.allowedSubjectIds),
          allowedAuthorIds: normalizeNumericIds(row.allowedAuthorIds),
          studentResultPublishMode: normalizeStudentResultPublishMode(row.studentResultPublishMode),
          studentResultPublishAt: normalizeDateInputValue(row.studentResultPublishAt) || null,
          financeClearanceMode: normalizeFinanceClearanceMode(row.financeClearanceMode),
          financeMinOutstandingAmount: normalizeFinanceAmount(row.financeMinOutstandingAmount),
          financeMinOverdueInvoices: normalizeFinanceOverdueCount(row.financeMinOverdueInvoices),
          financeClearanceNotes: row.financeClearanceNotes.trim() || null,
          ...(function alignFromComponent() {
            const component = componentMap.get(normalizeProgramCode(row.gradeComponentCode));
            if (!component) return {};
            const normalizedComponentCode = normalizeProgramCode(component.code);
            const nextTypeCode = normalizeProgramCode(
              component.typeCode || component.type || normalizedComponentCode,
            );
            const nextEntryModeCode = normalizeProgramCode(
              component.entryModeCode || component.entryMode || inferGradeEntryModeByCode(normalizedComponentCode),
            );
            const nextBaseTypeCode = inferBaseTypeByComponentCode(
              normalizedComponentCode,
              row.fixedSemester,
              row.baseTypeCode || row.baseType,
            );
            return {
              gradeComponentType: component.type,
              gradeComponentTypeCode: nextTypeCode,
              gradeComponentLabel: component.label,
              gradeEntryMode: component.entryMode,
              gradeEntryModeCode: nextEntryModeCode,
              baseTypeCode: nextBaseTypeCode,
              baseType: inferBaseTypeByComponentCode(
                normalizedComponentCode,
                row.fixedSemester,
                row.baseType,
              ),
            };
          })(),
        })),
      });
    },
    onSuccess: async (result) => {
      const nextDrafts = normalizeProgramDrafts(result.programs || []);
      setProgramDrafts(nextDrafts);
      setProgramBaseline(snapshotProgramDrafts(nextDrafts));
      const rebuiltReportDateRows = buildProgramReportDateDrafts(nextDrafts, mapProgramReportDateDraftsToPayload(reportDateDrafts));
      setReportDateDrafts(rebuiltReportDateRows);
      setReportDateBaseline(snapshotProgramReportDateDrafts(rebuiltReportDateRows));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-program-config'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-programs'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-report-dates'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-home-exam-programs'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-teacher-exam-programs'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-student-exam-programs'] }),
      ]);
      Alert.alert('Sukses', 'Konfigurasi program ujian berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan program ujian.';
      Alert.alert('Gagal', msg);
    },
  });

  const updateExamReportDatesMutation = useMutation({
    mutationFn: async () =>
      examApi.updateExamReportDates({
        academicYearId: activeYearQuery.data?.id,
        reportDates: reportDateDrafts.map((row) => ({
          semester: row.semester,
          reportType: normalizeReportDateType(row.reportType, row.semester),
          place: String(row.place || '').trim() || DEFAULT_REPORT_DATE_PLACE,
          date: normalizeDateInputValue(row.date) || null,
        })),
      }),
    onSuccess: async (result) => {
      const nextRows = buildProgramReportDateDrafts(programDrafts, result.reportDates || []);
      setReportDateDrafts(nextRows);
      setReportDateBaseline(snapshotProgramReportDateDrafts(nextRows));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-report-dates'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-student-grade-overview'] }),
      ]);
      Alert.alert('Sukses', 'Master tanggal rapor berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan master tanggal rapor.';
      Alert.alert('Gagal', msg);
    },
  });

  const updateExamComponentsMutation = useMutation({
    mutationFn: async () =>
      examApi.updateExamGradeComponents({
        academicYearId: activeYearQuery.data?.id,
        components: componentDrafts.map((row) => ({
          id: row.componentId ?? null,
          code: normalizeProgramCode(row.code),
          label: row.label.trim(),
          type: inferGradeComponentTypeByCode(
            normalizeProgramCode(row.typeCode || row.type || row.code),
            row.type || inferGradeComponentTypeByCode(normalizeProgramCode(row.code)),
          ),
          typeCode: normalizeProgramCode(row.typeCode || row.type || row.code),
          entryMode: resolveEntryModeByCode(
            normalizeProgramCode(row.entryModeCode || row.entryMode || inferGradeEntryModeByCode(row.code)),
            row.entryMode || inferGradeEntryModeByCode(normalizeProgramCode(row.code)),
          ),
          entryModeCode: normalizeProgramCode(
            row.entryModeCode || row.entryMode || inferGradeEntryModeByCode(row.code),
          ),
          reportSlot: resolveReportSlotByCode(
            normalizeProgramCode(row.reportSlotCode || row.reportSlot || defaultReportSlotByCode(row.code)),
            row.reportSlot || defaultReportSlotByCode(normalizeProgramCode(row.code)),
          ),
          reportSlotCode: normalizeProgramCode(
            row.reportSlotCode || row.reportSlot || defaultReportSlotByCode(row.code),
          ),
          includeInFinalScore: row.includeInFinalScore,
          description: row.description.trim() || null,
          order: Number.isFinite(row.order) ? row.order : 0,
          isActive: row.isActive,
        })),
      }),
    onSuccess: async (result) => {
      const nextComponents = normalizeComponentDrafts(result.components || []);
      setComponentDrafts(nextComponents);
      setComponentBaseline(snapshotComponentDrafts(nextComponents));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-components'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-program-config'] }),
      ]);
      Alert.alert('Sukses', 'Master komponen nilai berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan komponen nilai.';
      Alert.alert('Gagal', msg);
    },
  });

  useEffect(() => {
    if (!examProgramConfigQuery.data?.programs) return;
    const nextDrafts = normalizeProgramDrafts(examProgramConfigQuery.data.programs);
    const timerId = setTimeout(() => {
      setProgramDrafts(nextDrafts);
      setProgramBaseline(snapshotProgramDrafts(nextDrafts));
      setCodeEditBackup({});
    }, 0);
    return () => clearTimeout(timerId);
  }, [examProgramConfigQuery.data]);

  useEffect(() => {
    if (!examProgramConfigQuery.data?.programs) return;
    const nextDrafts = normalizeProgramDrafts(examProgramConfigQuery.data.programs);
    const nextRows = buildProgramReportDateDrafts(nextDrafts, examReportDatesQuery.data?.reportDates || []);
    const timerId = setTimeout(() => {
      setReportDateDrafts(nextRows);
      setReportDateBaseline(snapshotProgramReportDateDrafts(nextRows));
    }, 0);
    return () => clearTimeout(timerId);
  }, [examProgramConfigQuery.data, examReportDatesQuery.data]);

  useEffect(() => {
    const rows = examGradeComponentsQuery.data?.components || [];
    if (rows.length > 0) {
      const normalized = normalizeComponentDrafts(rows);
      const timerId = setTimeout(() => {
        setComponentDrafts(normalized);
        setComponentBaseline(snapshotComponentDrafts(normalized));
      }, 0);
      return () => clearTimeout(timerId);
    }
    if (!examGradeComponentsQuery.isLoading && !examGradeComponentsQuery.isError) {
      // Keep empty state as-is. Do not auto-inject local defaults when backend returns no components.
      const timerId = setTimeout(() => {
        setComponentDrafts([]);
        setComponentBaseline(snapshotComponentDrafts([]));
      }, 0);
      return () => clearTimeout(timerId);
    }
  }, [examGradeComponentsQuery.data, examGradeComponentsQuery.isLoading, examGradeComponentsQuery.isError]);

  const schedules = useMemo(() => schedulesQuery.data || [], [schedulesQuery.data]);
  const examTypeFilterOptions = useMemo<ExamTypeFilter[]>(() => {
    const codes = new Set<string>();
    (examProgramsQuery.data?.programs || []).forEach((program) => {
      const code = normalizeProgramCode(program.code);
      if (code) codes.add(code);
    });
    schedules.forEach((schedule) => {
      const code = resolveScheduleExamType(schedule);
      if (code) codes.add(code);
    });
    return ['ALL', ...Array.from(codes)] as ExamTypeFilter[];
  }, [examProgramsQuery.data?.programs, schedules]);

  const examTypeSelectOptions = useMemo(
    () =>
      examTypeFilterOptions.map((item) => ({
        value: item,
        label: item === 'ALL' ? 'Semua Tipe Ujian' : examTypeLabel(item),
      })),
    [examTypeFilterOptions, examTypeLabel],
  );

  const selectedProgramConfig = useMemo(() => {
    const programs = examProgramsQuery.data?.programs || [];
    return programs.find((program) => normalizeProgramCode(program.code) === normalizeProgramCode(examTypeFilter)) || null;
  }, [examProgramsQuery.data?.programs, examTypeFilter]);

  const effectiveSemester =
    selectedProgramConfig?.fixedSemester ||
    selectedSemester ||
    (activeYearQuery.data?.semester === 'EVEN' ? 'EVEN' : 'ODD');

  const selectedScheduleEditDayLabel = useMemo(
    () => getExamDayLabel(scheduleEditForm.date),
    [scheduleEditForm.date],
  );
  const scheduleEditPeriodOptions = useMemo(() => {
    const collected = new Set<number>();

    schedules.forEach((schedule) => {
      const value = Number(schedule.periodNumber || 0);
      if (Number.isInteger(value) && value > 0) {
        collected.add(value);
      }
    });

    customSchedulePeriods.forEach((value) => {
      if (Number.isInteger(value) && value > 0) {
        collected.add(value);
      }
    });

    const currentValue = Number(scheduleEditForm.periodNumber || 0);
    if (Number.isInteger(currentValue) && currentValue > 0) {
      collected.add(currentValue);
    }

    const values = Array.from(collected).sort((left, right) => left - right);
    if (values.length === 0) {
      return FALLBACK_EXAM_PERIOD_OPTIONS.map((item) => ({
        value: item.value,
        label: item.label,
      }));
    }

    return values.map((value) => ({
      value: String(value),
      label: `Jam Ke-${value}`,
    }));
  }, [customSchedulePeriods, scheduleEditForm.periodNumber, schedules]);
  const scheduleSessionOptions = useMemo(
    () => [
      { value: '', label: 'Tanpa sesi' },
      ...(programSessionsQuery.data || []).map((session: ExamProgramSession) => ({
        value: String(session.id),
        label: session.label,
      })),
    ],
    [programSessionsQuery.data],
  );

  const teachers = useMemo(
    () =>
      (teachersQuery.data || [])
        .map((item: AdminUser) => ({
          id: item.id,
          name: item.name,
          username: item.username,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [teachersQuery.data],
  );

  const subjects = useMemo(
    () =>
      (subjectsQuery.data || [])
        .map((item: AdminSubject) => ({
          id: item.id,
          code: item.code,
          name: item.name,
        }))
        .sort((a, b) => {
          const nameCompare = a.name.localeCompare(b.name, 'id');
          if (nameCompare !== 0) return nameCompare;
          return a.code.localeCompare(b.code, 'id');
        }),
    [subjectsQuery.data],
  );

  const classes = useMemo(
    () =>
      (classesQuery.data || [])
        .map((item: AdminClass) => ({
          id: item.id,
          name: item.name,
          level: item.level,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [classesQuery.data],
  );

  const editingProgramConfig = useMemo(() => {
    const programs = examProgramsQuery.data?.programs || [];
    const targetCode = normalizeProgramCode(editingSchedule?.examType || editingSchedule?.packet?.type || '');
    return programs.find((program) => normalizeProgramCode(program.code) === targetCode) || null;
  }, [editingSchedule?.examType, editingSchedule?.packet?.type, examProgramsQuery.data?.programs]);

  const scheduleEditSubjectOptions = useMemo(() => {
    const allowedSubjectIds = new Set(normalizeNumericIds(editingProgramConfig?.allowedSubjectIds));
    const currentSubjectId = Number(
      scheduleEditForm.subjectId || editingSchedule?.subjectId || editingSchedule?.packet?.subject?.id || 0,
    );
    return subjects
      .filter((subject) => {
        if (allowedSubjectIds.size === 0) return true;
        return allowedSubjectIds.has(subject.id) || subject.id === currentSubjectId;
      })
      .map((subject) => ({
        label: `${subject.name} (${subject.code})`,
        value: String(subject.id),
      }));
  }, [editingProgramConfig?.allowedSubjectIds, editingSchedule?.subjectId, scheduleEditForm.subjectId, subjects]);

  const scheduleEditClassOptions = useMemo(() => {
    const allowedLevels = new Set(normalizeClassLevelScope(editingProgramConfig?.targetClassLevels));
    const currentClassId = Number(scheduleEditForm.classId || editingSchedule?.classId || 0);
    return classes
      .filter((item) => {
        if (allowedLevels.size === 0) return true;
        const normalizedLevel = normalizeClassLevelToken(item.level || item.name);
        return allowedLevels.has(normalizedLevel) || item.id === currentClassId;
      })
      .map((item) => ({
        label: item.name,
        value: String(item.id),
      }));
  }, [classes, editingProgramConfig?.targetClassLevels, editingSchedule?.classId, scheduleEditForm.classId]);

  useEffect(() => {
    if (examTypeFilter === 'ALL') return;
    if (!examTypeFilterOptions.includes(examTypeFilter)) {
      const timerId = setTimeout(() => setExamTypeFilter('ALL'), 0);
      return () => clearTimeout(timerId);
    }
  }, [examTypeFilter, examTypeFilterOptions]);

  useEffect(() => {
    if (selectedProgramConfig?.fixedSemester) {
      setSelectedSemester(selectedProgramConfig.fixedSemester);
      return;
    }
    if (activeYearQuery.data?.semester === 'ODD' || activeYearQuery.data?.semester === 'EVEN') {
      setSelectedSemester(activeYearQuery.data.semester);
    }
  }, [activeYearQuery.data?.semester, selectedProgramConfig?.fixedSemester]);

  useEffect(() => {
    if (!scheduleEditorVisible) return;
    if (!scheduleEditForm.periodNumber) return;
    if (scheduleEditPeriodOptions.some((option) => option.value === scheduleEditForm.periodNumber)) return;
    setScheduleEditForm((prev) => ({ ...prev, periodNumber: '' }));
  }, [scheduleEditForm.periodNumber, scheduleEditPeriodOptions, scheduleEditorVisible]);

  useEffect(() => {
    if (!scheduleEditorVisible) return;
    setScheduleEditForm((prev) => {
      if (!prev.sessionId) return prev;
      const sessionStillExists = scheduleSessionOptions.some((option) => option.value === prev.sessionId);
      return sessionStillExists ? prev : { ...prev, sessionId: '' };
    });
  }, [scheduleEditorVisible, scheduleSessionOptions]);

  useEffect(() => {
    if (!scheduleEditorVisible) return;
    const fixedSemester = editingProgramConfig?.fixedSemester;
    if (fixedSemester !== 'ODD' && fixedSemester !== 'EVEN') return;
    setScheduleEditForm((prev) =>
      prev.semester === fixedSemester
        ? prev
        : { ...prev, semester: fixedSemester },
    );
  }, [editingProgramConfig?.fixedSemester, scheduleEditorVisible]);

  useEffect(() => {
    if (!scheduleEditorVisible) return;
    setScheduleEditForm((prev) => {
      const subjectValid =
        !prev.subjectId || scheduleEditSubjectOptions.some((option) => option.value === prev.subjectId);
      const classValid = !prev.classId || scheduleEditClassOptions.some((option) => option.value === prev.classId);
      if (subjectValid && classValid) return prev;
      return {
        ...prev,
        subjectId: subjectValid ? prev.subjectId : '',
        classId: classValid ? prev.classId : '',
      };
    });
  }, [scheduleEditClassOptions, scheduleEditSubjectOptions, scheduleEditorVisible]);

  const filteredSchedules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules
      .filter((item) => {
        if (activeYearQuery.data?.id && item.academicYearId && Number(item.academicYearId) !== Number(activeYearQuery.data.id)) {
          return false;
        }
        const type = resolveScheduleExamType(item);
        if (examTypeFilter !== 'ALL' && type !== examTypeFilter) return false;
        if (examTypeFilter !== 'ALL' && item.semester && item.semester !== effectiveSemester) return false;
        if (!query) return true;
        const subject = resolveScheduleSubject(item);
        const haystacks = [
          item.class?.name || '',
          item.room || '',
          item.proctor?.name || '',
          subject.subjectName,
          subject.subjectCode,
          item.packet?.title || '',
          type,
          examTypeLabel(type),
        ];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [schedules, activeYearQuery.data, examTypeFilter, search, examTypeLabel, effectiveSemester]);

  const sittingRoomDerived = useMemo(() => {
    const list = examSittingsQuery.data?.list || [];
    const details = examSittingsQuery.data?.details || [];

    const slotAccumulator: Record<string, Set<string>> = {};
    const sessionAccumulator: Record<string, Set<string>> = {};
    const roomOrderByName: Record<string, number> = {};

    const sortedList = [...list].sort((a, b) => {
      const timeA = Date.parse(String(a.startTime || ''));
      const timeB = Date.parse(String(b.startTime || ''));
      if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeA - timeB;
      return compareExamRoomName(a.roomName, b.roomName);
    });

    sortedList.forEach((sitting, index) => {
      const roomName = String(sitting.roomName || '').trim();
      if (!roomName) return;

      if (roomOrderByName[roomName] === undefined) roomOrderByName[roomName] = index;
    });

    details.forEach((sitting) => {
      const roomName = String(sitting.roomName || '').trim();
      if (!roomName) return;
      const slotKey = buildRoomSlotLookupKey(roomName, sitting.startTime, sitting.endTime, sitting.sessionLabel);
      const sessionKey = buildRoomSessionLookupKey(roomName, sitting.sessionLabel);
      const sittingClasses = new Set<string>();

      (sitting.students || []).forEach((student) => {
        const className = extractClassNameFromSittingStudent(student);
        if (!className) return;
        sittingClasses.add(className);

      });

      if (sittingClasses.size === 0) return;
      if (!slotAccumulator[slotKey]) slotAccumulator[slotKey] = new Set<string>();
      if (!sessionAccumulator[sessionKey]) sessionAccumulator[sessionKey] = new Set<string>();
      sittingClasses.forEach((className) => slotAccumulator[slotKey].add(className));
      sittingClasses.forEach((className) => sessionAccumulator[sessionKey].add(className));
    });

    const roomClassMap = Object.fromEntries(
      Object.entries(slotAccumulator).map(([key, classSet]) => [key, Array.from(classSet).sort(compareClassName)]),
    );

    const roomSessionClassMap = Object.fromEntries(
      Object.entries(sessionAccumulator).map(([key, classSet]) => [key, Array.from(classSet).sort(compareClassName)]),
    );

    return {
      roomClassMap,
      roomSessionClassMap,
      roomOrderByName,
    };
  }, [examSittingsQuery.data]);

  const groupedScheduleDays = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        slotMap: Map<
          string,
          {
            key: string;
            subjectName: string;
            subjectCode: string;
            examType: ExamDisplayType;
            startTime: string;
            endTime: string;
            periodNumber: number | null;
            sessionLabel: string | null;
            schedules: TeacherExamSchedule[];
          }
        >;
      }
    >();

    for (const schedule of filteredSchedules) {
      const subject = resolveScheduleSubject(schedule);
      const examType = resolveScheduleExamType(schedule);
      const periodNumber = Number(schedule.periodNumber || 0) || null;
      const dateKey = getDateKey(schedule.startTime);
      const dateLabel = formatDayDateLabel(schedule.startTime);
      const slotKey = [
        dateKey,
        periodNumber || 0,
        schedule.startTime,
        schedule.endTime,
        examType,
        subject.subjectCode,
        normalizeSessionLabel(schedule.sessionLabel),
      ].join('|');

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          dateKey,
          dateLabel,
          slotMap: new Map(),
        });
      }

      const dayEntry = dayMap.get(dateKey)!;
      if (!dayEntry.slotMap.has(slotKey)) {
        dayEntry.slotMap.set(slotKey, {
          key: slotKey,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          examType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          periodNumber,
          sessionLabel: schedule.sessionLabel || null,
          schedules: [],
        });
      }

      dayEntry.slotMap.get(slotKey)!.schedules.push(schedule);
    }

    return Array.from(dayMap.values())
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      .map((day) => ({
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        slots: Array.from(day.slotMap.values())
          .map((slot) => ({
            ...slot,
            schedules: [...slot.schedules].sort((left, right) =>
              String(left.class?.name || 'Calon Siswa').localeCompare(
                String(right.class?.name || 'Calon Siswa'),
                'id',
                { numeric: true, sensitivity: 'base' },
              ),
            ),
          }))
          .sort((left, right) => {
            const timeDiff = new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
            if (timeDiff !== 0) return timeDiff;
            const periodDiff =
              Number(left.periodNumber || Number.MAX_SAFE_INTEGER) -
              Number(right.periodNumber || Number.MAX_SAFE_INTEGER);
            if (periodDiff !== 0) return periodDiff;
            return String(left.subjectName || '').localeCompare(String(right.subjectName || ''), 'id');
          }),
      }));
  }, [filteredSchedules]);

  const groupedScheduleSlots = useMemo(
    () => groupedScheduleDays.flatMap((day) => day.slots),
    [groupedScheduleDays],
  );

  const roomSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        roomName: string;
        totalSchedules: number;
        classes: Set<string>;
        examTypes: Set<ExamDisplayType>;
        noProctorCount: number;
      }
    >();

    for (const schedule of filteredSchedules) {
      const roomName = String(schedule.room || '').trim() || 'Belum Diatur';
      const examType = resolveScheduleExamType(schedule);
      if (!map.has(roomName)) {
        map.set(roomName, {
          roomName,
          totalSchedules: 0,
          classes: new Set<string>(),
          examTypes: new Set<ExamDisplayType>(),
          noProctorCount: 0,
        });
      }

      const row = map.get(roomName)!;
      row.totalSchedules += 1;
      const slotKey = buildRoomSlotLookupKey(
        roomName,
        schedule.startTime,
        schedule.endTime,
        schedule.sessionLabel,
      );
      const roomSessionKey = buildRoomSessionLookupKey(roomName, schedule.sessionLabel);
      const classesFromSittings =
        sittingRoomDerived.roomClassMap[slotKey] ||
        sittingRoomDerived.roomSessionClassMap[roomSessionKey] ||
        [];
      if (classesFromSittings.length > 0) {
        classesFromSittings.forEach((className) => row.classes.add(className));
      } else {
        row.classes.add(schedule.class?.name || '-');
      }
      row.examTypes.add(examType);
      if (!schedule.proctorId) row.noProctorCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => {
      const orderA = sittingRoomDerived.roomOrderByName[a.roomName];
      const orderB = sittingRoomDerived.roomOrderByName[b.roomName];
      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) {
        return orderA - orderB;
      }
      if (a.totalSchedules !== b.totalSchedules) return b.totalSchedules - a.totalSchedules;
      return compareExamRoomName(a.roomName, b.roomName);
    });
  }, [filteredSchedules, sittingRoomDerived]);

  const managedSittings = useMemo(() => {
    const detailsMap = new Map(
      (examSittingsQuery.data?.details || []).map((detail) => [Number(detail.id), detail]),
    );
    const query = search.trim().toLowerCase();

    return (examSittingsQuery.data?.list || [])
      .filter((sitting) => {
        if (examTypeFilter !== 'ALL') {
          const normalizedType = normalizeProgramCode(sitting.examType);
          const normalizedFilter = normalizeProgramCode(examTypeFilter);
          if (normalizedType !== normalizedFilter) return false;
        }
        if (examTypeFilter !== 'ALL' && sitting.semester && sitting.semester !== effectiveSemester) return false;
        if (!query) return true;
        const detail = detailsMap.get(Number(sitting.id));
        const classes = (detail?.students || [])
          .map((student) => extractClassNameFromSittingStudent(student))
          .filter((value): value is string => Boolean(value))
          .join(' ');
        const haystack = [
          sitting.roomName || '',
          sitting.examType || '',
          sitting.sessionLabel || '',
          classes,
          sitting.proctor?.name || '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .map((sitting) => {
        const detail = detailsMap.get(Number(sitting.id));
        const classes = Array.from(
          new Set(
            (detail?.students || [])
              .map((student) => extractClassNameFromSittingStudent(student))
              .filter((value): value is string => Boolean(value)),
          ),
        ).sort(compareClassName);
        const studentCount = detail?.students?.length || Number(sitting._count?.students || 0);
        return {
          ...sitting,
          classes,
          studentCount,
        };
      })
      .sort((a, b) => {
        const timeA = Date.parse(String(a.startTime || ''));
        const timeB = Date.parse(String(b.startTime || ''));
        if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeA - timeB;
        const roomCompare = compareExamRoomName(a.roomName, b.roomName);
        if (roomCompare !== 0) return roomCompare;
        return Number(a.id) - Number(b.id);
      });
  }, [examSittingsQuery.data, examTypeFilter, search, effectiveSemester]);

  const filteredProctorRoomSlots = useMemo(() => {
    const rows = roomSlotsQuery.data?.slots || [];
    const keyword = search.trim().toLowerCase();
    return rows
      .filter((item) => {
        if (!keyword) return true;
        const haystacks = [
          item.roomName || '',
          item.subjectName || '',
          item.subjectCode || '',
          item.proctor?.name || '',
          item.packetTitle || '',
          ...(item.classNames || []),
        ];
        return haystacks.some((value) => String(value || '').toLowerCase().includes(keyword));
      })
      .sort((a, b) => {
        const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (timeDiff !== 0) return timeDiff;
        const roomCompare = compareExamRoomName(a.roomName, b.roomName);
        if (roomCompare !== 0) return roomCompare;
        return String(a.subjectName || '').localeCompare(String(b.subjectName || ''), 'id', {
          numeric: true,
          sensitivity: 'base',
        });
      });
  }, [roomSlotsQuery.data?.slots, search]);

  const groupedProctorDays = useMemo(() => {
    const dayMap = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        slotMap: Map<
          string,
          {
            key: string;
            subjectName: string;
            subjectCode: string | null;
            examType: string;
            startTime: string;
            endTime: string;
            periodNumber: number | null;
            sessionLabel: string | null;
            items: typeof filteredProctorRoomSlots;
          }
        >;
      }
    >();

    filteredProctorRoomSlots.forEach((item) => {
      const dateKey = getDateKey(item.startTime);
      const dateLabel = formatDayDateLabel(item.startTime);
      const periodNumber = Number(item.periodNumber || 0) || null;
      const slotKey = [
        dateKey,
        periodNumber || 0,
        item.startTime,
        item.endTime,
        item.subjectId || item.subjectName,
        normalizeSessionLabel(item.sessionLabel),
      ].join('|');

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          dateKey,
          dateLabel,
          slotMap: new Map(),
        });
      }

      const dayEntry = dayMap.get(dateKey)!;
      if (!dayEntry.slotMap.has(slotKey)) {
        dayEntry.slotMap.set(slotKey, {
          key: slotKey,
          subjectName: item.subjectName,
          subjectCode: item.subjectCode || null,
          examType: item.examType,
          startTime: item.startTime,
          endTime: item.endTime,
          periodNumber,
          sessionLabel: item.sessionLabel || null,
          items: [],
        });
      }

      dayEntry.slotMap.get(slotKey)!.items.push(item);
    });

    return Array.from(dayMap.values())
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      .map((day) => ({
        dateKey: day.dateKey,
        dateLabel: day.dateLabel,
        slots: Array.from(day.slotMap.values())
          .map((slot) => ({
            ...slot,
            items: [...slot.items].sort((left, right) => compareExamRoomName(left.roomName, right.roomName)),
          }))
          .sort((left, right) => {
            const timeDiff = new Date(left.startTime).getTime() - new Date(right.startTime).getTime();
            if (timeDiff !== 0) return timeDiff;
            const periodDiff =
              Number(left.periodNumber || Number.MAX_SAFE_INTEGER) -
              Number(right.periodNumber || Number.MAX_SAFE_INTEGER);
            if (periodDiff !== 0) return periodDiff;
            return String(left.subjectName || '').localeCompare(String(right.subjectName || ''), 'id');
          }),
      }));
  }, [filteredProctorRoomSlots]);

  const teacherOptions = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return teachers.slice(0, 14);
    return teachers
      .filter((item) => {
        const haystacks = [item.name || '', item.username || ''];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      })
      .slice(0, 14);
  }, [teachers, teacherSearch]);

  useEffect(() => {
    const validScheduleDayKeys = new Set(groupedScheduleDays.map((day) => day.dateKey));
    setExpandedScheduleDays((prev) => prev.filter((key) => validScheduleDayKeys.has(key)));
    const validScheduleSlotKeys = new Set(groupedScheduleDays.flatMap((day) => day.slots.map((slot) => slot.key)));
    setExpandedScheduleSlots((prev) => prev.filter((key) => validScheduleSlotKeys.has(key)));

    const validProctorDayKeys = new Set(groupedProctorDays.map((day) => day.dateKey));
    setExpandedProctorDays((prev) => prev.filter((key) => validProctorDayKeys.has(key)));

    const validProctorSlotKeys = new Set(groupedProctorDays.flatMap((day) => day.slots.map((slot) => slot.key)));
    setExpandedProctorSlots((prev) => prev.filter((key) => validProctorSlotKeys.has(key)));
  }, [groupedProctorDays, groupedScheduleDays]);

  const stats = useMemo(() => {
    const noProctorCount = filteredProctorRoomSlots.filter((item) => !item.proctorId).length;
    const readyPacketCount = filteredSchedules.filter((item) => !!item.packetId).length;
    const rooms = new Set((examSittingsQuery.data?.list || []).map((item) => String(item.roomName || '').trim()).filter(Boolean));
    return {
      totalSchedules: filteredSchedules.length,
      noProctorCount,
      readyPacketCount,
      totalRooms: rooms.size,
    };
  }, [examSittingsQuery.data?.list, filteredProctorRoomSlots, filteredSchedules]);

  const programStats = useMemo(() => {
    const activeCount = programDrafts.filter((item) => item.isActive).length;
    const teacherVisible = programDrafts.filter((item) => item.showOnTeacherMenu).length;
    const studentVisible = programDrafts.filter((item) => item.showOnStudentMenu).length;
    return {
      total: programDrafts.length,
      activeCount,
      teacherVisible,
      studentVisible,
    };
  }, [programDrafts]);
  const componentStats = useMemo(() => {
    const activeCount = componentDrafts.filter((item) => item.isActive).length;
    return {
      total: componentDrafts.length,
      activeCount,
    };
  }, [componentDrafts]);

  const summaryCards = useMemo<
    Array<{
      id: ExamSummaryId;
      title: string;
      value: string;
      subtitle: string;
      iconName: React.ComponentProps<typeof Feather>['name'];
      accentColor: string;
    }>
  >(
    () =>
      isProgramSection
        ? [
            {
              id: 'programs',
              title: 'Total Program',
              value: String(programStats.total),
              subtitle: 'Semua program ujian',
              iconName: 'layout',
              accentColor: '#7c3aed',
            },
            {
              id: 'active-programs',
              title: 'Program Aktif',
              value: String(programStats.activeCount),
              subtitle: 'Siap digunakan',
              iconName: 'check-circle',
              accentColor: '#16a34a',
            },
            {
              id: 'components',
              title: 'Total Komponen',
              value: String(componentStats.total),
              subtitle: 'Master komponen nilai',
              iconName: 'clipboard',
              accentColor: '#f59e0b',
            },
            {
              id: 'active-components',
              title: 'Komponen Aktif',
              value: String(componentStats.activeCount),
              subtitle: 'Siap dipakai program',
              iconName: 'check-circle',
              accentColor: '#16a34a',
            },
          ]
        : [
            {
              id: 'schedules',
              title: 'Jadwal Ujian',
              value: String(stats.totalSchedules),
              subtitle: 'Sesuai filter aktif',
              iconName: 'calendar',
              accentColor: '#2563eb',
            },
            {
              id: 'packets',
              title: 'Paket Siap',
              value: String(stats.readyPacketCount),
              subtitle: 'Sudah linked',
              iconName: 'clipboard',
              accentColor: '#f59e0b',
            },
            {
              id: 'proctors',
              title: 'Belum Pengawas',
              value: String(stats.noProctorCount),
              subtitle: 'Perlu assignment',
              iconName: 'user-x',
              accentColor: '#ef4444',
            },
            {
              id: 'rooms',
              title: 'Ruang Aktif',
              value: String(stats.totalRooms),
              subtitle: 'Ruang terpakai',
              iconName: 'home',
              accentColor: '#0ea5e9',
            },
          ],
    [
      componentStats.activeCount,
      componentStats.total,
      isProgramSection,
      programStats.activeCount,
      programStats.total,
      stats.noProctorCount,
      stats.readyPacketCount,
      stats.totalRooms,
      stats.totalSchedules,
    ],
  );

  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;

  const programDirty = useMemo(
    () => snapshotProgramDrafts(programDrafts) !== programBaseline,
    [programBaseline, programDrafts],
  );
  const reportDateDirty = useMemo(
    () => snapshotProgramReportDateDrafts(reportDateDrafts) !== reportDateBaseline,
    [reportDateBaseline, reportDateDrafts],
  );
  const componentDirty = useMemo(
    () => snapshotComponentDrafts(componentDrafts) !== componentBaseline,
    [componentBaseline, componentDrafts],
  );

  const filteredMakeupStudents = useMemo(() => {
    const rows = makeupOverview?.students || [];
    const keyword = makeupSearch.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const haystacks = [row.student.name || '', row.student.nis || '', row.student.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [makeupOverview?.students, makeupSearch]);

  const resetMakeupForm = () => {
    setMakeupForm({
      studentId: '',
      date: '',
      startTime: '',
      endTime: '',
      reason: '',
    });
  };

  const resetSessionForm = () => {
    setResetSessionTarget(null);
    setResetSessionReason('');
  };

  const closeMakeupModal = () => {
    setMakeupModalVisible(false);
    setSelectedMakeupSchedule(null);
    setMakeupOverview(null);
    setMakeupSearch('');
    resetMakeupForm();
    resetSessionForm();
  };

  const loadScheduleMakeupOverview = async (scheduleId: number) => {
    setLoadingMakeup(true);
    try {
      const data = await examApi.getTeacherScheduleMakeupAccess(scheduleId);
      setMakeupOverview(data);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const message = apiError?.response?.data?.message || apiError?.message || 'Gagal memuat data susulan.';
      Alert.alert('Gagal', message);
      setMakeupOverview(null);
    } finally {
      setLoadingMakeup(false);
    }
  };

  const openMakeupModal = async (schedule: TeacherExamSchedule) => {
    setSelectedMakeupSchedule(schedule);
    setMakeupModalVisible(true);
    setMakeupSearch('');
    resetMakeupForm();
    resetSessionForm();
    await loadScheduleMakeupOverview(schedule.id);
  };

  const fillMakeupForm = (row: ExamScheduleMakeupStudentRow) => {
    setMakeupForm({
      studentId: String(row.student.id),
      date: toInputDateValue(row.makeupAccess?.startTime),
      startTime: toInputTimeValue(row.makeupAccess?.startTime),
      endTime: toInputTimeValue(row.makeupAccess?.endTime),
      reason: row.makeupAccess?.reason || '',
    });
  };

  const handleSaveMakeup = async () => {
    if (!selectedMakeupSchedule) {
      Alert.alert('Validasi', 'Pilih jadwal ujian terlebih dahulu.');
      return;
    }
    if (!makeupForm.studentId || !makeupForm.date || !makeupForm.startTime || !makeupForm.endTime) {
      Alert.alert('Validasi', 'Lengkapi siswa, tanggal, jam mulai, dan jam selesai susulan.');
      return;
    }

    setSavingMakeup(true);
    try {
      await examApi.upsertTeacherScheduleMakeupAccess(selectedMakeupSchedule.id, {
        studentId: Number(makeupForm.studentId),
        date: makeupForm.date,
        startTime: makeupForm.startTime,
        endTime: makeupForm.endTime,
        reason: makeupForm.reason.trim() || undefined,
      });
      await loadScheduleMakeupOverview(selectedMakeupSchedule.id);
      resetMakeupForm();
      Alert.alert('Sukses', 'Jadwal susulan berhasil disimpan.');
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const message = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan jadwal susulan.';
      Alert.alert('Gagal', message);
    } finally {
      setSavingMakeup(false);
    }
  };

  const handleRevokeMakeup = (row: ExamScheduleMakeupStudentRow) => {
    if (!selectedMakeupSchedule) return;
    Alert.alert('Cabut Jadwal Susulan', `Cabut jadwal susulan untuk ${row.student.name}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Cabut',
        style: 'destructive',
        onPress: async () => {
          setSavingMakeup(true);
          try {
            await examApi.revokeTeacherScheduleMakeupAccess(selectedMakeupSchedule.id, row.student.id);
            await loadScheduleMakeupOverview(selectedMakeupSchedule.id);
            if (String(row.student.id) === String(makeupForm.studentId)) {
              resetMakeupForm();
            }
            Alert.alert('Sukses', 'Jadwal susulan berhasil dicabut.');
          } catch (error: unknown) {
            const apiError = error as { response?: { data?: { message?: string } }; message?: string };
            const message = apiError?.response?.data?.message || apiError?.message || 'Gagal mencabut jadwal susulan.';
            Alert.alert('Gagal', message);
          } finally {
            setSavingMakeup(false);
          }
        },
      },
    ]);
  };

  const openResetSessionForm = (row: ExamScheduleMakeupStudentRow) => {
    if (!row.canResetSession) {
      Alert.alert('Belum Bisa Direset', row.resetSessionBlockedReason || 'Sesi ini belum bisa direset.');
      return;
    }
    setResetSessionTarget(row);
    setResetSessionReason('');
  };

  const handleResetSession = async () => {
    if (!selectedMakeupSchedule || !resetSessionTarget) {
      Alert.alert('Validasi', 'Pilih siswa yang ingin direset sesinya.');
      return;
    }
    const normalizedReason = resetSessionReason.trim();
    if (!normalizedReason) {
      Alert.alert('Validasi', 'Alasan reset sesi wajib diisi.');
      return;
    }

    setResettingSession(true);
    try {
      await examApi.resetTeacherScheduleSession(selectedMakeupSchedule.id, {
        studentId: resetSessionTarget.student.id,
        reason: normalizedReason,
      });
      await loadScheduleMakeupOverview(selectedMakeupSchedule.id);
      resetSessionForm();
      Alert.alert('Sukses', `Sesi ${resetSessionTarget.student.name} berhasil direset tanpa menghapus jawaban.`);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const message = apiError?.response?.data?.message || apiError?.message || 'Gagal mereset sesi ujian.';
      Alert.alert('Gagal', message);
    } finally {
      setResettingSession(false);
    }
  };

  const handleDeleteSchedule = (scheduleId: number) => {
    Alert.alert('Hapus Jadwal', 'Yakin ingin menghapus jadwal ujian ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteScheduleMutation.mutate(scheduleId),
      },
    ]);
  };

  const closeScheduleEditor = () => {
    setScheduleEditorVisible(false);
    setEditingSchedule(null);
    setScheduleEditForm({
      subjectId: '',
      classId: '',
      semester: 'ODD',
      date: '',
      startTime: '',
      endTime: '',
      periodNumber: '',
      sessionId: '',
    });
    setNewSchedulePeriodDraft('');
    setCustomSchedulePeriods([]);
  };

  const openScheduleEditor = (schedule: TeacherExamSchedule) => {
    const targetProgram = (examProgramsQuery.data?.programs || []).find(
      (program) => normalizeProgramCode(program.code) === normalizeProgramCode(schedule.examType || schedule.packet?.type || ''),
    );
    setEditingSchedule(schedule);
    setScheduleEditForm({
      subjectId: schedule.subject?.id ? String(schedule.subject.id) : schedule.packet?.subject?.id ? String(schedule.packet.subject.id) : '',
      classId: schedule.classId ? String(schedule.classId) : '',
      semester:
        targetProgram?.fixedSemester ||
        (schedule.semester === 'EVEN' ? 'EVEN' : schedule.semester === 'ODD' ? 'ODD' : effectiveSemester),
      date: toInputDateValue(schedule.startTime),
      startTime: toInputTimeValue(schedule.startTime),
      endTime: toInputTimeValue(schedule.endTime),
      periodNumber: schedule.periodNumber ? String(schedule.periodNumber) : '',
      sessionId: schedule.sessionId ? String(schedule.sessionId) : '',
    });
    setNewSchedulePeriodDraft('');
    setCustomSchedulePeriods([]);
    setScheduleEditorVisible(true);
  };

  const handleAddSchedulePeriodOption = () => {
    const parsed = Number(newSchedulePeriodDraft);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      Alert.alert('Validasi', 'Jam ke baru harus berupa angka bulat positif.');
      return;
    }

    setCustomSchedulePeriods((prev) => (prev.includes(parsed) ? prev : [...prev, parsed].sort((a, b) => a - b)));
    setScheduleEditForm((prev) => ({ ...prev, periodNumber: String(parsed) }));
    setNewSchedulePeriodDraft('');
  };

  const handleSaveScheduleEdit = () => {
    if (!editingSchedule) {
      Alert.alert('Validasi', 'Pilih jadwal yang ingin diedit terlebih dahulu.');
      return;
    }
    if (!scheduleEditForm.subjectId) {
      Alert.alert('Validasi', 'Pilih mata pelajaran terlebih dahulu.');
      return;
    }
    if (editingSchedule.classId && !scheduleEditForm.classId) {
      Alert.alert('Validasi', 'Pilih kelas terlebih dahulu.');
      return;
    }
    if (
      !scheduleEditForm.date ||
      !scheduleEditForm.startTime ||
      !scheduleEditForm.endTime ||
      !scheduleEditForm.periodNumber
    ) {
      Alert.alert('Validasi', 'Lengkapi tanggal, jam ke, jam mulai, dan jam selesai.');
      return;
    }

    updateScheduleMutation.mutate({
      scheduleId: editingSchedule.id,
      data: {
        startTime: composeScheduleDateTime(scheduleEditForm.date, scheduleEditForm.startTime),
        endTime: composeScheduleDateTime(scheduleEditForm.date, scheduleEditForm.endTime),
        periodNumber: Number(scheduleEditForm.periodNumber),
        sessionId: scheduleEditForm.sessionId ? Number(scheduleEditForm.sessionId) : null,
        subjectId: Number(scheduleEditForm.subjectId),
        classId: scheduleEditForm.classId ? Number(scheduleEditForm.classId) : null,
        semester: (editingProgramConfig?.fixedSemester || scheduleEditForm.semester || effectiveSemester) as 'ODD' | 'EVEN',
      },
    });
  };

  const handleAssignProctor = (slot: ExamSittingRoomSlot, proctorId: number | null) => {
    updateProctorMutation.mutate({ slot, proctorId });
  };

  const toggleScheduleDay = (dateKey: string) => {
    setExpandedScheduleDays((prev) =>
      prev.includes(dateKey) ? prev.filter((item) => item !== dateKey) : [...prev, dateKey],
    );
  };

  const toggleScheduleSlot = (slotKey: string) => {
    setExpandedScheduleSlots((prev) =>
      prev.includes(slotKey) ? prev.filter((item) => item !== slotKey) : [...prev, slotKey],
    );
  };

  const toggleProctorDay = (dateKey: string) => {
    setExpandedProctorDays((prev) =>
      prev.includes(dateKey) ? prev.filter((item) => item !== dateKey) : [...prev, dateKey],
    );
  };

  const toggleProctorSlot = (slotKey: string) => {
    setExpandedProctorSlots((prev) =>
      prev.includes(slotKey) ? prev.filter((item) => item !== slotKey) : [...prev, slotKey],
    );
  };

  const updateProgramDraft = (rowId: string, patch: Partial<ExamProgramDraft>) => {
    setProgramDrafts((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };
  const updateComponentDraft = (rowId: string, patch: Partial<GradeComponentDraft>) => {
    setComponentDrafts((prev) => prev.map((item) => (item.rowId === rowId ? { ...item, ...patch } : item)));
  };

  const addProgramDraft = () => {
    setProgramDrafts((prev) => [...prev, createNewProgramDraft(prev, componentDrafts)]);
  };
  const removeProgramDraft = (rowId: string) => {
    setProgramDrafts((prev) => prev.filter((row) => row.rowId !== rowId));
    setCodeEditBackup((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };
  const unlockProgramCode = (rowId: string) => {
    const target = programDrafts.find((row) => row.rowId === rowId);
    if (target && codeEditBackup[rowId] === undefined) {
      setCodeEditBackup((prev) => ({ ...prev, [rowId]: target.code }));
    }
    updateProgramDraft(rowId, { isCodeLocked: false });
  };
  const cancelProgramCodeEdit = (rowId: string) => {
    updateProgramDraft(rowId, { code: codeEditBackup[rowId] || '', isCodeLocked: true });
    setCodeEditBackup((prev) => {
      const next = { ...prev };
      delete next[rowId];
      return next;
    });
  };
  const addComponentDraft = () => {
    setComponentDrafts((prev) => [...prev, createNewComponentDraft(prev)]);
  };
  const removeComponentDraft = (rowId: string) => {
    setComponentDrafts((prev) => prev.filter((row) => row.rowId !== rowId));
  };

  const handleSaveProgram = () => {
    if (!activeYearQuery.data?.id) {
      Alert.alert('Info', 'Tahun ajaran aktif belum tersedia.');
      return;
    }

    const hasInvalidCode = programDrafts.some((item) => !normalizeProgramCode(item.code));
    if (hasInvalidCode) {
      Alert.alert('Validasi', 'Kode program ujian wajib diisi.');
      return;
    }
    const hasDuplicateCode =
      new Set(programDrafts.map((item) => normalizeProgramCode(item.code))).size !== programDrafts.length;
    if (hasDuplicateCode) {
      Alert.alert('Validasi', 'Kode program ujian duplikat.');
      return;
    }
    const hasInvalidLabel = programDrafts.some((item) => !item.label.trim());
    if (hasInvalidLabel) {
      Alert.alert('Validasi', 'Label program ujian wajib diisi.');
      return;
    }
    const componentCodes = new Set(componentDrafts.map((item) => normalizeProgramCode(item.code)));
    const hasMissingComponent = programDrafts.some(
      (item) => !componentCodes.has(normalizeProgramCode(item.gradeComponentCode)),
    );
    if (hasMissingComponent) {
      Alert.alert('Validasi', 'Komponen nilai belum terdaftar di Master Komponen Nilai.');
      return;
    }
    const hasMissingScheduledPublishDate = programDrafts.some(
      (item) =>
        normalizeStudentResultPublishMode(item.studentResultPublishMode) === 'SCHEDULED' &&
        !normalizeDateInputValue(item.studentResultPublishAt),
    );
    if (hasMissingScheduledPublishDate) {
      Alert.alert('Validasi', 'Tanggal publikasi siswa wajib diisi jika mode publikasi memakai tanggal tertentu.');
      return;
    }

    updateExamProgramsMutation.mutate();
  };

  const handleSaveComponents = () => {
    if (!activeYearQuery.data?.id) {
      Alert.alert('Info', 'Tahun ajaran aktif belum tersedia.');
      return;
    }
    const hasInvalidCode = componentDrafts.some((item) => !normalizeProgramCode(item.code));
    if (hasInvalidCode) {
      Alert.alert('Validasi', 'Kode komponen nilai wajib diisi.');
      return;
    }
    const hasDuplicateCode =
      new Set(componentDrafts.map((item) => normalizeProgramCode(item.code))).size !== componentDrafts.length;
    if (hasDuplicateCode) {
      Alert.alert('Validasi', 'Kode komponen nilai duplikat.');
      return;
    }
    const hasInvalidLabel = componentDrafts.some((item) => !item.label.trim());
    if (hasInvalidLabel) {
      Alert.alert('Validasi', 'Label komponen nilai wajib diisi.');
      return;
    }
    updateExamComponentsMutation.mutate();
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Kelola Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Kelola Ujian
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan Wakasek Kurikulum atau Sekretaris Kurikulum."
        />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            schedulesQuery.isFetching ||
            examSittingsQuery.isFetching ||
            roomSlotsQuery.isFetching ||
            teachersQuery.isFetching ||
            examProgramConfigQuery.isFetching ||
            examGradeComponentsQuery.isFetching ||
            updateExamProgramsMutation.isPending ||
            updateExamComponentsMutation.isPending
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void schedulesQuery.refetch();
            void examSittingsQuery.refetch();
            void roomSlotsQuery.refetch();
            void teachersQuery.refetch();
            void examProgramConfigQuery.refetch();
            void examGradeComponentsQuery.refetch();
            void examProgramsQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontWeight: '700', ...headingTextStyle }}>
          Kelola Ujian
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 10 }}>
        Pengelolaan jadwal ujian, ruang ujian, generate denah ruang, jadwal mengawas, dan program ujian.
      </Text>

      <MobileMenuTabBar
        items={EXAM_SECTION_ITEMS}
        activeKey={section}
        onChange={(key) => setSection(key as ExamHubSection)}
        style={{ marginBottom: 10 }}
        contentContainerStyle={{ paddingRight: 8 }}
        minTabWidth={74}
        maxTabWidth={108}
      />

      {!isProgramSection ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 12 }}>
            {summaryCards.map((item) => (
              <View key={item.id} style={{ width: '48.5%', marginBottom: 8 }}>
                <MobileSummaryCard
                  title={item.title}
                  value={item.value}
                  subtitle={item.subtitle}
                  iconName={item.iconName}
                  accentColor={item.accentColor}
                  onPress={() => setActiveSummaryId(item.id)}
                />
              </View>
            ))}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#d5e0f5',
              borderRadius: 999,
              paddingHorizontal: 12,
              marginBottom: 12,
            }}
          >
            <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Cari mapel, kelas, ruang, pengawas, atau status denah"
              placeholderTextColor="#94a3b8"
              style={{
                flex: 1,
                color: BRAND_COLORS.textDark,
                paddingVertical: 10,
                paddingHorizontal: 10,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />
          </View>

          <MobileSelectField
            label="Filter tipe ujian"
            value={examTypeFilter}
            options={examTypeSelectOptions}
            onChange={(value) => setExamTypeFilter(value as ExamTypeFilter)}
            placeholder="Pilih tipe ujian"
          />

          {examTypeFilter !== 'ALL' && !selectedProgramConfig?.fixedSemester ? (
            <MobileSelectField
              label="Semester"
              value={selectedSemester}
              options={[
                { value: 'ODD', label: 'Ganjil' },
                { value: 'EVEN', label: 'Genap' },
              ]}
              onChange={(value) => setSelectedSemester((value as 'ODD' | 'EVEN') || 'ODD')}
              placeholder="Pilih semester"
            />
          ) : null}

          <Pressable
            onPress={openExamSessionCrud}
            style={{
              borderWidth: 1,
              borderColor: '#93c5fd',
              borderRadius: 10,
              backgroundColor: '#eff6ff',
              paddingVertical: 9,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Kelola Sesi Ujian (Tambah/Ubah/Hapus)</Text>
          </Pressable>
        </>
      ) : null}

      {isProgramSection ? (
        <>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              backgroundColor: '#f8fbff',
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Atur Master Komponen Nilai lalu susun Program Ujian agar menu guru/siswa mengikuti kebijakan kurikulum aktif.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 }}>
            {summaryCards.map((item) => (
              <View key={item.id} style={{ width: '48.5%', marginBottom: 8 }}>
                <MobileSummaryCard
                  title={item.title}
                  value={item.value}
                  subtitle={item.subtitle}
                  iconName={item.iconName}
                  accentColor={item.accentColor}
                  onPress={() => setActiveSummaryId(item.id)}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Pressable
              onPress={addComponentDraft}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#d5e1f5',
                backgroundColor: '#fff',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tambah Komponen</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveComponents}
              disabled={!componentDirty || updateExamComponentsMutation.isPending}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor:
                  !componentDirty || updateExamComponentsMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {updateExamComponentsMutation.isPending ? 'Menyimpan...' : 'Simpan Komponen'}
              </Text>
            </Pressable>
          </View>

          {examGradeComponentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat komponen nilai..." /> : null}
          {examGradeComponentsQuery.isError ? (
            <QueryStateView
              type="error"
              message="Gagal memuat komponen nilai."
              onRetry={() => examGradeComponentsQuery.refetch()}
            />
          ) : null}

          {componentDrafts.length > 0 ? (
            componentDrafts.map((component) => (
              <View
                key={component.rowId}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Komponen</Text>
                    <TextInput
                      value={component.code}
                      onChangeText={(value) => {
                        const nextCode = normalizeProgramCode(value);
                        const nextTypeCode = inferGradeComponentTypeByCode(nextCode, 'CUSTOM');
                        const nextEntryModeCode = inferGradeEntryModeByCode(nextCode, 'SINGLE_SCORE');
                        const nextSlot = defaultReportSlotByCode(nextCode);
                        updateComponentDraft(component.rowId, {
                          code: nextCode,
                          typeCode: nextTypeCode,
                          type: inferGradeComponentTypeByCode(nextTypeCode, component.type),
                          entryModeCode: nextEntryModeCode,
                          entryMode: resolveEntryModeByCode(nextEntryModeCode, component.entryMode),
                          reportSlot: nextSlot,
                          reportSlotCode: nextSlot,
                          includeInFinalScore: defaultIncludeInFinalScoreBySlot(nextSlot),
                        });
                      }}
                      placeholder="Contoh: PSAJ"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Label</Text>
                    <TextInput
                      value={component.label}
                      onChangeText={(value) => updateComponentDraft(component.rowId, { label: value })}
                      placeholder="Label komponen"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Tipe</Text>
                    <TextInput
                      value={component.typeCode}
                      onChangeText={(value) => {
                        const nextTypeCode = normalizeProgramCode(value);
                        updateComponentDraft(component.rowId, {
                          typeCode: nextTypeCode,
                          type: inferGradeComponentTypeByCode(nextTypeCode, component.type),
                        });
                      }}
                      placeholder="Contoh: FORMATIVE"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Mode Input</Text>
                    <TextInput
                      value={component.entryModeCode}
                      onChangeText={(value) => {
                        const nextEntryModeCode = normalizeProgramCode(value);
                        updateComponentDraft(component.rowId, {
                          entryModeCode: nextEntryModeCode,
                          entryMode: resolveEntryModeByCode(nextEntryModeCode, component.entryMode),
                        });
                      }}
                      placeholder="Contoh: NF_SERIES"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Mode Input</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {GRADE_ENTRY_MODE_OPTIONS.map((option) => {
                        const active = component.entryMode === option.value;
                        return (
                          <Pressable
                            key={`${component.rowId}-${option.value}`}
                            onPress={() =>
                              updateComponentDraft(component.rowId, {
                                entryMode: option.value,
                                entryModeCode: option.value,
                              })
                            }
                            style={{
                              borderWidth: 1,
                              borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                              backgroundColor: active ? '#e9f1ff' : '#fff',
                              borderRadius: 999,
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                            }}
                          >
                            <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Slot Rapor</Text>
                <TextInput
                  value={component.reportSlotCode}
                  onChangeText={(value) => {
                    const nextReportSlotCode = normalizeProgramCode(value);
                    updateComponentDraft(component.rowId, {
                      reportSlotCode: nextReportSlotCode,
                      reportSlot: resolveReportSlotByCode(nextReportSlotCode, component.reportSlot),
                    });
                  }}
                  placeholder="Contoh: FORMATIF"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 9,
                    backgroundColor: '#fff',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                    ...inputTextStyle,
                  }}
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {REPORT_SLOT_OPTIONS.map((slot) => {
                    const active = component.reportSlot === slot.value;
                    return (
                      <Pressable
                        key={`${component.rowId}-${slot.value}`}
                        onPress={() =>
                          updateComponentDraft(component.rowId, {
                            reportSlot: slot.value,
                            reportSlotCode: slot.value,
                            includeInFinalScore: defaultIncludeInFinalScoreBySlot(slot.value),
                          })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                          {slot.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={component.description}
                      onChangeText={(value) => updateComponentDraft(component.rowId, { description: value })}
                      placeholder="Deskripsi (opsional)"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ width: 96 }}>
                    <TextInput
                      value={String(component.order)}
                      onChangeText={(value) =>
                        updateComponentDraft(component.rowId, {
                          order: Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="Urutan"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Pressable
                    onPress={() => updateComponentDraft(component.rowId, { isActive: !component.isActive })}
                    style={{
                      borderWidth: 1,
                      borderColor: component.isActive ? '#86efac' : '#d5e1f5',
                      backgroundColor: component.isActive ? '#f0fdf4' : '#fff',
                      borderRadius: 999,
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: component.isActive ? '#166534' : BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                      Aktif
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      updateComponentDraft(component.rowId, {
                        includeInFinalScore: !component.includeInFinalScore,
                      })
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: component.includeInFinalScore ? '#86efac' : '#d5e1f5',
                      backgroundColor: component.includeInFinalScore ? '#f0fdf4' : '#fff',
                      borderRadius: 999,
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: component.includeInFinalScore ? '#166534' : BRAND_COLORS.textMuted,
                        ...bodyTextStyle,
                      }}
                    >
                      Ikut Nilai Akhir
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => removeComponentDraft(component.rowId)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fff1f2',
                      borderRadius: 999,
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text style={{ color: '#be123c', ...bodyTextStyle }}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <Pressable
              onPress={addProgramDraft}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#d5e1f5',
                backgroundColor: '#fff',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tambah Program</Text>
            </Pressable>
            <Pressable
              onPress={handleSaveProgram}
              disabled={!programDirty || updateExamProgramsMutation.isPending}
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                backgroundColor:
                  !programDirty || updateExamProgramsMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {updateExamProgramsMutation.isPending ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </Text>
            </Pressable>
          </View>

          {examProgramConfigQuery.isLoading ? <QueryStateView type="loading" message="Memuat program ujian..." /> : null}
          {examProgramConfigQuery.isError ? (
            <QueryStateView
              type="error"
              message="Gagal memuat program ujian."
              onRetry={() => examProgramConfigQuery.refetch()}
            />
          ) : null}

          {programDrafts.length > 0 ? (
            programDrafts.map((program) => (
              <View
                key={program.rowId}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...sectionTitleTextStyle }}>
                    {program.code || 'PROGRAM_BARU'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {program.isCodeLocked ? (
                      <Pressable
                        onPress={() => unlockProgramCode(program.rowId)}
                        style={{
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          borderRadius: 8,
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', ...helperTextStyle }}>Edit</Text>
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={() => cancelProgramCodeEdit(program.rowId)}
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          backgroundColor: '#fff',
                          borderRadius: 8,
                          paddingVertical: 5,
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', ...helperTextStyle }}>Batal</Text>
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => removeProgramDraft(program.rowId)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 8,
                        paddingVertical: 5,
                        paddingHorizontal: 8,
                      }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '700', ...helperTextStyle }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Program</Text>
                    <TextInput
                      value={program.code}
                      editable={!program.isCodeLocked}
                      onChangeText={(value) => updateProgramDraft(program.rowId, { code: normalizeProgramCode(value) })}
                      placeholder="Contoh: PSAJ"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: program.isCodeLocked ? '#cbd5e1' : '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: program.isCodeLocked ? '#f8fafc' : '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Label Menu</Text>
                    <TextInput
                      value={program.label}
                      onChangeText={(value) => updateProgramDraft(program.rowId, { label: value })}
                      placeholder="Label program ujian"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Komponen Nilai</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  {componentDrafts.map((component) => {
                    const active = normalizeProgramCode(program.gradeComponentCode) === normalizeProgramCode(component.code);
                    return (
                      <Pressable
                        key={`${program.rowId}-${component.rowId}`}
                        onPress={() =>
                          updateProgramDraft(program.rowId, {
                            gradeComponentCode: normalizeProgramCode(component.code),
                            gradeComponentType: component.type,
                            gradeComponentTypeCode: normalizeProgramCode(
                              component.typeCode || component.type || component.code,
                            ),
                            gradeComponentLabel: component.label,
                            gradeEntryMode: component.entryMode,
                            gradeEntryModeCode: normalizeProgramCode(
                              component.entryModeCode || component.entryMode || inferGradeEntryModeByCode(component.code),
                            ),
                            baseTypeCode: inferBaseTypeByComponentCode(
                              normalizeProgramCode(component.code),
                              program.fixedSemester,
                              program.baseTypeCode || program.baseType,
                            ),
                            baseType: inferBaseTypeByComponentCode(
                              normalizeProgramCode(component.code),
                              program.fixedSemester,
                              program.baseTypeCode || program.baseType,
                            ),
                          })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                          {component.code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Pola</Text>
                    <TextInput
                      value={program.baseTypeCode}
                      onChangeText={(value) => {
                        const nextBaseTypeCode = normalizeProgramCode(value);
                        updateProgramDraft(program.rowId, {
                          baseTypeCode: nextBaseTypeCode,
                          baseType: inferBaseTypeByComponentCode(
                            normalizeProgramCode(program.gradeComponentCode),
                            program.fixedSemester,
                            nextBaseTypeCode || program.baseType,
                          ),
                        });
                      }}
                      placeholder="Contoh: FORMATIF"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Kode Mode Input</Text>
                    <TextInput
                      value={program.gradeEntryModeCode}
                      onChangeText={(value) => {
                        const nextGradeEntryModeCode = normalizeProgramCode(value);
                        updateProgramDraft(program.rowId, {
                          gradeEntryModeCode: nextGradeEntryModeCode,
                          gradeEntryMode: resolveEntryModeByCode(
                            nextGradeEntryModeCode,
                            program.gradeEntryMode,
                          ),
                        });
                      }}
                      placeholder="Contoh: SINGLE_SCORE"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={program.shortLabel}
                      onChangeText={(value) => updateProgramDraft(program.rowId, { shortLabel: value })}
                      placeholder="Label singkat"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                  <View style={{ width: 96 }}>
                    <TextInput
                      value={String(program.order)}
                      onChangeText={(value) =>
                        updateProgramDraft(program.rowId, {
                          order: Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0,
                        })
                      }
                      keyboardType="number-pad"
                      placeholder="Urutan"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  {PROGRAM_FIXED_SEMESTER_OPTIONS.map((option) => {
                    const active = program.fixedSemester === option.value;
                    return (
                      <Pressable
                        key={`${program.rowId}-${option.key}`}
                        onPress={() =>
                          updateProgramDraft(program.rowId, {
                            fixedSemester: option.value,
                            baseTypeCode: inferBaseTypeByComponentCode(
                              normalizeProgramCode(program.gradeComponentCode),
                              option.value,
                              program.baseTypeCode || program.baseType,
                            ),
                            baseType: inferBaseTypeByComponentCode(
                              normalizeProgramCode(program.gradeComponentCode),
                              option.value,
                              program.baseTypeCode || program.baseType,
                            ),
                          })
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 8 }}>
                  Finance: {getFinanceClearanceSummary(program)}
                </Text>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Target Tingkat Kelas (opsional)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => updateProgramDraft(program.rowId, { targetClassLevels: [] })}
                    style={{
                      borderWidth: 1,
                      borderColor: program.targetClassLevels.length === 0 ? BRAND_COLORS.blue : '#d5e1f5',
                      backgroundColor: program.targetClassLevels.length === 0 ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: program.targetClassLevels.length === 0 ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                        ...helperTextStyle,
                      }}
                    >
                      Semua Tingkat
                    </Text>
                  </Pressable>
                  {CLASS_LEVEL_SCOPE_OPTIONS.map((level) => {
                    const active = program.targetClassLevels.includes(level);
                    return (
                      <Pressable
                        key={`${program.rowId}-level-${level}`}
                        onPress={() => {
                          const current = new Set(normalizeClassLevelScope(program.targetClassLevels));
                          if (current.has(level)) current.delete(level);
                          else current.add(level);
                          updateProgramDraft(program.rowId, { targetClassLevels: Array.from(current) });
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                          backgroundColor: active ? '#e9f1ff' : '#fff',
                          borderRadius: 999,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                          {level}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Mapel Diizinkan (opsional)</Text>
                <TextInput
                  value={programSubjectSearch[program.rowId] || ''}
                  onChangeText={(value) =>
                    setProgramSubjectSearch((prev) => ({
                      ...prev,
                      [program.rowId]: value,
                    }))
                  }
                  placeholder="Cari mapel..."
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 9,
                    backgroundColor: '#fff',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 6,
                    ...inputTextStyle,
                  }}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => updateProgramDraft(program.rowId, { allowedSubjectIds: [] })}
                    style={{
                      borderWidth: 1,
                      borderColor: program.allowedSubjectIds.length === 0 ? BRAND_COLORS.blue : '#d5e1f5',
                      backgroundColor: program.allowedSubjectIds.length === 0 ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: program.allowedSubjectIds.length === 0 ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                        ...helperTextStyle,
                      }}
                    >
                      Semua Mapel
                    </Text>
                  </Pressable>
                  {subjects
                    .filter((subject) => {
                      const keyword = String(programSubjectSearch[program.rowId] || '').trim().toLowerCase();
                      if (!keyword) return true;
                      return (
                        subject.name.toLowerCase().includes(keyword) || subject.code.toLowerCase().includes(keyword)
                      );
                    })
                    .slice(0, 40)
                    .map((subject) => {
                      const active = program.allowedSubjectIds.includes(subject.id);
                      return (
                        <Pressable
                          key={`${program.rowId}-subject-${subject.id}`}
                          onPress={() => {
                            const current = new Set(normalizeNumericIds(program.allowedSubjectIds));
                            if (current.has(subject.id)) current.delete(subject.id);
                            else current.add(subject.id);
                            updateProgramDraft(program.rowId, { allowedSubjectIds: Array.from(current) });
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#22c55e' : '#d5e1f5',
                            backgroundColor: active ? '#f0fdf4' : '#fff',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: active ? '#166534' : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                            {subject.code}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Publikasi Hasil ke Siswa</Text>
                <View style={{ gap: 8, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {STUDENT_RESULT_PUBLISH_MODE_OPTIONS.map((option) => {
                      const active = program.studentResultPublishMode === option.value;
                      return (
                        <Pressable
                          key={`${program.rowId}-publish-${option.value}`}
                          onPress={() =>
                            updateProgramDraft(program.rowId, {
                              studentResultPublishMode: option.value,
                              studentResultPublishAt:
                                option.value === 'SCHEDULED' ? program.studentResultPublishAt : '',
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#f59e0b' : '#d5e1f5',
                            backgroundColor: active ? '#fffbeb' : '#fff',
                            borderRadius: 12,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: active ? '#92400e' : BRAND_COLORS.textMuted, fontWeight: '600', ...helperTextStyle }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      )
                    })}
                  </View>
                  <Text style={{ color: '#92400e', ...helperTextStyle }}>
                    {
                      STUDENT_RESULT_PUBLISH_MODE_OPTIONS.find(
                        (option) => option.value === normalizeStudentResultPublishMode(program.studentResultPublishMode),
                      )?.hint
                    }
                  </Text>
                  {shouldShowStudentResultPublishDate(program.studentResultPublishMode) ? (
                    <View>
                      <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Tanggal Publikasi Siswa</Text>
                      <TextInput
                        value={program.studentResultPublishAt}
                        onChangeText={(value) =>
                          updateProgramDraft(program.rowId, {
                            studentResultPublishAt: normalizeDateInputValue(value),
                          })
                        }
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          borderRadius: 9,
                          backgroundColor: '#fff',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          color: BRAND_COLORS.textDark,
                          ...inputTextStyle,
                        }}
                      />
                    </View>
                  ) : null}
                  <Text style={{ color: '#64748b', ...helperTextStyle }}>
                    Ringkasan: {getStudentResultPublishSummary(program)}
                  </Text>
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Policy Clearance Finance</Text>
                <View style={{ gap: 8, marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {FINANCE_CLEARANCE_MODE_OPTIONS.map((option) => {
                      const active = program.financeClearanceMode === option.value;
                      return (
                        <Pressable
                          key={`${program.rowId}-finance-${option.value}`}
                          onPress={() =>
                            updateProgramDraft(program.rowId, {
                              financeClearanceMode: option.value,
                            })
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#f59e0b' : '#d5e1f5',
                            backgroundColor: active ? '#fffbeb' : '#fff',
                            borderRadius: 12,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: active ? '#92400e' : BRAND_COLORS.textMuted, fontWeight: '600', ...helperTextStyle }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ color: '#92400e', ...helperTextStyle }}>
                    {
                      FINANCE_CLEARANCE_MODE_OPTIONS.find(
                        (option) => option.value === normalizeFinanceClearanceMode(program.financeClearanceMode),
                      )?.hint
                    }
                  </Text>
                  {shouldShowFinanceThresholdAmount(program.financeClearanceMode) ? (
                    <View>
                      <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Ambang Outstanding</Text>
                      <TextInput
                        value={String(program.financeMinOutstandingAmount)}
                        onChangeText={(value) =>
                          updateProgramDraft(program.rowId, {
                            financeMinOutstandingAmount: normalizeFinanceAmount(value),
                          })
                        }
                        keyboardType="numeric"
                        placeholder="Contoh: 500000"
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          borderRadius: 9,
                          backgroundColor: '#fff',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          color: BRAND_COLORS.textDark,
                          ...inputTextStyle,
                        }}
                      />
                    </View>
                  ) : null}
                  {shouldShowFinanceOverdueCount(program.financeClearanceMode) ? (
                    <View>
                      <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Minimal Invoice Overdue</Text>
                      <TextInput
                        value={String(program.financeMinOverdueInvoices)}
                        onChangeText={(value) =>
                          updateProgramDraft(program.rowId, {
                            financeMinOverdueInvoices: normalizeFinanceOverdueCount(value),
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="Contoh: 1"
                        placeholderTextColor="#94a3b8"
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          borderRadius: 9,
                          backgroundColor: '#fff',
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          color: BRAND_COLORS.textDark,
                          ...inputTextStyle,
                        }}
                      />
                    </View>
                  ) : null}
                  <View>
                    <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Catatan Policy (opsional)</Text>
                    <TextInput
                      value={program.financeClearanceNotes}
                      onChangeText={(value) => updateProgramDraft(program.rowId, { financeClearanceNotes: value })}
                      placeholder="Contoh: Program ini wajib clear minimal daftar ulang."
                      placeholderTextColor="#94a3b8"
                      multiline
                      style={{
                        minHeight: 68,
                        borderWidth: 1,
                        borderColor: '#d5e1f5',
                        borderRadius: 9,
                        backgroundColor: '#fff',
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        color: BRAND_COLORS.textDark,
                        textAlignVertical: 'top',
                        ...inputTextStyle,
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Pembuat Soal Diizinkan (opsional)</Text>
                <TextInput
                  value={programAuthorSearch[program.rowId] || ''}
                  onChangeText={(value) =>
                    setProgramAuthorSearch((prev) => ({
                      ...prev,
                      [program.rowId]: value,
                    }))
                  }
                  placeholder="Cari guru pembuat soal..."
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 9,
                    backgroundColor: '#fff',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 6,
                    ...inputTextStyle,
                  }}
                />
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => updateProgramDraft(program.rowId, { allowedAuthorIds: [] })}
                    style={{
                      borderWidth: 1,
                      borderColor: program.allowedAuthorIds.length === 0 ? BRAND_COLORS.blue : '#d5e1f5',
                      backgroundColor: program.allowedAuthorIds.length === 0 ? '#e9f1ff' : '#fff',
                      borderRadius: 999,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: program.allowedAuthorIds.length === 0 ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                        ...helperTextStyle,
                      }}
                    >
                      Semua Guru
                    </Text>
                  </Pressable>
                  {teachers
                    .filter((teacher) => {
                      const keyword = String(programAuthorSearch[program.rowId] || '').trim().toLowerCase();
                      if (!keyword) return true;
                      return (
                        teacher.name.toLowerCase().includes(keyword) ||
                        teacher.username.toLowerCase().includes(keyword)
                      );
                    })
                    .slice(0, 40)
                    .map((teacher) => {
                      const active = program.allowedAuthorIds.includes(teacher.id);
                      return (
                        <Pressable
                          key={`${program.rowId}-author-${teacher.id}`}
                          onPress={() => {
                            const current = new Set(normalizeNumericIds(program.allowedAuthorIds));
                            if (current.has(teacher.id)) current.delete(teacher.id);
                            else current.add(teacher.id);
                            updateProgramDraft(program.rowId, { allowedAuthorIds: Array.from(current) });
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? '#22c55e' : '#d5e1f5',
                            backgroundColor: active ? '#f0fdf4' : '#fff',
                            borderRadius: 999,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: active ? '#166534' : BRAND_COLORS.textMuted, ...helperTextStyle }}>
                            {teacher.username}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <TextInput
                  value={program.description}
                  onChangeText={(value) => updateProgramDraft(program.rowId, { description: value })}
                  placeholder="Deskripsi program"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e1f5',
                    borderRadius: 9,
                    backgroundColor: '#fff',
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                    ...inputTextStyle,
                  }}
                />

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {[
                    { key: 'isActive', label: 'Aktif', value: program.isActive },
                    { key: 'showOnTeacherMenu', label: 'Tampil di Guru', value: program.showOnTeacherMenu },
                    { key: 'showOnStudentMenu', label: 'Tampil di Siswa', value: program.showOnStudentMenu },
                  ].map((toggle) => (
                    <Pressable
                      key={`${program.rowId}-${toggle.key}`}
                      onPress={() =>
                        updateProgramDraft(program.rowId, {
                          [toggle.key]: !toggle.value,
                        } as Partial<ExamProgramDraft>)
                      }
                      style={{
                        borderWidth: 1,
                        borderColor: toggle.value ? '#86efac' : '#d5e1f5',
                        backgroundColor: toggle.value ? '#f0fdf4' : '#fff',
                        borderRadius: 999,
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text style={{ color: toggle.value ? '#166534' : BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        {toggle.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 16,
                backgroundColor: '#fff',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada program ujian.</Text>
            </View>
          )}

          <View
            style={{
              backgroundColor: '#fffbeb',
              borderWidth: 1,
              borderColor: '#fde68a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#92400e', fontWeight: '800', marginBottom: 4, ...sectionTitleTextStyle }}>
              Master Tanggal Rapor
            </Text>
            <Text style={{ color: '#92400e', marginBottom: 10, ...bodyTextStyle }}>
              Dipakai oleh program yang memilih policy Ikuti Tanggal Rapor Semester.
            </Text>

            {examReportDatesQuery.isLoading ? (
              <QueryStateView type="loading" message="Memuat master tanggal rapor..." />
            ) : null}
            {examReportDatesQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat master tanggal rapor."
                onRetry={() => examReportDatesQuery.refetch()}
              />
            ) : null}

            {!examReportDatesQuery.isLoading && !examReportDatesQuery.isError ? (
              reportDateDrafts.length > 0 ? (
                <>
                  {reportDateDrafts.map((row) => (
                    <View
                      key={row.key}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fde68a',
                        backgroundColor: '#fff',
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...itemTitleTextStyle }}>
                        {row.programLabels.join(', ')}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...helperTextStyle }}>
                        {formatReportTypeLabel(row.reportType)} • Semester {formatSemesterLabel(row.semester)} • Kode {row.programCodes.join(', ')}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#64748b', marginBottom: 4, ...helperTextStyle }}>Tanggal Rapor</Text>
                          <TextInput
                            value={row.date}
                            onChangeText={(value) =>
                              setReportDateDrafts((currentRows) =>
                                currentRows.map((item) =>
                                  item.key === row.key
                                    ? { ...item, date: normalizeDateInputValue(value) }
                                    : item,
                                ),
                              )
                            }
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#94a3b8"
                            style={{
                              borderWidth: 1,
                              borderColor: '#d5e1f5',
                              borderRadius: 9,
                              backgroundColor: '#fff',
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              color: BRAND_COLORS.textDark,
                              ...inputTextStyle,
                            }}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#64748b', marginBottom: 4, ...helperTextStyle }}>Tempat</Text>
                          <TextInput
                            value={row.place}
                            onChangeText={(value) =>
                              setReportDateDrafts((currentRows) =>
                                currentRows.map((item) =>
                                  item.key === row.key
                                    ? { ...item, place: value.slice(0, 120) }
                                    : item,
                                ),
                              )
                            }
                            placeholder={DEFAULT_REPORT_DATE_PLACE}
                            placeholderTextColor="#94a3b8"
                            style={{
                              borderWidth: 1,
                              borderColor: '#d5e1f5',
                              borderRadius: 9,
                              backgroundColor: '#fff',
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              color: BRAND_COLORS.textDark,
                              ...inputTextStyle,
                            }}
                          />
                        </View>
                      </View>

                      <Text
                        style={{
                          color: row.date ? '#166534' : '#b91c1c',
                          marginTop: 8,
                          fontWeight: '700',
                          ...helperTextStyle,
                        }}
                      >
                        {row.date ? 'Status: Siap dipakai' : 'Status: Belum diatur'}
                      </Text>
                    </View>
                  ))}

                  <Pressable
                    onPress={() => updateExamReportDatesMutation.mutate()}
                    disabled={!reportDateDirty || updateExamReportDatesMutation.isPending}
                    style={{
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor:
                        !reportDateDirty || updateExamReportDatesMutation.isPending ? '#94a3b8' : '#d97706',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {updateExamReportDatesMutation.isPending ? 'Menyimpan...' : 'Simpan Tanggal Rapor'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    borderStyle: 'dashed',
                    borderRadius: 10,
                    padding: 14,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#92400e', ...bodyTextStyle }}>
                    Belum ada program yang memakai policy Ikuti Tanggal Rapor Semester.
                  </Text>
                </View>
              )
            ) : null}
          </View>
        </>
      ) : (
        <>
          {schedulesQuery.isLoading ? <QueryStateView type="loading" message="Memuat data ujian..." /> : null}
          {schedulesQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat data ujian." onRetry={() => schedulesQuery.refetch()} />
          ) : null}

          {!schedulesQuery.isLoading && !schedulesQuery.isError ? (
            <>
              {section === 'JADWAL' ? (
                groupedScheduleDays.length > 0 ? (
                  groupedScheduleDays.map((day) => {
                    const isExpanded = expandedScheduleDays.includes(day.dateKey);
                    return (
                    <View
                      key={day.dateKey}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        marginBottom: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <Pressable
                        onPress={() => toggleScheduleDay(day.dateKey)}
                        style={{
                          padding: 12,
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>
                            {day.dateLabel}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
                            {day.slots.length} slot jadwal pada hari ini
                          </Text>
                        </View>
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                          {isExpanded ? 'Tutup Hari' : 'Buka Hari'}
                        </Text>
                      </Pressable>

                      {isExpanded ? (
                        <View style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', padding: 12, paddingTop: 10 }}>
                          {day.slots.map((group) => {
                            const isSlotExpanded = expandedScheduleSlots.includes(group.key);
                            return (
                              <View
                                key={group.key}
                                style={{
                                  backgroundColor: '#fff',
                                  borderWidth: 1,
                                  borderColor: '#dbe7fb',
                                  borderRadius: 12,
                                  marginBottom: 10,
                                  overflow: 'hidden',
                                }}
                              >
                                <Pressable
                                  onPress={() => toggleScheduleSlot(group.key)}
                                  style={{
                                    padding: 12,
                                    flexDirection: 'row',
                                    justifyContent: 'space-between',
                                    alignItems: 'flex-start',
                                    gap: 8,
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...itemTitleTextStyle }}>
                                      {group.subjectName} ({group.subjectCode})
                                    </Text>
                                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...bodyTextStyle }}>
                                      {resolvePeriodLabel(group.periodNumber)} • {formatTimeRangeSummary(group.startTime, group.endTime)}
                                    </Text>
                                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
                                      {group.sessionLabel ? `Sesi ${group.sessionLabel}` : 'Tanpa sesi'} • {group.schedules.length} target
                                    </Text>
                                  </View>
                                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                    <Text
                                      style={{
                                        color: '#1d4ed8',
                                        backgroundColor: '#eff6ff',
                                        borderWidth: 1,
                                        borderColor: '#bfdbfe',
                                        borderRadius: 999,
                                        paddingHorizontal: 8,
                                        paddingVertical: 2,
                                        ...helperTextStyle,
                                        fontWeight: '700',
                                      }}
                                    >
                                      {group.examType}
                                    </Text>
                                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                                      {isSlotExpanded ? 'Tutup Detail' : 'Lihat Detail'}
                                    </Text>
                                  </View>
                                </Pressable>

                                {isSlotExpanded ? (
                                  <View style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', padding: 12, paddingTop: 10 }}>
                                    {group.schedules.map((item) => (
                                      <View
                                        key={item.id}
                                        style={{
                                          borderTopWidth: 1,
                                          borderTopColor: '#eef3ff',
                                          paddingTop: 8,
                                          marginTop: 8,
                                        }}
                                      >
                                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                                          {item.class?.name || '-'}
                                        </Text>
                                        <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                                          Ruang: {item.room || '-'} • Pengawas: {item.proctor?.name || '-'}
                                        </Text>
                                        <Text style={{ color: '#64748b', ...bodyTextStyle, marginTop: 2 }}>
                                          Packet: {item.packet?.title || '-'}
                                        </Text>
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                                          <Pressable
                                            onPress={() => openScheduleEditor(item)}
                                            style={{
                                              borderWidth: 1,
                                              borderColor: '#cbd5e1',
                                              backgroundColor: '#fff',
                                              borderRadius: 8,
                                              paddingVertical: 6,
                                              paddingHorizontal: 10,
                                            }}
                                          >
                                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>
                                              Edit Jadwal
                                            </Text>
                                          </Pressable>
                                          {item.class?.name ? (
                                            <Pressable
                                              onPress={() => void openMakeupModal(item)}
                                              style={{
                                                borderWidth: 1,
                                                borderColor: '#bfdbfe',
                                                backgroundColor: '#eff6ff',
                                                borderRadius: 8,
                                                paddingVertical: 6,
                                                paddingHorizontal: 10,
                                              }}
                                            >
                                              <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                                                Kelola Susulan
                                              </Text>
                                            </Pressable>
                                          ) : null}
                                          <Pressable
                                            onPress={() => handleDeleteSchedule(item.id)}
                                            disabled={deleteScheduleMutation.isPending}
                                            style={{
                                              borderWidth: 1,
                                              borderColor: '#fecaca',
                                              backgroundColor: '#fff1f2',
                                              borderRadius: 8,
                                              paddingVertical: 6,
                                              paddingHorizontal: 10,
                                            }}
                                          >
                                            <Text style={{ color: '#be123c', fontWeight: '700', ...bodyTextStyle }}>
                                              {deleteScheduleMutation.isPending ? 'Memproses...' : 'Hapus Jadwal'}
                                            </Text>
                                          </Pressable>
                                        </View>
                                      </View>
                                    ))}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                    );
                  })
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada jadwal ujian sesuai filter.</Text>
                  </View>
                )
              ) : null}

              {section === 'RUANG' ? (
                managedSittings.length > 0 ? (
                  managedSittings.map((sitting) => (
                    <View
                      key={sitting.id}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', flex: 1, ...sectionTitleTextStyle }}>
                          {sitting.roomName || '-'}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>{sitting.studentCount} siswa</Text>
                      </View>

                      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 2, ...bodyTextStyle }}>
                        {formatDateTime(String(sitting.startTime || ''))} - {formatDateTime(String(sitting.endTime || ''))}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6, ...bodyTextStyle }}>
                        Program: {examTypeLabel(normalizeProgramCode(sitting.examType))} • Sesi: {sitting.sessionLabel || '-'}
                      </Text>
                      <Text style={{ color: '#64748b', ...bodyTextStyle, marginBottom: 8 }}>
                        Kelas: {sitting.classes.length > 0 ? sitting.classes.join(', ') : '-'} • Pengawas:{' '}
                        {sitting.proctor?.name || '-'}
                      </Text>

                      <Pressable
                        onPress={() =>
                          router.push(`/teacher/wakakur-room-manage?sittingId=${encodeURIComponent(String(sitting.id))}` as never)
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          borderRadius: 8,
                          paddingVertical: 9,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Kelola Ruang & Siswa</Text>
                      </Pressable>
                    </View>
                  ))
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data ruang ujian sesuai filter.</Text>
                  </View>
                )
              ) : null}

              {section === 'DENAH' ? (
                managedSittings.length > 0 ? (
                  managedSittings.map((sitting) => {
                    const hasLayout = Boolean(sitting.layout?.id);
                    return (
                      <View
                        key={`layout-${sitting.id}`}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 16,
                          padding: 14,
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 12,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>
                              {sitting.roomName || '-'}
                            </Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...bodyTextStyle }}>
                              {formatScheduleSummary(sitting.startTime, sitting.endTime)}
                            </Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...bodyTextStyle }}>
                              {examTypeLabel(normalizeProgramCode(sitting.examType))} • {formatSessionSummary(sitting.sessionLabel)}
                            </Text>
                          </View>
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: hasLayout ? '#ecfdf5' : '#fffbeb',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <Text
                              style={{
                                color: hasLayout ? '#047857' : '#b45309',
                                fontWeight: '800',
                                ...helperTextStyle,
                              }}
                            >
                              {hasLayout ? 'Siap Edit' : 'Belum Digenerate'}
                            </Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#f8fafc',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <Text style={{ color: '#475569', fontWeight: '700', ...bodyTextStyle }}>
                              {sitting.studentCount} siswa
                            </Text>
                          </View>
                          {sitting.layout ? (
                            <View
                              style={{
                                borderRadius: 999,
                                backgroundColor: '#eff6ff',
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                                {sitting.layout.rows} x {sitting.layout.columns}
                              </Text>
                            </View>
                          ) : null}
                          <View
                            style={{
                              borderRadius: 999,
                              backgroundColor: '#f8fafc',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                          >
                            <Text
                              style={{
                                color: '#475569',
                                ...bodyTextStyle,
                                fontWeight: '700',
                              }}
                            >
                              {hasLayout
                                ? `Update ${formatDateTime(sitting.layout?.updatedAt || sitting.layout?.generatedAt || null)}`
                                : 'Perlu generate awal'}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ color: '#64748b', ...bodyTextStyle, marginTop: 10 }}>
                          Kelas: {sitting.classes.length > 0 ? sitting.classes.join(', ') : '-'}
                        </Text>

                        <Pressable
                          onPress={() =>
                            router.push(`/teacher/wakakur-room-layout?sittingId=${encodeURIComponent(String(sitting.id))}` as never)
                          }
                          style={{
                            marginTop: 12,
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            backgroundColor: hasLayout ? '#eff6ff' : '#fff',
                            borderRadius: 12,
                            paddingVertical: 11,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                            {hasLayout ? 'Lihat Denah' : 'Setup Denah'}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>
                      Belum ada data ruang ujian untuk generate denah sesuai filter.
                    </Text>
                  </View>
                )
              ) : null}

              {section === 'MENGAWAS' ? (
                groupedProctorDays.length > 0 ? (
                  groupedProctorDays.map((day) => {
                    const isDayExpanded = expandedProctorDays.includes(day.dateKey);
                    return (
                      <View
                        key={day.dateKey}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 12,
                          marginBottom: 10,
                          overflow: 'hidden',
                        }}
                      >
                        <Pressable
                          onPress={() => toggleProctorDay(day.dateKey)}
                          style={{
                            padding: 12,
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', ...sectionTitleTextStyle }}>
                              {day.dateLabel}
                            </Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
                              {day.slots.length} slot mapel pada hari ini
                            </Text>
                          </View>
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>
                            {isDayExpanded ? 'Tutup Hari' : 'Buka Hari'}
                          </Text>
                        </Pressable>

                        {isDayExpanded ? (
                          <View style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', padding: 12, paddingTop: 10 }}>
                            {day.slots.map((slot) => {
                              const type = normalizeProgramCode(slot.examType);
                              const isSlotExpanded = expandedProctorSlots.includes(slot.key);
                              return (
                                <View
                                  key={slot.key}
                                  style={{
                                    backgroundColor: '#fff',
                                    borderWidth: 1,
                                    borderColor: '#dbe7fb',
                                    borderRadius: 12,
                                    marginBottom: 10,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <Pressable
                                    onPress={() => toggleProctorSlot(slot.key)}
                                    style={{
                                      padding: 12,
                                      flexDirection: 'row',
                                      justifyContent: 'space-between',
                                      alignItems: 'flex-start',
                                      gap: 8,
                                    }}
                                  >
                                    <View style={{ flex: 1 }}>
                                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...itemTitleTextStyle }}>
                                        {slot.subjectName}
                                        {slot.subjectCode ? ` (${slot.subjectCode})` : ''}
                                      </Text>
                                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3, ...bodyTextStyle }}>
                                        {resolvePeriodLabel(slot.periodNumber)} • {formatTimeRangeSummary(slot.startTime, slot.endTime)}
                                      </Text>
                                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
                                        {slot.items.length} ruang • {slot.sessionLabel ? `Sesi ${slot.sessionLabel}` : 'Tanpa sesi'}
                                      </Text>
                                    </View>
                                    <Text
                                      style={{
                                        color: '#1d4ed8',
                                        backgroundColor: '#eff6ff',
                                        borderWidth: 1,
                                        borderColor: '#bfdbfe',
                                        borderRadius: 999,
                                        paddingHorizontal: 8,
                                        paddingVertical: 2,
                                        ...helperTextStyle,
                                        fontWeight: '700',
                                      }}
                                    >
                                      {examTypeLabel(type || slot.examType)}
                                    </Text>
                                  </Pressable>

                                  {isSlotExpanded ? (
                                    <View style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', padding: 12, paddingTop: 10 }}>
                                      {slot.items.map((item) => {
                                        const isEditing = editingAssignmentKey === item.key;
                                        return (
                                          <View
                                            key={item.key}
                                            style={{
                                              borderWidth: 1,
                                              borderColor: '#dbe7fb',
                                              borderRadius: 10,
                                              backgroundColor: '#fff',
                                              padding: 12,
                                              marginBottom: 8,
                                            }}
                                          >
                                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                                              Ruang: {item.roomName || '-'}
                                            </Text>
                                            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 3 }}>
                                              {(item.classNames || []).join(', ') || '-'}
                                            </Text>
                                            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 2 }}>
                                              Pengawas: {item.proctor?.name || 'Belum ditentukan'} • {item.participantCount} peserta
                                            </Text>

                                            {!isEditing ? (
                                              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                                <Pressable
                                                  onPress={() => setEditingAssignmentKey(item.key)}
                                                  style={{
                                                    borderWidth: 1,
                                                    borderColor: '#bfdbfe',
                                                    backgroundColor: '#eff6ff',
                                                    borderRadius: 8,
                                                    paddingVertical: 7,
                                                    paddingHorizontal: 10,
                                                  }}
                                                >
                                                  <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Ubah Pengawas</Text>
                                                </Pressable>
                                                <Pressable
                                                  onPress={() => handleAssignProctor(item, user.id)}
                                                  disabled={updateProctorMutation.isPending}
                                                  style={{
                                                    borderWidth: 1,
                                                    borderColor: '#d5e1f5',
                                                    backgroundColor: '#fff',
                                                    borderRadius: 8,
                                                    paddingVertical: 7,
                                                    paddingHorizontal: 10,
                                                  }}
                                                >
                                                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', ...bodyTextStyle }}>
                                                    {updateProctorMutation.isPending ? 'Memproses...' : 'Set Saya'}
                                                  </Text>
                                                </Pressable>
                                              </View>
                                            ) : (
                                              <View
                                                style={{
                                                  borderWidth: 1,
                                                  borderColor: '#dbe7fb',
                                                  backgroundColor: '#f8fbff',
                                                  borderRadius: 10,
                                                  padding: 10,
                                                  marginTop: 8,
                                                }}
                                              >
                                                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                                                  Pilih Pengawas
                                                </Text>
                                                <TextInput
                                                  value={teacherSearch}
                                                  onChangeText={setTeacherSearch}
                                                  placeholder="Cari nama guru / username"
                                                  placeholderTextColor="#94a3b8"
                                                  style={{
                                                    borderWidth: 1,
                                                    borderColor: '#d5e1f5',
                                                    borderRadius: 8,
                                                    backgroundColor: '#fff',
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 8,
                                                    color: BRAND_COLORS.textDark,
                                                    marginBottom: 8,
                                                  }}
                                                />
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                                                  {teacherOptions.map((teacher) => (
                                                    <View key={teacher.id} style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
                                                      <Pressable
                                                        onPress={() => handleAssignProctor(item, teacher.id)}
                                                        disabled={updateProctorMutation.isPending}
                                                        style={{
                                                          borderWidth: 1,
                                                          borderColor: '#d5e1f5',
                                                          borderRadius: 8,
                                                          backgroundColor: '#fff',
                                                          paddingVertical: 7,
                                                          paddingHorizontal: 8,
                                                        }}
                                                      >
                                                        <Text
                                                          style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}
                                                          numberOfLines={1}
                                                        >
                                                          {teacher.name}
                                                        </Text>
                                                        <Text style={{ color: BRAND_COLORS.textMuted, ...helperTextStyle }} numberOfLines={1}>
                                                          @{teacher.username}
                                                        </Text>
                                                      </Pressable>
                                                    </View>
                                                  ))}
                                                </View>
                                                <Pressable
                                                  onPress={() => {
                                                    setEditingAssignmentKey(null);
                                                    setTeacherSearch('');
                                                  }}
                                                  style={{
                                                    marginTop: 4,
                                                    alignSelf: 'flex-start',
                                                    borderWidth: 1,
                                                    borderColor: '#d5e1f5',
                                                    borderRadius: 8,
                                                    paddingVertical: 7,
                                                    paddingHorizontal: 10,
                                                    backgroundColor: '#fff',
                                                  }}
                                                >
                                                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', ...bodyTextStyle }}>Batal</Text>
                                                </Pressable>
                                              </View>
                                            )}
                                          </View>
                                        );
                                      })}
                                    </View>
                                  ) : null}
                                </View>
                              );
                            })}
                          </View>
                        ) : null}
                      </View>
                    );
                  })
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada jadwal untuk assignment pengawas.</Text>
                  </View>
                )
              ) : null}
            </>
          ) : null}
        </>
      )}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
          backgroundColor: BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>

      <MobileDetailModal
        visible={scheduleEditorVisible}
        title="Edit Jadwal Ujian"
        subtitle="Gunakan popup ini untuk merapikan semester, mapel, kelas, jam ke, tanggal, waktu ujian, dan sesi pada jadwal yang sudah dibuat."
        iconName="edit-3"
        accentColor="#1d4ed8"
        onClose={closeScheduleEditor}
      >
        {editingSchedule ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              backgroundColor: '#f8fbff',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              {resolveScheduleSubject(editingSchedule).subjectName} ({resolveScheduleSubject(editingSchedule).subjectCode})
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 2 }}>
              Target: {editingSchedule.class?.name || 'Calon Siswa'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
              Program: {examTypeLabel(normalizeProgramCode(editingSchedule.examType || '') || editingSchedule.examType || 'FORMATIF')}
            </Text>
          </View>
        ) : null}

        {editingProgramConfig?.fixedSemester ? (
          <MobileSelectField
            label="Semester"
            value={editingProgramConfig.fixedSemester}
            options={[
              { label: 'Ganjil', value: 'ODD' },
              { label: 'Genap', value: 'EVEN' },
            ]}
            onChange={() => undefined}
            disabled
            helperText={`Program ini terkunci di semester ${editingProgramConfig.fixedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.`}
          />
        ) : (
          <MobileSelectField
            label="Semester"
            value={scheduleEditForm.semester}
            options={[
              { label: 'Ganjil', value: 'ODD' },
              { label: 'Genap', value: 'EVEN' },
            ]}
            onChange={(value) =>
              setScheduleEditForm((prev) => ({
                ...prev,
                semester: (value as 'ODD' | 'EVEN') || 'ODD',
              }))
            }
            placeholder="Pilih semester"
            helperText="Semester jadwal ujian harus sejalan dengan program ujian aktif."
          />
        )}

        <MobileSelectField
          label="Mata Pelajaran"
          value={scheduleEditForm.subjectId}
          options={scheduleEditSubjectOptions}
          onChange={(value) => setScheduleEditForm((prev) => ({ ...prev, subjectId: String(value || '') }))}
          placeholder={subjectsQuery.isLoading ? 'Memuat mapel...' : 'Pilih mata pelajaran'}
          helperText="Mapel bisa disesuaikan selama jadwal belum dipakai sesi ujian siswa."
        />

        {editingSchedule?.classId ? (
          <MobileSelectField
            label="Kelas"
            value={scheduleEditForm.classId}
            options={scheduleEditClassOptions}
            onChange={(value) => setScheduleEditForm((prev) => ({ ...prev, classId: String(value || '') }))}
            placeholder={classesQuery.isLoading ? 'Memuat kelas...' : 'Pilih kelas'}
            helperText="Gunakan edit ini untuk memindahkan satu jadwal ke kelas lain yang masih sesuai scope program."
          />
        ) : null}

        <MobileSelectField
          label="Sesi Ujian (Opsional)"
          value={scheduleEditForm.sessionId}
          options={scheduleSessionOptions}
          onChange={(value) => setScheduleEditForm((prev) => ({ ...prev, sessionId: String(value || '') }))}
          placeholder={programSessionsQuery.isLoading ? 'Memuat sesi...' : 'Pilih sesi'}
          helperText="Sesi tetap opsional. Jika belum dipakai, biarkan Tanpa sesi."
        />

        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 6 }}>Tanggal</Text>
          <TextInput
            value={scheduleEditForm.date}
            onChangeText={(value) => setScheduleEditForm((prev) => ({ ...prev, date: value }))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94a3b8"
            style={{
              borderWidth: 1,
              borderColor: '#d5e1f5',
              borderRadius: 12,
              backgroundColor: '#fff',
              paddingHorizontal: 12,
              paddingVertical: 11,
              color: BRAND_COLORS.textDark,
              ...inputTextStyle,
            }}
          />
        </View>

        <View style={{ marginBottom: 10 }}>
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 6 }}>Hari</Text>
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 12,
              backgroundColor: '#f8fafc',
              paddingHorizontal: 12,
              paddingVertical: 11,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', ...bodyTextStyle }}>{selectedScheduleEditDayLabel}</Text>
          </View>
        </View>

        <MobileSelectField
          label="Jam Ke"
          value={scheduleEditForm.periodNumber}
          options={scheduleEditPeriodOptions}
          onChange={(value) => setScheduleEditForm((prev) => ({ ...prev, periodNumber: String(value || '') }))}
          placeholder="Pilih jam ke"
          helperText="Jam ke dipakai sebagai urutan slot ujian. Tambahkan nomor baru bila dibutuhkan."
        />

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 6 }}>Tambah Jam Ke Baru</Text>
            <TextInput
              value={newSchedulePeriodDraft}
              onChangeText={setNewSchedulePeriodDraft}
              placeholder="Contoh: 7"
              keyboardType="number-pad"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 12,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
          <View style={{ justifyContent: 'flex-end' }}>
            <Pressable
              onPress={handleAddSchedulePeriodOption}
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                backgroundColor: '#fff',
                borderRadius: 10,
                paddingVertical: 11,
                paddingHorizontal: 14,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Tambah</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 6 }}>Jam Mulai</Text>
            <TextInput
              value={scheduleEditForm.startTime}
              onChangeText={(value) => setScheduleEditForm((prev) => ({ ...prev, startTime: value }))}
              placeholder="HH:mm"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 12,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 6 }}>Jam Selesai</Text>
            <TextInput
              value={scheduleEditForm.endTime}
              onChangeText={(value) => setScheduleEditForm((prev) => ({ ...prev, endTime: value }))}
              placeholder="HH:mm"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 12,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
          <Pressable
            onPress={closeScheduleEditor}
            style={{
              flex: 1,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#d5e1f5',
              backgroundColor: '#fff',
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Batal</Text>
          </Pressable>
          <Pressable
            onPress={handleSaveScheduleEdit}
            disabled={updateScheduleMutation.isPending}
            style={{
              flex: 1,
              borderRadius: 10,
              backgroundColor: updateScheduleMutation.isPending ? '#94a3b8' : BRAND_COLORS.blue,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {updateScheduleMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </Text>
          </Pressable>
        </View>
      </MobileDetailModal>

      <MobileDetailModal
        visible={makeupModalVisible}
        title="Kelola Ujian Susulan"
        subtitle={`${CURRICULUM_EXAM_MANAGER_LABEL} mengatur susulan per siswa. Akses susulan hanya aktif jika dijadwalkan dari menu ini.`}
        iconName="clock"
        accentColor="#1d4ed8"
        onClose={closeMakeupModal}
      >
        {selectedMakeupSchedule ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbe7fb',
              backgroundColor: '#f8fbff',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              {makeupOverview?.schedule.subject.name || resolveScheduleSubject(selectedMakeupSchedule).subjectName}
              {' '}
              (
              {makeupOverview?.schedule.subject.code || resolveScheduleSubject(selectedMakeupSchedule).subjectCode}
              )
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginBottom: 2 }}>
              Kelas: {makeupOverview?.schedule.className || selectedMakeupSchedule.class?.name || '-'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
              Jadwal reguler: {formatDateTime(makeupOverview?.schedule.startTime || selectedMakeupSchedule.startTime)}
              {' - '}
              {formatDateTime(makeupOverview?.schedule.endTime || selectedMakeupSchedule.endTime)}
            </Text>
            <Text style={{ color: '#1d4ed8', ...helperTextStyle, marginTop: 8 }}>
              Susulan hanya berlaku jika diatur dari menu ini, waktunya harus sesudah jadwal reguler berakhir, dan hanya untuk siswa yang belum mulai ujian reguler.
            </Text>
          </View>
        ) : null}

        {resetSessionTarget ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#fcd34d',
              backgroundColor: '#fffbeb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Reset Sesi Peserta</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...bodyTextStyle }}>
                  {resetSessionTarget.student.name}
                </Text>
                <Text style={{ color: '#92400e', ...helperTextStyle, marginTop: 4 }}>
                  Status: {resetSessionTarget.session?.status || 'Belum mulai'}
                  {typeof resetSessionTarget.session?.answeredCount === 'number'
                    ? ` • Jawaban ${resetSessionTarget.session.answeredCount}`
                    : ''}
                  {typeof resetSessionTarget.session?.totalViolations === 'number'
                    ? ` • Pelanggaran ${resetSessionTarget.session.totalViolations}`
                    : ''}
                  {resetSessionTarget.session?.currentQuestionNumber
                    ? ` • Soal ${resetSessionTarget.session.currentQuestionNumber}`
                    : ''}
                </Text>
                <Text style={{ color: '#92400e', ...helperTextStyle, marginTop: 4 }}>
                  Reset ini hanya membuka ulang status sesi. Jawaban dan question set siswa tetap dipertahankan.
                </Text>
              </View>
              <Pressable
                onPress={resetSessionForm}
                style={{
                  alignSelf: 'flex-start',
                  borderWidth: 1,
                  borderColor: '#fcd34d',
                  backgroundColor: '#fff',
                  borderRadius: 10,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: '#92400e', fontWeight: '700', ...helperTextStyle }}>Batal</Text>
              </Pressable>
            </View>

            <Text style={{ color: '#92400e', ...helperTextStyle, marginTop: 10, marginBottom: 4 }}>Alasan Reset</Text>
            <TextInput
              value={resetSessionReason}
              onChangeText={setResetSessionReason}
              placeholder="Contoh: false violation, kendala teknis device, layar error"
              placeholderTextColor="#a16207"
              style={{
                borderWidth: 1,
                borderColor: '#fcd34d',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={resetSessionForm}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#d5e1f5',
                  borderRadius: 10,
                  backgroundColor: '#fff',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Tutup</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleResetSession()}
                disabled={resettingSession || loadingMakeup}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: resettingSession || loadingMakeup ? '#fbbf24' : '#d97706',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {resettingSession ? 'Mereset...' : 'Reset Sesi'}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <MobileSelectField
          label="Pilih Siswa"
          value={makeupForm.studentId}
          options={(makeupOverview?.students || [])
            .filter((row) => row.canManageMakeup || row.makeupAccess)
            .map((row) => ({
              value: String(row.student.id),
              label: `${row.student.name}${row.student.nis ? ` • ${row.student.nis}` : ''}`,
            }))}
          onChange={(value) => setMakeupForm((prev) => ({ ...prev, studentId: String(value || '') }))}
          placeholder="Pilih siswa"
        />

        <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Catatan / Alasan</Text>
        <TextInput
          value={makeupForm.reason}
          onChangeText={(value) => setMakeupForm((prev) => ({ ...prev, reason: value }))}
          placeholder="Contoh: sakit, izin resmi, kendala teknis"
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#d5e1f5',
            borderRadius: 10,
            backgroundColor: '#fff',
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            marginBottom: 10,
            ...inputTextStyle,
          }}
        />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Tanggal Susulan</Text>
            <TextInput
              value={makeupForm.date}
              onChangeText={(value) => setMakeupForm((prev) => ({ ...prev, date: value }))}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Jam Mulai</Text>
            <TextInput
              value={makeupForm.startTime}
              onChangeText={(value) => setMakeupForm((prev) => ({ ...prev, startTime: value }))}
              placeholder="HH:MM"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#64748b', ...helperTextStyle, marginBottom: 4 }}>Jam Selesai</Text>
            <TextInput
              value={makeupForm.endTime}
              onChangeText={(value) => setMakeupForm((prev) => ({ ...prev, endTime: value }))}
              placeholder="HH:MM"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d5e1f5',
                borderRadius: 10,
                backgroundColor: '#fff',
                paddingHorizontal: 12,
                paddingVertical: 10,
                color: BRAND_COLORS.textDark,
                ...inputTextStyle,
              }}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          <Pressable
            onPress={resetMakeupForm}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#d5e1f5',
              borderRadius: 10,
              backgroundColor: '#fff',
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Reset Form</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSaveMakeup()}
            disabled={savingMakeup || loadingMakeup}
            style={{
              flex: 1,
              borderRadius: 10,
              backgroundColor: savingMakeup || loadingMakeup ? '#94a3b8' : BRAND_COLORS.blue,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>
              {savingMakeup ? 'Menyimpan...' : 'Simpan Susulan'}
            </Text>
          </Pressable>
        </View>

        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Daftar Siswa</Text>
        <TextInput
          value={makeupSearch}
          onChangeText={setMakeupSearch}
          placeholder="Cari nama siswa / NIS / NISN"
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#d5e1f5',
            borderRadius: 10,
            backgroundColor: '#fff',
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            marginBottom: 10,
          }}
        />

        {loadingMakeup ? (
          <QueryStateView type="loading" message="Memuat data susulan..." />
        ) : filteredMakeupStudents.length === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 14,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada siswa yang sesuai untuk dikelola.</Text>
          </View>
        ) : (
          filteredMakeupStudents.map((row) => {
            const makeupState = getMakeupStateMeta(row.makeupAccess?.state);
            return (
              <View
                key={row.student.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  backgroundColor: '#fff',
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.student.name}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 2 }}>
                      {row.student.nis ? `NIS ${row.student.nis}` : 'Tanpa NIS'}
                      {row.student.nisn ? ` • NISN ${row.student.nisn}` : ''}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: makeupState.border,
                      backgroundColor: makeupState.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: makeupState.text, fontWeight: '700', ...helperTextStyle }}>
                      {makeupState.label}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                  Status reguler: {row.session ? row.session.status : 'Belum mulai'}
                </Text>
                {row.session ? (
                  <Text style={{ color: '#64748b', ...bodyTextStyle, marginTop: 4 }}>
                    Jawaban {row.session.answeredCount} • Pelanggaran {row.session.totalViolations}
                    {row.session.currentQuestionNumber ? ` • Soal ${row.session.currentQuestionNumber}` : ''}
                  </Text>
                ) : null}
                {row.makeupAccess ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 4 }}>
                    Susulan: {formatDateTime(row.makeupAccess.startTime)} - {formatDateTime(row.makeupAccess.endTime)}
                  </Text>
                ) : null}
                {row.makeupAccess?.reason ? (
                  <Text style={{ color: '#64748b', ...bodyTextStyle, marginTop: 4 }}>
                    Alasan: {row.makeupAccess.reason}
                  </Text>
                ) : null}
                {row.session && row.resetSessionBlockedReason ? (
                  <Text style={{ color: '#a16207', ...bodyTextStyle, marginTop: 4 }}>
                    {row.resetSessionBlockedReason}
                  </Text>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Pressable
                    onPress={() => fillMakeupForm(row)}
                    style={{
                      minWidth: 110,
                      flexGrow: 1,
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      borderRadius: 10,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', ...bodyTextStyle }}>Isi Form</Text>
                  </Pressable>
                  {row.makeupAccess && row.makeupAccess.state !== 'REVOKED' ? (
                    <Pressable
                      onPress={() => handleRevokeMakeup(row)}
                      style={{
                        minWidth: 110,
                        flexGrow: 1,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '700', ...bodyTextStyle }}>Cabut</Text>
                    </Pressable>
                  ) : null}
                  {row.canResetSession ? (
                    <Pressable
                      onPress={() => openResetSessionForm(row)}
                      style={{
                        minWidth: 110,
                        flexGrow: 1,
                        borderWidth: 1,
                        borderColor: '#fcd34d',
                        backgroundColor: '#fffbeb',
                        borderRadius: 10,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#a16207', fontWeight: '700', ...bodyTextStyle }}>Reset Sesi</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </MobileDetailModal>

      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Ujian'}
        subtitle="Detail lengkap dipindahkan ke popup supaya tampilan utama mobile tetap rapi dan fokus."
        iconName={activeSummaryMeta?.iconName || 'bar-chart-2'}
        accentColor={activeSummaryMeta?.accentColor || BRAND_COLORS.blue}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'schedules' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total jadwal sesuai filter: {stats.totalSchedules}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Daftar ini mengikuti pencarian dan tipe ujian yang sedang aktif di halaman.
            </Text>
            {groupedScheduleSlots.slice(0, 6).map((group) => (
              <View
                key={group.key}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                  {group.subjectName} ({group.subjectCode})
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 3 }}>
                  {resolvePeriodLabel(group.periodNumber)} • {group.schedules.length} jadwal • {group.examType}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {activeSummaryId === 'packets' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Paket siap pakai: {stats.readyPacketCount}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Nilai ini menunjukkan jadwal yang sudah terhubung dengan packet ujian.
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Sisa jadwal tanpa packet: {Math.max(stats.totalSchedules - stats.readyPacketCount, 0)}
            </Text>
          </>
        ) : null}

        {activeSummaryId === 'proctors' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Ruang tanpa pengawas: {stats.noProctorCount}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Gunakan section <Text style={{ fontWeight: '700', color: BRAND_COLORS.textDark }}>Jadwal Mengawas</Text> untuk melengkapi assignment pengawas yang belum terisi.
            </Text>
            {filteredProctorRoomSlots
              .filter((item) => !item.proctorId)
              .slice(0, 6)
              .map((item) => (
                <View
                  key={item.key}
                  style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.roomName || '-'} • {item.subjectName}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 3 }}>
                    {(item.classNames || []).join(', ') || '-'} • {formatDateTime(item.startTime)}
                  </Text>
                </View>
              ))}
          </>
        ) : null}

        {activeSummaryId === 'rooms' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total ruang aktif: {stats.totalRooms}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Ringkasan ini mengikuti ruang yang benar-benar terpakai pada jadwal sesuai filter.
            </Text>
            {managedSittings.slice(0, 6).map((item) => (
              <View
                key={item.id}
                style={{ borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 10, marginBottom: 8 }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.roomName || '-'}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle, marginTop: 3 }}>
                  {item.studentCount} siswa • {item.classes.join(', ') || '-'}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        {activeSummaryId === 'components' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total master komponen: {componentStats.total}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Komponen ini menjadi dasar penilaian yang bisa dipakai dalam program ujian aktif.
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Program aktif saat ini: {programStats.activeCount} dari {programStats.total}
            </Text>
          </>
        ) : null}

        {activeSummaryId === 'programs' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Total program ujian: {programStats.total}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Program ujian menentukan tipe ujian, visibilitas menu, dan aturan kebijakan yang berlaku di guru maupun siswa.
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Program tampil di guru: {programStats.teacherVisible} • tampil di siswa: {programStats.studentVisible}
            </Text>
          </>
        ) : null}

        {activeSummaryId === 'active-programs' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Program aktif siap pakai: {programStats.activeCount}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Hanya program aktif yang ikut tersedia sebagai pilihan saat operasional ujian berjalan.
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Total program tersusun: {programStats.total}
            </Text>
          </>
        ) : null}

        {activeSummaryId === 'active-components' ? (
          <>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
              Komponen aktif siap pakai: {componentStats.activeCount}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, ...paragraphTextStyle, marginBottom: 12 }}>
              Hanya komponen aktif yang akan ikut tersedia saat kurikulum menyusun program ujian berjalan.
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Program tampil di guru: {programStats.teacherVisible} • tampil di siswa: {programStats.studentVisible}
            </Text>
          </>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
