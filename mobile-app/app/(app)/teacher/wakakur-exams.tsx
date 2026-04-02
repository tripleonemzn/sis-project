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
import { MobileMenuTab } from '../../../src/components/MobileMenuTab';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminSubject, AdminUser, adminApi } from '../../../src/features/admin/adminApi';
import {
  examApi,
  ExamFinanceClearanceMode,
  ExamGradeComponentItem,
  ExamProgramBaseType,
  ExamProgramCode,
  ExamProgramGradeComponentType,
  ExamProgramGradeEntryMode,
  ExamProgramItem,
  ExamProgramReportSlot,
} from '../../../src/features/exams/examApi';
import {
  ExamDisplayType,
  ExamSittingDetail,
  ExamSittingListItem,
  TeacherExamSchedule,
} from '../../../src/features/exams/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type ExamHubSection = 'JADWAL' | 'RUANG' | 'MENGAWAS' | 'PROGRAM';
type ExamTypeFilter = 'ALL' | ExamDisplayType;
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
  financeClearanceMode: ExamFinanceClearanceMode;
  financeMinOutstandingAmount: number;
  financeMinOverdueInvoices: number;
  financeClearanceNotes: string;
  source: 'default' | 'custom' | 'new';
  isCodeLocked: boolean;
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

function extractClassNameFromSittingStudent(student: ExamSittingStudentRow): string {
  if (!student) return '';
  const fromStudentClass = String(student.studentClass?.name || '').trim();
  if (fromStudentClass) return fromStudentClass;
  const fromClass = String(student.class?.name || '').trim();
  if (fromClass) return fromClass;
  return String(student.class_name || '').trim();
}

function formatDateTime(value: string) {
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

const SectionChip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <MobileMenuTab active={active} label={label} onPress={onPress} minWidth={96} />
);

function TypeChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

export default function TeacherWakakurExamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [section, setSection] = useState<ExamHubSection>('JADWAL');
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [programDrafts, setProgramDrafts] = useState<ExamProgramDraft[]>([]);
  const [programBaseline, setProgramBaseline] = useState<string>('[]');
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
        return await academicYearApi.getActive();
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

  const examSittingsQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-sittings', activeYearQuery.data?.id, examTypeFilter],
    enabled: isAuthenticated && !!isAllowed && Boolean(activeYearQuery.data?.id) && !isProgramSection,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const sittings = await examApi.getExamSittings({
        academicYearId: activeYearQuery.data?.id,
        ...(examTypeFilter !== 'ALL'
          ? {
              examType: examTypeFilter,
              programCode: examTypeFilter,
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

  const updateProctorMutation = useMutation({
    mutationFn: async (payload: { scheduleId: number; proctorId: number }) =>
      examApi.updateTeacherSchedule(payload.scheduleId, { proctorId: payload.proctorId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] });
      setEditingScheduleId(null);
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-program-config'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-programs'] }),
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

  useEffect(() => {
    if (examTypeFilter === 'ALL') return;
    if (!examTypeFilterOptions.includes(examTypeFilter)) {
      const timerId = setTimeout(() => setExamTypeFilter('ALL'), 0);
      return () => clearTimeout(timerId);
    }
  }, [examTypeFilter, examTypeFilterOptions]);

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

  const filteredSchedules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules
      .filter((item) => {
        if (activeYearQuery.data?.id && item.academicYearId && Number(item.academicYearId) !== Number(activeYearQuery.data.id)) {
          return false;
        }
        const type = resolveScheduleExamType(item);
        if (examTypeFilter !== 'ALL' && type !== examTypeFilter) return false;
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
  }, [schedules, activeYearQuery.data, examTypeFilter, search, examTypeLabel]);

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
      const roomA = String(a.roomName || '').trim();
      const roomB = String(b.roomName || '').trim();
      return roomA.localeCompare(roomB, 'id', { sensitivity: 'base' });
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

  const groupedSchedules = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        subjectName: string;
        subjectCode: string;
        examType: ExamDisplayType;
        startTime: string;
        endTime: string;
        schedules: TeacherExamSchedule[];
      }
    >();

    for (const schedule of filteredSchedules) {
      const subject = resolveScheduleSubject(schedule);
      const examType = resolveScheduleExamType(schedule);
      const key = `${subject.subjectCode}|${schedule.startTime}|${schedule.endTime}|${examType}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          examType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          schedules: [],
        });
      }
      map.get(key)!.schedules.push(schedule);
    }

    return Array.from(map.values());
  }, [filteredSchedules]);

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
      return a.roomName.localeCompare(b.roomName, 'id', { sensitivity: 'base' });
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
        const roomCompare = String(a.roomName || '').localeCompare(String(b.roomName || ''), 'id', {
          sensitivity: 'base',
          numeric: true,
        });
        if (roomCompare !== 0) return roomCompare;
        return Number(a.id) - Number(b.id);
      });
  }, [examSittingsQuery.data, examTypeFilter, search]);

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

  const stats = useMemo(() => {
    const noProctorCount = filteredSchedules.filter((item) => !item.proctorId).length;
    const readyPacketCount = filteredSchedules.filter((item) => !!item.packetId).length;
    const rooms = new Set(filteredSchedules.map((item) => (item.room || '').trim()).filter(Boolean));
    return {
      totalSchedules: filteredSchedules.length,
      noProctorCount,
      readyPacketCount,
      totalRooms: rooms.size,
    };
  }, [filteredSchedules]);

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

  const programDirty = useMemo(
    () => snapshotProgramDrafts(programDrafts) !== programBaseline,
    [programBaseline, programDrafts],
  );
  const componentDirty = useMemo(
    () => snapshotComponentDrafts(componentDrafts) !== componentBaseline,
    [componentBaseline, componentDrafts],
  );

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

  const handleAssignProctor = (scheduleId: number, proctorId: number) => {
    updateProctorMutation.mutate({ scheduleId, proctorId });
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Kelola Ujian</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Kelola Ujian
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Pengelolaan jadwal ujian, ruang ujian, jadwal mengawas, dan program ujian.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <SectionChip active={section === 'JADWAL'} label="Jadwal Ujian" onPress={() => setSection('JADWAL')} />
        <SectionChip active={section === 'RUANG'} label="Ruang Ujian" onPress={() => setSection('RUANG')} />
        <SectionChip active={section === 'MENGAWAS'} label="Jadwal Mengawas" onPress={() => setSection('MENGAWAS')} />
        <SectionChip active={section === 'PROGRAM'} label="Program Ujian" onPress={() => setSection('PROGRAM')} />
      </View>

      {!isProgramSection ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
            <SummaryCard title="Jadwal Ujian" value={String(stats.totalSchedules)} subtitle="Sesuai filter" />
            <SummaryCard title="Paket Siap" value={String(stats.readyPacketCount)} subtitle="Sudah linked" />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <SummaryCard title="Belum Pengawas" value={String(stats.noProctorCount)} subtitle="Perlu assignment" />
            <SummaryCard title="Ruang Aktif" value={String(stats.totalRooms)} subtitle="Ruang terpakai" />
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
              placeholder="Cari mapel, kelas, ruang, atau pengawas"
              placeholderTextColor="#94a3b8"
              style={{ flex: 1, color: BRAND_COLORS.textDark, paddingVertical: 10, paddingHorizontal: 10 }}
            />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {examTypeFilterOptions.map((item) => (
              <TypeChip
                key={item}
                active={examTypeFilter === item}
                label={item === 'ALL' ? 'Semua Tipe' : examTypeLabel(item)}
                onPress={() => setExamTypeFilter(item)}
              />
            ))}
          </View>

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
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <SummaryCard title="Total Komponen" value={String(componentStats.total)} subtitle="Master komponen nilai" />
            <SummaryCard title="Komponen Aktif" value={String(componentStats.activeCount)} subtitle="Siap dipakai" />
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
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Komponen</Text>
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
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Label</Text>
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
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Tipe</Text>
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
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Mode Input</Text>
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
                      }}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Mode Input</Text>
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
                            <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 11 }}>
                              {option.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Slot Rapor</Text>
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
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 11 }}>
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
                    <Text style={{ color: component.isActive ? '#166534' : BRAND_COLORS.textMuted, fontSize: 12 }}>
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
                        fontSize: 12,
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
                    <Text style={{ color: '#be123c', fontSize: 12 }}>Hapus</Text>
                  </Pressable>
                </View>
              </View>
            ))
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
            <SummaryCard title="Total Program" value={String(programStats.total)} subtitle="Semua program ujian" />
            <SummaryCard title="Program Aktif" value={String(programStats.activeCount)} subtitle="Siap digunakan" />
          </View>
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
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>
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
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 11 }}>Edit</Text>
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
                        <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 11 }}>Batal</Text>
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
                      <Text style={{ color: '#be123c', fontWeight: '700', fontSize: 11 }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Program</Text>
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
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Label Menu</Text>
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
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Komponen Nilai</Text>
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
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 11 }}>
                          {component.code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Pola</Text>
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
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Kode Mode Input</Text>
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
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 11 }}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
                  Finance: {getFinanceClearanceSummary(program)}
                </Text>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Target Tingkat Kelas (opsional)</Text>
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
                        fontSize: 11,
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
                        <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 11 }}>
                          {level}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Mapel Diizinkan (opsional)</Text>
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
                        fontSize: 11,
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
                          <Text style={{ color: active ? '#166534' : BRAND_COLORS.textMuted, fontSize: 11 }}>
                            {subject.code}
                          </Text>
                        </Pressable>
                      );
                    })}
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Policy Clearance Finance</Text>
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
                          <Text style={{ color: active ? '#92400e' : BRAND_COLORS.textMuted, fontSize: 11, fontWeight: '600' }}>
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={{ color: '#92400e', fontSize: 11 }}>
                    {
                      FINANCE_CLEARANCE_MODE_OPTIONS.find(
                        (option) => option.value === normalizeFinanceClearanceMode(program.financeClearanceMode),
                      )?.hint
                    }
                  </Text>
                  {shouldShowFinanceThresholdAmount(program.financeClearanceMode) ? (
                    <View>
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Ambang Outstanding</Text>
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
                        }}
                      />
                    </View>
                  ) : null}
                  {shouldShowFinanceOverdueCount(program.financeClearanceMode) ? (
                    <View>
                      <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Minimal Invoice Overdue</Text>
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
                        }}
                      />
                    </View>
                  ) : null}
                  <View>
                    <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Catatan Policy (opsional)</Text>
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
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Pembuat Soal Diizinkan (opsional)</Text>
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
                        fontSize: 11,
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
                          <Text style={{ color: active ? '#166534' : BRAND_COLORS.textMuted, fontSize: 11 }}>
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
                      <Text style={{ color: toggle.value ? '#166534' : BRAND_COLORS.textMuted, fontSize: 12 }}>
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
                groupedSchedules.length > 0 ? (
                  groupedSchedules.map((group) => (
                    <View
                      key={group.key}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, flex: 1 }}>
                          {group.subjectName} ({group.subjectCode})
                        </Text>
                        <Text
                          style={{
                            color: '#1d4ed8',
                            backgroundColor: '#eff6ff',
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 2,
                            fontSize: 11,
                            fontWeight: '700',
                          }}
                        >
                          {group.examType}
                        </Text>
                      </View>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>
                        {formatDateTime(group.startTime)} - {formatDateTime(group.endTime)}
                      </Text>
                      {group.schedules.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: '#eef3ff',
                            paddingTop: 8,
                            marginTop: 6,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.class?.name || '-'}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Ruang: {item.room || '-'} • Pengawas: {item.proctor?.name || '-'}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                            Packet: {item.packet?.title || '-'}
                          </Text>
                          <Pressable
                            onPress={() => handleDeleteSchedule(item.id)}
                            disabled={deleteScheduleMutation.isPending}
                            style={{
                              marginTop: 8,
                              alignSelf: 'flex-start',
                              borderWidth: 1,
                              borderColor: '#fecaca',
                              backgroundColor: '#fff1f2',
                              borderRadius: 8,
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                            }}
                          >
                            <Text style={{ color: '#be123c', fontWeight: '700', fontSize: 12 }}>
                              {deleteScheduleMutation.isPending ? 'Memproses...' : 'Hapus Jadwal'}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
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
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, flex: 1 }}>
                          {sitting.roomName || '-'}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>{sitting.studentCount} siswa</Text>
                      </View>

                      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 2, fontSize: 12 }}>
                        {formatDateTime(String(sitting.startTime || ''))} - {formatDateTime(String(sitting.endTime || ''))}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6, fontSize: 12 }}>
                        Program: {examTypeLabel(normalizeProgramCode(sitting.examType))} • Sesi: {sitting.sessionLabel || '-'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
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
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Kelola Ruang & Siswa</Text>
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

              {section === 'MENGAWAS' ? (
                filteredSchedules.length > 0 ? (
                  filteredSchedules.map((item) => {
                    const subject = resolveScheduleSubject(item);
                    const type = resolveScheduleExamType(item);
                    const isEditing = editingScheduleId === item.id;
                    return (
                      <View
                        key={item.id}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 12,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', flex: 1, paddingRight: 6 }}>
                            {subject.subjectName} ({subject.subjectCode})
                          </Text>
                          <Text
                            style={{
                              color: '#1d4ed8',
                              backgroundColor: '#eff6ff',
                              borderWidth: 1,
                              borderColor: '#bfdbfe',
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              fontSize: 11,
                              fontWeight: '700',
                            }}
                          >
                            {examTypeLabel(type)}
                          </Text>
                        </View>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          {item.class?.name || '-'} • {formatDateTime(item.startTime)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                          Ruang: {item.room || '-'} • Pengawas: {item.proctor?.name || 'Belum ditentukan'}
                        </Text>

                        {!isEditing ? (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable
                              onPress={() => setEditingScheduleId(item.id)}
                              style={{
                                borderWidth: 1,
                                borderColor: '#bfdbfe',
                                backgroundColor: '#eff6ff',
                                borderRadius: 8,
                                paddingVertical: 7,
                                paddingHorizontal: 10,
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Ubah Pengawas</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleAssignProctor(item.id, user.id)}
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
                              <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>
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
                              marginTop: 4,
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
                                    onPress={() => handleAssignProctor(item.id, teacher.id)}
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
                                      style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}
                                      numberOfLines={1}
                                    >
                                      {teacher.name}
                                    </Text>
                                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }} numberOfLines={1}>
                                      @{teacher.username}
                                    </Text>
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                            <Pressable
                              onPress={() => {
                                setEditingScheduleId(null);
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
                              <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Batal</Text>
                            </Pressable>
                          </View>
                        )}
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
    </ScrollView>
  );
}
