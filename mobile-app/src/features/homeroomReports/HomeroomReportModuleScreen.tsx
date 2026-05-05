import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { scaleWithAppTextScale } from '../../theme/AppTextScaleProvider';
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
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileDetailModal } from '../../components/MobileDetailModal';
import { MobileMenuTabBar } from '../../components/MobileMenuTabBar';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { academicYearApi } from '../academicYear/academicYearApi';
import { adminApi } from '../admin/adminApi';
import { useAuth } from '../auth/AuthProvider';
import { gradeApi } from '../grades/gradeApi';
import type { HomeroomRemedialMonitoringItem, HomeroomResultPublicationStudentRow } from '../grades/types';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { homeroomReportApi } from './homeroomReportApi';
import { examApi } from '../exams/examApi';
import {
  HomeroomReportBaseType,
  HomeroomExtracurricularStudent,
  HomeroomRankingData,
  HomeroomSemester,
  HomeroomStudentReportSubjectRow,
} from './types';

type TabKey = 'RAPOR' | 'LEDGER' | 'EXTRACURRICULAR' | 'RANKING' | 'REMEDIAL' | 'PUBLICATION';
type RequestedProgramHint = 'MIDTERM' | 'FINAL_ODD' | 'FINAL_EVEN';

type ModuleConfig = {
  title: string;
  subtitle: string;
  defaultSemester: HomeroomSemester;
  allowSemesterSwitch: boolean;
};

type HomeroomReportModuleScreenProps = {
  mode?: string;
  fixedProgramCode?: string;
  fixedProgramLabel?: string;
};

function normalizeProgramCode(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isMidtermAliasCode(raw?: string | null): boolean {
  const value = normalizeProgramCode(raw);
  if (!value) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(value)) return true;
  return value.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw?: string | null): boolean {
  const value = normalizeProgramCode(raw);
  if (!value) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(value)) return true;
  return value.includes('EVEN');
}

function isFinalOddAliasCode(raw?: string | null): boolean {
  const value = normalizeProgramCode(raw);
  if (!value) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(value)) return true;
  return value.includes('ODD');
}

function isFinalAliasCode(raw?: string | null): boolean {
  const value = normalizeProgramCode(raw);
  if (!value) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_ODD', 'FINAL_EVEN'].includes(value)) {
    return true;
  }
  return value.includes('FINAL');
}

function toRequestedProgramHint(raw?: string | null): RequestedProgramHint | null {
  if (isMidtermAliasCode(raw)) return 'MIDTERM';
  if (isFinalEvenAliasCode(raw)) return 'FINAL_EVEN';
  if (isFinalOddAliasCode(raw) || isFinalAliasCode(raw)) return 'FINAL_ODD';
  return null;
}

function normalizeGradeComponentType(raw?: string | null): string {
  return String(raw || '').trim().toUpperCase();
}

function resolveReportModeFromProgram(
  program?:
    | {
        baseType?: string | null;
        baseTypeCode?: string | null;
        gradeComponentType?: string | null;
        gradeComponentTypeCode?: string | null;
        fixedSemester?: 'ODD' | 'EVEN' | null;
      }
    | null,
): HomeroomReportBaseType | null {
  if (!program) return null;
  const normalizedBaseType = normalizeProgramCode(program.baseTypeCode || program.baseType);
  if (normalizedBaseType) {
    if (isMidtermAliasCode(normalizedBaseType)) return 'MIDTERM';
    if (isFinalAliasCode(normalizedBaseType)) return 'FINAL';
    return normalizedBaseType;
  }
  const componentType = normalizeGradeComponentType(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  if (isMidtermAliasCode(componentType)) return 'MIDTERM';
  if (isFinalAliasCode(componentType)) return 'FINAL';
  return null;
}

function fallbackModeFromHint(hint?: RequestedProgramHint | null): HomeroomReportBaseType | null {
  if (!hint) return null;
  if (hint === 'MIDTERM') return 'MIDTERM';
  return 'FINAL';
}

function matchProgramByHint(
  program:
    | {
        baseType?: string | null;
        baseTypeCode?: string | null;
        gradeComponentType?: string | null;
        gradeComponentTypeCode?: string | null;
        fixedSemester?: 'ODD' | 'EVEN' | null;
      }
    | null
    | undefined,
  hint?: RequestedProgramHint | null,
  strictSemester: boolean = true,
): boolean {
  if (!program || !hint) return false;
  const componentType = normalizeGradeComponentType(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  const baseType = normalizeProgramCode(program.baseTypeCode || program.baseType);
  const fixedSemester = String(program.fixedSemester || '')
    .trim()
    .toUpperCase();

  if (hint === 'MIDTERM') {
    return isMidtermAliasCode(componentType) || isMidtermAliasCode(baseType);
  }
  if (!isFinalAliasCode(componentType) && !isFinalAliasCode(baseType)) return false;
  if (!strictSemester) return true;
  if (hint === 'FINAL_EVEN') {
    return fixedSemester === 'EVEN' || isFinalEvenAliasCode(baseType);
  }
  return fixedSemester === 'ODD' || isFinalOddAliasCode(baseType);
}

function buildModuleConfig(params: {
  activeProgramLabel: string;
  resolvedMode: HomeroomReportBaseType;
  requestedProgramHint: RequestedProgramHint | null;
  fixedSemesterFromProgram: HomeroomSemester | null;
  activeProgramComponentMode: HomeroomReportBaseType | null;
}): ModuleConfig {
  const {
    activeProgramLabel,
    resolvedMode,
    requestedProgramHint,
    fixedSemesterFromProgram,
    activeProgramComponentMode,
  } =
    params;
  const title = 'Rapor Wali Kelas';
  const subtitlePrefix = activeProgramLabel ? `${activeProgramLabel} • ` : '';

  if (isMidtermAliasCode(activeProgramComponentMode)) {
    return {
      title,
      subtitle: `${subtitlePrefix}Monitoring rapor tengah semester, leger, ekstrakurikuler, dan peringkat kelas.`,
      defaultSemester: 'ODD',
      allowSemesterSwitch: true,
    };
  }

  if (isFinalAliasCode(activeProgramComponentMode)) {
    if (fixedSemesterFromProgram === 'EVEN') {
      return {
        title,
        subtitle: `${subtitlePrefix}Monitoring rapor semester genap, leger, ekstrakurikuler, dan peringkat kelas.`,
        defaultSemester: 'EVEN',
        allowSemesterSwitch: false,
      };
    }
    if (fixedSemesterFromProgram === 'ODD') {
      return {
        title,
        subtitle: `${subtitlePrefix}Monitoring rapor semester ganjil, leger, ekstrakurikuler, dan peringkat kelas.`,
        defaultSemester: 'ODD',
        allowSemesterSwitch: false,
      };
    }
    return {
      title,
      subtitle: `${subtitlePrefix}Monitoring rapor akhir semester sesuai semester aktif kelas.`,
      defaultSemester: requestedProgramHint === 'FINAL_EVEN' ? 'EVEN' : 'ODD',
      allowSemesterSwitch: true,
    };
  }

  return {
    title,
    subtitle: `${subtitlePrefix}Monitoring rapor ${resolvedMode}, leger, ekstrakurikuler, dan peringkat kelas.`,
    defaultSemester: 'ODD',
    allowSemesterSwitch: true,
  };
}

function isHomeroomTeacher(duties?: string[], classesCount?: number) {
  if ((classesCount || 0) > 0) return true;
  const normalized = (duties || []).map((item) => item.trim().toUpperCase());
  return normalized.includes('WALI_KELAS');
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function parseScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBelowKkmScore(
  value: number | string | null | undefined,
  kkm: number | string | null | undefined,
) {
  const numericValue = parseScore(value);
  const numericKkm = parseScore(kkm);
  if (numericValue === null || numericKkm === null) return false;
  return numericValue < numericKkm;
}

function resolveCompletionStatus(
  scores: Array<number | string | null | undefined>,
  kkm: number | string | null | undefined,
) {
  const availableScores = scores
    .map((value) => parseScore(value))
    .filter((value): value is number => value !== null);
  const numericKkm = parseScore(kkm);
  if (availableScores.length === 0) return '-';
  if (numericKkm === null) return '-';
  return availableScores.some((score) => score < numericKkm) ? 'Belum Tuntas' : 'Tuntas';
}

function formatNumber(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  const num = Number(value);
  return num.toLocaleString('id-ID', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function safeText(value: string | null | undefined, fallback = '-') {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : fallback;
}

function formatDateTime(value: string | null | undefined) {
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

function getProgressToneStyle(tone: string) {
  if (tone === 'green') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (tone === 'red') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  if (tone === 'blue') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
  return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
}

function averageFrom(values: Array<number | null | undefined>) {
  const valid = values.filter((item): item is number => item !== null && item !== undefined && Number.isFinite(item));
  if (!valid.length) return null;
  return valid.reduce((acc, item) => acc + item, 0) / valid.length;
}

function EmptyState({ message }: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderStyle: 'dashed',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
      }}
    >
      <Text style={{ color: '#64748b' }}>{message}</Text>
    </View>
  );
}

function SubjectRow({
  row,
  isMidterm,
  col1Label,
  col2Label,
}: {
  row: HomeroomStudentReportSubjectRow;
  isMidterm: boolean;
  col1Label?: string;
  col2Label?: string;
}) {
  if (row.isHeader) {
    return (
      <View
        style={{
          backgroundColor: '#eff6ff',
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 7,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>{safeText(row.name)}</Text>
      </View>
    );
  }

  const formatifScore = row.formatif?.score ?? row.col1?.score ?? null;
  const examScore = row.sbts?.score ?? row.col2?.score ?? null;
  const finalScore = row.final?.score ?? null;

  const finalPredicate = row.final?.predicate ?? row.col2?.predicate ?? null;
  const description = safeText(row.description || row.col2?.description || '');
  const formatifBelowKkm = isBelowKkmScore(formatifScore, row.kkm);
  const examBelowKkm = isBelowKkmScore(examScore, row.kkm);
  const status = resolveCompletionStatus([formatifScore, examScore], row.kkm);
  const statusColor = status === 'Belum Tuntas' ? '#dc2626' : '#0f172a';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(row.name)}</Text>
      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
        KKTP: {formatScore(row.kkm ?? null)} • Guru: {safeText(row.teacherName)}
      </Text>

      {isMidterm ? (
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(10) }}>{safeText(col1Label, 'Komponen 1')}</Text>
              <Text style={{ color: formatifBelowKkm ? '#dc2626' : BRAND_COLORS.textDark, fontWeight: '700' }}>
                {formatScore(formatifScore)}
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(10) }}>{safeText(col2Label, 'Komponen 2')}</Text>
              <Text style={{ color: examBelowKkm ? '#dc2626' : BRAND_COLORS.textDark, fontWeight: '700' }}>
                {formatScore(examScore)}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(10) }}>Nilai Akhir</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatScore(row.col1?.score ?? finalScore)}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 8,
                paddingVertical: 7,
                alignItems: 'center',
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(10) }}>Predikat</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(finalPredicate)}</Text>
            </View>
          </View>
        </View>
      )}

      {isMidterm && status !== '-' ? (
        <Text style={{ color: statusColor, fontSize: scaleWithAppTextScale(12), marginTop: 8, fontWeight: status === 'Belum Tuntas' ? '700' : '600' }}>
          Status: {status}
        </Text>
      ) : !isMidterm ? (
        <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 8 }}>
          Capaian: {safeText(description)}
        </Text>
      ) : null}
    </View>
  );
}

export function HomeroomReportModuleScreen({
  mode,
  fixedProgramCode,
  fixedProgramLabel,
}: HomeroomReportModuleScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const requestedProgramHint = toRequestedProgramHint(mode);
  const requestedProgramCode = normalizeProgramCode(fixedProgramCode);

  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('RAPOR');
  const [semester, setSemester] = useState<HomeroomSemester>(
    requestedProgramHint === 'FINAL_EVEN' ? 'EVEN' : 'ODD',
  );
  const [search, setSearch] = useState('');
  const [publicationGuideVisible, setPublicationGuideVisible] = useState(false);
  const [publicationProgramVisible, setPublicationProgramVisible] = useState(false);
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );

  const isAllowed = user?.role === 'TEACHER' && isHomeroomTeacher(user?.additionalDuties, user?.teacherClasses?.length);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-report-active-year', user?.id, requestedProgramHint || 'AUTO'],
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
    queryKey: ['mobile-homeroom-report-programs', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!activeYearQuery.data?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: activeYearQuery.data?.id,
        roleContext: 'teacher',
      }),
  });

  const homeroomPrograms = useMemo(() => {
    const rows = examProgramsQuery.data?.programs || [];
    return rows
      .filter((item) => item.isActive && item.showOnTeacherMenu)
      .filter((item) => {
        const componentType = normalizeGradeComponentType(
          item.gradeComponentTypeCode || item.gradeComponentType,
        );
        const baseType = normalizeProgramCode(item.baseTypeCode || item.baseType);
        return (
          isMidtermAliasCode(componentType) ||
          isFinalAliasCode(componentType) ||
          isMidtermAliasCode(baseType) ||
          isFinalAliasCode(baseType)
        );
      })
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.code).localeCompare(String(b.code)));
  }, [examProgramsQuery.data?.programs]);

  const activeProgram = useMemo(() => {
    if (!homeroomPrograms.length) return null;
    const exact = homeroomPrograms.find(
      (item) => normalizeProgramCode(item.code) === requestedProgramCode,
    );
    if (exact) return exact;
    if (requestedProgramHint) {
      const byRequestedModeStrict = homeroomPrograms.find(
        (item) => matchProgramByHint(item, requestedProgramHint, true),
      );
      if (byRequestedModeStrict) return byRequestedModeStrict;
      const byRequestedModeRelaxed = homeroomPrograms.find(
        (item) => matchProgramByHint(item, requestedProgramHint, false),
      );
      if (byRequestedModeRelaxed) return byRequestedModeRelaxed;
    }
    return homeroomPrograms[0] || null;
  }, [homeroomPrograms, requestedProgramCode, requestedProgramHint]);

  const resolvedMode: HomeroomReportBaseType = useMemo(() => {
    const byProgram = resolveReportModeFromProgram(activeProgram);
    const byHint = fallbackModeFromHint(requestedProgramHint);
    const explicitMode = normalizeProgramCode(mode);
    return byProgram || byHint || explicitMode || 'RAPOR';
  }, [activeProgram, mode, requestedProgramHint]);
  const activeProgramCode = useMemo(
    () => normalizeProgramCode(activeProgram?.code) || requestedProgramCode,
    [activeProgram?.code, requestedProgramCode],
  );

  const activeProgramLabel = useMemo(() => {
    const fromProgram = String(activeProgram?.label || activeProgram?.shortLabel || activeProgram?.code || '').trim();
    if (fromProgram) return fromProgram;
    if (String(fixedProgramLabel || '').trim()) return String(fixedProgramLabel || '').trim();
    return resolvedMode;
  }, [activeProgram?.label, activeProgram?.shortLabel, activeProgram?.code, fixedProgramLabel, resolvedMode]);

  const fixedSemesterFromProgram = useMemo<HomeroomSemester | null>(() => {
    const value = String(activeProgram?.fixedSemester || '').trim().toUpperCase();
    if (value === 'ODD' || value === 'EVEN') return value;
    return null;
  }, [activeProgram?.fixedSemester]);

  const activeProgramComponentType = useMemo(
    () =>
      normalizeGradeComponentType(
        activeProgram?.gradeComponentTypeCode || activeProgram?.gradeComponentType,
      ),
    [activeProgram?.gradeComponentTypeCode, activeProgram?.gradeComponentType],
  );
  const activeProgramComponentMode = useMemo(
    () => resolveReportModeFromProgram(activeProgram),
    [activeProgram],
  );

  const moduleConfig = useMemo(() => {
    return buildModuleConfig({
      activeProgramLabel,
      resolvedMode,
      requestedProgramHint,
      fixedSemesterFromProgram,
      activeProgramComponentMode,
    });
  }, [
    activeProgramLabel,
    resolvedMode,
    requestedProgramHint,
    fixedSemesterFromProgram,
    activeProgramComponentMode,
  ]);

  const isSemesterLockedByProgram = Boolean(fixedSemesterFromProgram);
  const isFinalProgramView = useMemo(() => {
    if (isFinalAliasCode(activeProgramComponentType)) return true;
    if (isFinalAliasCode(activeProgramComponentMode)) return true;
    return normalizeProgramCode(resolvedMode) === 'FINAL';
  }, [activeProgramComponentMode, activeProgramComponentType, resolvedMode]);

  const reportTabItems = useMemo(() => {
    const items: Array<{
      key: TabKey;
      label: string;
      iconName: 'file-text' | 'layers' | 'activity' | 'bar-chart-2' | 'clipboard' | 'award';
    }> = [
      { key: 'LEDGER', label: 'Leger Nilai', iconName: 'layers' },
      { key: 'EXTRACURRICULAR', label: 'Ekstrakurikuler', iconName: 'activity' },
    ];
    if (isFinalProgramView) {
      items.push({ key: 'RANKING', label: 'Peringkat', iconName: 'bar-chart-2' });
    }
    items.push(
      { key: 'RAPOR', label: 'Rapor Siswa', iconName: 'file-text' },
      { key: 'REMEDIAL', label: 'Monitoring Remedial', iconName: 'clipboard' },
      { key: 'PUBLICATION', label: 'Publikasi Nilai', iconName: 'award' },
    );
    return items;
  }, [isFinalProgramView]);

  useEffect(() => {
    if (reportTabItems.some((item) => item.key === activeTab)) return;
    setActiveTab(reportTabItems[0]?.key || 'RAPOR');
  }, [activeTab, reportTabItems]);

  useEffect(() => {
    const nextSemester = fixedSemesterFromProgram || moduleConfig.defaultSemester;
    const timerId = setTimeout(() => {
      setSemester((prev) => {
        if (isSemesterLockedByProgram && prev !== nextSemester) return nextSemester;
        if (!moduleConfig.allowSemesterSwitch && prev !== nextSemester) return nextSemester;
        if (!prev) return nextSemester;
        return prev;
      });
    }, 0);
    return () => clearTimeout(timerId);
  }, [fixedSemesterFromProgram, isSemesterLockedByProgram, moduleConfig.allowSemesterSwitch, moduleConfig.defaultSemester]);

  const classesQuery = useQuery({
    queryKey: ['mobile-homeroom-report-classes', activeProgramCode, user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!user?.id && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
        teacherId: user?.id,
      });
      return result.items;
    },
  });

  const classItems = useMemo(() => classesQuery.data || [], [classesQuery.data]);
  const selectedClass = classItems.find((item) => item.id === selectedClassId) || null;

  useEffect(() => {
    if (!classItems.length) return;
    if (selectedClassId && classItems.some((item) => item.id === selectedClassId)) return;
    const timerId = setTimeout(() => setSelectedClassId(classItems[0].id), 0);
    return () => clearTimeout(timerId);
  }, [selectedClassId, classItems]);

  const classDetailQuery = useQuery({
    queryKey: ['mobile-homeroom-report-class-detail', user?.id, activeProgramCode, selectedClassId],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId,
    queryFn: async () => adminApi.getClassById(Number(selectedClassId)),
  });

  const students = useMemo(() => classDetailQuery.data?.students || [], [classDetailQuery.data?.students]);

  useEffect(() => {
    if (!students.length) {
      const timerId = setTimeout(() => setSelectedStudentId(null), 0);
      return () => clearTimeout(timerId);
    }
    if (selectedStudentId && students.some((item) => item.id === selectedStudentId)) return;
    const timerId = setTimeout(() => setSelectedStudentId(students[0].id), 0);
    return () => clearTimeout(timerId);
  }, [students, selectedStudentId]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });
  }, [students, normalizedSearch]);

  const selectedStudent = students.find((item) => item.id === selectedStudentId) || null;

  const ledgerQuery = useQuery({
    queryKey: ['mobile-homeroom-report-ledger', user?.id, activeProgramCode, selectedClassId, activeYearQuery.data?.id, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'LEDGER',
    queryFn: async () =>
      homeroomReportApi.getClassLedger({
        classId: Number(selectedClassId),
        academicYearId: activeYearQuery.data?.id,
        semester,
        reportType: activeProgramCode ? undefined : resolvedMode,
        programCode: activeProgramCode,
      }),
  });

  const extracurricularQuery = useQuery({
    queryKey: ['mobile-homeroom-report-extracurricular', user?.id, activeProgramCode, selectedClassId, activeYearQuery.data?.id, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'EXTRACURRICULAR',
    queryFn: async () =>
      homeroomReportApi.getClassExtracurricular({
        classId: Number(selectedClassId),
        academicYearId: activeYearQuery.data?.id,
        semester,
        reportType: activeProgramCode ? undefined : resolvedMode,
        programCode: activeProgramCode,
      }),
  });

  const rankingQuery = useQuery({
    queryKey: ['mobile-homeroom-report-ranking', user?.id, activeProgramCode, selectedClassId, semester, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!selectedClassId && activeTab === 'RANKING',
    queryFn: async () =>
      homeroomReportApi.getClassRankings({
        classId: Number(selectedClassId),
        semester,
        academicYearId: activeYearQuery.data?.id,
      }),
  });

  const studentReportQuery = useQuery({
    queryKey: ['mobile-homeroom-report-student', user?.id, activeProgramCode, selectedStudentId, activeYearQuery.data?.id, semester],
    enabled: isAuthenticated && !!isAllowed && !!selectedStudentId && activeTab === 'RAPOR',
    queryFn: async () =>
      homeroomReportApi.getStudentReport({
        studentId: Number(selectedStudentId),
        academicYearId: activeYearQuery.data?.id,
        semester,
        type: activeProgramCode ? undefined : resolvedMode,
        programCode: activeProgramCode,
      }),
  });

  const publicationQuery = useQuery({
    queryKey: [
      'mobile-homeroom-report-publication',
      user?.id,
      activeProgramCode,
      selectedClassId,
      activeYearQuery.data?.id,
      semester,
      search,
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!selectedClassId &&
      !!activeYearQuery.data?.id &&
      !!activeProgramCode &&
      activeTab === 'PUBLICATION',
    queryFn: async () =>
      gradeApi.getHomeroomResultPublications({
        classId: Number(selectedClassId),
        semester,
        publicationCode: activeProgramCode,
        page: 1,
        limit: 250,
        search: search.trim() || undefined,
      }),
  });

  const remedialMonitoringQuery = useQuery({
    queryKey: [
      'mobile-homeroom-report-remedial-monitoring',
      user?.id,
      activeProgramCode,
      selectedClassId,
      activeYearQuery.data?.id,
      semester,
      search,
    ],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!selectedClassId &&
      !!activeYearQuery.data?.id &&
      activeTab === 'REMEDIAL',
    queryFn: async () =>
      gradeApi.getHomeroomRemedialMonitoring({
        classId: Number(selectedClassId),
        semester,
        publicationCode: activeProgramCode || undefined,
        search: search.trim() || undefined,
      }),
  });

  const updatePublicationMutation = useMutation({
    mutationFn: (payload: {
      classId: number;
      studentId: number;
      publicationCode: string;
      mode: 'FOLLOW_GLOBAL' | 'BLOCKED';
    }) => gradeApi.updateHomeroomResultPublication(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-report-publication'] });
      Alert.alert(
        'Berhasil',
        payload.mode === 'BLOCKED'
          ? 'Publikasi nilai berhasil ditahan oleh wali kelas.'
          : 'Publikasi nilai kembali mengikuti jadwal Wakakur.',
      );
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const message =
        normalized.response?.data?.message || normalized.message || 'Gagal memperbarui publikasi nilai.';
      Alert.alert('Proses Gagal', message);
    },
  });

  const onRefresh = async () => {
    await Promise.all([
      activeYearQuery.refetch(),
      classesQuery.refetch(),
      classDetailQuery.refetch(),
      studentReportQuery.refetch(),
      ledgerQuery.refetch(),
      extracurricularQuery.refetch(),
      rankingQuery.refetch(),
      publicationQuery.refetch(),
    ]);
  };

  const handleToggleResultPublication = (row: HomeroomResultPublicationStudentRow) => {
    const selectedProgram = publicationQuery.data?.selectedProgram;
    if (!selectedClassId || !selectedProgram) {
      Alert.alert('Program Belum Siap', 'Program publikasi nilai belum tersedia.');
      return;
    }

    const nextMode = row.homeroomPublication.mode === 'BLOCKED' ? 'FOLLOW_GLOBAL' : 'BLOCKED';
    const title = nextMode === 'BLOCKED' ? 'Tahan Publikasi Nilai' : 'Ikuti Jadwal Wakakur';
    const message =
      nextMode === 'BLOCKED'
        ? `Tahan hasil nilai ${selectedProgram.shortLabel} untuk ${row.student.name}?`
        : `Kembalikan hasil nilai ${selectedProgram.shortLabel} untuk ${row.student.name} agar mengikuti jadwal Wakakur?`;

    Alert.alert(title, message, [
      { text: 'Batal', style: 'cancel' },
      {
        text: nextMode === 'BLOCKED' ? 'Tahan' : 'Ikuti Wakakur',
        style: nextMode === 'BLOCKED' ? 'destructive' : 'default',
        onPress: () =>
          updatePublicationMutation.mutate({
            classId: Number(selectedClassId),
            studentId: row.student.id,
            publicationCode: selectedProgram.publicationCode,
            mode: nextMode,
          }),
      },
    ]);
  };

  const renderRaporTab = () => {
    if (!students.length && !classDetailQuery.isLoading) {
      return <EmptyState message="Belum ada siswa aktif pada kelas terpilih." />;
    }

    const reportMeta = studentReportQuery.data?.body?.meta;
    const reportComponentMode = String(reportMeta?.reportComponentMode || '')
      .trim()
      .toUpperCase();
    const reportComponentType = String(reportMeta?.reportComponentType || '')
      .trim()
      .toUpperCase();
    const fallbackMidterm =
      isMidtermAliasCode(activeProgramComponentType) ||
      isMidtermAliasCode(activeProgramComponentMode);
    const isMidtermReportView =
      isMidtermAliasCode(reportComponentMode) ||
      isMidtermAliasCode(reportComponentType) ||
      (!reportComponentType && fallbackMidterm);
    const raporCol1Label = String(reportMeta?.col1Label || 'Komponen 1').trim();
    const raporCol2Label = String(reportMeta?.col2Label || activeProgramLabel || 'Komponen 2').trim();

    return (
      <View>
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Siswa</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student) => {
                const selected = student.id === selectedStudentId;
                return (
                  <View key={student.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setSelectedStudentId(student.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}
                      >
                        {safeText(student.name)}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), marginTop: 2 }}>
                        NIS: {safeText(student.nis)}
                      </Text>
                    </Pressable>
                  </View>
                );
              })
            ) : (
              <View style={{ width: '100%', paddingHorizontal: 4 }}>
                <EmptyState message="Siswa tidak ditemukan untuk pencarian ini." />
              </View>
            )}
          </View>
        </View>

        {selectedStudent ? (
          <View
            style={{
              backgroundColor: '#1e3a8a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: '#bfdbfe', fontSize: scaleWithAppTextScale(12) }}>Siswa Terpilih</Text>
            <Text style={{ color: '#fff', fontSize: scaleWithAppTextScale(18), fontWeight: '700', marginTop: 3 }}>{safeText(selectedStudent.name)}</Text>
            <Text style={{ color: '#dbeafe', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
              NIS: {safeText(selectedStudent.nis)} • NISN: {safeText(selectedStudent.nisn)}
            </Text>
          </View>
        ) : null}

        {studentReportQuery.isLoading ? <QueryStateView type="loading" message="Memuat rapor siswa..." /> : null}
        {studentReportQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat rapor siswa." onRetry={() => studentReportQuery.refetch()} />
        ) : null}

        {!studentReportQuery.isLoading && !studentReportQuery.isError && studentReportQuery.data ? (
          <View>
            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard
                  title="Semester"
                  value={studentReportQuery.data.header.semester}
                  subtitle={studentReportQuery.data.header.academicYear}
                />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard
                  title="Kelas"
                  value={safeText(studentReportQuery.data.header.class)}
                  subtitle={safeText(studentReportQuery.data.header.major)}
                />
              </View>
            </View>

            <View style={{ marginBottom: 12 }}>
              {(['A', 'B', 'C'] as const).map((groupKey) => {
                const rows = studentReportQuery.data?.body?.groups?.[groupKey] || [];
                if (!rows.length) return null;
                const title =
                  groupKey === 'A'
                    ? 'Kelompok Umum'
                    : groupKey === 'B'
                      ? 'Kelompok Kejuruan'
                      : 'Kelompok Muatan Lokal';
                return (
                  <View
                    key={groupKey}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
                    {rows.map((row, index) => (
                      <SubjectRow
                        key={`${groupKey}-${row.id ?? row.name}-${index}`}
                        row={row}
                        isMidterm={isMidtermReportView}
                        col1Label={raporCol1Label}
                        col2Label={raporCol2Label}
                      />
                    ))}
                  </View>
                );
              })}
            </View>

            {studentReportQuery.data.body?.attendance ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Rekap Kehadiran</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Sakit"
                      value={formatNumber(studentReportQuery.data.body.attendance.sick)}
                      subtitle="Total siswa"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Izin"
                      value={formatNumber(studentReportQuery.data.body.attendance.permission)}
                      subtitle="Total siswa"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Alpa"
                      value={formatNumber(studentReportQuery.data.body.attendance.absent)}
                      subtitle="Total siswa"
                    />
                  </View>
                </View>
              </View>
            ) : null}

            {studentReportQuery.data.body?.extracurriculars?.length ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ekstrakurikuler</Text>
                {studentReportQuery.data.body.extracurriculars.slice(0, 5).map((item, idx) => (
                  <View key={`${item.name}-${idx}`} style={{ marginBottom: idx === 4 ? 0 : 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(13) }}>{safeText(item.name)}</Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                      Predikat: {safeText(item.grade)} • {safeText(item.description)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {studentReportQuery.data.body?.organizations?.length ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>OSIS</Text>
                {studentReportQuery.data.body.organizations.slice(0, 5).map((item, idx) => (
                  <View key={`${item.name}-${item.positionName || 'osis'}-${idx}`} style={{ marginBottom: idx === 4 ? 0 : 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(13) }}>
                      {safeText(item.positionName || item.name)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                      {safeText(item.divisionName || 'Organisasi Siswa')} • Predikat: {safeText(item.grade)} • {safeText(item.description)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {studentReportQuery.data.body?.homeroomNote ? (
              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Wali Kelas</Text>
                <Text style={{ color: '#334155' }}>{safeText(studentReportQuery.data.body.homeroomNote)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const renderLedgerTab = () => {
    if (ledgerQuery.isLoading) return <QueryStateView type="loading" message="Memuat data leger nilai..." />;
    if (ledgerQuery.isError) {
      return <QueryStateView type="error" message="Gagal memuat data leger." onRetry={() => ledgerQuery.refetch()} />;
    }

    const ledgerData = ledgerQuery.data;
    if (!ledgerData || !ledgerData.students.length) {
      return <EmptyState message="Belum ada data leger untuk filter terpilih." />;
    }
    const ledgerComponentMode = String(ledgerData.meta?.reportComponentMode || '')
      .trim()
      .toUpperCase();
    const ledgerComponentType = String(ledgerData.meta?.reportComponentType || '')
      .trim()
      .toUpperCase();
    const fallbackMidterm =
      isMidtermAliasCode(activeProgramComponentType) ||
      isMidtermAliasCode(activeProgramComponentMode);
    const isLedgerMidterm =
      isMidtermAliasCode(ledgerComponentMode) ||
      isMidtermAliasCode(ledgerComponentType) ||
      (!ledgerComponentType && fallbackMidterm);
    const ledgerCol1Label = String(ledgerData.meta?.col1Label || 'Komponen 1').trim();
    const ledgerExamLabel = String(
      ledgerData.meta?.col2Label || activeProgramLabel || 'Komponen 2',
    ).trim();

    const rows = ledgerData.students.filter((item) => {
      if (!normalizedSearch) return true;
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });

    const classAverage = averageFrom(
      rows.map((item) => {
        const grades = Object.values(item.grades || {});
        return averageFrom(grades.map((grade) => grade.finalScore));
      }),
    );

    const classCol1Average = averageFrom(
      rows.map((item) => {
        const grades = Object.values(item.grades || {});
        return averageFrom(grades.map((grade) => (isLedgerMidterm ? grade.formatif : grade.finalScore)));
      }),
    );

    const classExamAverage = averageFrom(
      rows.map((item) => {
        const grades = Object.values(item.grades || {});
        return averageFrom(
          grades.map((grade) => (isLedgerMidterm ? grade.sbts : grade.finalComponent ?? null)),
        );
      }),
    );

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Jumlah Siswa"
              value={formatNumber(rows.length)}
              subtitle={`${formatNumber(ledgerData.subjects.length)} mata pelajaran`}
            />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Rata-rata Akhir"
              value={formatNumber(classAverage, 1)}
              subtitle={`${ledgerCol1Label} ${formatNumber(classCol1Average, 1)} • ${ledgerExamLabel} ${formatNumber(classExamAverage, 1)}`}
            />
          </View>
        </View>

        {rows.length > 0 ? (
          rows.map((item) => {
            const gradeValues = Object.values(item.grades || {});
            const avgCol1 = averageFrom(
              gradeValues.map((g) => (isLedgerMidterm ? g.formatif : g.finalScore)),
            );
            const avgExam = averageFrom(
              gradeValues.map((g) => (isLedgerMidterm ? g.sbts : g.finalComponent ?? null)),
            );
            const avgFinal = averageFrom(gradeValues.map((g) => g.finalScore));
            const predicateCount = gradeValues.reduce<Record<string, number>>((acc, grade) => {
              const key = (grade.predicate || '-').toUpperCase();
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            }, {});
            const dominantPredicate = Object.entries(predicateCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';

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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.name)}</Text>
                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                  NIS: {safeText(item.nis)} • NISN: {safeText(item.nisn)}
                </Text>

                <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title={ledgerCol1Label}
                      value={formatNumber(avgCol1, 1)}
                      subtitle="Rata-rata"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title={ledgerExamLabel}
                      value={formatNumber(avgExam, 1)}
                      subtitle="Rata-rata"
                    />
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <SummaryCard
                      title="Nilai Akhir"
                      value={formatNumber(avgFinal, 1)}
                      subtitle={`Predikat dominan ${safeText(dominantPredicate)}`}
                    />
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState message="Siswa tidak ditemukan untuk pencarian ini." />
        )}
      </View>
    );
  };

  const renderExtracurricularTab = () => {
    if (extracurricularQuery.isLoading) return <QueryStateView type="loading" message="Memuat data ekstrakurikuler..." />;
    if (extracurricularQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat data ekstrakurikuler."
          onRetry={() => extracurricularQuery.refetch()}
        />
      );
    }

    const rows = (extracurricularQuery.data || []).filter((item) => {
      if (!normalizedSearch) return true;
      const name = (item.name || '').toLowerCase();
      const nis = (item.nis || '').toLowerCase();
      const nisn = (item.nisn || '').toLowerCase();
      return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
    });

    if (!rows.length) {
      return <EmptyState message="Belum ada data ekstrakurikuler untuk filter terpilih." />;
    }

    const totalEkskul = rows.reduce((acc, item) => acc + item.extracurriculars.length, 0);
    const totalOrganizations = rows.reduce((acc, item) => acc + item.organizations.length, 0);
    const totalAchievements = rows.reduce((acc, item) => acc + item.achievements.length, 0);

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Total Siswa" value={formatNumber(rows.length)} subtitle="Data ekstrakurikuler" />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Non Akademik"
              value={formatNumber(totalEkskul + totalOrganizations)}
              subtitle={`Ekskul ${formatNumber(totalEkskul)} • OSIS ${formatNumber(totalOrganizations)} • Prestasi ${formatNumber(totalAchievements)}`}
            />
          </View>
        </View>

        {rows.map((item: HomeroomExtracurricularStudent) => (
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.name)}</Text>
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              NIS: {safeText(item.nis)} • NISN: {safeText(item.nisn)}
            </Text>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 8 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="S" value={formatNumber(item.attendance.s)} subtitle="Sakit" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="I" value={formatNumber(item.attendance.i)} subtitle="Izin" />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <SummaryCard title="A" value={formatNumber(item.attendance.a)} subtitle="Alpa" />
              </View>
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Ekstrakurikuler</Text>
              {item.extracurriculars.length > 0 ? (
                item.extracurriculars.map((ekskul) => (
                  <View key={ekskul.id} style={{ marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleWithAppTextScale(13) }}>{safeText(ekskul.ekskulName)}</Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                      Predikat: {safeText(ekskul.grade)} • {safeText(ekskul.description)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: '#64748b' }}>Belum ada data ekstrakurikuler.</Text>
              )}
            </View>

            <View style={{ marginTop: 10 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>OSIS</Text>
              {item.organizations.length > 0 ? (
                item.organizations.map((organization, idx) => (
                  <View key={`${organization.sourceType}-${organization.positionName || 'osis'}-${idx}`} style={{ marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleWithAppTextScale(13) }}>
                      {safeText(organization.positionName || organization.name)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                      {safeText(organization.divisionName || 'Organisasi Siswa')} • Predikat: {safeText(organization.grade)} • {safeText(organization.description)}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: '#64748b' }}>Belum ada data OSIS.</Text>
              )}
            </View>

            {item.achievements.length > 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Prestasi</Text>
                {item.achievements.slice(0, 4).map((achievement) => (
                  <Text key={achievement.id} style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginBottom: 4 }}>
                    • {safeText(achievement.name)} ({safeText(achievement.rank)} - {safeText(achievement.level)})
                  </Text>
                ))}
              </View>
            ) : null}

            <View style={{ marginTop: 8 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Catatan Wali Kelas</Text>
              <Text style={{ color: '#475569' }}>{safeText(item.catatan, 'Belum ada catatan.')}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderRankingTab = () => {
    if (rankingQuery.isLoading) return <QueryStateView type="loading" message="Memuat data peringkat..." />;
    if (rankingQuery.isError) {
      return <QueryStateView type="error" message="Gagal memuat data peringkat." onRetry={() => rankingQuery.refetch()} />;
    }

    const rankingData = rankingQuery.data as HomeroomRankingData | undefined;
    const rankingRows = [...(rankingData?.rankings || [])]
      .sort((a, b) => a.rank - b.rank)
      .filter((item) => {
        if (!normalizedSearch) return true;
        const name = (item.student?.name || '').toLowerCase();
        const nis = (item.student?.nis || '').toLowerCase();
        const nisn = (item.student?.nisn || '').toLowerCase();
        return name.includes(normalizedSearch) || nis.includes(normalizedSearch) || nisn.includes(normalizedSearch);
      });

    if (!rankingRows.length) {
      return <EmptyState message="Belum ada data peringkat untuk filter terpilih." />;
    }

    const topThree = rankingRows.filter((item) => item.rank <= 3);

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Jumlah Siswa" value={formatNumber(rankingRows.length)} subtitle="Data peringkat" />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Top 1"
              value={safeText(topThree[0]?.student?.name || '-', '-')}
              subtitle={`Skor ${formatNumber(topThree[0]?.totalScore ?? null, 2)}`}
            />
          </View>
        </View>

        {rankingRows.map((item) => (
          <View
            key={item.student.id}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <View
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                backgroundColor: item.rank <= 3 ? '#fef3c7' : '#e2e8f0',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700' }}>#{item.rank}</Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{safeText(item.student.name)}</Text>
              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                NIS: {safeText(item.student.nis)} • NISN: {safeText(item.student.nisn)}
              </Text>
              <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                Skor total: {formatNumber(item.totalScore, 2)} • Rata-rata: {formatNumber(item.averageScore, 2)} • Mapel:{' '}
                {formatNumber(item.subjectCount)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const renderRemedialItem = (item: HomeroomRemedialMonitoringItem) => {
    const tone = getProgressToneStyle(item.progress.tone);
    return (
      <View
        key={`${item.scoreEntryId}-${item.subject.id}`}
        style={{
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          backgroundColor: '#fff',
          padding: 10,
          marginTop: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }} numberOfLines={1}>
              {safeText(item.subject.name)}
            </Text>
            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
              {safeText(item.sourceLabel)} • Nilai {formatNumber(item.currentEffectiveScore, 2)} / KKM {formatNumber(item.kkm, 2)}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: tone.border,
              backgroundColor: tone.bg,
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}
          >
            <Text style={{ color: tone.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
              {safeText(item.progress.label)}
            </Text>
          </View>
        </View>
        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 6 }}>
          Percobaan: {formatNumber(item.attemptCount)} • Tenggat: {formatDateTime(item.latestAttempt?.activityDueAt)}
        </Text>
        <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), lineHeight: scaleWithAppTextScale(18), marginTop: 4 }}>
          {safeText(item.progress.description)}
        </Text>
      </View>
    );
  };

  const renderRemedialMonitoringTab = () => {
    if (remedialMonitoringQuery.isLoading) {
      return <QueryStateView type="loading" message="Memuat monitoring remedial..." />;
    }
    if (remedialMonitoringQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat monitoring remedial."
          onRetry={() => remedialMonitoringQuery.refetch()}
        />
      );
    }

    const data = remedialMonitoringQuery.data;
    const rows = data?.rows || [];
    const summary = data?.summary || {
      totalStudents: 0,
      studentsWithRemedial: 0,
      subjectsWithRemedial: 0,
      totalItems: 0,
      finishedItems: 0,
      unfinishedItems: 0,
      blockedItems: 0,
      expiredItems: 0,
    };

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Mapel Remedial" value={formatNumber(summary.subjectsWithRemedial)} subtitle={`${formatNumber(summary.studentsWithRemedial)} siswa`} />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Belum Selesai" value={formatNumber(summary.unfinishedItems)} subtitle={`Ditahan ${formatNumber(summary.blockedItems)} • Expired ${formatNumber(summary.expiredItems)}`} />
          </View>
        </View>

        {rows.length === 0 ? (
          <EmptyState message="Tidak ada remedial aktif untuk filter ini." />
        ) : (
          <View>
            {rows.map((row, index) => (
              <View
                key={row.student.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  backgroundColor: '#fff',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>NO {index + 1}</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>
                      {safeText(row.student.name)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      NIS: {safeText(row.student.nis)} • NISN: {safeText(row.student.nisn)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700' }}>{formatNumber(row.summary.subjectCount)} mapel</Text>
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                      {formatNumber(row.summary.finishedItems)} selesai • {formatNumber(row.summary.unfinishedItems)} belum
                    </Text>
                  </View>
                </View>
                {row.summary.blockedItems > 0 ? (
                  <Text style={{ color: '#991b1b', fontSize: scaleWithAppTextScale(12), marginTop: 8 }}>
                    Ada {formatNumber(row.summary.blockedItems)} remedial yang masih ditahan wali kelas.
                  </Text>
                ) : null}
                {row.items.map(renderRemedialItem)}
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderPublicationTab = () => {
    if (publicationQuery.isLoading) {
      return <QueryStateView type="loading" message="Memuat kontrol publikasi nilai..." />;
    }
    if (publicationQuery.isError) {
      return (
        <QueryStateView
          type="error"
          message="Gagal memuat kontrol publikasi nilai."
          onRetry={() => publicationQuery.refetch()}
        />
      );
    }

    const publicationData = publicationQuery.data;
    const selectedProgram = publicationData?.selectedProgram || null;
    const rows = publicationData?.rows || [];
    const summary = publicationData?.summary || {
      totalStudents: 0,
      blockedStudents: 0,
      visibleStudents: 0,
      waitingWakakurStudents: 0,
    };

    if (!selectedProgram) {
      return <EmptyState message="Program nilai ini belum punya konfigurasi publikasi siswa." />;
    }

    return (
      <View>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 12 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard title="Total Siswa" value={formatNumber(summary.totalStudents)} subtitle="Sesuai kelas aktif" />
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <SummaryCard
              title="Sudah Tampil"
              value={formatNumber(summary.visibleStudents)}
              subtitle={`Ditahan ${formatNumber(summary.blockedStudents)} • Menunggu ${formatNumber(summary.waitingWakakurStudents)}`}
            />
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 12 }}>
          <Pressable
            onPress={() => setPublicationGuideVisible(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#fde68a',
              backgroundColor: '#fefce8',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#a16207',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Feather name="alert-circle" size={20} color="#ca8a04" />
          </Pressable>
          <Pressable
            onPress={() => setPublicationProgramVisible(true)}
            style={{
              marginLeft: 12,
              width: 44,
              height: 44,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#2563eb',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.12,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Feather name="calendar" size={20} color="#2563eb" />
          </Pressable>
        </View>

        {rows.length > 0 ? (
          rows.map((row) => {
            const isBlocked = row.homeroomPublication.mode === 'BLOCKED';
            const effectiveColors =
              row.effectiveVisibility.tone === 'green'
                ? { border: '#86efac', bg: '#dcfce7', text: '#166534' }
                : row.effectiveVisibility.tone === 'amber'
                  ? { border: '#fcd34d', bg: '#fffbeb', text: '#92400e' }
                  : { border: '#fca5a5', bg: '#fee2e2', text: '#991b1b' };

            return (
              <View
                key={row.student.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15), lineHeight: 22 }}>
                      {row.student.name}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleWithAppTextScale(12), lineHeight: 18 }}>
                      NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => handleToggleResultPublication(row)}
                    disabled={updatePublicationMutation.isPending}
                    style={{
                      borderRadius: 10,
                      backgroundColor: isBlocked ? '#16a34a' : '#dc2626',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      opacity: updatePublicationMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>
                      {isBlocked ? 'Publikasikan' : 'Tahan Publikasi'}
                    </Text>
                  </Pressable>
                </View>

                <View style={{ gap: 8 }}>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), fontWeight: '700', marginBottom: 4 }}>
                      RILIS WAKAKUR
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {selectedProgram.globalRelease.label || '-'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), lineHeight: 18, marginTop: 4 }}>
                      {selectedProgram.globalRelease.effectiveDate
                        ? `Efektif ${formatDateTime(selectedProgram.globalRelease.effectiveDate)}`
                        : 'Tanpa tanggal khusus'}
                    </Text>
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      backgroundColor: '#f8fafc',
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), fontWeight: '700', marginBottom: 4 }}>
                      GATE WALI KELAS
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.homeroomPublication.label}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), lineHeight: 18, marginTop: 4 }}>
                      {row.homeroomPublication.updatedAt
                        ? `Diperbarui ${formatDateTime(row.homeroomPublication.updatedAt)}`
                        : 'Belum ada override manual'}
                    </Text>
                  </View>

                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: effectiveColors.border,
                      backgroundColor: effectiveColors.bg,
                      borderRadius: 10,
                      padding: 10,
                    }}
                  >
                    <Text style={{ color: effectiveColors.text, fontSize: scaleWithAppTextScale(11), fontWeight: '700', marginBottom: 4 }}>
                      STATUS KE SISWA
                    </Text>
                    <Text style={{ color: effectiveColors.text, fontWeight: '700' }}>{row.effectiveVisibility.label}</Text>
                    <Text style={{ color: effectiveColors.text, fontSize: scaleWithAppTextScale(12), lineHeight: 18, marginTop: 4 }}>
                      {row.effectiveVisibility.description}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        ) : (
          <EmptyState message="Tidak ada siswa yang ditemukan untuk pencarian ini." />
        )}
      </View>
    );
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul rapor wali kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>{moduleConfig.title}</Text>
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
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          {moduleConfig.title}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk wali kelas yang memiliki kelas aktif.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
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

  if (examProgramsQuery.isSuccess && !activeProgram) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          {moduleConfig.title}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Belum ada Program Ujian rapor aktif untuk wali kelas.
        </Text>
        <QueryStateView
          type="error"
          message="Aktifkan program dengan komponen nilai rapor di menu Kelola Ujian."
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
            examProgramsQuery.isFetching ||
            classesQuery.isFetching ||
            classDetailQuery.isFetching ||
            studentReportQuery.isFetching ||
            ledgerQuery.isFetching ||
            extracurricularQuery.isFetching ||
            rankingQuery.isFetching
          }
          onRefresh={() => {
            void onRefresh();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>{moduleConfig.title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{moduleConfig.subtitle}</Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>Program Ujian Aktif</Text>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>{activeProgramLabel}</Text>
        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
          Kode: {activeProgramCode} • Base: {resolvedMode}
        </Text>
      </View>

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kelas wali..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kelas wali." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Kelas</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {classItems.map((classItem) => {
                const selected = selectedClassId === classItem.id;
                return (
                  <View key={classItem.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => {
                        setSelectedClassId(classItem.id);
                        setSelectedStudentId(null);
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text
                        numberOfLines={1}
                        style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}
                      >
                        {classItem.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                        {classItem.major?.code || classItem.major?.name || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <EmptyState message="Anda belum memiliki kelas wali pada tahun ajaran aktif." />
        )
      ) : null}

      {selectedClass ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbe7fb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>Kelas Aktif</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 2 }}>{selectedClass.name}</Text>
          <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • {selectedClass.academicYear?.name || activeYearQuery.data?.name || '-'}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        {!isSemesterLockedByProgram && moduleConfig.allowSemesterSwitch ? (
          <MobileSelectField
            label="Semester Aktif"
            value={semester}
            options={semesterOptions}
            onChange={(next) => setSemester((next as HomeroomSemester) || 'ODD')}
            placeholder="Pilih semester"
          />
        ) : (
          <View
            style={{
              borderRadius: 999,
              borderWidth: 1,
              borderColor: '#cfe0fb',
              backgroundColor: '#eff6ff',
              paddingHorizontal: 12,
              paddingVertical: 8,
              alignSelf: 'flex-start',
            }}
          >
            <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
              {semester === 'ODD' ? 'Ganjil' : 'Genap'}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa / NIS / NISN..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 8,
          marginBottom: 12,
        }}
      >
        <MobileMenuTabBar
          items={reportTabItems}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as TabKey)}
          minTabWidth={84}
          maxTabWidth={112}
          compact
        />
      </View>

      {classDetailQuery.isLoading && activeTab === 'RAPOR' ? <QueryStateView type="loading" message="Memuat data siswa..." /> : null}
      {classDetailQuery.isError && activeTab === 'RAPOR' ? (
        <QueryStateView type="error" message="Gagal memuat data siswa kelas." onRetry={() => classDetailQuery.refetch()} />
      ) : null}

      {activeTab === 'RAPOR' ? renderRaporTab() : null}
      {activeTab === 'LEDGER' ? renderLedgerTab() : null}
      {activeTab === 'EXTRACURRICULAR' ? renderExtracurricularTab() : null}
      {activeTab === 'RANKING' ? renderRankingTab() : null}
      {activeTab === 'REMEDIAL' ? renderRemedialMonitoringTab() : null}
      {activeTab === 'PUBLICATION' ? renderPublicationTab() : null}

      <MobileDetailModal
        visible={publicationGuideVisible}
        title="Panduan Publikasi Nilai"
        subtitle="Ikuti jadwal Kurikulum, lalu tahan hanya jika memang perlu per siswa."
        iconName="alert-circle"
        accentColor="#ca8a04"
        onClose={() => setPublicationGuideVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            'Default publikasi nilai tetap mengikuti jadwal rilis dari Wakakur/Kurikulum.',
            'Gunakan kontrol ini hanya jika wali kelas perlu menahan hasil nilai siswa tertentu.',
            'Penahanan bersifat per siswa dan tidak memengaruhi siswa lain di kelas yang sama.',
          ].map((item) => (
            <View
              key={item}
              style={{
                borderWidth: 1,
                borderColor: '#fde68a',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#fefce8',
              }}
            >
              <Text style={{ color: '#854d0e', fontSize: scaleWithAppTextScale(12), lineHeight: 18 }}>{item}</Text>
            </View>
          ))}
        </View>
      </MobileDetailModal>

      <MobileDetailModal
        visible={publicationProgramVisible && !!publicationQuery.data?.selectedProgram}
        title={publicationQuery.data?.selectedProgram?.label || 'Jadwal Rilis'}
        subtitle="Status rilis global dari Wakakur untuk jenis nilai pada tab ini."
        iconName="calendar"
        accentColor="#2563eb"
        onClose={() => setPublicationProgramVisible(false)}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            borderRadius: 14,
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: '#eff6ff',
          }}
        >
          <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700', marginBottom: 4 }}>
            STATUS RILIS
          </Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>
            {publicationQuery.data?.selectedProgram?.globalRelease.label || '-'}
          </Text>
          <Text style={{ color: '#1e40af', fontSize: scaleWithAppTextScale(12), lineHeight: 18, marginTop: 6 }}>
            {publicationQuery.data?.selectedProgram?.globalRelease.description || '-'}
          </Text>
          <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), lineHeight: 16, marginTop: 8 }}>
            {publicationQuery.data?.selectedProgram?.globalRelease.effectiveDate
              ? `Efektif ${formatDateTime(publicationQuery.data?.selectedProgram?.globalRelease.effectiveDate)}`
              : 'Tanpa tanggal khusus'}
          </Text>
        </View>
      </MobileDetailModal>
    </ScrollView>
  );
}
