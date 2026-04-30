import { useState, useEffect, useMemo, useRef, type WheelEvent } from 'react';
import { ClipboardList, Loader2, RotateCcw, Save, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../services/grade.service';
import { examService, type ExamPacket } from '../../services/exam.service';
import type {
  GradeComponent,
  RemedialScoreEntry,
  ScoreRemedialAttempt,
  ScoreRemedialMethod,
} from '../../services/grade.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import type { TeacherAssignment, TeacherAssignmentDetail } from '../../services/teacherAssignment.service';
import {
  formatTeacherAssignmentLabel,
  sortTeacherAssignmentsBySubjectClass,
} from '../../services/teacherAssignment.service';
import UnderlineTabBar from '../../components/navigation/UnderlineTabBar';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';

interface Student {
  id: number;
  full_name: string;
  nisn: string;
  nis: string;
  religion?: string | null;
}

interface StudentGrade {
  student_id: number;
  formativeSeriesInput?: string;
  score: string;
}

interface StudentReportGrade {
  studentId: number;
  formatifScore: number | null;
  sbtsScore: number | null;
  sasScore: number | null;
  finalScore: number | null;
  slotScores?: Record<string, number | null> | null;
  description?: string | null;
}

type ApiGradeRow = {
  id?: number | string;
  studentId?: number | string;
  student_id?: number | string;
  subjectId?: number | string;
  subject_id?: number | string;
  academicYearId?: number | string;
  academic_year_id?: number | string;
  componentId?: number | string;
  component_id?: number | string;
  semester?: string;
  score?: number | string | null;
  nf1?: number | string | null;
  nf2?: number | string | null;
  nf3?: number | string | null;
  nf4?: number | string | null;
  nf5?: number | string | null;
  nf6?: number | string | null;
  formativeSeries?: number[] | null;
  formativeSlotCount?: number | string | null;
  component?: {
    type?: string | null;
  } | null;
};

type ApiReportGradeRow = {
  studentId?: number | string;
  formatifScore?: number | null;
  sbtsScore?: number | null;
  sasScore?: number | null;
  finalScore?: number | null;
  slotScores?: Record<string, number | null> | null;
  description?: string | null;
};

type GradeBulkPayload = {
  student_id: number;
  subject_id: number;
  academic_year_id: number;
  grade_component_id: number;
  semester: 'ODD' | 'EVEN';
  score: number | null;
  nf1?: number | null;
  nf2?: number | null;
  nf3?: number | null;
  nf4?: number | null;
  nf5?: number | null;
  nf6?: number | null;
  formative_series?: number[];
  formative_slot_count?: number | null;
  description?: string;
};

type CompetencyThresholdSet = {
  A: string;
  B: string;
  C: string;
  D: string;
};

type CompetencySettings = CompetencyThresholdSet & {
  _byReligion?: Record<string, CompetencyThresholdSet>;
};

type ReligionOption = {
  value: string;
  label: string;
};

const TEACHER_GRADES_FILTER_STORAGE_KEY = 'teacher-grades:filters:v1';

type BulkGradeSaveResult = {
  success?: number;
  failed?: number;
  errors?: Array<{ student_id: number; error: string }>;
  reportSync?: {
    success?: number;
    failed?: number;
    errors?: Array<{ student_id: number; error: string }>;
  };
};

type TeacherGradeTab = 'INPUT' | 'REMEDIAL';
type RemedialModalMode = 'SCORE' | 'HISTORY';

type RemedialSourceOption = {
  code: string;
  label: string;
};

const EMPTY_COMPETENCY_SET: CompetencyThresholdSet = { A: '', B: '', C: '', D: '' };

const RELIGION_LABELS: Record<string, string> = {
  ISLAM: 'Islam',
  KRISTEN: 'Kristen',
  KATOLIK: 'Katolik',
  HINDU: 'Hindu',
  BUDDHA: 'Buddha',
  KONGHUCU: 'Konghucu',
};

const STANDARD_RELIGION_OPTIONS: ReligionOption[] = [
  { value: 'ISLAM', label: 'Islam' },
  { value: 'KRISTEN', label: 'Kristen' },
  { value: 'KATOLIK', label: 'Katolik' },
  { value: 'HINDU', label: 'Hindu' },
  { value: 'BUDDHA', label: 'Buddha' },
  { value: 'KONGHUCU', label: 'Konghucu' },
];

const RELIGION_ALIASES: Record<string, string> = {
  ISLAM: 'ISLAM',
  MUSLIM: 'ISLAM',
  MOSLEM: 'ISLAM',
  KRISTEN: 'KRISTEN',
  KRISTEN_PROTESTAN: 'KRISTEN',
  PROTESTAN: 'KRISTEN',
  CHRISTIAN: 'KRISTEN',
  KATOLIK: 'KATOLIK',
  CATHOLIC: 'KATOLIK',
  HINDU: 'HINDU',
  BUDDHA: 'BUDDHA',
  BUDHA: 'BUDDHA',
  BUDDHIST: 'BUDDHA',
  KONGHUCU: 'KONGHUCU',
  KHONGHUCU: 'KONGHUCU',
  CONFUCIAN: 'KONGHUCU',
};

const normalizeLegacySeriesValues = (rawValues: unknown[]): number[] =>
  rawValues
    .filter((value) => value !== null && value !== undefined && value !== '')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

const isLegacyZeroPaddedSeries = (values: number[]) =>
  Array.isArray(values) && values.length === 6 && values.every((value) => value === 0);

const sanitizeLegacySeriesForDisplay = (rawValues: unknown[], _storedScore?: unknown): number[] => {
  const values = normalizeLegacySeriesValues(rawValues);
  if (values.length === 0 || isLegacyZeroPaddedSeries(values)) return [];

  const trimmedTrailingPadding = (() => {
    let lastNonZeroIndex = -1;
    values.forEach((value, index) => {
      if (value !== 0) lastNonZeroIndex = index;
    });
    if (lastNonZeroIndex < 0) return [];
    return values.slice(0, lastNonZeroIndex + 1);
  })();

  if (
    trimmedTrailingPadding.length > 0 &&
    trimmedTrailingPadding.length < values.length
  ) {
    return trimmedTrailingPadding;
  }

  return values;
};

const averageValues = (values: number[]): number | null => {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, item) => acc + item, 0) / values.length;
};

const normalizeFinalRoundedScore = (raw: number | null | undefined): number | null => {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const fixedTwo = Number(parsed.toFixed(2));
  const fractional = fixedTwo - Math.trunc(fixedTwo);
  if (fractional > 0.5) {
    return Number(Math.ceil(fixedTwo).toFixed(2));
  }
  return fixedTwo;
};

const computeWeightedPreviewScore = (
  rows: Array<{ score: number | null | undefined; weight: number | null | undefined }>,
): number | null => {
  let weightedScoreTotal = 0;
  let weightTotal = 0;

  rows.forEach((row) => {
    const score = Number(row.score);
    const weight = Number(row.weight);
    if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return;
    weightedScoreTotal += score * weight;
    weightTotal += weight;
  });

  if (weightTotal <= 0) return null;
  return weightedScoreTotal / weightTotal;
};

const computeFixedWeightedPreviewScore = (
  rows: Array<{ score: number | null | undefined; weight: number | null | undefined }>,
): number | null => {
  let weightedScoreTotal = 0;
  let weightTotal = 0;
  let hasAnyScoreEvidence = false;

  rows.forEach((row) => {
    const weight = Number(row.weight);
    if (!Number.isFinite(weight) || weight <= 0) return;

    const score = Number(row.score);
    if (Number.isFinite(score)) {
      weightedScoreTotal += score * weight;
      hasAnyScoreEvidence = true;
    }

    weightTotal += weight;
  });

  if (!hasAnyScoreEvidence || weightTotal <= 0) return null;
  return weightedScoreTotal / weightTotal;
};

const formatSeriesValues = (values: number[]) =>
  values
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    .join(', ');

const formatScoreDisplay = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return parsed.toFixed(2);
};

const formatDateTimeDisplay = (value?: string | null): string => {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  if (typeof error === 'object' && error !== null) {
    const maybeError = error as { response?: { data?: { message?: string } }; message?: string };
    return maybeError.response?.data?.message || maybeError.message || fallback;
  }
  return fallback;
};

const getRemedialStatusMeta = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'PASSED') {
    return {
      label: 'Tuntas',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    };
  }
  if (normalized === 'STILL_BELOW_KKM') {
    return {
      label: 'Masih Belum KKM',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    };
  }
  if (normalized === 'CANCELLED') {
    return {
      label: 'Dibatalkan',
      className: 'bg-slate-50 text-slate-600 border border-slate-200',
    };
  }
  if (normalized === 'DRAFT') {
    return {
      label: 'Diberikan',
      className: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    };
  }
  return {
    label: 'Tercatat',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  };
};

const getRemedialMethodLabel = (method?: string | null) => {
  const normalized = String(method || 'MANUAL_SCORE').toUpperCase();
  if (normalized === 'ASSIGNMENT') return 'Tugas Remedial';
  if (normalized === 'QUESTION_SET') return 'Soal/Quiz Remedial';
  return 'Input Nilai Manual';
};

const resolveRemedialComponentCode = (component: GradeComponent): string => {
  return normalizeSlotCode(component.code || component.typeCode || component.reportSlotCode || component.reportSlot || component.type);
};

const parseFormativeSlotDrafts = (drafts: string[]): { values: number[]; invalid: boolean } => {
  if (!Array.isArray(drafts) || drafts.length === 0) return { values: [], invalid: false };
  const values: number[] = [];
  for (const rawDraft of drafts) {
    const cleaned = String(rawDraft || '').trim();
    if (!cleaned) continue;
    const parsed = Number(cleaned.replace(',', '.'));
    if (!Number.isFinite(parsed)) return { values: [], invalid: true };
    if (parsed < 0 || parsed > 100) return { values: [], invalid: true };
    values.push(parsed);
  }
  return { values, invalid: false };
};

const buildFormativeSlotDrafts = (values: number[], slotCount = 0): string[] => {
  const filledDrafts = Array.isArray(values)
    ? values.map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    : [];
  const normalizedSlotCount = Math.max(0, Number(slotCount || 0));
  const totalSlots = Math.max(normalizedSlotCount, filledDrafts.length);
  return [...filledDrafts, ...Array.from({ length: Math.max(0, totalSlots - filledDrafts.length) }, () => '')];
};

const preventFormativeWheelMutation = (event: WheelEvent<HTMLInputElement>) => {
  event.preventDefault();
};

const gradePageTabItems = [
  { id: 'INPUT', label: 'Input Nilai', icon: ClipboardList },
  { id: 'REMEDIAL', label: 'Remedial', icon: RotateCcw },
];

const resolveComponentReportSlotCode = (component?: GradeComponent): string => {
  const explicit = normalizeSlotCode(component?.reportSlotCode || component?.reportSlot);
  if (explicit) return explicit;
  const fromCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  if (fromCode && fromCode !== 'NONE') {
    return fromCode === 'FORMATIVE' ? 'FORMATIF' : fromCode;
  }
  if (component?.type === 'FORMATIVE') return 'FORMATIF';
  if (component?.type === 'MIDTERM') return 'MIDTERM';
  if (component?.type === 'FINAL') return 'FINAL';
  if (component?.type === 'US_THEORY') return 'US_THEORY';
  if (component?.type === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
};

const resolveComponentEntryMode = (component?: GradeComponent): 'NF_SERIES' | 'SINGLE_SCORE' => {
  const explicit = normalizeSlotCode(component?.entryModeCode || component?.entryMode);
  if (explicit === 'NF_SERIES' || explicit === 'SINGLE_SCORE') {
    return explicit;
  }
  const fallbackCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  return fallbackCode === 'FORMATIVE' ? 'NF_SERIES' : 'SINGLE_SCORE';
};

const buildComponentDisplayLabel = (component: GradeComponent) => {
  const baseLabel = String(component.name || component.code || 'Komponen').trim();
  const entryMode = resolveComponentEntryMode(component);
  const reportSlot = resolveComponentReportSlotCode(component);
  const modeLabel = entryMode === 'NF_SERIES' ? 'Bertahap' : 'Satu Nilai';
  const slotLabel = reportSlot !== 'NONE' ? reportSlot : 'Tanpa Slot Rapor';
  return `${baseLabel} (${modeLabel} • ${slotLabel})`;
};

const resolveReadableComponentLabel = (component?: GradeComponent | null, fallback = 'Komponen') => {
  const label = String(component?.name || component?.code || '').trim();
  return label || fallback;
};

const normalizeSlotCode = (raw: unknown): string => String(raw || '').trim().toUpperCase();

const isUsTheorySlot = (raw: unknown): boolean => {
  const normalized = normalizeSlotCode(raw);
  return normalized === 'US_THEORY' || normalized === 'US_TEORY';
};

const normalizeSubjectIdentityToken = (raw: unknown): string =>
  String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeReligionKey = (raw: unknown): string | null => {
  const normalized = normalizeSubjectIdentityToken(raw);
  if (!normalized) return null;
  return RELIGION_ALIASES[normalized] || normalized;
};

const formatReligionLabel = (raw: unknown): string => {
  const normalizedKey = normalizeReligionKey(raw);
  if (!normalizedKey) return '';
  if (RELIGION_LABELS[normalizedKey]) return RELIGION_LABELS[normalizedKey];
  return normalizedKey
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(' ');
};

const emptyCompetencySettings = (): CompetencySettings => ({
  ...EMPTY_COMPETENCY_SET,
});

const emptyCompetencyThresholdSet = (): CompetencyThresholdSet => ({
  ...EMPTY_COMPETENCY_SET,
});

const coerceCompetencySettings = (raw: unknown): CompetencySettings => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyCompetencySettings();
  }

  const source = raw as Record<string, unknown>;
  const byReligionSource =
    source._byReligion && typeof source._byReligion === 'object' && !Array.isArray(source._byReligion)
      ? (source._byReligion as Record<string, unknown>)
      : {};

  const byReligion = Object.fromEntries(
    Object.entries(byReligionSource)
      .map(([rawKey, value]) => {
        const religionKey = normalizeReligionKey(rawKey);
        if (!religionKey || !value || typeof value !== 'object' || Array.isArray(value)) return null;
        const thresholdSet = {
          A: String((value as Record<string, unknown>).A || '').trim(),
          B: String((value as Record<string, unknown>).B || '').trim(),
          C: String((value as Record<string, unknown>).C || '').trim(),
          D: String((value as Record<string, unknown>).D || '').trim(),
        };
        const hasValue = Object.values(thresholdSet).some((entry) => String(entry || '').trim());
        return hasValue ? [religionKey, thresholdSet] : null;
      })
      .filter(
        (
          entry,
        ): entry is [string, CompetencyThresholdSet] => Array.isArray(entry) && entry.length === 2,
      ),
  );

  const settings: CompetencySettings = {
    A: String(source.A || '').trim(),
    B: String(source.B || '').trim(),
    C: String(source.C || '').trim(),
    D: String(source.D || '').trim(),
  };

  if (Object.keys(byReligion).length > 0) {
    settings._byReligion = byReligion;
  }

  return settings;
};

const getReligionThresholdSet = (
  settings: CompetencySettings,
  religionKey?: string | null,
): CompetencyThresholdSet => {
  const normalizedReligionKey = normalizeReligionKey(religionKey);
  if (!normalizedReligionKey) return emptyCompetencyThresholdSet();
  return settings._byReligion?.[normalizedReligionKey] || emptyCompetencyThresholdSet();
};

const updateCompetencySettingValue = (
  settings: CompetencySettings,
  predicate: keyof CompetencyThresholdSet,
  value: string,
  options?: {
    religionKey?: string | null;
    useReligionThreshold?: boolean;
  },
): CompetencySettings => {
  if (options?.useReligionThreshold) {
    const normalizedReligionKey = normalizeReligionKey(options.religionKey);
    if (!normalizedReligionKey) return settings;
    const currentSet = getReligionThresholdSet(settings, normalizedReligionKey);
    const nextByReligion = {
      ...(settings._byReligion || {}),
      [normalizedReligionKey]: {
        ...currentSet,
        [predicate]: value,
      },
    };
    const hasReligionValue = Object.values(nextByReligion[normalizedReligionKey]).some((entry) => String(entry || '').trim());
    if (!hasReligionValue) {
      delete nextByReligion[normalizedReligionKey];
    }
    return {
      ...settings,
      _byReligion: Object.keys(nextByReligion).length > 0 ? nextByReligion : undefined,
    };
  }

  return {
    ...settings,
    [predicate]: value,
  };
};

const hasAnyCompetencySettingValue = (
  settings: CompetencySettings,
  useReligionThreshold: boolean,
): boolean => {
  if (useReligionThreshold) {
    return Object.values(settings._byReligion || {}).some((entry) =>
      Object.values(entry).some((value) => String(value || '').trim()),
    );
  }
  return (['A', 'B', 'C', 'D'] as Array<keyof CompetencyThresholdSet>).some((predicate) =>
    String(settings[predicate] || '').trim(),
  );
};

const sanitizeCompetencySettingsForSave = (
  settings: CompetencySettings,
  useReligionThreshold: boolean,
): CompetencySettings => {
  if (!useReligionThreshold) {
    return {
      A: String(settings.A || '').trim(),
      B: String(settings.B || '').trim(),
      C: String(settings.C || '').trim(),
      D: String(settings.D || '').trim(),
    };
  }

  const nextByReligion = Object.fromEntries(
    Object.entries(settings._byReligion || {})
      .map(([rawKey, entry]) => {
        const religionKey = normalizeReligionKey(rawKey);
        if (!religionKey) return null;
        const thresholdSet = {
          A: String(entry?.A || '').trim(),
          B: String(entry?.B || '').trim(),
          C: String(entry?.C || '').trim(),
          D: String(entry?.D || '').trim(),
        };
        const hasValue = Object.values(thresholdSet).some((value) => String(value || '').trim());
        return hasValue ? [religionKey, thresholdSet] : null;
      })
      .filter(
        (
          entry,
        ): entry is [string, CompetencyThresholdSet] => Array.isArray(entry) && entry.length === 2,
      ),
  );

  return {
    ...EMPTY_COMPETENCY_SET,
    _byReligion: Object.keys(nextByReligion).length > 0 ? nextByReligion : undefined,
  };
};

const deriveCompetencyDescription = (
  score: number | null | undefined,
  kkm: number,
  settings: CompetencySettings,
  options?: {
    religionKey?: string | null;
    useReligionThreshold?: boolean;
  },
): string => {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return '';
  const predicate = numericScore >= 86 ? 'A' : numericScore >= kkm ? 'B' : numericScore >= 60 ? 'C' : 'D';
  if (options?.useReligionThreshold) {
    return String(
      getReligionThresholdSet(settings, options.religionKey)[predicate as keyof CompetencyThresholdSet] || '',
    ).trim();
  }
  return String(settings[predicate as keyof CompetencyThresholdSet] || '').trim();
};

const isReligionCompetencySubject = (
  subject?: Pick<TeacherAssignment['subject'], 'name' | 'code'> | null,
): boolean => {
  const normalizedName = normalizeSubjectIdentityToken(subject?.name);
  const normalizedCode = normalizeSubjectIdentityToken(subject?.code);
  if (!normalizedName && !normalizedCode) return false;
  if (
    [
      'PAI',
      'PAK',
      'PAKB',
      'PAH',
      'PAB',
      'PAKH',
      'PABP',
      'PABP_ISLAM',
      'PABP_KRISTEN',
      'PABP_KATOLIK',
      'PABP_HINDU',
      'PABP_BUDDHA',
      'PABP_KONGHUCU',
    ].includes(normalizedCode)
  ) {
    return true;
  }
  return (
    normalizedName.includes('PENDIDIKAN_AGAMA') ||
    normalizedName === 'AGAMA' ||
    normalizedName.startsWith('AGAMA_')
  );
};

const isTheoryKejuruanSubject = (subject?: Pick<TeacherAssignment['subject'], 'name' | 'code'> | null): boolean => {
  const normalizedName = normalizeSubjectIdentityToken(subject?.name);
  const normalizedCode = normalizeSubjectIdentityToken(subject?.code);
  if (!normalizedName && !normalizedCode) return false;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) {
    return true;
  }
  return (
    normalizedName.includes('KONSENTRASI_KEAHLIAN') ||
    normalizedName === 'KONSENTRASI' ||
    normalizedName === 'KEJURUAN'
  );
};

const resolvePrimarySlots = (components: GradeComponent[]) => {
  const availableSlots: string[] = [];
  let formativeByType: string | null = null;
  let midtermByType: string | null = null;
  let finalByType: string | null = null;

  components.forEach((item) => {
    const slotCode = normalizeSlotCode(resolveComponentReportSlotCode(item));
    if (!slotCode || slotCode === 'NONE') return;
    if (!availableSlots.includes(slotCode)) {
      availableSlots.push(slotCode);
    }

    const componentType = String(item.type || '').trim().toUpperCase();
    const entryMode = resolveComponentEntryMode(item);
    if (!formativeByType && (entryMode === 'NF_SERIES' || componentType === 'FORMATIVE')) {
      formativeByType = slotCode;
      return;
    }
    if (!midtermByType && componentType === 'MIDTERM') {
      midtermByType = slotCode;
      return;
    }
    if (!finalByType && componentType === 'FINAL') {
      finalByType = slotCode;
    }
  });

  const firstSlot = availableSlots[0] || 'NONE';
  const nonFormativeSlots = availableSlots.filter((slot) => slot !== formativeByType);
  const secondSlot = nonFormativeSlots[0] || availableSlots[1] || firstSlot;
  const lastSlot =
    nonFormativeSlots[nonFormativeSlots.length - 1] ||
    availableSlots[availableSlots.length - 1] ||
    secondSlot;

  const formative = formativeByType || firstSlot || 'FORMATIF';
  const midterm = midtermByType || secondSlot || formative || 'NONE';
  const final = finalByType || lastSlot || midterm || formative || 'NONE';

  return {
    formative,
    midterm,
    final,
  };
};

const resolveReportSlotScore = (
  report: StudentReportGrade | undefined,
  slotCode: string,
  fallback: number | null | undefined,
): number | null => {
  if (!report) return fallback ?? null;
  const normalizedSlot = normalizeSlotCode(slotCode);
  const slotScores = report.slotScores;
  if (slotScores && typeof slotScores === 'object' && normalizedSlot) {
    const dynamic = slotScores[normalizedSlot];
    if (dynamic !== undefined && dynamic !== null && Number.isFinite(Number(dynamic))) {
      return Number(dynamic);
    }
  }
  if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }
  return null;
};

const buildFormativeReferenceSlotCode = (slotCode: string, stage: 'MIDTERM' | 'FINAL') => {
  const normalized = normalizeSlotCode(slotCode);
  const suffix = stage === 'MIDTERM' ? 'SBTS_REF' : 'FINAL_REF';
  return normalized ? `${normalized}_${suffix}` : suffix;
};

const isRemedialRowSelectable = (row: RemedialScoreEntry) =>
  !row.isComplete && row.remedialEligibility?.canSelectForActivity === true;

export const TeacherGradesPage = () => {
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TeacherGradeTab>('INPUT');
  
  // Filter states
  const [assignments, setAssignments] = useState<TeacherAssignment[]>([]);
  const [gradeComponents, setGradeComponents] = useState<GradeComponent[]>([]);
  
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<string>('');
  const [selectedComponent, setSelectedComponent] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<'ODD' | 'EVEN' | ''>('');
  const [kkm, setKkm] = useState(75);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [competencySettings, setCompetencySettings] = useState<CompetencySettings>(emptyCompetencySettings());
  const [selectedReligionKey, setSelectedReligionKey] = useState<string>('');
  const [availableReligionKeys, setAvailableReligionKeys] = useState<string[]>([]);
  
  // Data states
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<StudentGrade[]>([]);
  const [reportGradeMap, setReportGradeMap] = useState<Record<number, StudentReportGrade>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [formativeSlotDrafts, setFormativeSlotDrafts] = useState<Record<number, string[]>>({});
  const [remedialRows, setRemedialRows] = useState<RemedialScoreEntry[]>([]);
  const [remedialLoading, setRemedialLoading] = useState(false);
  const [remedialComponentCode, setRemedialComponentCode] = useState('');
  const [remedialIncludeAll, setRemedialIncludeAll] = useState(false);
  const [selectedBulkRemedialIds, setSelectedBulkRemedialIds] = useState<number[]>([]);
  const [showBulkRemedialModal, setShowBulkRemedialModal] = useState(false);
  const [selectedRemedial, setSelectedRemedial] = useState<RemedialScoreEntry | null>(null);
  const [remedialModalMode, setRemedialModalMode] = useState<RemedialModalMode>('SCORE');
  const [remedialDetail, setRemedialDetail] = useState<RemedialScoreEntry | null>(null);
  const [remedialDetailLoading, setRemedialDetailLoading] = useState(false);
  const [remedialScoreInput, setRemedialScoreInput] = useState('');
  const [remedialNoteInput, setRemedialNoteInput] = useState('');
  const [remedialMethodInput, setRemedialMethodInput] = useState<ScoreRemedialMethod>('MANUAL_SCORE');
  const [remedialActivityTitleInput, setRemedialActivityTitleInput] = useState('');
  const [remedialActivityDueAtInput, setRemedialActivityDueAtInput] = useState('');
  const [remedialActivityExamPacketIdInput, setRemedialActivityExamPacketIdInput] = useState('');
  const [remedialActivitySourceExamPacketIdInput, setRemedialActivitySourceExamPacketIdInput] = useState('');
  const [remedialExamPackets, setRemedialExamPackets] = useState<ExamPacket[]>([]);
  const [remedialExamPacketsLoading, setRemedialExamPacketsLoading] = useState(false);
  const [remedialSaving, setRemedialSaving] = useState(false);
  const [isFilterRestoreDone, setIsFilterRestoreDone] = useState(false);
  const restoredAssignmentRef = useRef<string | undefined>(undefined);
  const gradeComponentRequestRef = useRef(0);
  const studentsRequestRef = useRef(0);
  const existingGradesRequestRef = useRef(0);
  const assignmentsRequestRef = useRef(0);
  const remedialRequestRef = useRef(0);
  const remedialDetailRequestRef = useRef(0);
  const remedialPacketRequestRef = useRef(0);
  
  const selectedAcademicYearNum = Number(selectedAcademicYear);
  const assignmentOptions = useMemo(() => {
    if (!Number.isFinite(selectedAcademicYearNum) || selectedAcademicYearNum <= 0) {
      return assignments;
    }
    return assignments.filter((assignment) => Number(assignment.academicYearId) === selectedAcademicYearNum);
  }, [assignments, selectedAcademicYearNum]);

  // Check selected component mode/slot dynamically
  const selectedComponentObj = gradeComponents.find(c => c.id.toString() === selectedComponent);
  const selectedComponentEntryMode = resolveComponentEntryMode(selectedComponentObj);
  const selectedComponentSlotCode = resolveComponentReportSlotCode(selectedComponentObj);
  const isFormatifComponent = selectedComponentEntryMode === 'NF_SERIES';
  // Derived state for filtered components
  const selectedAssignmentObj = assignmentOptions.find(a => a.id.toString() === selectedAssignment);
  const isReligionSubject = isReligionCompetencySubject(selectedAssignmentObj?.subject);
  const filteredComponents = useMemo(() => {
    if (!selectedAssignmentObj) return [];
    const theoryKejuruanOnly = isTheoryKejuruanSubject(selectedAssignmentObj.subject);
    return gradeComponents.filter((component) => {
      if (component.subjectId !== selectedAssignmentObj.subject.id) return false;
      if (theoryKejuruanOnly) {
        return isUsTheorySlot(resolveComponentReportSlotCode(component));
      }
      return true;
    });
  }, [gradeComponents, selectedAssignmentObj]);
  const primarySlots = resolvePrimarySlots(filteredComponents);
  const formativePrimarySlot = primarySlots.formative;
  const midtermPrimarySlot = primarySlots.midterm;
  const finalPrimarySlot = primarySlots.final;
  const hasFormativeSeriesComponent = filteredComponents.some(
    (item) => resolveComponentEntryMode(item) === 'NF_SERIES',
  );
  const hasDistinctMidtermFormula =
    hasFormativeSeriesComponent &&
    normalizeSlotCode(midtermPrimarySlot) !== 'NONE' &&
    normalizeSlotCode(midtermPrimarySlot) !== normalizeSlotCode(formativePrimarySlot);
  const hasDistinctFinalFormula =
    hasFormativeSeriesComponent &&
    normalizeSlotCode(finalPrimarySlot) !== 'NONE' &&
    normalizeSlotCode(finalPrimarySlot) !== normalizeSlotCode(formativePrimarySlot) &&
    normalizeSlotCode(finalPrimarySlot) !== normalizeSlotCode(midtermPrimarySlot);
  const isMidtermComponent =
    !isFormatifComponent &&
    hasDistinctMidtermFormula &&
    selectedComponentSlotCode === midtermPrimarySlot;
  const isFinalComponent =
    !isFormatifComponent &&
    hasDistinctFinalFormula &&
    selectedComponentSlotCode === finalPrimarySlot;
  const formativeComponentObj =
    filteredComponents.find(
      (item) =>
        resolveComponentEntryMode(item) === 'NF_SERIES' ||
        resolveComponentReportSlotCode(item) === formativePrimarySlot,
    ) || null;
  const midtermComponentObj =
    filteredComponents.find((item) => resolveComponentReportSlotCode(item) === midtermPrimarySlot) || null;
  const finalComponentObj =
    filteredComponents.find((item) => resolveComponentReportSlotCode(item) === finalPrimarySlot) || null;
  const formativeComponentLabel = resolveReadableComponentLabel(formativeComponentObj, 'Komponen 1');
  const midtermComponentLabel = resolveReadableComponentLabel(midtermComponentObj, 'Komponen 2');
  const finalComponentLabel = resolveReadableComponentLabel(finalComponentObj, 'Komponen 3');
  const remedialSourceOptions = useMemo<RemedialSourceOption[]>(() => {
    const optionMap = new Map<string, string>();
    filteredComponents.forEach((component) => {
      const code = resolveRemedialComponentCode(component);
      if (!code || optionMap.has(code)) return;
      optionMap.set(code, buildComponentDisplayLabel(component));
    });
    return Array.from(optionMap.entries()).map(([code, label]) => ({ code, label }));
  }, [filteredComponents]);
  const remedialSummary = useMemo(() => {
    const complete = remedialRows.filter((row) => row.isComplete).length;
    const selectable = remedialRows.filter(isRemedialRowSelectable).length;
    const blocked = remedialRows.filter((row) => row.remedialEligibility?.isBlockedByHomeroom).length;
    const active = remedialRows.filter((row) => row.remedialEligibility?.hasActiveRemedialActivity).length;
    return {
      total: remedialRows.length,
      pending: remedialRows.length - complete,
      complete,
      selectable,
      blocked,
      active,
    };
  }, [remedialRows]);
  const selectableRemedialRows = useMemo(
    () => remedialRows.filter(isRemedialRowSelectable),
    [remedialRows],
  );
  const remedialManagementRows = useMemo(
    () => remedialRows.filter((row) => !row.isComplete),
    [remedialRows],
  );
  const selectedBulkRemedialRows = useMemo(
    () => remedialRows.filter((row) => selectedBulkRemedialIds.includes(row.scoreEntryId) && isRemedialRowSelectable(row)),
    [remedialRows, selectedBulkRemedialIds],
  );
  const bulkReferenceRemedialRow = selectedBulkRemedialRows[0] || selectableRemedialRows[0] || remedialManagementRows[0] || null;
  const activeRemedialDetail = remedialDetail || selectedRemedial;
  const isRemedialScoreMode = remedialModalMode === 'SCORE';
  const isRemedialHistoryMode = remedialModalMode === 'HISTORY';
  const primaryFormativeComponentId =
    filteredComponents.find((item) => resolveComponentEntryMode(item) === 'NF_SERIES')?.id ?? null;
  const religionOptions = useMemo<ReligionOption[]>(() => {
    if (!isReligionSubject) return [];
    const optionMap = new Map<string, string>();

    STANDARD_RELIGION_OPTIONS.forEach((option) => {
      optionMap.set(option.value, option.label);
    });

    availableReligionKeys.forEach((rawKey) => {
      const religionKey = normalizeReligionKey(rawKey);
      if (!religionKey) return;
      optionMap.set(religionKey, formatReligionLabel(religionKey));
    });

    students.forEach((student) => {
      const religionKey = normalizeReligionKey(student.religion);
      if (!religionKey) return;
      optionMap.set(religionKey, formatReligionLabel(student.religion || religionKey));
    });

    Object.keys(competencySettings._byReligion || {}).forEach((rawKey) => {
      const religionKey = normalizeReligionKey(rawKey);
      if (!religionKey) return;
      if (!optionMap.has(religionKey)) {
        optionMap.set(religionKey, formatReligionLabel(religionKey));
      }
    });

    return Array.from(optionMap.entries()).map(([value, label]) => ({ value, label }));
  }, [availableReligionKeys, competencySettings._byReligion, isReligionSubject, students]);
  const activeCompetencyThresholdSet = isReligionSubject
    ? getReligionThresholdSet(competencySettings, selectedReligionKey)
    : competencySettings;

  const fetchAssignmentsByAcademicYear = async (
    academicYearId: string,
    preferredAssignmentId?: string,
    preferredSemester?: 'ODD' | 'EVEN' | '',
  ) => {
    const requestId = ++assignmentsRequestRef.current;
    const parsedAcademicYearId = Number(academicYearId);
    if (!Number.isFinite(parsedAcademicYearId) || parsedAcademicYearId <= 0) {
      setAssignments([]);
      setSelectedAssignment('');
      return;
    }

    const assignRes = await teacherAssignmentService.list({
      limit: 1000,
      academicYearId: parsedAcademicYearId,
      semester: preferredSemester || undefined,
    });
    const assignResponse = assignRes as { data?: { assignments?: TeacherAssignment[] }, assignments?: TeacherAssignment[] };
    const assignsData = assignResponse.data?.assignments || assignResponse.assignments || [];

    if (requestId !== assignmentsRequestRef.current) return;

    if (!Array.isArray(assignsData)) {
      setAssignments([]);
      setSelectedAssignment('');
      return;
    }

    const sorted = sortTeacherAssignmentsBySubjectClass(assignsData as TeacherAssignment[]);
    setAssignments(sorted);

    setSelectedAssignment((previous) => {
      const candidate = preferredAssignmentId ?? previous;
      if (candidate && sorted.some((assignment) => assignment.id.toString() === candidate)) {
        return candidate;
      }
      return '';
    });
  };

  useEffect(() => {
    fetchInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const activeAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);
    if (!Number.isFinite(activeAcademicYearId) || activeAcademicYearId <= 0) {
      setSelectedAcademicYear('');
      return;
    }
    setSelectedAcademicYear(String(activeAcademicYearId));
  }, [activeAcademicYear?.academicYearId, activeAcademicYear?.id]);

  useEffect(() => {
    try {
      if (!isFilterRestoreDone) return;
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(
        TEACHER_GRADES_FILTER_STORAGE_KEY,
        JSON.stringify({
          semester: selectedSemester,
          assignment: selectedAssignment,
          component: selectedComponent,
        }),
      );
    } catch (error) {
      console.warn('Failed to persist teacher grade filters:', error);
    }
  }, [isFilterRestoreDone, selectedAcademicYear, selectedSemester, selectedAssignment, selectedComponent]);

  useEffect(() => {
    if (selectedAssignment) {
      fetchStudents();
    }
  }, [selectedAssignment, selectedSemester, assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedAssignment && selectedAcademicYear && selectedSemester) {
      fetchGradeComponents();
      return;
    }
    setGradeComponents([]);
    setSelectedComponent('');
  }, [selectedAssignment, selectedAcademicYear, selectedSemester, assignments]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (
      selectedAssignment &&
      selectedComponent &&
      selectedAcademicYear &&
      selectedSemester &&
      students.length > 0
    ) {
      fetchExistingGrades();
    }
  }, [selectedAssignment, selectedComponent, selectedAcademicYear, selectedSemester, students]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isReligionSubject) {
      if (selectedReligionKey) {
        setSelectedReligionKey('');
      }
      return;
    }
    if (religionOptions.length === 0) {
      if (selectedReligionKey) {
        setSelectedReligionKey('');
      }
      return;
    }
    if (!religionOptions.some((option) => option.value === selectedReligionKey)) {
      setSelectedReligionKey(religionOptions[0].value);
    }
  }, [isReligionSubject, religionOptions, selectedReligionKey]);

  useEffect(() => {
    if (!isFinalComponent || !hasAnyCompetencySettingValue(competencySettings, isReligionSubject)) {
      setDescriptions({});
      return;
    }

    const nextDescriptions: Record<number, string> = {};
    students.forEach((student) => {
      const report = reportGradeMap[student.id];
      if (report?.finalScore === null || report?.finalScore === undefined) return;
      const nextDescription = deriveCompetencyDescription(report.finalScore, kkm, competencySettings, {
        religionKey: student.religion,
        useReligionThreshold: isReligionSubject,
      });
      if (nextDescription) {
        nextDescriptions[student.id] = nextDescription;
      }
    });
    setDescriptions(nextDescriptions);
  }, [competencySettings, isFinalComponent, isReligionSubject, kkm, reportGradeMap, students]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setIsFilterRestoreDone(false);

      let restoredFilter: {
        semester?: 'ODD' | 'EVEN' | '';
        assignment?: string;
        component?: string;
      } | null = null;
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const raw = window.localStorage.getItem(TEACHER_GRADES_FILTER_STORAGE_KEY);
          if (raw) restoredFilter = JSON.parse(raw);
        }
      } catch (error) {
        console.warn('Failed to restore teacher grade filters:', error);
      }
      restoredAssignmentRef.current = restoredFilter?.assignment;

      if (restoredFilter?.component) {
        setSelectedComponent(restoredFilter.component);
      }
      if (restoredFilter?.semester === 'ODD' || restoredFilter?.semester === 'EVEN') {
        setSelectedSemester(restoredFilter.semester);
      }

    } catch (error) {
      console.error('Fetch initial data error:', error);
      toast.error('Gagal memuat data awal');
    } finally {
      setLoading(false);
      setIsFilterRestoreDone(true);
    }
  };

  useEffect(() => {
    if (!selectedAcademicYear || !isFilterRestoreDone) return;
    fetchAssignmentsByAcademicYear(
      selectedAcademicYear,
      restoredAssignmentRef.current,
      selectedSemester,
    ).catch((error) => {
      console.error('Fetch assignments by academic year error:', error);
      toast.error('Gagal memuat assignment guru');
      setAssignments([]);
      setSelectedAssignment('');
    }).finally(() => {
      restoredAssignmentRef.current = undefined;
    });
  }, [selectedAcademicYear, selectedSemester, isFilterRestoreDone]);

  useEffect(() => {
    if (!selectedAssignment) return;
    const stillExists = assignmentOptions.some((assignment) => assignment.id.toString() === selectedAssignment);
    if (!stillExists) {
      setSelectedAssignment('');
      setSelectedComponent('');
    }
  }, [assignmentOptions, selectedAssignment]);

  useEffect(() => {
    if (!selectedAssignmentObj) {
      if (selectedComponent) setSelectedComponent('');
      return;
    }
    if (!selectedComponent) return;
    const exists = filteredComponents.some((component) => component.id.toString() === selectedComponent);
    if (!exists) {
      setSelectedComponent('');
    }
  }, [filteredComponents, selectedAssignmentObj, selectedComponent]);

  useEffect(() => {
    setRemedialRows([]);
    setRemedialComponentCode('');
    setSelectedRemedial(null);
    setRemedialDetail(null);
    setSelectedBulkRemedialIds([]);
    setShowBulkRemedialModal(false);
    setRemedialExamPackets([]);
    setRemedialActivityExamPacketIdInput('');
    setRemedialActivitySourceExamPacketIdInput('');
  }, [selectedAssignment, selectedSemester]);

  useEffect(() => {
    setSelectedBulkRemedialIds((current) =>
      current.filter((scoreEntryId) =>
        remedialRows.some((row) => row.scoreEntryId === scoreEntryId && isRemedialRowSelectable(row)),
      ),
    );
  }, [remedialRows]);

  useEffect(() => {
    if (!remedialComponentCode) return;
    const stillExists = remedialSourceOptions.some((option) => option.code === remedialComponentCode);
    if (!stillExists) {
      setRemedialComponentCode('');
    }
  }, [remedialComponentCode, remedialSourceOptions]);

  useEffect(() => {
    if (activeTab !== 'REMEDIAL') return;
    fetchRemedialRows(true);
  }, [
    activeTab,
    remedialComponentCode,
    remedialIncludeAll,
    selectedAcademicYear,
    selectedAssignment,
    selectedSemester,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const packetReferenceEntry = showBulkRemedialModal ? bulkReferenceRemedialRow : null;
    if (remedialMethodInput !== 'QUESTION_SET' || !packetReferenceEntry) {
      setRemedialExamPackets([]);
      setRemedialActivityExamPacketIdInput('');
      setRemedialActivitySourceExamPacketIdInput('');
      return;
    }
    fetchRemedialExamPackets(packetReferenceEntry);
  }, [remedialMethodInput, showBulkRemedialModal, bulkReferenceRemedialRow?.scoreEntryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchGradeComponents = async () => {
    const requestId = ++gradeComponentRequestRef.current;
    try {
      const assignment = selectedAssignmentObj;
      if (!assignment || !selectedAcademicYear || !selectedSemester) return;

      const response = await gradeService.getComponents({
        subject_id: assignment.subject.id,
        academic_year_id: parseInt(selectedAcademicYear),
        assignment_id: assignment.id,
        semester: selectedSemester,
      });
      const payload = response as { data?: GradeComponent[] } | GradeComponent[];
      const components =
        'data' in payload && Array.isArray(payload.data)
          ? payload.data
          : (Array.isArray(payload) ? payload : []);

      if (requestId !== gradeComponentRequestRef.current) return;

      const sorted = [...components].sort((a, b) => {
        const aOrder = Number(a.displayOrder ?? 999);
        const bOrder = Number(b.displayOrder ?? 999);
        if (aOrder !== bOrder) return aOrder - bOrder;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

      setGradeComponents(sorted);
      setSelectedComponent((previous) => {
        if (!previous) return previous;
        const exists = sorted.some((item) => item.id.toString() === previous);
        return exists ? previous : '';
      });
    } catch (error) {
      if (requestId !== gradeComponentRequestRef.current) return;
      console.error('Fetch grade components error:', error);
      toast.error('Gagal memuat komponen nilai dinamis');
      setGradeComponents([]);
      setSelectedComponent('');
    }
  };

  const fetchStudents = async () => {
    const requestId = ++studentsRequestRef.current;
    try {
      if (!selectedAssignment) {
        setStudents([]);
        setGrades([]);
        setAvailableReligionKeys([]);
        return;
      }

      const assignDetail = await teacherAssignmentService.getById(
        Number(selectedAssignment),
        selectedSemester || undefined,
      );
      const detailAssignment = assignDetail.data as TeacherAssignmentDetail | undefined;

      if (requestId !== studentsRequestRef.current) return;
      if (!detailAssignment || typeof detailAssignment !== 'object') {
        setStudents([]);
        setGrades([]);
        setAvailableReligionKeys([]);
        return;
      }

      setKkm(Number(detailAssignment.kkm || selectedAssignmentObj?.kkm || 75));
      setCompetencySettings(coerceCompetencySettings(detailAssignment.competencyThresholds));
      setAvailableReligionKeys(
        Array.isArray(detailAssignment.availableReligions) ? detailAssignment.availableReligions : [],
      );

      const studentsData = Array.isArray(detailAssignment.class?.students)
        ? detailAssignment.class.students
        : [];

      setStudents(
        studentsData.map((student) => ({
          id: student.id,
          full_name: student.name,
          nisn: student.nisn || '',
          nis: student.nis || '',
          religion: student.religion || null,
        })),
      );

      setGrades(
        studentsData.map((student) => ({
          student_id: student.id,
          formativeSeriesInput: '',
          score: '',
        })),
      );
      setFormativeSlotDrafts({});
    } catch (error) {
      if (requestId !== studentsRequestRef.current) return;
      console.error('Fetch students error:', error);
      toast.error('Gagal memuat data siswa');
      setStudents([]);
      setGrades([]);
      setAvailableReligionKeys([]);
      setFormativeSlotDrafts({});
    }
  };

  const refreshReportGradeSnapshot = async (requestId?: number) => {
    const assignment = selectedAssignmentObj;
    const academicYearId = Number(selectedAcademicYear);
    if (
      !assignment ||
      !Number.isFinite(academicYearId) ||
      academicYearId <= 0 ||
      !selectedSemester
    ) {
      setReportGradeMap({});
      setDescriptions({});
      return;
    }

    const reportRes = await gradeService.getReportGrades({
      class_id: assignment.class.id,
      subject_id: assignment.subject.id,
      academic_year_id: academicYearId,
      semester: selectedSemester,
    });
    const reportResponse = reportRes as { data?: ApiReportGradeRow[] } | ApiReportGradeRow[];
    const reportData =
      'data' in reportResponse && Array.isArray(reportResponse.data)
        ? reportResponse.data
        : (Array.isArray(reportResponse) ? reportResponse : []);
    const nextReportMap: Record<number, StudentReportGrade> = {};
    const nextDescriptions: Record<number, string> = {};

    if (Array.isArray(reportData)) {
      reportData.forEach((r: ApiReportGradeRow) => {
        const studentId = Number(r?.studentId);
        if (!studentId) return;
        nextReportMap[studentId] = {
          studentId,
          formatifScore: r.formatifScore ?? null,
          sbtsScore: r.sbtsScore ?? null,
          sasScore: r.sasScore ?? null,
          finalScore: r.finalScore ?? null,
          slotScores:
            r.slotScores && typeof r.slotScores === 'object'
              ? (r.slotScores as Record<string, number | null>)
              : null,
          description: r.description ?? null,
        };
        if (typeof r.description === 'string' && r.description.trim()) {
          nextDescriptions[studentId] = r.description;
        }
      });
    }

    if (requestId && requestId !== existingGradesRequestRef.current) return;
    setReportGradeMap(nextReportMap);
    setDescriptions(isFinalComponent ? nextDescriptions : {});
  };

  const fetchExistingGrades = async () => {
    const requestId = ++existingGradesRequestRef.current;
    try {
      const assignment = selectedAssignmentObj;
      if (!assignment) return;
      if (students.length === 0) return;

      const response = await gradeService.getGradesByClassSubject(
        assignment.class.id,
        assignment.subject.id,
        parseInt(selectedAcademicYear),
        selectedSemester
      );

      const allGradesResponse = response as { data?: ApiGradeRow[] } | ApiGradeRow[];
      const rawGrades = (
        'data' in allGradesResponse && Array.isArray(allGradesResponse.data)
          ? allGradesResponse.data
          : Array.isArray(allGradesResponse)
            ? allGradesResponse
            : []
      ) as ApiGradeRow[];
      const latestGradesByKey = new Map<string, ApiGradeRow>();
      rawGrades.forEach((row: ApiGradeRow) => {
        const studentId = Number(row?.studentId ?? row?.student_id);
        const subjectId = Number(row?.subjectId ?? row?.subject_id);
        const academicYearId = Number(row?.academicYearId ?? row?.academic_year_id);
        const componentId = Number(row?.componentId ?? row?.component_id);
        const semesterKey = String(row?.semester || '');
        if (!studentId || !subjectId || !academicYearId || !componentId || !semesterKey) return;
        const key = `${studentId}:${subjectId}:${academicYearId}:${componentId}:${semesterKey}`;
        const currentId = Number(row?.id || 0);
        const previous = latestGradesByKey.get(key);
        const previousId = Number(previous?.id || 0);
        if (!previous || currentId >= previousId) {
          latestGradesByKey.set(key, row);
        }
      });
      const allGrades = latestGradesByKey.size > 0 ? Array.from(latestGradesByKey.values()) : rawGrades;
      if (requestId !== existingGradesRequestRef.current) return;
      
      try {
          await refreshReportGradeSnapshot(requestId);
          if (requestId !== existingGradesRequestRef.current) return;
          setFormativeSlotDrafts({});
      } catch (e) {
          if (requestId !== existingGradesRequestRef.current) return;
          console.error('Error fetching report grades', e);
          setReportGradeMap({});
          setDescriptions({});
          setFormativeSlotDrafts({});
      }

      // Rebuild grade rows from student list to avoid refresh race condition.
      const nextFormativeSlotDrafts: Record<number, string[]> = {};
      const nextGrades = students.map((student) => {
        const existing = allGrades.find(
          (g: ApiGradeRow) =>
            (g.studentId === student.id || g.student_id === student.id) &&
            String(Number(g.componentId || g.component_id || 0)) === selectedComponent,
        );

        const formatifData =
          allGrades.find(
            (g: ApiGradeRow) =>
              (g.studentId === student.id || g.student_id === student.id) &&
              Number(g.componentId || g.component_id) === Number(primaryFormativeComponentId || -1),
          ) ||
          allGrades.find(
            (g: ApiGradeRow) =>
              (g.studentId === student.id || g.student_id === student.id) &&
              (g.component?.type === 'FORMATIVE' || g.component?.type === 'FORMATIF'),
          );

        const dynamicSeries = Array.isArray(formatifData?.formativeSeries)
          ? formatifData.formativeSeries
          : Array.isArray(existing?.formativeSeries)
            ? existing.formativeSeries
            : [];
        const savedSlotCount = Math.max(
          0,
          Number(existing?.formativeSlotCount || formatifData?.formativeSlotCount || 0),
        );

        let resolvedSeriesValues: number[] = [];
        let formativeSeriesInput = '';
        if (dynamicSeries.length > 0) {
          resolvedSeriesValues = isLegacyZeroPaddedSeries(dynamicSeries) ? [] : dynamicSeries;
          formativeSeriesInput = isLegacyZeroPaddedSeries(dynamicSeries) ? '' : formatSeriesValues(dynamicSeries);
        } else {
          const legacyValues = sanitizeLegacySeriesForDisplay([
            formatifData?.nf1,
            formatifData?.nf2,
            formatifData?.nf3,
            formatifData?.nf4,
            formatifData?.nf5,
            formatifData?.nf6,
            existing?.nf1,
            existing?.nf2,
            existing?.nf3,
            existing?.nf4,
            existing?.nf5,
            existing?.nf6,
          ], existing?.score ?? formatifData?.score ?? null);
          const legacySeries = legacyValues;
          if (!isLegacyZeroPaddedSeries(legacySeries) && legacySeries.length > 0) {
            resolvedSeriesValues = legacySeries;
            formativeSeriesInput = formatSeriesValues(legacySeries);
          }
        }

        const slotDrafts = buildFormativeSlotDrafts(
          resolvedSeriesValues,
          Math.max(savedSlotCount, resolvedSeriesValues.length),
        );
        if (slotDrafts.length > 0) {
          nextFormativeSlotDrafts[student.id] = slotDrafts;
        }

        const formativeSeriesValues = parseFormativeSlotDrafts(slotDrafts).values;
        const formativeAverage = averageValues(formativeSeriesValues);
        const existingScore =
          existing?.score === null || existing?.score === undefined || existing?.score === ''
            ? ''
            : Number(existing.score).toFixed(2);

        return {
          student_id: student.id,
          score:
            isFormatifComponent && formativeAverage !== null
              ? formativeAverage.toFixed(2)
              : existingScore,
          formativeSeriesInput,
          };
      });
      if (requestId !== existingGradesRequestRef.current) return;
      setGrades(nextGrades);
      setFormativeSlotDrafts(nextFormativeSlotDrafts);

    } catch (error) {
      if (requestId !== existingGradesRequestRef.current) return;
      console.error('Fetch existing grades error:', error);
    }
  };

  const handleScoreChange = (studentId: number, value: string) => {
    if (value !== '' && (isNaN(Number(value)) || Number(value) < 0 || Number(value) > 100)) {
      return;
    }

    setGrades(prev => prev.map(grade => {
      if (grade.student_id === studentId) {
        return { ...grade, score: value };
      }
      return grade;
    }));
  };

  const getStudentFormativeSlotDrafts = (studentId: number): string[] => {
    return Array.isArray(formativeSlotDrafts[studentId]) ? formativeSlotDrafts[studentId] : [];
  };

  const getStudentVisibleFormativeSlotDrafts = (studentId: number): string[] => {
    const drafts = getStudentFormativeSlotDrafts(studentId);
    return drafts.length > 0 ? drafts : [''];
  };

  const syncFormativeSlotDrafts = (studentId: number, nextDrafts: string[]) => {
    const normalizedDrafts = Array.isArray(nextDrafts) ? nextDrafts.map((item) => String(item ?? '')) : [];
    const parsed = parseFormativeSlotDrafts(normalizedDrafts);
    if (parsed.invalid) return false;
    const average = averageValues(parsed.values);
    setFormativeSlotDrafts((prev) => {
      if (normalizedDrafts.length === 0) {
        if (!(studentId in prev)) return prev;
        const next = { ...prev };
        delete next[studentId];
        return next;
      }
      return {
        ...prev,
        [studentId]: normalizedDrafts,
      };
    });
    setGrades((prev) =>
      prev.map((grade) => {
        if (grade.student_id !== studentId) return grade;
        return {
          ...grade,
          formativeSeriesInput: formatSeriesValues(parsed.values),
          score: average === null ? '' : average.toFixed(2),
        };
      }),
    );
    return true;
  };

  const handleFormativeValueChange = (studentId: number, index: number, rawValue: string) => {
    const current = getStudentFormativeSlotDrafts(studentId);
    const nextDrafts = current.length > 0 ? [...current] : [''];
    if (rawValue.trim() === '') {
      if (index >= nextDrafts.length) return;
      nextDrafts[index] = '';
      syncFormativeSlotDrafts(studentId, nextDrafts);
      return;
    }
    const normalizedRawValue = rawValue.replace(',', '.');
    const parsed = Number(normalizedRawValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
    nextDrafts[index] = normalizedRawValue;
    syncFormativeSlotDrafts(studentId, nextDrafts);
  };

  const handleRemoveFormativeValue = (studentId: number, index: number) => {
    const current = getStudentFormativeSlotDrafts(studentId);
    if (index >= current.length) return;
    const currentValue = String(current[index] || '').trim();
    if (currentValue) {
      const confirmed = window.confirm(
        `Nilai ${currentValue} akan dihapus dari entri formatif. Lanjutkan?`,
      );
      if (!confirmed) return;
    }
    syncFormativeSlotDrafts(
      studentId,
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const handleAddFormativeValue = (studentId: number) => {
    const current = getStudentFormativeSlotDrafts(studentId);
    const nextDrafts = current.length > 0 ? [...current, ''] : ['', ''];
    syncFormativeSlotDrafts(studentId, nextDrafts);
  };

  const fetchRemedialRows = async (silent = false) => {
    const requestId = ++remedialRequestRef.current;
    const assignment = selectedAssignmentObj;
    const academicYearId = Number(selectedAcademicYear);

    if (
      !assignment ||
      !Number.isFinite(academicYearId) ||
      academicYearId <= 0 ||
      !selectedSemester
    ) {
      setRemedialRows([]);
      return;
    }

    try {
      if (!silent) setRemedialLoading(true);
      const rows = await gradeService.getRemedialEligibleScores({
        subjectId: assignment.subject.id,
        academicYearId,
        classId: assignment.class.id,
        semester: selectedSemester,
        componentCode: remedialComponentCode || undefined,
        includeAll: remedialIncludeAll,
        limit: 500,
      });
      if (requestId !== remedialRequestRef.current) return;
      setRemedialRows(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (requestId !== remedialRequestRef.current) return;
      console.error('Fetch remedial rows error:', error);
      toast.error(getApiErrorMessage(error, 'Gagal memuat daftar remedial'));
      setRemedialRows([]);
    } finally {
      if (requestId === remedialRequestRef.current) {
        setRemedialLoading(false);
      }
    }
  };

  const fetchRemedialDetail = async (scoreEntryId: number) => {
    const requestId = ++remedialDetailRequestRef.current;
    try {
      setRemedialDetailLoading(true);
      const detail = await gradeService.getScoreRemedials(scoreEntryId);
      if (requestId !== remedialDetailRequestRef.current) return;
      setRemedialDetail(detail);
      setSelectedRemedial(detail);
    } catch (error) {
      if (requestId !== remedialDetailRequestRef.current) return;
      console.error('Fetch remedial detail error:', error);
      toast.error(getApiErrorMessage(error, 'Gagal memuat riwayat remedial'));
    } finally {
      if (requestId === remedialDetailRequestRef.current) {
        setRemedialDetailLoading(false);
      }
    }
  };

  const fetchRemedialExamPackets = async (entry: RemedialScoreEntry) => {
    const requestId = ++remedialPacketRequestRef.current;
    try {
      setRemedialExamPacketsLoading(true);
      const response = await examService.getPackets({
        subjectId: entry.subjectId,
        academicYearId: entry.academicYearId,
        semester: entry.semester,
        scope: 'teacher',
        limit: 100,
      });
      if (requestId !== remedialPacketRequestRef.current) return;
      const payload = response as { data?: ExamPacket[] | { packets?: ExamPacket[] } } | ExamPacket[];
      const packets = Array.isArray(payload)
        ? payload
        : Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.data?.packets)
            ? payload.data.packets
            : [];
      setRemedialExamPackets(packets);
    } catch (error) {
      if (requestId !== remedialPacketRequestRef.current) return;
      console.error('Fetch remedial exam packets error:', error);
      toast.error(getApiErrorMessage(error, 'Gagal memuat paket soal remedial'));
      setRemedialExamPackets([]);
    } finally {
      if (requestId === remedialPacketRequestRef.current) {
        setRemedialExamPacketsLoading(false);
      }
    }
  };

  const openRemedialModal = (row: RemedialScoreEntry, mode: RemedialModalMode = 'SCORE') => {
    setSelectedRemedial(row);
    setRemedialDetail(row);
    setRemedialModalMode(mode);
    setRemedialScoreInput('');
    setRemedialNoteInput('');
    setRemedialMethodInput('MANUAL_SCORE');
    setRemedialActivityTitleInput('');
    setRemedialActivityDueAtInput('');
    setRemedialActivityExamPacketIdInput('');
    setRemedialActivitySourceExamPacketIdInput('');
    setRemedialExamPackets([]);
    fetchRemedialDetail(row.scoreEntryId);
  };

  const closeRemedialModal = () => {
    setSelectedRemedial(null);
    setRemedialDetail(null);
    setRemedialModalMode('SCORE');
    setRemedialScoreInput('');
    setRemedialNoteInput('');
    setRemedialMethodInput('MANUAL_SCORE');
    setRemedialActivityTitleInput('');
    setRemedialActivityDueAtInput('');
    setRemedialActivityExamPacketIdInput('');
    setRemedialActivitySourceExamPacketIdInput('');
    setRemedialExamPackets([]);
    setRemedialDetailLoading(false);
  };

  const resetRemedialActivityInputs = () => {
    setRemedialActivityTitleInput('');
    setRemedialActivityDueAtInput('');
    setRemedialActivityExamPacketIdInput('');
    setRemedialActivitySourceExamPacketIdInput('');
    setRemedialNoteInput('');
  };

  const openBulkRemedialModal = () => {
    if (remedialManagementRows.length === 0) {
      toast.error('Tidak ada siswa belum KKM pada filter ini.');
      return;
    }
    setSelectedRemedial(null);
    setRemedialDetail(null);
    setRemedialScoreInput('');
    setRemedialMethodInput('QUESTION_SET');
    resetRemedialActivityInputs();
    const sourceLabel = bulkReferenceRemedialRow?.sourceLabel || 'Remedial';
    setRemedialActivityTitleInput(`Remedial ${sourceLabel}`);
    setShowBulkRemedialModal(true);
  };

  const closeBulkRemedialModal = () => {
    setShowBulkRemedialModal(false);
    resetRemedialActivityInputs();
    setRemedialExamPackets([]);
  };

  const handleSaveRemedial = async () => {
    const activeRemedial = remedialDetail || selectedRemedial;
    if (!activeRemedial) return;
    const parsedScore = Number(remedialScoreInput.replace(',', '.'));
    if (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      toast.error('Nilai remedial harus berupa angka 0-100.');
      return;
    }

    try {
      setRemedialSaving(true);
      await gradeService.createScoreRemedial({
        scoreEntryId: activeRemedial.scoreEntryId,
        remedialScore: parsedScore,
        method: 'MANUAL_SCORE',
        note: remedialNoteInput.trim() || undefined,
      });
      toast.success('Nilai remedial berhasil disimpan.');
      setRemedialScoreInput('');
      setRemedialNoteInput('');
      setRemedialMethodInput('MANUAL_SCORE');
      setRemedialActivityTitleInput('');
      setRemedialActivityDueAtInput('');
      setRemedialActivityExamPacketIdInput('');
      setRemedialActivitySourceExamPacketIdInput('');
      await fetchRemedialDetail(activeRemedial.scoreEntryId);
      await fetchRemedialRows(true);
      await refreshReportGradeSnapshot();
    } catch (error) {
      console.error('Save remedial error:', error);
      toast.error(getApiErrorMessage(error, 'Gagal menyimpan nilai remedial'));
    } finally {
      setRemedialSaving(false);
    }
  };

  const handleBulkGiveRemedialActivity = async () => {
    if (selectedBulkRemedialRows.length === 0) {
      toast.error('Pilih minimal satu siswa yang bisa remedial.');
      return;
    }
    if (remedialMethodInput === 'MANUAL_SCORE') {
      toast.error('Pilih metode tugas remedial atau soal/quiz remedial.');
      return;
    }

    const activityTitle = remedialActivityTitleInput.trim();
    const activityExamPacketId = Number(remedialActivityExamPacketIdInput || 0);
    const activitySourceExamPacketId = Number(remedialActivitySourceExamPacketIdInput || 0);

    if (!activityTitle && !activityExamPacketId && !activitySourceExamPacketId) {
      toast.error('Isi judul remedial atau pilih paket soal sebelum remedial diterbitkan.');
      return;
    }

    try {
      setRemedialSaving(true);
      const response = await gradeService.createBulkScoreRemedialActivities({
        scoreEntryIds: selectedBulkRemedialRows.map((row) => row.scoreEntryId),
        method: remedialMethodInput,
        activityTitle: activityTitle || undefined,
        activityDueAt: remedialActivityDueAtInput || undefined,
        activityExamPacketId: activityExamPacketId || undefined,
        activitySourceExamPacketId: activitySourceExamPacketId || undefined,
        note: remedialNoteInput.trim() || undefined,
      });
      toast.success(response?.message || 'Remedial terpilih berhasil diterbitkan ke siswa.');
      closeBulkRemedialModal();
      setSelectedBulkRemedialIds([]);
      await fetchRemedialRows(true);
    } catch (error) {
      console.error('Bulk give remedial activity error:', error);
      toast.error(getApiErrorMessage(error, 'Gagal menerbitkan remedial terpilih'));
    } finally {
      setRemedialSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedAssignment) return;
    try {
        const payload = sanitizeCompetencySettingsForSave(competencySettings, isReligionSubject);
        setSaving(true);
        await teacherAssignmentService.updateCompetencyThresholds(
          parseInt(selectedAssignment),
          payload,
          selectedSemester || undefined,
        );
        toast.success('Pengaturan Capaian Kompetensi berhasil disimpan');
        setShowSettingsModal(false);
        
        // Recalculate all descriptions immediately and SAVE to backend
        handleRefreshDescriptions(true, true);
    } catch (error) {
        console.error('Save settings error:', error);
        toast.error('Gagal menyimpan pengaturan');
    } finally {
        setSaving(false);
    }
  };

  const handleRefreshDescriptions = async (silent = false, saveToBackend = false) => {
    if (!isFinalComponent) return;
    
    if (!hasAnyCompetencySettingValue(competencySettings, isReligionSubject)) {
        if (!silent) toast.error('Pengaturan Capaian Kompetensi belum diatur');
        return;
    }

    // We need to calculate the new descriptions state first
    const calculateNewDescriptions = (prev: Record<number, string>) => {
        const next = { ...prev };
        let updateCount = 0;

        students.forEach(student => {
            const grade = grades.find(g => g.student_id === student.id);
            if (grade) {
                const report = reportGradeMap[student.id];
                if (!report || report.finalScore === null || report.finalScore === undefined) return;
                const desc = deriveCompetencyDescription(report.finalScore, kkm, competencySettings, {
                  religionKey: student.religion,
                  useReligionThreshold: isReligionSubject,
                });
                
                // Update if description exists and is different
                if (desc && desc !== next[student.id]) {
                    next[student.id] = desc;
                    updateCount++;
                }
            }
        });
        return { next, updateCount };
    };

    setDescriptions(prev => {
        const { next, updateCount } = calculateNewDescriptions(prev);

        if (!silent) {
            if (updateCount > 0) {
                toast.success(`${updateCount} deskripsi diperbarui.`);
            } else {
                toast.success('Semua deskripsi sudah sesuai dengan nilai saat ini.');
            }
        }
        
        // If requested, save to backend immediately using the NEW descriptions
        if (saveToBackend && updateCount > 0 && selectedAssignment && selectedAcademicYear && selectedComponent) {
            const assignment = selectedAssignmentObj;
            if (assignment) {
                const gradesPayload = students.map(student => {
                     const grade = grades.find(g => g.student_id === student.id);
                     return {
                        student_id: student.id,
                        subject_id: assignment.subject.id,
                        academic_year_id: parseInt(selectedAcademicYear),
                        grade_component_id: parseInt(selectedComponent),
                        semester: selectedSemester,
                        score: grade && grade.score !== '' ? parseFloat(grade.score) : null,
                        description: next[student.id] || ''
                     };
                });

                // Execute save in background (or await if we made this async)
                gradeService.bulkInputGrades({ grades: gradesPayload })
                    .then((result: BulkGradeSaveResult) => {
                      if ((result?.reportSync?.failed || 0) > 0) {
                        toast.error(
                          `Deskripsi tersimpan, tetapi sinkronisasi rapor gagal pada ${result.reportSync?.failed} siswa.`,
                        );
                        return;
                      }
                      toast.success('Deskripsi otomatis disimpan ke database');
                    })
                    .catch(err => console.error('Auto-save description error:', err));
            }
        }

        return updateCount > 0 ? next : prev;
    });
  };

  const handleSaveGrades = async () => {
    if (!selectedAcademicYear || !selectedAssignment || !selectedComponent) {
      toast.error('Pilih kelas & mata pelajaran, semester, dan komponen nilai terlebih dahulu');
      return;
    }

    const assignment = selectedAssignmentObj;
    if (!assignment) return;

    let gradesPayload: GradeBulkPayload[] = [];

    if (isFormatifComponent) {
        gradesPayload = grades.map(g => {
            const slotDrafts = getStudentFormativeSlotDrafts(g.student_id);
            const parsedSeries = parseFormativeSlotDrafts(slotDrafts);
            if (parsedSeries.invalid) {
                throw new Error('Setiap kotak nilai formatif harus berupa angka 0-100.');
            }
            const seriesValues = parsedSeries.values;
            const scoreValue = averageValues(seriesValues);

            return {
                student_id: g.student_id,
                subject_id: assignment.subject.id,
                academic_year_id: parseInt(selectedAcademicYear),
                grade_component_id: parseInt(selectedComponent),
                semester: selectedSemester as 'ODD' | 'EVEN',
                score: scoreValue,
                formative_series: seriesValues,
                formative_slot_count: slotDrafts.length,
            };
        });
    } else {
        gradesPayload = grades.map(grade => {
            const parsedScore = grade.score === '' ? null : parseFloat(grade.score);
            let description: string | undefined;

            if (isFinalComponent) {
                const student = students.find((item) => item.id === grade.student_id);
                const report = reportGradeMap[grade.student_id];
                const backendFormative = resolveReportSlotScore(report, formativePrimarySlot, report?.formatifScore ?? null);
                const backendSbts = resolveReportSlotScore(report, midtermPrimarySlot, report?.sbtsScore ?? null);
                const previewFinalScore =
                  computeFixedWeightedPreviewScore([
                    { score: backendFormative, weight: formativeComponentObj?.weight },
                    { score: backendSbts, weight: midtermComponentObj?.weight },
                    { score: parsedScore, weight: selectedComponentObj?.weight },
                  ]) ?? parsedScore;
                description = deriveCompetencyDescription(previewFinalScore, kkm, competencySettings, {
                  religionKey: student?.religion,
                  useReligionThreshold: isReligionSubject,
                }) || undefined;
            }

            return {
                student_id: grade.student_id,
                subject_id: assignment.subject.id,
                academic_year_id: parseInt(selectedAcademicYear),
                grade_component_id: parseInt(selectedComponent),
                semester: selectedSemester as 'ODD' | 'EVEN',
                score: parsedScore,
                description
            };
        });
    }

    if (gradesPayload.length === 0) {
      toast.error('Tidak ada data nilai untuk disimpan.');
      return;
    }

    setSaving(true);
    try {
        const result = (await gradeService.bulkInputGrades({ grades: gradesPayload })) as BulkGradeSaveResult;
        if ((result?.reportSync?.failed || 0) > 0) {
          toast.error(
            `Nilai tersimpan, tetapi sinkronisasi rapor gagal pada ${result.reportSync?.failed} siswa. Silakan cek ulang.`,
          );
        } else {
          toast.success('Nilai berhasil disimpan');
        }
        fetchExistingGrades();
    } catch (error: unknown) {
        const runtimeError = error as { message?: string };
        console.error('Save grades error:', error);
        toast.error(runtimeError?.message || 'Gagal menyimpan nilai');
    } finally {
        setSaving(false);
    }
  };

  const getStatusBadge = (score: number) => {
    if (score >= kkm) {
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Tuntas</span>;
    }
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Belum Tuntas</span>;
  };

  const remedialAttempts = activeRemedialDetail?.remedials
    ? [...activeRemedialDetail.remedials].sort(
        (a: ScoreRemedialAttempt, b: ScoreRemedialAttempt) => b.attemptNumber - a.attemptNumber,
      )
    : [];

  return (
      <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Input Nilai Siswa</h1>
          <p className="text-gray-600">Input nilai per komponen untuk siswa</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="px-6 pt-4">
          <UnderlineTabBar
            items={gradePageTabItems}
            activeId={activeTab}
            onChange={(tabId) => setActiveTab(tabId as 'INPUT' | 'REMEDIAL')}
            className="border-b-0"
            innerClassName="gap-4"
            ariaLabel="Tab input nilai"
          />
        </div>

        <div className="px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div>
                <label htmlFor="semester" className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                <select 
                    id="semester"
                    name="semester"
                    value={selectedSemester}
                    onChange={(e) => {
                        setSelectedSemester(e.target.value as 'ODD' | 'EVEN' | '');
                        setSelectedAssignment('');
                        setSelectedComponent('');
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="">Pilih Semester</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                </select>
            </div>

            <div className="md:col-span-2 lg:col-span-2">
                <label htmlFor="class-subject" className="block text-sm font-medium text-gray-700 mb-2">Kelas & Mapel</label>
                <div className="relative">
                    <select 
                        id="class-subject"
                        name="class-subject"
                        value={selectedAssignment}
                        onChange={(e) => {
                            setSelectedAssignment(e.target.value);
                            setSelectedComponent('');
                        }}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        disabled={!selectedSemester}
                    >
                        <option value="">Pilih Kelas & Mapel</option>
                        {assignmentOptions.map((a) => (
                            <option key={a.id} value={a.id}>
                              {formatTeacherAssignmentLabel(a)} (KKM: {a.kkm})
                            </option>
                        ))}
                    </select>
                    {!selectedSemester && (
                        <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Semester</p>
                    )}
                </div>
            </div>

            {activeTab === 'INPUT' ? (
            <div className="md:col-span-2 lg:col-span-2">
                <div className={isFinalComponent ? "flex gap-2 items-end" : ""}>
                        <div className="flex-1">
                            <label htmlFor="grade-component" className="block text-sm font-medium text-gray-700 mb-2">Komponen Nilai</label>
                            <div className="relative">
                                <select 
                                    id="grade-component"
                                    name="grade-component"
                                    value={selectedComponent}
                                    onChange={(e) => setSelectedComponent(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                                    disabled={!selectedAssignment}
                                >
                                    <option value="">Pilih Komponen</option>
                                    {filteredComponents.map(c => {
                                        return <option key={c.id} value={c.id}>{buildComponentDisplayLabel(c)}</option>;
                                    })}
                                </select>
                                {!selectedAssignment && selectedSemester && (
                                    <p className="text-xs text-red-500 mt-1 absolute -bottom-5 left-0">Silahkan Pilih Kelas & Mapel</p>
                                )}
                            </div>
                        </div>
                        {isFinalComponent && (
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => setShowSettingsModal(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mb-0.5 whitespace-nowrap shadow-sm font-medium text-sm flex items-center h-[42px]"
                                    title="Setting Capaian Kompetensi"
                                >
                                    + Deskripsi
                                </button>
                            </div>
                        )}
                    </div>
            </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Table */}
	      {activeTab === 'INPUT' && selectedAcademicYear && selectedAssignment && selectedComponent && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                      <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NISN</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                              
                              {isFormatifComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entri Formatif (Dinamis)</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-green-50">x̄ Referensi {finalComponentLabel}</th>
                                  </>
                              ) : isMidtermComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {formativeComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor {midtermComponentLabel}</th>
                                  </>
                              ) : isFinalComponent ? (
                                  <>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-blue-50">x̄ Referensi {formativeComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50">Nilai {midtermComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai {finalComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-yellow-50">Nilai Rapor {finalComponentLabel}</th>
                                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Capaian Kompetensi</th>
                                  </>
                              ) : (
                                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai</th>
                              )}
                              
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                          </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {loading ? (
                              <tr><td colSpan={12} className="text-center py-8">Memuat...</td></tr>
                          ) : students.length > 0 ? (
	                              students.map((student, idx) => {
                                  const grade = grades.find(g => g.student_id === student.id);
                                  if (!grade) return null;
                                  
                                  const report = reportGradeMap[student.id];
	                                  const backendFormative = resolveReportSlotScore(report, formativePrimarySlot, report?.formatifScore ?? null);
	                                  const backendMidtermFormativeReference = resolveReportSlotScore(
	                                    report,
	                                    buildFormativeReferenceSlotCode(formativePrimarySlot, 'MIDTERM'),
	                                    backendFormative,
	                                  );
	                                  const backendFinalFormativeReference = resolveReportSlotScore(
	                                    report,
	                                    buildFormativeReferenceSlotCode(formativePrimarySlot, 'FINAL'),
	                                    backendFormative,
	                                  );
	                                  const backendSbts = resolveReportSlotScore(report, midtermPrimarySlot, report?.sbtsScore ?? null);
	                                  const backendFinal = report?.finalScore ?? null;
	                                  const currentScore = (() => {
	                                    const parsed = Number(grade.score);
	                                    return Number.isFinite(parsed) ? parsed : null;
	                                  })();
                                  const backendSelectedComponentScore = resolveReportSlotScore(
                                    report,
                                    selectedComponentSlotCode,
                                    currentScore,
                                  );
                                  const rowStatusScore =
                                    !isFormatifComponent && !isMidtermComponent && !isFinalComponent
                                      ? backendSelectedComponentScore ?? currentScore ?? 0
                                      : backendFinal !== null && backendFinal !== undefined
                                        ? backendFinal
                                        : parseFloat(grade.score || '0');
                                  const formativeDrafts = getStudentFormativeSlotDrafts(student.id);
                                  const visibleFormativeDrafts = getStudentVisibleFormativeSlotDrafts(student.id);
                                  const formativeParsed = parseFormativeSlotDrafts(formativeDrafts);
                                  const hasDraftFormativeValues =
                                    !formativeParsed.invalid && formativeParsed.values.length > 0;
                                  const draftFormativeAverage =
                                    hasDraftFormativeValues
                                      ? averageValues(formativeParsed.values)
                                      : null;
                                  const normalizedBackendFormative =
                                    !hasDraftFormativeValues && Number(backendFormative) === 0
                                      ? null
                                      : backendFormative;
	                                  const previewFormative = draftFormativeAverage ?? normalizedBackendFormative;
	                                  const previewMidtermReference = draftFormativeAverage ?? backendMidtermFormativeReference;
	                                  const previewFinalReference = draftFormativeAverage ?? backendFinalFormativeReference;
	                                  const displayFormative =
	                                    previewFormative !== null && previewFormative !== undefined
	                                      ? formatScoreDisplay(previewFormative)
	                                      : '-';
	                                  const previewSbtsFinal = (() => {
	                                    if (!isMidtermComponent) return backendFinal;
	                                    return (
	                                      computeWeightedPreviewScore([
	                                        { score: previewFormative, weight: formativeComponentObj?.weight },
	                                        { score: currentScore, weight: selectedComponentObj?.weight },
	                                      ]) ?? backendFinal
	                                    );
	                                  })();
	                                  const previewSasFinal = (() => {
	                                    if (!isFinalComponent) return backendFinal;
	                                    return normalizeFinalRoundedScore(
	                                      computeFixedWeightedPreviewScore([
	                                        { score: previewFormative, weight: formativeComponentObj?.weight },
	                                        { score: backendSbts, weight: midtermComponentObj?.weight },
	                                        { score: currentScore, weight: selectedComponentObj?.weight },
	                                      ]) ?? backendFinal
	                                    );
	                                  })();
                                  const previewCompetencyTargetScore = previewSasFinal ?? backendFinal;
                                  const studentReligionKey = normalizeReligionKey(student.religion);
                                  const previewCompetencyDescription =
                                    deriveCompetencyDescription(
                                      previewCompetencyTargetScore,
                                      kkm,
                                      competencySettings,
                                      {
                                        religionKey: student.religion,
                                        useReligionThreshold: isReligionSubject,
                                      },
                                    ) ||
                                    String(descriptions[student.id] || report?.description || '').trim();
                                  const previewCompetencyPlaceholder = isReligionSubject
                                    ? studentReligionKey
                                      ? `Deskripsi agama ${formatReligionLabel(studentReligionKey)} belum diatur di tombol + Deskripsi.`
                                      : 'Agama siswa belum terisi di profile.'
                                    : 'Deskripsi belum diatur di tombol + Deskripsi.';
                                  const rowStatusScorePreview =
                                    isFormatifComponent
                                      ? previewFormative ?? 0
                                      : isMidtermComponent
                                      ? previewSbtsFinal ?? 0
	                                      : isFinalComponent
	                                        ? previewSasFinal ?? 0
	                                        : rowStatusScore;

	                                  return (
                                      <tr key={student.id} className="hover:bg-gray-50">
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{idx + 1}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.nisn}</td>
                                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{student.full_name}</td>
                                          
                                          {isFormatifComponent ? (
	                                              <>
		                                                  <td className="px-6 py-4">
		                                                      <div className="space-y-2 min-w-[280px]">
		                                                        <div className="flex flex-wrap gap-2">
		                                                          {visibleFormativeDrafts.map((item, itemIndex) => (
		                                                            <div key={`${student.id}-${itemIndex}`} className="relative">
		                                                              <input
		                                                                type="text"
		                                                                inputMode="decimal"
		                                                                value={item}
		                                                                onChange={(e) =>
		                                                                  handleFormativeValueChange(student.id, itemIndex, e.target.value)
		                                                                }
		                                                                onWheel={preventFormativeWheelMutation}
		                                                                className="w-16 px-2 py-1 pr-5 border border-gray-300 rounded text-xs text-center focus:ring-blue-500 focus:border-blue-500"
		                                                              />
		                                                              <button
		                                                                type="button"
		                                                                onClick={() => handleRemoveFormativeValue(student.id, itemIndex)}
		                                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] leading-none flex items-center justify-center hover:bg-red-600"
		                                                                title="Hapus entri"
		                                                              >
		                                                                ×
		                                                              </button>
		                                                            </div>
		                                                          ))}
		                                                        </div>
		                                                        <div className="flex items-center gap-2">
	                                                          <button
	                                                            type="button"
	                                                            onClick={() => handleAddFormativeValue(student.id)}
	                                                            className="px-2 py-1 text-xs rounded border border-blue-200 text-blue-700 hover:bg-blue-50"
	                                                          >
	                                                            + Tambah
	                                                          </button>
	                                                        </div>
	                                                      </div>
		                                                      <p className={`mt-1 text-[11px] ${formativeParsed.invalid ? 'text-red-600' : 'text-gray-500'}`}>
		                                                        {formativeParsed.invalid
		                                                          ? 'Format tidak valid. Gunakan angka 0-100 pada tiap kotak.'
		                                                          : `${visibleFormativeDrafts.length} kotak entri dinamis`}
	                                                      </p>
		                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-blue-50`}>
                                                      {previewMidtermReference !== null && previewMidtermReference !== undefined
                                                        ? formatScoreDisplay(previewMidtermReference)
                                                        : '-'}
                                                  </td>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-medium ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-900'} bg-green-50`}>
                                                      {previewFinalReference !== null && previewFinalReference !== undefined
                                                        ? formatScoreDisplay(previewFinalReference)
                                                        : '-'}
                                                  </td>
                                              </>
                                          ) : isMidtermComponent ? (
                                              <>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayFormative}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                      />
                                                  </td>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${(previewSbtsFinal ?? 0) < kkm && previewSbtsFinal !== null ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
	                                                      {previewSbtsFinal !== null && previewSbtsFinal !== undefined ? formatScoreDisplay(previewSbtsFinal) : '-'}
	                                                  </td>
                                              </>
                                          ) : isFinalComponent ? (
                                              <>
                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm ${(backendFormative ?? 0) < kkm && backendFormative !== null ? 'text-red-600 font-bold' : 'text-gray-500'} bg-blue-50`}>{displayFormative}</td>
	                                                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500 bg-gray-50">{backendSbts !== null && backendSbts !== undefined ? formatScoreDisplay(backendSbts) : '-'}</td>
                                                  <td className="px-6 py-4 whitespace-nowrap text-center">
                                                      <input 
                                                          type="number" 
                                                          name={`score-${student.id}`}
                                                          id={`score-${student.id}`}
                                                          min="0" max="100" 
                                                          className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                          value={grade.score}
                                                          onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                      />
                                                  </td>
	                                                  <td className={`px-6 py-4 whitespace-nowrap text-center text-sm font-bold ${(previewSasFinal ?? 0) < kkm && previewSasFinal !== null ? 'text-red-600' : 'text-gray-900'} bg-yellow-50`}>
	                                                      {previewSasFinal !== null && previewSasFinal !== undefined ? formatScoreDisplay(previewSasFinal) : '-'}
	                                                  </td>
                                                  <td className="px-6 py-4">
                                                      <div className="w-full min-w-[300px] rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm text-slate-700">
                                                        <p className="font-medium text-slate-900">
                                                          {previewCompetencyDescription || previewCompetencyPlaceholder}
                                                        </p>
                                                      </div>
                                                  </td>
                                              </>
                                          ) : (
                                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                                  <input 
                                                      type="number" 
                                                      name={`score-${student.id}`}
                                                      id={`score-${student.id}`}
                                                      min="0" max="100" 
                                                      className="w-20 px-2 py-1 border border-gray-300 rounded text-center focus:ring-blue-500 focus:border-blue-500"
                                                      value={grade.score}
                                                      onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                                  />
                                              </td>
                                          )}
                                          
                                          <td className="px-6 py-4 whitespace-nowrap text-center">
	                                              {getStatusBadge(rowStatusScorePreview)}
                                          </td>
                                      </tr>
                                  );
                              })
                          ) : (
                              <tr><td colSpan={12} className="text-center py-8">Tidak ada siswa</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>

              <div className="fixed bottom-6 right-6 z-10">
                  <button 
                      onClick={handleSaveGrades}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
                  >
                      {saving ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Save className="w-5 h-5" />
                      )}
                      <span className="font-bold">Simpan Nilai</span>
                  </button>
              </div>
          </div>
      )}

      {activeTab === 'REMEDIAL' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Remedial Nilai</h2>
              <p className="mt-1 text-sm text-gray-600">
                Pilih sumber nilai, lalu input remedial untuk siswa yang nilainya masih di bawah KKM.
              </p>
            </div>
            <div className="w-full lg:w-96">
              <label htmlFor="remedial-source" className="block text-sm font-medium text-gray-700 mb-2">
                Sumber Nilai
              </label>
              <select
                id="remedial-source"
                value={remedialComponentCode}
                onChange={(event) => setRemedialComponentCode(event.target.value)}
                disabled={!selectedAcademicYear || !selectedAssignment || !selectedSemester}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">Semua sumber nilai</option>
                {remedialSourceOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Opsi mengikuti komponen nilai aktif pada mapel ini.
              </p>
            </div>
          </div>

          {!selectedAcademicYear || !selectedAssignment || !selectedSemester ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Pilih semester dan kelas & mapel terlebih dahulu untuk melihat kandidat remedial.
            </div>
          ) : (
            <>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={openBulkRemedialModal}
                    disabled={remedialManagementRows.length === 0 || remedialSaving}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Kelola Remedial
                  </button>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={remedialIncludeAll}
                      onChange={(event) => setRemedialIncludeAll(event.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    Tampilkan yang sudah tuntas
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      Total: {remedialSummary.total}
                    </span>
                    <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                      Belum KKM: {remedialSummary.pending}
                    </span>
                    <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      Tuntas: {remedialSummary.complete}
                    </span>
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      Bisa dipilih: {remedialSummary.selectable}
                    </span>
                    {remedialSummary.blocked > 0 ? (
                      <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
                        Ditahan wali: {remedialSummary.blocked}
                      </span>
                    ) : null}
                    {remedialSummary.active > 0 ? (
                      <span className="inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                        Remedial aktif: {remedialSummary.active}
                      </span>
                    ) : null}
                  </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[920px] border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">No</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS / NISN</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sumber Nilai</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai Asli</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Efektif</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">KKM</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Percobaan</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {remedialLoading ? (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-blue-600" />
                          Memuat kandidat remedial...
                        </td>
                      </tr>
                    ) : remedialRows.length > 0 ? (
                      remedialRows.map((row, index) => {
                        const statusMeta = getRemedialStatusMeta(
                          row.isComplete ? 'PASSED' : row.latestAttempt?.status || 'STILL_BELOW_KKM',
                        );
                        return (
                          <tr key={row.scoreEntryId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-500">{index + 1}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <div>{row.student.nis || '-'}</div>
                              <div className="text-xs text-gray-500">NISN: {row.student.nisn || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.student.name}</td>
                            <td className="px-4 py-3 text-sm text-gray-700">
                              <div className="font-medium text-gray-900">{row.sourceLabel || '-'}</div>
                              <div className="text-xs text-gray-500">{row.sourceKey || row.componentCode || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-semibold text-red-600">
                              {formatScoreDisplay(row.originalScore)}
                            </td>
                            <td className={`px-4 py-3 text-center text-sm font-semibold ${row.currentEffectiveScore < row.kkm ? 'text-red-600' : 'text-emerald-700'}`}>
                              {formatScoreDisplay(row.currentEffectiveScore)}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-gray-700">{formatScoreDisplay(row.kkm)}</td>
                            <td className="px-4 py-3 text-center text-sm text-gray-700">{row.attemptCount || 0}x</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                                {row.remedialEligibility?.label && !row.isComplete ? (
                                  <span
                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${
                                      row.remedialEligibility.isBlockedByHomeroom
                                        ? 'bg-red-50 text-red-700'
                                        : row.remedialEligibility.hasActiveRemedialActivity
                                          ? 'bg-indigo-50 text-indigo-700'
                                          : 'bg-blue-50 text-blue-700'
                                    }`}
                                    title={row.homeroomPublication?.description || row.remedialEligibility.label}
                                  >
                                    {row.remedialEligibility.label}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-wrap justify-end gap-2">
                                {!row.isComplete ? (
                                  <button
                                    type="button"
                                    onClick={() => openRemedialModal(row, 'SCORE')}
                                    disabled={row.remedialEligibility?.isBlockedByHomeroom}
                                    className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-100 disabled:text-gray-500"
                                  >
                                    Input Nilai
                                  </button>
                                ) : null}
                                {(row.attemptCount || 0) > 0 || row.isComplete || row.remedialEligibility?.hasActiveRemedialActivity ? (
                                  <button
                                    type="button"
                                    onClick={() => openRemedialModal(row, 'HISTORY')}
                                    className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                  >
                                    Riwayat
                                  </button>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-500">
                          Tidak ada kandidat remedial pada filter ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {showBulkRemedialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Kelola Remedial</h3>
                <p className="text-sm text-gray-600">
                  Pilih siswa yang nilainya masih di bawah KKM, lalu terbitkan jadwal remedial sekaligus.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkRemedialModal}
                className="text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Tutup popup kelola remedial"
                disabled={remedialSaving}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto px-6 py-5">
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Pilih Siswa Remedial</p>
                    <p className="text-xs text-blue-800">
                      Siswa yang masih ditahan wali kelas atau sudah punya remedial aktif tidak bisa dicentang.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-blue-800">
                    <input
                      type="checkbox"
                      aria-label="Pilih semua siswa yang bisa diterbitkan remedial"
                      checked={
                        selectableRemedialRows.length > 0 &&
                        selectableRemedialRows.every((row) => selectedBulkRemedialIds.includes(row.scoreEntryId))
                      }
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedBulkRemedialIds(selectableRemedialRows.map((row) => row.scoreEntryId));
                        } else {
                          setSelectedBulkRemedialIds([]);
                        }
                      }}
                      disabled={selectableRemedialRows.length === 0 || remedialSaving}
                      className="h-4 w-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    Pilih semua yang bisa
                  </label>
                </div>

                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-blue-100 bg-white">
                  {remedialManagementRows.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {remedialManagementRows.map((row) => {
                        const selectable = isRemedialRowSelectable(row);
                        const checked = selectedBulkRemedialIds.includes(row.scoreEntryId);
                        const statusMeta = getRemedialStatusMeta(row.latestAttempt?.status || 'STILL_BELOW_KKM');
                        return (
                          <label
                            key={row.scoreEntryId}
                            className={`flex gap-3 px-3 py-3 text-sm ${selectable ? 'cursor-pointer hover:bg-blue-50' : 'cursor-not-allowed bg-gray-50 text-gray-500'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!selectable || remedialSaving}
                              onChange={(event) => {
                                setSelectedBulkRemedialIds((current) => {
                                  if (event.target.checked) {
                                    return current.includes(row.scoreEntryId) ? current : [...current, row.scoreEntryId];
                                  }
                                  return current.filter((id) => id !== row.scoreEntryId);
                                });
                              }}
                              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-gray-900">{row.student.name}</span>
                              <span className="mt-0.5 block text-xs text-gray-500">
                                {row.student.nis || '-'} • {row.sourceLabel || '-'} • Nilai {formatScoreDisplay(row.currentEffectiveScore)} / KKM {formatScoreDisplay(row.kkm)}
                              </span>
                              {row.remedialEligibility?.label ? (
                                <span
                                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    row.remedialEligibility.isBlockedByHomeroom
                                      ? 'bg-red-50 text-red-700'
                                      : row.remedialEligibility.hasActiveRemedialActivity
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'bg-blue-50 text-blue-700'
                                  }`}
                                >
                                  {row.remedialEligibility.label}
                                </span>
                              ) : null}
                            </span>
                            <span className={`mt-1 h-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                              {statusMeta.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-500">
                      Tidak ada siswa belum KKM pada filter ini.
                    </div>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-blue-100">
                    Dipilih: {selectedBulkRemedialRows.length}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-700 ring-1 ring-blue-100">
                    Bisa dipilih: {remedialSummary.selectable}
                  </span>
                  {remedialSummary.blocked > 0 ? (
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-100">
                      Ditahan wali: {remedialSummary.blocked}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="bulk-remedial-method" className="mb-2 block text-sm font-medium text-gray-700">
                    Metode Remedial
                  </label>
                  <select
                    id="bulk-remedial-method"
                    value={remedialMethodInput}
                    onChange={(event) => setRemedialMethodInput(event.target.value as ScoreRemedialMethod)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
                    disabled={remedialSaving}
                  >
                    <option value="ASSIGNMENT">Tugas remedial</option>
                    <option value="QUESTION_SET">Soal/quiz remedial</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="bulk-remedial-due" className="mb-2 block text-sm font-medium text-gray-700">
                    Tenggat
                  </label>
                  <input
                    id="bulk-remedial-due"
                    type="datetime-local"
                    value={remedialActivityDueAtInput}
                    onChange={(event) => setRemedialActivityDueAtInput(event.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
                    disabled={remedialSaving}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="bulk-remedial-title" className="mb-2 block text-sm font-medium text-gray-700">
                  Judul Tugas/Soal
                </label>
                <input
                  id="bulk-remedial-title"
                  type="text"
                  value={remedialActivityTitleInput}
                  onChange={(event) => setRemedialActivityTitleInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Contoh: Remedial SBTS"
                  disabled={remedialSaving}
                />
              </div>

              {remedialMethodInput === 'QUESTION_SET' ? (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <div>
                      <label htmlFor="bulk-remedial-exam-packet" className="mb-2 block text-sm font-medium text-gray-700">
                        Paket Soal Remedial
                      </label>
                      <select
                        id="bulk-remedial-exam-packet"
                        value={remedialActivityExamPacketIdInput}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          setRemedialActivityExamPacketIdInput(nextValue);
                          const packet = remedialExamPackets.find((item) => item.id.toString() === nextValue);
                          if (packet && !remedialActivityTitleInput.trim()) {
                            setRemedialActivityTitleInput(`Remedial ${packet.title}`);
                          }
                        }}
                        className="w-full rounded-lg border border-indigo-200 bg-white px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
                        disabled={remedialSaving || remedialExamPacketsLoading}
                      >
                        <option value="">{remedialExamPacketsLoading ? 'Memuat paket soal...' : 'Pilih paket soal existing'}</option>
                        {remedialExamPackets.map((packet) => (
                          <option key={packet.id} value={packet.id}>
                            {packet.title} {packet.publishedQuestionCount ? `(${packet.publishedQuestionCount} soal)` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <a
                      href="/teacher/exams/create"
                      className="inline-flex h-[42px] items-center justify-center rounded-lg border border-indigo-200 bg-white px-4 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      Buat Paket Baru
                    </a>
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="bulk-remedial-note" className="mb-2 block text-sm font-medium text-gray-700">
                  Catatan
                </label>
                <textarea
                  id="bulk-remedial-note"
                  rows={3}
                  value={remedialNoteInput}
                  onChange={(event) => setRemedialNoteInput(event.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Opsional, misalnya materi yang diremedialkan."
                  disabled={remedialSaving}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={closeBulkRemedialModal}
                className="rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-50"
                disabled={remedialSaving}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleBulkGiveRemedialActivity}
                disabled={remedialSaving || selectedBulkRemedialRows.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {remedialSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                Terbitkan ke {selectedBulkRemedialRows.length} Siswa
              </button>
            </div>
          </div>
        </div>
      )}

      {activeRemedialDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/25 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[calc(100vh-7rem)] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {isRemedialHistoryMode ? 'Riwayat Remedial' : 'Input Nilai Remedial'}
                </h3>
                <p className="text-sm text-gray-600">
                  {activeRemedialDetail.student.name} • {activeRemedialDetail.sourceLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeRemedialModal}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Tutup popup remedial"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {remedialDetailLoading ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Memuat riwayat remedial...
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Nilai Asli</p>
                  <p className="mt-1 text-lg font-bold text-red-600">{formatScoreDisplay(activeRemedialDetail.originalScore)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Efektif</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{formatScoreDisplay(activeRemedialDetail.currentEffectiveScore)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">KKM</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{formatScoreDisplay(activeRemedialDetail.kkm)}</p>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Percobaan</p>
                  <p className="mt-1 text-lg font-bold text-gray-900">{activeRemedialDetail.attemptCount || 0}x</p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h4 className="text-sm font-semibold text-gray-900">Riwayat Percobaan</h4>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Percobaan</th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Nilai Remedial</th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Efektif</th>
                        <th className="px-4 py-2 text-center text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Metode</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {remedialAttempts.length > 0 ? (
                        remedialAttempts.map((attempt) => {
                          const statusMeta = getRemedialStatusMeta(attempt.status);
                          return (
                            <tr key={attempt.id}>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <div className="font-medium">Ke-{attempt.attemptNumber}</div>
                                <div className="text-xs text-gray-500">{formatDateTimeDisplay(attempt.recordedAt)}</div>
                              </td>
                              <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                                {formatScoreDisplay(attempt.remedialScore)}
                              </td>
                              <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900">
                                {formatScoreDisplay(attempt.effectiveScore)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                                  {statusMeta.label}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700">
                                <div className="font-medium text-gray-900">{getRemedialMethodLabel(attempt.method)}</div>
                                {attempt.activityTitle ? (
                                  <div className="text-xs text-gray-500">{attempt.activityTitle}</div>
                                ) : null}
                                {attempt.activityExamPacket ? (
                                  <div className="text-xs text-gray-500">Paket soal: {attempt.activityExamPacket.title}</div>
                                ) : null}
                                {attempt.activityDueAt ? (
                                  <div className="text-xs text-gray-500">Tenggat: {formatDateTimeDisplay(attempt.activityDueAt)}</div>
                                ) : null}
                                {attempt.activityReferenceUrl ? (
                                  <a
                                    href={attempt.activityReferenceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                                  >
                                    Buka tautan
                                  </a>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">{attempt.note || '-'}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                            Belum ada percobaan remedial.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {isRemedialHistoryMode ? null : activeRemedialDetail.isComplete ? (
                <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Nilai ini sudah tuntas. Riwayat remedial tetap tersimpan tanpa menimpa nilai asli.
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 p-4">
                  <h4 className="text-sm font-semibold text-gray-900">Input Nilai Hasil Remedial</h4>
                  <p className="mt-1 text-xs text-blue-800">
                    Nilai efektif remedial otomatis memakai nilai terbaik, tetapi maksimal hanya sampai KKM.
                  </p>
                  <div className="mt-4">
                    {isRemedialScoreMode ? (
                      <div>
                        <label htmlFor="remedial-score" className="block text-sm font-medium text-gray-700 mb-2">
                          Nilai Remedial
                        </label>
                        <input
                          id="remedial-score"
                          type="number"
                          inputMode="decimal"
                          min="0"
                          max="100"
                          value={remedialScoreInput}
                          onChange={(event) => setRemedialScoreInput(event.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-center focus:ring-blue-500 focus:border-blue-500"
                          placeholder="0-100"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <label htmlFor="remedial-note" className="block text-sm font-medium text-gray-700 mb-2">
                      Catatan
                    </label>
                    <textarea
                      id="remedial-note"
                      rows={3}
                      value={remedialNoteInput}
                      onChange={(event) => setRemedialNoteInput(event.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Opsional, misalnya materi yang diremedialkan."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <button
                type="button"
                onClick={closeRemedialModal}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                disabled={remedialSaving}
              >
                Tutup
              </button>
              {!activeRemedialDetail.isComplete && !isRemedialHistoryMode ? (
                <>
                  {isRemedialScoreMode ? (
                    <button
                      type="button"
                      onClick={handleSaveRemedial}
                      disabled={remedialSaving}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {remedialSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Simpan Nilai
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {/* Modal Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/25 backdrop-blur-[2px]">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200 max-h-[calc(100vh-7rem)] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Setting Capaian Kompetensi</h3>
                    <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-4">
                        <p className="font-semibold mb-1">Panduan Predikat:</p>
                        <ul className="list-disc list-inside space-y-1">
                            <li><strong>A</strong> : Nilai ≥ 86</li>
                            <li><strong>B</strong> : Nilai ≥ KKM &lt; 86</li>
                            <li><strong>C</strong> : Nilai ≥ 60 &lt; KKM</li>
                            <li><strong>D</strong> : Nilai &lt; 60</li>
                        </ul>
                    </div>

                    {isReligionSubject ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        Deskripsi mapel Agama disimpan per agama siswa dan otomatis mengikuti data `Agama` pada profile siswa.
                      </div>
                    ) : null}

                    {isReligionSubject ? (
                      <div>
                        <label htmlFor="competency-religion" className="block text-sm font-medium text-gray-700 mb-1">
                          Agama
                        </label>
                        <select
                          id="competency-religion"
                          value={selectedReligionKey}
                          onChange={(e) => setSelectedReligionKey(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        >
                          {religionOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Semua agama baku tersedia untuk diisi, lalu sistem otomatis menyesuaikan dengan agama di profile siswa.
                        </p>
                      </div>
                    ) : null}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat A</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                            rows={2}
                            value={activeCompetencyThresholdSet.A}
                            onChange={e => setCompetencySettings(prev => updateCompetencySettingValue(prev, 'A', e.target.value, {
                              religionKey: selectedReligionKey,
                              useReligionThreshold: isReligionSubject,
                            }))}
                            disabled={isReligionSubject && !selectedReligionKey}
                            placeholder="Contoh: Sangat baik dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat B</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                            rows={2}
                            value={activeCompetencyThresholdSet.B}
                            onChange={e => setCompetencySettings(prev => updateCompetencySettingValue(prev, 'B', e.target.value, {
                              religionKey: selectedReligionKey,
                              useReligionThreshold: isReligionSubject,
                            }))}
                            disabled={isReligionSubject && !selectedReligionKey}
                            placeholder="Contoh: Baik dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat C</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                            rows={2}
                            value={activeCompetencyThresholdSet.C}
                            onChange={e => setCompetencySettings(prev => updateCompetencySettingValue(prev, 'C', e.target.value, {
                              religionKey: selectedReligionKey,
                              useReligionThreshold: isReligionSubject,
                            }))}
                            disabled={isReligionSubject && !selectedReligionKey}
                            placeholder="Contoh: Cukup dalam memahami materi..."
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Deskripsi Predikat D</label>
                        <textarea 
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                            rows={2}
                            value={activeCompetencyThresholdSet.D}
                            onChange={e => setCompetencySettings(prev => updateCompetencySettingValue(prev, 'D', e.target.value, {
                              religionKey: selectedReligionKey,
                              useReligionThreshold: isReligionSubject,
                            }))}
                            disabled={isReligionSubject && !selectedReligionKey}
                            placeholder="Contoh: Perlu bimbingan dalam memahami materi..."
                        />
                    </div>
                </div>

                <div className="mt-8 flex justify-end gap-3">
                    <button 
                        onClick={() => setShowSettingsModal(false)}
                        className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors"
                        disabled={saving}
                    >
                        Batal
                    </button>
                    <button
                      onClick={handleSaveSettings}
                        disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Simpan & Terapkan
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
