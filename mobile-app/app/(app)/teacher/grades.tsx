import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { teacherAssignmentApi } from '../../../src/features/teacherAssignments/teacherAssignmentApi';
import {
  buildTeacherAssignmentOptionLabel,
  isGenericExamSubject,
  sortTeacherAssignments,
} from '../../../src/features/teacherAssignments/utils';
import { teacherGradeApi, type GradeComponent } from '../../../src/features/teacherGrades/teacherGradeApi';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type Semester = 'ODD' | 'EVEN';
type SemesterOption = Semester | '';

type CompetencyThresholdSet = { A: string; B: string; C: string; D: string };
type CompetencySettings = CompetencyThresholdSet & {
  _byReligion?: Record<string, CompetencyThresholdSet>;
};
type ReligionOption = { value: string; label: string };

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

function parseScore(raw?: string) {
  if (raw === undefined) return { value: null as number | null, invalid: false };
  const trimmed = raw.trim();
  if (!trimmed) return { value: null as number | null, invalid: false };
  const value = Number(trimmed);
  if (Number.isNaN(value)) return { value: null as number | null, invalid: true };
  return { value, invalid: false };
}

function toFixedOrInt(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function normalizeFinalRoundedScore(raw: number | null | undefined) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  const fixedTwo = Number(parsed.toFixed(2));
  const fractional = fixedTwo - Math.trunc(fixedTwo);
  if (fractional > 0.5) {
    return Number(Math.ceil(fixedTwo).toFixed(2));
  }
  return fixedTwo;
}

function emptyCompetencySettings(): CompetencySettings {
  return { ...EMPTY_COMPETENCY_SET };
}

function calculatePredicate(score: number, kkm: number) {
  if (score >= 86) return 'A';
  if (score >= kkm) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function parseFormativeSeriesInput(raw: string): { values: number[]; invalid: boolean } {
  const cleaned = String(raw || '').trim();
  if (!cleaned) return { values: [], invalid: false };
  const tokens = cleaned
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const values: number[] = [];
  for (const token of tokens) {
    const parsed = Number(token.replace(',', '.'));
    if (!Number.isFinite(parsed)) return { values: [], invalid: true };
    if (parsed < 0 || parsed > 100) return { values: [], invalid: true };
    values.push(parsed);
  }
  return { values, invalid: false };
}

function normalizeLegacySeriesValues(rawValues: unknown[]) {
  return rawValues
    .filter((item) => item !== null && item !== undefined && item !== '')
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function sanitizeLegacySeriesForDisplay(rawValues: unknown[], _storedScore?: unknown) {
  const values = normalizeLegacySeriesValues(rawValues);
  if (values.length === 0) return [];
  if (values.length === 6 && values.every((value) => value === 0)) return [];

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
}

function averageValues(values: number[]) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function computeWeightedPreviewScore(
  rows: Array<{ score: number | null | undefined; weight: number | null | undefined }>,
) {
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
}

function computeFixedWeightedPreviewScore(
  rows: Array<{ score: number | null | undefined; weight: number | null | undefined }>,
) {
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
}

function formatSeriesValues(values: number[]) {
  return values
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(2)))
    .join(', ');
}

function normalizeSlotCode(raw: unknown): string {
  return String(raw || '').trim().toUpperCase();
}

function normalizeSubjectIdentityToken(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeReligionKey(raw: unknown): string | null {
  const normalized = normalizeSubjectIdentityToken(raw);
  if (!normalized) return null;
  return RELIGION_ALIASES[normalized] || normalized;
}

function formatReligionLabel(raw: unknown): string {
  const normalizedKey = normalizeReligionKey(raw);
  if (!normalizedKey) return '';
  if (RELIGION_LABELS[normalizedKey]) return RELIGION_LABELS[normalizedKey];
  return normalizedKey
    .split('_')
    .filter(Boolean)
    .map((token) => token.charAt(0) + token.slice(1).toLowerCase())
    .join(' ');
}

function emptyCompetencyThresholdSet(): CompetencyThresholdSet {
  return { ...EMPTY_COMPETENCY_SET };
}

function coerceCompetencySettings(raw: unknown): CompetencySettings {
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
}

function getReligionThresholdSet(settings: CompetencySettings, religionKey?: string | null): CompetencyThresholdSet {
  const normalizedReligionKey = normalizeReligionKey(religionKey);
  if (!normalizedReligionKey) return emptyCompetencyThresholdSet();
  return settings._byReligion?.[normalizedReligionKey] || emptyCompetencyThresholdSet();
}

function updateCompetencySettingValue(
  settings: CompetencySettings,
  predicate: keyof CompetencyThresholdSet,
  value: string,
  options?: {
    religionKey?: string | null;
    useReligionThreshold?: boolean;
  },
): CompetencySettings {
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
}

function hasAnyCompetencySettingValue(settings: CompetencySettings, useReligionThreshold: boolean) {
  if (useReligionThreshold) {
    return Object.values(settings._byReligion || {}).some((entry) =>
      Object.values(entry).some((value) => String(value || '').trim()),
    );
  }
  return (['A', 'B', 'C', 'D'] as Array<keyof CompetencyThresholdSet>).some((predicate) =>
    String(settings[predicate] || '').trim(),
  );
}

function sanitizeCompetencySettingsForSave(
  settings: CompetencySettings,
  useReligionThreshold: boolean,
): CompetencySettings {
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
}

function deriveCompetencyDescription(
  score: number | null | undefined,
  kkm: number,
  settings: CompetencySettings,
  options?: {
    religionKey?: string | null;
    useReligionThreshold?: boolean;
  },
) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) return '';
  const predicate = calculatePredicate(numericScore, kkm);
  if (options?.useReligionThreshold) {
    return String(
      getReligionThresholdSet(settings, options.religionKey)[predicate as keyof CompetencyThresholdSet] || '',
    ).trim();
  }
  return String(settings[predicate as keyof CompetencyThresholdSet] || '').trim();
}

function isReligionCompetencySubject(subject?: { name?: string | null; code?: string | null } | null) {
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
}

function resolveComponentEntryMode(component?: GradeComponent | null): 'NF_SERIES' | 'SINGLE_SCORE' {
  const explicit = normalizeSlotCode(component?.entryModeCode || component?.entryMode);
  if (explicit === 'NF_SERIES' || explicit === 'SINGLE_SCORE') return explicit;
  const fallbackCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  return fallbackCode === 'FORMATIVE' ? 'NF_SERIES' : 'SINGLE_SCORE';
}

function resolveComponentSlotCode(component?: GradeComponent | null): string {
  const explicit = normalizeSlotCode(component?.reportSlotCode || component?.reportSlot);
  if (explicit) return explicit;
  const fromCode = normalizeSlotCode(component?.code || component?.typeCode || '');
  if (fromCode && fromCode !== 'NONE') {
    return fromCode === 'FORMATIVE' ? 'FORMATIF' : fromCode;
  }
  const type = String(component?.type || '').toUpperCase();
  if (type === 'FORMATIVE') return 'FORMATIF';
  if (type === 'MIDTERM') return 'MIDTERM';
  if (type === 'FINAL') return 'FINAL';
  if (type === 'US_THEORY') return 'US_THEORY';
  if (type === 'US_PRACTICE') return 'US_PRACTICE';
  return 'NONE';
}

function resolveReadableComponentLabel(component?: GradeComponent | null, fallback = 'Komponen') {
  const label = String(component?.name || component?.code || '').trim();
  return label || fallback;
}

function resolvePrimarySlots(components: GradeComponent[]) {
  const availableSlots: string[] = [];
  let formativeByType: string | null = null;
  let midtermByType: string | null = null;
  let finalByType: string | null = null;

  components.forEach((item) => {
    const slotCode = normalizeSlotCode(resolveComponentSlotCode(item));
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
}

function resolveSlotScore(
  row:
    | {
        formatif: number | null;
        sbts: number | null;
        sas: number | null;
        final: number | null;
        slotScores?: Record<string, number | null> | null;
      }
    | undefined,
  slotCode: string,
  fallback: number | null | undefined,
): number | null {
  if (!row) return fallback ?? null;
  const normalizedSlot = normalizeSlotCode(slotCode);
  if (row.slotScores && typeof row.slotScores === 'object' && normalizedSlot) {
    const dynamic = row.slotScores[normalizedSlot];
    if (dynamic !== undefined && dynamic !== null && Number.isFinite(Number(dynamic))) {
      return Number(dynamic);
    }
  }
  if (fallback !== undefined && fallback !== null && Number.isFinite(Number(fallback))) {
    return Number(fallback);
  }
  return null;
}

function buildFormativeReferenceSlotCode(slotCode: string, stage: 'MIDTERM' | 'FINAL') {
  const normalized = normalizeSlotCode(slotCode);
  const suffix = stage === 'MIDTERM' ? 'SBTS_REF' : 'FINAL_REF';
  return normalized ? `${normalized}_${suffix}` : suffix;
}

function isUsTheorySlot(raw: unknown): boolean {
  const normalized = normalizeSlotCode(raw);
  return normalized === 'US_THEORY' || normalized === 'US_TEORY';
}

function isUsPracticeSlot(raw: unknown): boolean {
  const normalized = normalizeSlotCode(raw);
  return normalized === 'US_PRACTICE' || normalized === 'US_PRAKTEK';
}

function formatComponentLabel(component: GradeComponent) {
  const baseLabel = String(component.name || component.code || 'Komponen').trim();
  const entryMode = resolveComponentEntryMode(component);
  const slotCode = resolveComponentSlotCode(component);
  if (entryMode === 'NF_SERIES') return `${baseLabel} [NF Series] (${component.weight}%)`;
  if (slotCode !== 'NONE') return `${baseLabel} [${slotCode}] (${component.weight}%)`;
  return `${baseLabel} (${component.weight}%)`;
}

export default function TeacherGradesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = useMemo(
    () => sortTeacherAssignments(assignmentsQuery.data?.assignments || []),
    [assignmentsQuery.data?.assignments],
  );
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
  const [semester, setSemester] = useState<SemesterOption>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [formativeSeriesDraft, setFormativeSeriesDraft] = useState<Record<string, string>>({});
  const [formativePendingSlots, setFormativePendingSlots] = useState<Record<string, number>>({});
  const [showCompetencyModal, setShowCompetencyModal] = useState(false);
  const [competencySettings, setCompetencySettings] = useState<CompetencySettings>(emptyCompetencySettings());
  const [selectedReligionKey, setSelectedReligionKey] = useState<string>('');

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId) || null;
  const hasSelectionReady = Boolean(selectedAssignmentId && selectedAssignment && semester);
  const isReligionSubject = isReligionCompetencySubject(selectedAssignment?.subject);
  const assignmentOptions = useMemo(
    () =>
      assignments.map((item) => ({
        value: String(item.id),
        label: buildTeacherAssignmentOptionLabel(item),
      })),
    [assignments],
  );
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );

  const assignmentDetailQuery = useQuery({
    queryKey: ['mobile-grade-assignment-detail', user?.id, selectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignmentId && !!semester,
    queryFn: () => teacherAssignmentApi.getById(selectedAssignmentId!, semester as Semester),
  });

  const componentsQuery = useQuery({
    queryKey: [
      'mobile-grade-components',
      user?.id,
      selectedAssignment?.subject.id,
      selectedAssignment?.id,
      selectedAssignment?.academicYear.id,
      semester,
    ],
    enabled:
      isAuthenticated &&
      user?.role === 'TEACHER' &&
      !!selectedAssignment?.subject.id &&
      !!selectedAssignment?.id &&
      !!semester,
    queryFn: () =>
      teacherGradeApi.getComponents({
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        assignmentId: selectedAssignment!.id,
        semester,
      }),
  });

  const gradesQuery = useQuery({
    queryKey: ['mobile-grade-rows', user?.id, selectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment && !!semester,
    queryFn: () =>
      teacherGradeApi.getStudentGrades({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        semester: semester as Semester,
      }),
  });
  const reportGradesQuery = useQuery({
    queryKey: ['mobile-grade-report-rows', user?.id, selectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment && !!semester,
    queryFn: () =>
      teacherGradeApi.getReportGrades({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        semester: semester as Semester,
      }),
  });
  const selectedKkm = selectedAssignment?.kkm ?? assignmentDetailQuery.data?.kkm ?? 75;
  const religionOptions = useMemo<ReligionOption[]>(() => {
    if (!isReligionSubject) return [];
    const optionMap = new Map<string, string>();

    STANDARD_RELIGION_OPTIONS.forEach((option) => {
      optionMap.set(option.value, option.label);
    });

    (assignmentDetailQuery.data?.availableReligions || []).forEach((rawKey) => {
      const religionKey = normalizeReligionKey(rawKey);
      if (!religionKey) return;
      optionMap.set(religionKey, formatReligionLabel(religionKey));
    });

    (assignmentDetailQuery.data?.class.students || []).forEach((student) => {
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
  }, [assignmentDetailQuery.data?.availableReligions, assignmentDetailQuery.data?.class.students, competencySettings._byReligion, isReligionSubject]);
  const components = useMemo(() => componentsQuery.data || [], [componentsQuery.data]);
  const filteredComponents = useMemo(() => {
    if (!selectedAssignment) return [];
    const theoryKejuruanOnly = isGenericExamSubject(selectedAssignment.subject);
    return components.filter((component) => {
      if (component.subjectId !== selectedAssignment.subject.id) return false;
      if (theoryKejuruanOnly) {
        return (
          isUsTheorySlot(resolveComponentSlotCode(component)) ||
          String(component.type || '').trim().toUpperCase() === 'US_THEORY'
        );
      }
      return true;
    });
  }, [components, selectedAssignment]);
  const componentOptions = useMemo(
    () =>
      filteredComponents.map((component) => ({
        value: String(component.id),
        label: formatComponentLabel(component),
      })),
    [filteredComponents],
  );
  const selectedComponent = filteredComponents.find((component) => component.id === selectedComponentId) || null;
  const selectedComponentEntryMode = resolveComponentEntryMode(selectedComponent);
  const selectedComponentSlotCode = resolveComponentSlotCode(selectedComponent);
  const isFormatifComponent = selectedComponentEntryMode === 'NF_SERIES';
  const formativeComponent =
    filteredComponents.find((item) => resolveComponentEntryMode(item) === 'NF_SERIES') || null;
  const primarySlots = resolvePrimarySlots(filteredComponents);
  const midtermPrimarySlot = primarySlots.midterm;
  const finalPrimarySlot = primarySlots.final;
  const isMidtermComponent = !isFormatifComponent && selectedComponentSlotCode === midtermPrimarySlot;
  const isFinalComponent = !isFormatifComponent && selectedComponentSlotCode === finalPrimarySlot;
  const midtermComponent =
    filteredComponents.find(
      (item) =>
        resolveComponentSlotCode(item) === midtermPrimarySlot &&
        resolveComponentEntryMode(item) !== 'NF_SERIES',
    ) || null;
  const finalComponent =
    filteredComponents.find(
      (item) =>
        resolveComponentSlotCode(item) === finalPrimarySlot &&
        resolveComponentEntryMode(item) !== 'NF_SERIES',
    ) || null;
  const formativeComponentLabel = resolveReadableComponentLabel(formativeComponent, 'Komponen 1');
  const midtermComponentLabel = resolveReadableComponentLabel(midtermComponent, 'Komponen 2');
  const finalComponentLabel = resolveReadableComponentLabel(finalComponent, 'Komponen 3');
  const formativePrimarySlot = primarySlots.formative;

  useEffect(() => {
    if (selectedComponentId && !filteredComponents.some((component) => component.id === selectedComponentId)) {
      const timerId = setTimeout(() => setSelectedComponentId(null), 0);
      return () => clearTimeout(timerId);
    }
  }, [filteredComponents, selectedComponentId]);

  useEffect(() => {
    const timerId = setTimeout(() => {
    if (!selectedAssignmentId) {
      setCompetencySettings(emptyCompetencySettings());
      return;
    }
    const assignmentThresholds = assignmentDetailQuery.data?.competencyThresholds;
    if (!assignmentThresholds) {
      setCompetencySettings(emptyCompetencySettings());
      return;
    }
    setCompetencySettings(coerceCompetencySettings(assignmentThresholds));
    }, 0);
    return () => clearTimeout(timerId);
  }, [selectedAssignmentId, assignmentDetailQuery.data?.competencyThresholds]);

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
    const timerId = setTimeout(() => {
      const nextScoreDraft: Record<string, string> = {};
      const nextSeriesDraft: Record<string, string> = {};
      for (const item of gradesQuery.data || []) {
        const series = Array.isArray(item.formativeSeries)
          ? item.formativeSeries
          : sanitizeLegacySeriesForDisplay(
              [item.nf1, item.nf2, item.nf3, item.nf4, item.nf5, item.nf6],
              item.score ?? null,
            );
        const seriesAverage = averageValues(series);
        nextScoreDraft[`${item.studentId}:${item.componentId}`] = String(
          seriesAverage !== null ? seriesAverage : (item.score ?? ''),
        );
        if (series.length > 0) {
          nextSeriesDraft[`${item.studentId}:${item.componentId}`] = series.join(', ');
        }
      }
      setScoreDraft(nextScoreDraft);
      setFormativeSeriesDraft(nextSeriesDraft);
      setFormativePendingSlots({});
    }, 0);
    return () => clearTimeout(timerId);
  }, [selectedAssignmentId, semester, gradesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Assignment belum dipilih.');
      if (!selectedComponent) throw new Error('Pilih komponen nilai terlebih dahulu.');
      if (!semester) throw new Error('Pilih semester terlebih dahulu.');
      const activeSemester = semester as Semester;
      const students = assignmentDetailQuery.data?.class.students || [];
      const components = filteredComponents;
      const payload: Array<{
        student_id: number;
        subject_id: number;
        academic_year_id: number;
        grade_component_id: number;
        semester: Semester;
        score: number | null;
        nf1?: number | null;
        nf2?: number | null;
        nf3?: number | null;
        nf4?: number | null;
        nf5?: number | null;
        nf6?: number | null;
        formative_series?: number[] | null;
        description?: string;
      }> = [];

      for (const student of students) {
        const component = selectedComponent;
        const key = `${student.id}:${component.id}`;
        const rawScore = scoreDraft[key];
        const parsedScore = parseScore(rawScore);
        if (parsedScore.invalid) {
          throw new Error(`Nilai ${student.name} pada ${component.name} harus berupa angka.`);
        }

        if (resolveComponentEntryMode(component) === 'NF_SERIES') {
          const seriesKey = `${student.id}:${component.id}`;
          const parsedSeries = parseFormativeSeriesInput(formativeSeriesDraft[seriesKey] || '');
          if (parsedSeries.invalid) {
            throw new Error(`Deret nilai formatif ${student.name} harus berupa angka 0-100.`);
          }
          let formativeScore = parsedScore.value;
          if (parsedSeries.values.length > 0) {
            formativeScore =
              parsedSeries.values.reduce((acc, value) => acc + value, 0) / parsedSeries.values.length;
          }

          if (formativeScore === null && parsedSeries.values.length === 0) {
            payload.push({
              student_id: student.id,
              subject_id: selectedAssignment.subject.id,
              academic_year_id: selectedAssignment.academicYear.id,
              grade_component_id: component.id,
              semester: activeSemester,
              score: null,
              formative_series: [],
            });
            continue;
          }
          if (formativeScore !== null && (formativeScore < 0 || formativeScore > 100)) {
            throw new Error(`Nilai ${component.name} ${student.name} harus 0-100.`);
          }

          payload.push({
            student_id: student.id,
            subject_id: selectedAssignment.subject.id,
            academic_year_id: selectedAssignment.academicYear.id,
            grade_component_id: component.id,
            semester: activeSemester,
            score: formativeScore,
            formative_series: parsedSeries.values,
          });
          continue;
        }

        if (parsedScore.value === null) {
          payload.push({
            student_id: student.id,
            subject_id: selectedAssignment.subject.id,
            academic_year_id: selectedAssignment.academicYear.id,
            grade_component_id: component.id,
            semester: activeSemester,
            score: null,
          });
          continue;
        }
        if (parsedScore.value < 0 || parsedScore.value > 100) {
          throw new Error(`Nilai ${student.name} pada ${component.name} harus 0-100.`);
        }

        let description: string | undefined;
        const componentSlotCode = resolveComponentSlotCode(component);
        const isFinalSlot = componentSlotCode === finalPrimarySlot;
        if (isFinalSlot) {
          const formative = components.find((item) => resolveComponentEntryMode(item) === 'NF_SERIES') || null;
          const midterm =
            components.find(
              (item) =>
                resolveComponentSlotCode(item) === midtermPrimarySlot &&
                resolveComponentEntryMode(item) !== 'NF_SERIES',
            ) || null;
          const formativeScore = formative
            ? parseScore(scoreDraft[`${student.id}:${formative.id}`]).value ?? 0
            : 0;
          const midtermScore = midterm ? parseScore(scoreDraft[`${student.id}:${midterm.id}`]).value ?? 0 : 0;
          const finalScore = parsedScore.value;

          const formativeWeight = formative?.weight ?? 0;
          const midtermWeight = midterm?.weight ?? 0;
          const finalWeight = component.weight ?? 0;

          let weightedTotal = 0;
          let weightTotal = 0;
          if (formativeWeight > 0) {
            weightedTotal += formativeScore * (formativeWeight / 100);
            weightTotal += formativeWeight;
          }
          if (midtermWeight > 0) {
            weightedTotal += midtermScore * (midtermWeight / 100);
            weightTotal += midtermWeight;
          }
          if (finalWeight > 0) {
            weightedTotal += finalScore * (finalWeight / 100);
            weightTotal += finalWeight;
          }

          let raporSas = weightedTotal;
          if (weightTotal > 0 && weightTotal !== 100) {
            raporSas = (weightedTotal / weightTotal) * 100;
          } else if (weightTotal === 0) {
            raporSas = (formativeScore + midtermScore + finalScore) / 3;
          }

          raporSas = normalizeFinalRoundedScore(raporSas) ?? raporSas;

          description =
            deriveCompetencyDescription(raporSas, selectedKkm, competencySettings, {
              religionKey: student.religion,
              useReligionThreshold: isReligionSubject,
            }) || undefined;
        }

        payload.push({
          student_id: student.id,
          subject_id: selectedAssignment.subject.id,
          academic_year_id: selectedAssignment.academicYear.id,
          grade_component_id: component.id,
          semester: activeSemester,
          score: parsedScore.value,
          description,
        });
      }

      if (payload.length === 0) {
        throw new Error('Belum ada nilai yang diisi.');
      }

      return teacherGradeApi.saveBulk({ grades: payload });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['mobile-grade-rows', user?.id, selectedAssignmentId, semester],
        }),
        queryClient.invalidateQueries({
          queryKey: ['mobile-grade-report-rows', user?.id, selectedAssignmentId, semester],
        }),
      ]);
      if ((result.reportSync?.failed || 0) > 0) {
        notifySuccess(
          `Nilai tersimpan. Entri berhasil: ${result.success}, gagal: ${result.failed}, tetapi sinkronisasi rapor gagal pada ${result.reportSync?.failed} siswa.`,
        );
        return;
      }
      notifySuccess(`Simpan nilai selesai. Berhasil: ${result.success}, Gagal: ${result.failed}`);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan nilai.');
    },
  });

  const saveCompetencyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignmentId) throw new Error('Assignment belum dipilih.');
      if (!semester) throw new Error('Pilih semester terlebih dahulu.');
      const payload = sanitizeCompetencySettingsForSave(competencySettings, isReligionSubject);
      return teacherAssignmentApi.updateCompetencyThresholds(selectedAssignmentId, {
        A: payload.A.trim(),
        B: payload.B.trim(),
        C: payload.C.trim(),
        D: payload.D.trim(),
        _byReligion: payload._byReligion,
      }, semester);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-grade-assignment-detail', user?.id, selectedAssignmentId, semester],
      });
      setShowCompetencyModal(false);
      notifySuccess('Pengaturan deskripsi predikat berhasil disimpan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan pengaturan predikat.');
    },
  });

  const students = useMemo(
    () => assignmentDetailQuery.data?.class.students || [],
    [assignmentDetailQuery.data?.class.students],
  );
  const activeCompetencyThresholdSet = isReligionSubject
    ? getReligionThresholdSet(competencySettings, selectedReligionKey)
    : competencySettings;
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const name = student.name.toLowerCase();
      const nis = (student.nis || '').toLowerCase();
      const nisn = (student.nisn || '').toLowerCase();
      return name.includes(q) || nis.includes(q) || nisn.includes(q);
    });
  }, [students, searchQuery]);
  const reportMap = useMemo(() => {
    const map: Record<
      number,
      {
        formatif: number | null;
        sbts: number | null;
        sas: number | null;
        final: number | null;
        slotScores?: Record<string, number | null> | null;
        description?: string | null;
      }
    > = {};
    for (const row of reportGradesQuery.data || []) {
      map[row.studentId] = {
        formatif: row.formatifScore ?? null,
        sbts: row.sbtsScore ?? null,
        sas: row.sasScore ?? null,
        final: row.finalScore ?? null,
        slotScores:
          row.slotScores && typeof row.slotScores === 'object'
            ? (row.slotScores as Record<string, number | null>)
            : null,
        description: row.description ?? null,
      };
    }
    return map;
  }, [reportGradesQuery.data]);
  const recap = (() => {
    if (!selectedComponent) return { total: students.length, filled: 0 };
    let filled = 0;
    const total = students.length;
    for (const student of students) {
      const scoreRaw = scoreDraft[`${student.id}:${selectedComponent.id}`];
      const hasScore = scoreRaw !== undefined && scoreRaw.trim() !== '';
      if (isFormatifComponent) {
        const seriesValue = formativeSeriesDraft[`${student.id}:${selectedComponent.id}`] || '';
        const parsedSeries = parseFormativeSeriesInput(seriesValue);
        if (hasScore || (!parsedSeries.invalid && parsedSeries.values.length > 0)) filled += 1;
      } else if (hasScore) {
        filled += 1;
      }
    }
    return { total, filled };
  })();

  const competencyConfigured = useMemo(
    () => hasAnyCompetencySettingValue(competencySettings, isReligionSubject),
    [competencySettings, isReligionSubject],
  );

  const onScoreChange = (studentId: number, componentId: number, value: string) => {
    setScoreDraft((prev) => ({
      ...prev,
      [`${studentId}:${componentId}`]: value.replace(',', '.'),
    }));
  };

  const getFormativeSeriesValues = (studentId: number, componentId: number) => {
    const key = `${studentId}:${componentId}`;
    const parsed = parseFormativeSeriesInput(formativeSeriesDraft[key] || '');
    if (parsed.invalid) return [];
    return parsed.values;
  };

  const getFormativeDisplayValues = (studentId: number, componentId: number): Array<number | null> => {
    const key = `${studentId}:${componentId}`;
    const current = getFormativeSeriesValues(studentId, componentId);
    const pending = Math.max(0, Number(formativePendingSlots[key] || 0));
    const display = [...current, ...Array.from({ length: pending }, () => null)];
    return display.length > 0 ? display : [null];
  };

  const applyFormativeSeriesValues = (studentId: number, componentId: number, values: number[]) => {
    const key = `${studentId}:${componentId}`;
    const sanitized = values
      .map((item) => Number(item))
      .filter((item) => Number.isFinite(item) && item >= 0 && item <= 100);
    const formatted = formatSeriesValues(sanitized);
    const avg = averageValues(sanitized);
    setFormativeSeriesDraft((prev) => ({
      ...prev,
      [key]: formatted,
    }));
    setScoreDraft((prev) => ({
      ...prev,
      [key]: avg === null ? '' : toFixedOrInt(avg),
    }));
  };

  const onFormativeValueChange = (studentId: number, componentId: number, index: number, rawValue: string) => {
    const key = `${studentId}:${componentId}`;
    const current = getFormativeSeriesValues(studentId, componentId);
    const pending = Math.max(0, Number(formativePendingSlots[key] || 0));
    if (rawValue.trim() === '') {
      if (index < current.length) {
        applyFormativeSeriesValues(
          studentId,
          componentId,
          current.filter((_, currentIndex) => currentIndex !== index),
        );
      } else if (pending > 0) {
        setFormativePendingSlots((prev) => ({
          ...prev,
          [key]: Math.max(0, pending - 1),
        }));
      }
      return;
    }
    const parsed = Number(rawValue.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return;
    if (index < current.length) {
      const next = [...current];
      next[index] = parsed;
      applyFormativeSeriesValues(studentId, componentId, next);
      return;
    }
    applyFormativeSeriesValues(studentId, componentId, [...current, parsed]);
    if (pending > 0) {
      setFormativePendingSlots((prev) => ({
        ...prev,
        [key]: Math.max(0, pending - 1),
      }));
    }
  };

  const onFormativeValueRemove = (studentId: number, componentId: number, index: number) => {
    const key = `${studentId}:${componentId}`;
    const current = getFormativeSeriesValues(studentId, componentId);
    const pending = Math.max(0, Number(formativePendingSlots[key] || 0));
    if (index >= current.length) {
      if (pending > 0) {
        setFormativePendingSlots((prev) => ({
          ...prev,
          [key]: Math.max(0, pending - 1),
        }));
      }
      return;
    }
    const currentValue = current[index];
    const applyRemove = () => {
      applyFormativeSeriesValues(
        studentId,
        componentId,
        current.filter((_, currentIndex) => currentIndex !== index),
      );
    };
    if (currentValue === undefined || currentValue === null) {
      applyRemove();
      return;
    }
    Alert.alert(
      'Hapus Entri Nilai',
      `Nilai ${toFixedOrInt(currentValue)} akan dihapus dari entri formatif.`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: applyRemove },
      ],
    );
  };

  const onFormativeValueAdd = (studentId: number, componentId: number) => {
    const key = `${studentId}:${componentId}`;
    setFormativePendingSlots((prev) => ({
      ...prev,
      [key]: Math.max(0, Number(prev[key] || 0)) + 1,
    }));
  };

  if (isLoading) return <AppLoadingScreen message="Memuat input nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Input Nilai</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentPadding}
        refreshControl={
          <RefreshControl
            refreshing={
              assignmentsQuery.isFetching ||
              assignmentDetailQuery.isFetching ||
              gradesQuery.isFetching ||
              reportGradesQuery.isFetching
            }
            onRefresh={async () => {
              const refetches: Array<Promise<unknown>> = [assignmentsQuery.refetch()];
              if (hasSelectionReady) {
                refetches.push(
                  assignmentDetailQuery.refetch(),
                  gradesQuery.refetch(),
                  reportGradesQuery.refetch(),
                );
              }
              await Promise.all(refetches);
            }}
          />
        }
      >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>Input Nilai</Text>
      <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        Masukkan nilai per komponen untuk kelas ajar Anda.
      </Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
          <>
            <MobileSelectField
              label="Semester"
              value={semester}
              options={semesterOptions}
              onChange={(next) => {
                if (next !== 'ODD' && next !== 'EVEN') return;
                setSemester(next);
                setSelectedAssignmentId(null);
                setSelectedComponentId(null);
              }}
              placeholder="Pilih semester"
            />

            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
              <MobileSelectField
                value={selectedAssignmentId ? String(selectedAssignmentId) : ''}
                options={assignmentOptions}
                onChange={(next) => {
                  if (!semester) return;
                  setSelectedAssignmentId(next ? Number(next) : null);
                }}
                placeholder="Pilih kelas & mapel"
                helperText={!semester ? 'Pilih semester terlebih dahulu.' : undefined}
                disabled={!semester}
              />
              {!semester ? (
                <Text style={{ color: '#dc2626', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
                  Silahkan Pilih Semester
                </Text>
              ) : null}
            </View>

            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Komponen Nilai</Text>
              {componentsQuery.isLoading ? (
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  Memuat komponen mapel...
                </Text>
              ) : filteredComponents.length > 0 ? (
                <MobileSelectField
                  value={selectedComponentId ? String(selectedComponentId) : ''}
                  options={componentOptions}
                  onChange={(next) => setSelectedComponentId(next ? Number(next) : null)}
                  placeholder="Pilih komponen nilai"
                  helperText={!selectedAssignmentId ? 'Pilih kelas & mapel terlebih dahulu.' : undefined}
                  disabled={!selectedAssignmentId}
                />
              ) : (
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  Komponen nilai untuk mapel ini belum tersedia.
                </Text>
              )}
              {!selectedAssignmentId && semester ? (
                <Text style={{ color: '#dc2626', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
                  Silahkan Pilih Kelas & Mapel
                </Text>
              ) : null}
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Cari siswa / NIS / NISN..."
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: scaleFont(14),
                backgroundColor: '#fff',
                color: '#0f172a',
                marginBottom: 10,
              }}
            />

            {hasSelectionReady &&
            (assignmentDetailQuery.isLoading || componentsQuery.isLoading || gradesQuery.isLoading || reportGradesQuery.isLoading) ? (
              <QueryStateView type="loading" message="Memuat siswa dan komponen nilai..." />
            ) : null}
            {hasSelectionReady &&
            (assignmentDetailQuery.isError || componentsQuery.isError || gradesQuery.isError || reportGradesQuery.isError) ? (
              <QueryStateView
                type="error"
                message="Gagal memuat data input nilai."
                onRetry={() => {
                  assignmentDetailQuery.refetch();
                  componentsQuery.refetch();
                  gradesQuery.refetch();
                  reportGradesQuery.refetch();
                }}
              />
            ) : null}

            {!hasSelectionReady ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Lanjutkan Pemilihan Input</Text>
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  Pilih semester, lalu tentukan kelas & mapel untuk memuat siswa dan komponen nilai.
                </Text>
              </View>
            ) : !assignmentDetailQuery.isLoading &&
              !componentsQuery.isLoading &&
              !gradesQuery.isLoading &&
              !reportGradesQuery.isLoading ? (
              <>
                <View
                  style={{
                    backgroundColor: '#1e3a8a',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#bfdbfe', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
                    {selectedAssignment?.subject.name} • {selectedAssignment?.class.name} • Semester{' '}
                    {semester === 'ODD' ? 'Ganjil' : semester === 'EVEN' ? 'Genap' : '-'}
                  </Text>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    Terisi {recap.filled} / {recap.total} kolom nilai
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}>
                    Menampilkan {filteredStudents.length} dari {students.length} siswa
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}>
                    Komponen aktif: {selectedComponent ? formatComponentLabel(selectedComponent) : 'Belum dipilih'}
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}>
                    KKM mapel: {selectedKkm}
                  </Text>
                </View>

                {isFinalComponent ? (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbeafe',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                      {`Deskripsi Predikat ${finalComponentLabel}`}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                      A: nilai minimal 86, B: nilai minimal KKM sampai 85, C: nilai 60 sampai di bawah KKM, D: nilai di bawah 60
                    </Text>
                    {isReligionSubject ? (
                      <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                        Mapel Agama memakai template deskripsi per agama siswa sesuai profile.
                      </Text>
                    ) : null}
                    <Pressable
                      onPress={() => setShowCompetencyModal(true)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#1d4ed8',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                        {competencyConfigured ? 'Ubah Pengaturan Predikat' : 'Atur Deskripsi Predikat'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {filteredStudents.length > 0 && selectedComponent ? (
                  <View>
                    {filteredStudents.map((student) => {
                      const seriesKey = `${student.id}:${selectedComponent.id}`;
                      const seriesValue = formativeSeriesDraft[seriesKey] ?? '';
                      const parsedSeries = parseFormativeSeriesInput(seriesValue);
                      const draftAverage =
                        !parsedSeries.invalid && parsedSeries.values.length > 0
                          ? averageValues(parsedSeries.values)
                          : null;
                      const backendFormative = resolveSlotScore(
                        reportMap[student.id],
                        formativePrimarySlot,
                        reportMap[student.id]?.formatif ?? null,
                      );
                      const backendMidtermFormativeReference = resolveSlotScore(
                        reportMap[student.id],
                        buildFormativeReferenceSlotCode(formativePrimarySlot, 'MIDTERM'),
                        backendFormative,
                      );
                      const backendFinalFormativeReference = resolveSlotScore(
                        reportMap[student.id],
                        buildFormativeReferenceSlotCode(formativePrimarySlot, 'FINAL'),
                        backendFormative,
                      );
                      const backendMidterm = resolveSlotScore(
                        reportMap[student.id],
                        midtermPrimarySlot,
                        reportMap[student.id]?.sbts ?? null,
                      );
                      const backendFinalFromSlot = resolveSlotScore(
                        reportMap[student.id],
                        finalPrimarySlot,
                        reportMap[student.id]?.sas ?? reportMap[student.id]?.final ?? null,
                      );
                      const previewFormative = draftAverage ?? backendFormative;
                      const previewMidtermReference = draftAverage ?? backendMidtermFormativeReference;
                      const previewFinalReference = draftAverage ?? backendFinalFormativeReference;

                      return (
                      <View
                        key={student.id}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 2 }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                          NIS: {student.nis || '-'} | NISN: {student.nisn || '-'}
                        </Text>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ color: '#334155', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
                            {formatComponentLabel(selectedComponent)}
                          </Text>
                          {isFormatifComponent ? (
                            <>
                              {(() => {
                                return (
                                  <View style={{ marginBottom: 6 }}>
                                    <Text style={{ color: '#64748b', fontSize: scaleFont(10), lineHeight: scaleLineHeight(14), marginBottom: 3 }}>
                                      Butir nilai formatif (dinamis)
                                    </Text>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 6 }}>
                                      {getFormativeDisplayValues(student.id, selectedComponent.id).map((value, valueIndex) => (
                                        <View key={`${seriesKey}-${valueIndex}`} style={{ position: 'relative', paddingHorizontal: 3, marginBottom: 6 }}>
                                          <TextInput
                                            value={value === null ? '' : toFixedOrInt(value)}
                                            onChangeText={(nextValue) =>
                                              onFormativeValueChange(student.id, selectedComponent.id, valueIndex, nextValue)
                                            }
                                            keyboardType="numeric"
                                            style={{
                                              width: 56,
                                              borderWidth: 1,
                                              borderColor: '#cbd5e1',
                                              borderRadius: 8,
                                              paddingHorizontal: 8,
                                              paddingRight: 18,
                                              paddingVertical: 6,
                                              backgroundColor: '#fff',
                                              color: '#0f172a',
                                              fontSize: scaleFont(12),
                                              textAlign: 'center',
                                            }}
                                          />
                                          <Pressable
                                            onPress={() => onFormativeValueRemove(student.id, selectedComponent.id, valueIndex)}
                                            style={{
                                              position: 'absolute',
                                              top: -4,
                                              right: -1,
                                              width: 16,
                                              height: 16,
                                              borderRadius: 8,
                                              backgroundColor: '#ef4444',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                            }}
                                          >
                                            <Text style={{ color: '#ffffff', fontSize: scaleFont(10), fontWeight: '700', lineHeight: scaleLineHeight(12) }}>×</Text>
                                          </Pressable>
                                        </View>
                                      ))}
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: -3 }}>
                                      <View style={{ paddingHorizontal: 3 }}>
                                        <Pressable
                                          onPress={() => onFormativeValueAdd(student.id, selectedComponent.id)}
                                          style={{
                                            borderWidth: 1,
                                            borderColor: '#bfdbfe',
                                            backgroundColor: '#eff6ff',
                                            borderRadius: 8,
                                            paddingHorizontal: 10,
                                            paddingVertical: 8,
                                          }}
                                        >
                                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(11) }}>+ Tambah</Text>
                                        </Pressable>
                                      </View>
                                    </View>
                                    <Text
                                      style={{
                                        color: parsedSeries.invalid ? '#dc2626' : '#64748b',
                                        fontSize: scaleFont(10),
                                        marginTop: 3,
                                      }}
                                    >
                                      {parsedSeries.invalid
                                        ? 'Format salah. Gunakan angka 0-100 dipisahkan koma.'
                                        : `${getFormativeDisplayValues(student.id, selectedComponent.id).length} kotak entri dinamis`}
                                    </Text>
                                  </View>
                                );
                              })()}
                              <View style={{ flexDirection: 'row', marginHorizontal: -3, alignItems: 'center' }}>
                                <View style={{ flex: 1, paddingHorizontal: 3 }}>
                                  <View
                                    style={{
                                      borderWidth: 1,
                                      borderColor: '#bfdbfe',
                                      backgroundColor: '#eff6ff',
                                      borderRadius: 8,
                                      paddingVertical: 8,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{ color: '#64748b', fontSize: scaleFont(10) }}>{`Referensi ${midtermComponentLabel}`}</Text>
                                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                                      {previewMidtermReference === null || previewMidtermReference === undefined
                                        ? '-'
                                        : toFixedOrInt(previewMidtermReference)}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              <View style={{ marginTop: 6 }}>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: '#bbf7d0',
                                    backgroundColor: '#f0fdf4',
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#166534', fontSize: scaleFont(10) }}>{`Referensi ${finalComponentLabel}`}</Text>
                                  <Text style={{ color: '#166534', fontWeight: '700' }}>
                                    {previewFinalReference === null || previewFinalReference === undefined
                                      ? '-'
                                      : toFixedOrInt(previewFinalReference)}
                                  </Text>
                                </View>
                              </View>
                            </>
                          ) : (
                            <>
                              <TextInput
                                value={scoreDraft[`${student.id}:${selectedComponent.id}`] ?? ''}
                                onChangeText={(value) => onScoreChange(student.id, selectedComponent.id, value)}
                                keyboardType="numeric"
                                placeholder="0 - 100"
                                placeholderTextColor="#94a3b8"
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#cbd5e1',
                                  borderRadius: 8,
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  backgroundColor: '#fff',
                                  color: '#0f172a',
                                }}
                              />
                              {isMidtermComponent ? (
                                <View
                                  style={{
                                    marginTop: 6,
                                    borderWidth: 1,
                                    borderColor: '#fde68a',
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    backgroundColor: '#fefce8',
                                  }}
                                >
                                  <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginBottom: 2 }}>
                                    {`Nilai Rapor ${midtermComponentLabel} (preview)`}
                                  </Text>
                                  <Text style={{ color: '#92400e', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                                    {(() => {
                                      const sbtsRaw = Number(scoreDraft[`${student.id}:${selectedComponent.id}`]);
                                      const sbtsScore = Number.isFinite(sbtsRaw) ? sbtsRaw : null;
                                      const formatif = backendFormative;
                                      const weightedScore = computeWeightedPreviewScore([
                                        { score: formatif, weight: formativeComponent?.weight },
                                        { score: sbtsScore, weight: selectedComponent.weight },
                                      ]);
                                      if (weightedScore === null) return '-';
                                      return `${toFixedOrInt(weightedScore)} (otomatis saat simpan)`;
                                    })()}
                                  </Text>
                                </View>
                              ) : null}
                              {isFinalComponent ? (
                                <View
                                  style={{
                                    marginTop: 6,
                                    borderWidth: 1,
                                    borderColor: '#dbeafe',
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    backgroundColor: '#eff6ff',
                                  }}
                                >
                                  <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginBottom: 2 }}>
                                    Capaian Kompetensi
                                  </Text>
                                  <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                                    {(() => {
                                      const finalRaw = Number(scoreDraft[`${student.id}:${selectedComponent.id}`]);
                                      const finalScore = Number.isFinite(finalRaw) ? finalRaw : null;
                                      const formatif = backendFormative;
                                      const sbts = backendMidterm;
                                      const previewFinalRaw = computeFixedWeightedPreviewScore([
                                        { score: formatif, weight: formativeComponent?.weight },
                                        { score: sbts, weight: midtermComponent?.weight },
                                        { score: finalScore, weight: selectedComponent.weight },
                                      ]);
                                      const previewFinal = normalizeFinalRoundedScore(previewFinalRaw);
                                      const effectiveFinal = previewFinal ?? backendFinalFromSlot;
                                      if (effectiveFinal === null || effectiveFinal === undefined) {
                                        return 'Belum ada cukup data nilai.';
                                      }
                                      const predicate = calculatePredicate(effectiveFinal, selectedKkm);
                                      const backendDescription = reportMap[student.id]?.description?.trim();
                                      const fallbackDescription =
                                        deriveCompetencyDescription(effectiveFinal, selectedKkm, competencySettings, {
                                          religionKey: student.religion,
                                          useReligionThreshold: isReligionSubject,
                                        });
                                      const religionKey = normalizeReligionKey(student.religion);
                                      const emptyDescriptionMessage = isReligionSubject
                                        ? religionKey
                                          ? `Deskripsi agama ${formatReligionLabel(religionKey)} belum diatur di + Deskripsi`
                                          : 'Agama siswa belum terisi di profile'
                                        : 'Deskripsi belum diatur di + Deskripsi';
                                      return `Predikat ${predicate} • ${backendDescription || fallbackDescription || emptyDescriptionMessage} • Nilai ${Number(effectiveFinal).toFixed(2)}`;
                                    })()}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          )}
                        </View>
                      </View>
                    )})}
                  </View>
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>
                      Data belum lengkap
                    </Text>
                    <Text style={{ color: '#64748b' }}>
                      {selectedComponent
                        ? 'Siswa aktif belum tersedia untuk mapel ini.'
                        : 'Pilih komponen nilai terlebih dahulu untuk mulai input.'}
                    </Text>
                  </View>
                )}
              </>
            ) : null}

            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || students.length === 0 || !selectedComponent}
              style={{
                marginTop: 8,
                backgroundColor: saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
              </Text>
            </Pressable>
          </>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b' }}>Guru belum memiliki assignment mapel aktif.</Text>
          </View>
        )
      ) : null}

        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 18,
            backgroundColor: '#1d4ed8',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showCompetencyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompetencyModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 14,
              maxHeight: '85%',
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', marginBottom: 6 }}>
              Pengaturan Deskripsi Predikat
            </Text>
            <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 10 }}>
              {`Deskripsi ini akan diterapkan otomatis ke komponen ${finalComponentLabel}.`}
            </Text>
            {isReligionSubject ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#fcd34d',
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: '#fef3c7',
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  Deskripsi mapel Agama disimpan per agama siswa dan mengikuti data `Agama` pada profile siswa.
                </Text>
              </View>
            ) : null}
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbeafe',
                borderRadius: 8,
                padding: 10,
                backgroundColor: '#eff6ff',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#1e3a8a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 2 }}>A: Nilai ≥ 86</Text>
              <Text style={{ color: '#1e3a8a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 2 }}>B: Nilai minimal KKM sampai 85</Text>
              <Text style={{ color: '#1e3a8a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 2 }}>C: Nilai 60 sampai di bawah KKM</Text>
              <Text style={{ color: '#1e3a8a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>D: Nilai di bawah 60</Text>
            </View>

            {isReligionSubject ? (
              <View style={{ marginBottom: 8 }}>
                <MobileSelectField
                  label="Agama"
                  value={selectedReligionKey}
                  options={religionOptions}
                  onChange={(value) => setSelectedReligionKey(value)}
                  placeholder="Pilih agama"
                  helperText="Semua agama baku tersedia untuk diisi, lalu sistem otomatis mengikuti agama di profile siswa."
                />
              </View>
            ) : null}

            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <View key={key} style={{ marginBottom: 8 }}>
                <Text style={{ color: '#334155', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700', marginBottom: 4 }}>
                  Deskripsi Predikat {key}
                </Text>
                <TextInput
                  value={activeCompetencyThresholdSet[key]}
                  onChangeText={(value) => {
                    setCompetencySettings((prev) =>
                      updateCompetencySettingValue(prev, key, value, {
                        religionKey: selectedReligionKey,
                        useReligionThreshold: isReligionSubject,
                      }),
                    );
                  }}
                  multiline
                  numberOfLines={2}
                  placeholder={`Tulis deskripsi untuk predikat ${key}`}
                  editable={!isReligionSubject || Boolean(selectedReligionKey)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: !isReligionSubject || selectedReligionKey ? '#fff' : '#f8fafc',
                    minHeight: 56,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            ))}

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 4 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setShowCompetencyModal(false)}
                  disabled={saveCompetencyMutation.isPending}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => saveCompetencyMutation.mutate()}
                  disabled={saveCompetencyMutation.isPending}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor:
                      saveCompetencyMutation.isPending
                        ? '#93c5fd'
                        : '#1d4ed8',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveCompetencyMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
