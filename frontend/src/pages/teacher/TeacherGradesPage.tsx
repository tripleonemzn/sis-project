import { useState, useEffect, useMemo, useRef, type UIEvent, type WheelEvent } from 'react';
import { Save, Loader2, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { gradeService } from '../../services/grade.service';
import type { GradeComponent } from '../../services/grade.service';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import type { TeacherAssignment, TeacherAssignmentDetail } from '../../services/teacherAssignment.service';
import {
  formatTeacherAssignmentLabel,
  sortTeacherAssignmentsBySubjectClass,
} from '../../services/teacherAssignment.service';
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

type GradeTableColumn = {
  key: string;
  label: string;
  width: string;
  align?: 'left' | 'center';
  headerBgClass?: string;
};

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

const formatWeightPercent = (weight: number | null | undefined) => {
  const numeric = Number(weight);
  if (!Number.isFinite(numeric)) return '0%';
  if (Number.isInteger(numeric)) return `${numeric}%`;
  return `${numeric.toFixed(2)}%`;
};

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

export const TeacherGradesPage = () => {
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
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
  const [isFilterRestoreDone, setIsFilterRestoreDone] = useState(false);
  const restoredAssignmentRef = useRef<string | undefined>(undefined);
  const gradeComponentRequestRef = useRef(0);
  const studentsRequestRef = useRef(0);
  const existingGradesRequestRef = useRef(0);
  const assignmentsRequestRef = useRef(0);
  const frozenHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  
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
  const selectedComponentReportSlotLabel =
    selectedComponentSlotCode && selectedComponentSlotCode !== 'NONE' ? selectedComponentSlotCode : 'TANPA SLOT';
  const selectedComponentInputModeLabel =
    selectedComponentEntryMode === 'NF_SERIES' ? 'Bertahap (banyak butir nilai)' : 'Satu nilai per siswa';
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
  const selectedComponentFlowLabel = isFormatifComponent
    ? 'Formatif Bertahap'
    : isMidtermComponent
      ? 'Komponen Tengah Semester'
      : isFinalComponent
        ? 'Komponen Akhir Semester/Tahun'
        : 'Komponen Input Sederhana';
  const selectedComponentFormulaHint = isFormatifComponent
    ? `Input bertahap, sistem hitung rata-rata ${resolveReadableComponentLabel(selectedComponentObj, 'komponen')} otomatis.`
    : isMidtermComponent
      ? `Nilai rapor dihitung berbobot: ${formativeComponentLabel} ${formatWeightPercent(formativeComponentObj?.weight)} + ${resolveReadableComponentLabel(selectedComponentObj, 'komponen ini')} ${formatWeightPercent(selectedComponentObj?.weight)}.`
      : isFinalComponent
        ? `Nilai rapor dihitung berbobot: ${formativeComponentLabel} ${formatWeightPercent(formativeComponentObj?.weight)} + ${midtermComponentLabel} ${formatWeightPercent(midtermComponentObj?.weight)} + ${resolveReadableComponentLabel(selectedComponentObj, 'komponen ini')} ${formatWeightPercent(selectedComponentObj?.weight)}.`
        : 'Komponen ini memakai satu nilai per siswa.';
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

  const getDescription = () => {
    const componentName = String(selectedComponentObj?.name || selectedComponentObj?.code || 'komponen ini').trim();
    if (isFormatifComponent) {
      return `Komponen ${componentName} diinput per butir, rata-rata dihitung otomatis oleh sistem.`;
    }
    if (isMidtermComponent) {
      return `Komponen ${componentName} diinput satu nilai, lalu dipadukan sesuai rumus komponen aktif.`;
    }
    if (isFinalComponent) {
      return `Komponen ${componentName} diinput satu nilai, lalu dipadukan ke nilai rapor akhir.`;
    }
    return `Komponen ${componentName} menggunakan input satu nilai per siswa.`;
  };

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
          const reportRes = await gradeService.getReportGrades({
              class_id: assignment.class.id,
              subject_id: assignment.subject.id,
              academic_year_id: parseInt(selectedAcademicYear),
              semester: selectedSemester
          });
          const reportResponse = reportRes as { data?: ApiReportGradeRow[] } | ApiReportGradeRow[];
          const reportData = 'data' in reportResponse && Array.isArray(reportResponse.data) ? reportResponse.data : (Array.isArray(reportResponse) ? reportResponse : []);
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
          if (requestId !== existingGradesRequestRef.current) return;
          setReportGradeMap(nextReportMap);
          setDescriptions(isFinalComponent ? nextDescriptions : {});
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

  const showGradeTable = Boolean(selectedAcademicYear && selectedAssignment && selectedComponent);
  const gradeTableColumns = useMemo<GradeTableColumn[]>(() => {
    const baseColumns: GradeTableColumn[] = [
      { key: 'no', label: 'No', width: '72px' },
      { key: 'nisn', label: 'NISN', width: '124px' },
      { key: 'name', label: 'Nama Siswa', width: '250px' },
    ];

    if (isFormatifComponent) {
      return [
        ...baseColumns,
        { key: 'formative-entry', label: 'Entri Formatif (Dinamis)', width: '320px' },
        { key: 'midterm-ref', label: `x̄ Referensi ${midtermComponentLabel}`, width: '280px', align: 'center', headerBgClass: 'bg-blue-50' },
        { key: 'final-ref', label: `x̄ Referensi ${finalComponentLabel}`, width: '280px', align: 'center', headerBgClass: 'bg-green-50' },
        { key: 'status', label: 'Status', width: '120px', align: 'center' },
      ];
    }

    if (isMidtermComponent) {
      return [
        ...baseColumns,
        { key: 'formative-ref', label: `x̄ Referensi ${formativeComponentLabel}`, width: '260px', align: 'center', headerBgClass: 'bg-blue-50' },
        { key: 'midterm-score', label: `Nilai ${midtermComponentLabel}`, width: '180px', align: 'center' },
        { key: 'midterm-report', label: `Nilai Rapor ${midtermComponentLabel}`, width: '260px', align: 'center', headerBgClass: 'bg-yellow-50' },
        { key: 'status', label: 'Status', width: '120px', align: 'center' },
      ];
    }

    if (isFinalComponent) {
      return [
        ...baseColumns,
        { key: 'formative-ref', label: `x̄ Referensi ${formativeComponentLabel}`, width: '220px', align: 'center', headerBgClass: 'bg-blue-50' },
        { key: 'midterm-score', label: `Nilai ${midtermComponentLabel}`, width: '180px', align: 'center' },
        { key: 'final-score', label: `Nilai ${finalComponentLabel}`, width: '180px', align: 'center' },
        { key: 'final-report', label: `Nilai Rapor ${finalComponentLabel}`, width: '220px', align: 'center', headerBgClass: 'bg-yellow-50' },
        { key: 'competency', label: 'Capaian Kompetensi', width: '360px' },
        { key: 'status', label: 'Status', width: '120px', align: 'center' },
      ];
    }

    return [
      ...baseColumns,
      { key: 'score', label: 'Nilai', width: '180px', align: 'center' },
      { key: 'status', label: 'Status', width: '120px', align: 'center' },
    ];
  }, [
    finalComponentLabel,
    formativeComponentLabel,
    isFinalComponent,
    isFormatifComponent,
    isMidtermComponent,
    midtermComponentLabel,
  ]);
  const gradeTableWidth = useMemo(() => {
    const totalWidth = gradeTableColumns.reduce((sum, column) => {
      const parsed = Number.parseInt(column.width, 10);
      return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
    return `${Math.max(totalWidth, 960)}px`;
  }, [gradeTableColumns]);

  const handleGradeTableBodyScroll = (event: UIEvent<HTMLDivElement>) => {
    if (!frozenHeaderScrollRef.current) return;
    frozenHeaderScrollRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  return (
      <div className="space-y-6 pb-6">
      <div className="sticky top-0 z-30 bg-[var(--app-bg)] pb-4">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Input Nilai Siswa</h1>
              <p className="text-gray-600">Input nilai per komponen untuk siswa</p>
            </div>
          </div>

          {/* Description Box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <span className="font-semibold">Informasi Penilaian:</span> {getDescription()}
          </div>

          {selectedComponentObj ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                  <span className="mr-1 text-gray-500">Komponen:</span>
                  <span className="font-semibold">{resolveReadableComponentLabel(selectedComponentObj, '-')}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                  <span className="mr-1 text-gray-500">Mode:</span>
                  <span className="font-semibold">{selectedComponentInputModeLabel}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                  <span className="mr-1 text-gray-500">Slot:</span>
                  <span className="font-semibold">{selectedComponentReportSlotLabel}</span>
                </span>
                <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                  <span className="mr-1 text-gray-500">Masuk Nilai Akhir:</span>
                  <span className="font-semibold">{selectedComponentObj.includeInFinalScore ? 'Ya' : 'Tidak'}</span>
                </span>
              </div>
              <p className="mt-2 text-xs text-blue-700">
                {selectedComponentFlowLabel}: {selectedComponentFormulaHint}
              </p>
            </div>
          ) : null}

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Filter Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
            </div>
          </div>

          {showGradeTable && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div ref={frozenHeaderScrollRef} className="overflow-hidden">
                <table className="table-fixed border-separate border-spacing-0" style={{ width: gradeTableWidth, minWidth: gradeTableWidth }}>
                  <colgroup>
                    {gradeTableColumns.map((column) => (
                      <col key={column.key} style={{ width: column.width }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {gradeTableColumns.map((column) => (
                        <th
                          key={column.key}
                          className={`border-b border-gray-200 px-6 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 ${column.align === 'center' ? 'text-center' : 'text-left'} ${column.headerBgClass || 'bg-gray-50'}`}
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
	      {showGradeTable && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 pt-0">
              <div className="overflow-x-auto" onScroll={handleGradeTableBodyScroll}>
                  <table className="table-fixed border-separate border-spacing-0" style={{ width: gradeTableWidth, minWidth: gradeTableWidth }}>
                      <colgroup>
                        {gradeTableColumns.map((column) => (
                          <col key={column.key} style={{ width: column.width }} />
                        ))}
                      </colgroup>
                      <tbody className="bg-white divide-y divide-gray-200">
                          {loading ? (
                              <tr><td colSpan={gradeTableColumns.length} className="text-center py-8">Memuat...</td></tr>
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
                              <tr><td colSpan={gradeTableColumns.length} className="text-center py-8">Tidak ada siswa</td></tr>
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
      {/* Modal Settings */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setShowSettingsModal(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
