import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Feather } from '@expo/vector-icons';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Animated, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileDetailModal from '../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../src/components/MobileSelectField';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { resolveStudentExamRuntimeStatus, StudentExamRuntimeStatus } from '../../src/features/exams/status';
import { StudentExamItem, StudentExamPlacement } from '../../src/features/exams/types';
import { useStudentExamsQuery } from '../../src/features/exams/useStudentExamsQuery';
import { ENV } from '../../src/config/env';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { examApi, ExamProgramItem } from '../../src/features/exams/examApi';
import { examCardApi } from '../../src/features/examCards/examCardApi';
import { useIsScreenActive } from '../../src/hooks/useIsScreenActive';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';
import {
  MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS,
  shouldRunForegroundRefetch,
} from '../../src/lib/query/foregroundRefetch';

type StatusFilter = 'ALL' | 'OPEN' | 'MAKEUP' | 'UPCOMING' | 'MISSED' | 'COMPLETED';
type ExamLabelMap = Record<string, string>;
type PlacementRoomGroup = {
  key: string;
  roomName: string;
  examType: string;
  seatLabel?: string | null;
  seatPosition?: NonNullable<StudentExamPlacement['seatPosition']> | null;
  layout?: StudentExamPlacement['layout'] | null;
  entries: StudentExamPlacement[];
  primaryPlacement: StudentExamPlacement;
};
type ExamDayGroup = {
  key: string;
  label: string;
  exams: StudentExamItem[];
  startTime: string;
};

function normalizeProgramCode(raw?: string | null): string {
  const normalized = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (['PSAJ', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK'].includes(normalized)) {
    return 'ASAJP';
  }
  return normalized;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = date.getDate();
  const month = months[date.getMonth()] || '';
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hour}:${minute}`;
}

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function buildExamDayKey(value?: string | null) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return String(value || 'unknown');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatExamDayLabel(value?: string | null) {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return 'Tanggal belum diatur';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatExamCurrency(value?: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function statusStyle(status: StudentExamRuntimeStatus) {
  if (status === 'OPEN') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  if (status === 'MAKEUP') return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', label: 'Susulan' };
  if (status === 'COMPLETED') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8', label: 'Selesai' };
  if (status === 'MISSED') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', label: 'Terlewat' };
  return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Akan Datang' };
}

function placementStatusStyle(startTime?: string | null, endTime?: string | null) {
  const now = Date.now();
  const startMs = startTime ? new Date(startTime).getTime() : Number.NaN;
  const endMs = endTime ? new Date(endTime).getTime() : Number.NaN;

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && now <= endMs) {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  }
  if (Number.isFinite(endMs) && now > endMs) {
    return { bg: '#e2e8f0', border: '#cbd5e1', text: '#475569', label: 'Selesai' };
  }
  return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Terjadwal' };
}

function placementGroupStatusStyle(entries: StudentExamPlacement[]) {
  const now = Date.now();
  const validRanges = entries
    .map((entry) => ({
      startMs: entry.startTime ? new Date(entry.startTime).getTime() : Number.NaN,
      endMs: entry.endTime ? new Date(entry.endTime).getTime() : Number.NaN,
    }))
    .filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs));

  if (validRanges.some((range) => range.startMs <= now && now <= range.endMs)) {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  }
  if (validRanges.some((range) => now < range.startMs) || validRanges.length === 0) {
    return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Terjadwal' };
  }
  return { bg: '#e2e8f0', border: '#cbd5e1', text: '#475569', label: 'Selesai' };
}

function resolveExamTypeLabel(type: string, labels: ExamLabelMap): string {
  const normalized = normalizeProgramCode(type);
  const override = labels[normalized];
  if (!override) return normalized || '-';
  const cleaned = String(override).trim();
  return cleaned || normalized || '-';
}

function normalizeSubjectToken(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericSubject(name?: string | null, code?: string | null): boolean {
  const normalizedName = normalizeSubjectToken(name);
  const normalizedCode = normalizeSubjectToken(code);
  if (!normalizedName && !normalizedCode) return true;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) return true;
  if (normalizedName === 'KONSENTRASI' || normalizedName === 'KEJURUAN') return true;
  if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
  return false;
}

function resolveSubjectLabel(item: StudentExamItem): { name: string; code: string } {
  const scheduleSubject = item.subject || null;
  const packetSubject = item.packet?.subject || null;
  const usePacket = Boolean(
    scheduleSubject &&
      packetSubject &&
      isGenericSubject(scheduleSubject.name, scheduleSubject.code) &&
      !isGenericSubject(packetSubject.name, packetSubject.code),
  );
  const picked = usePacket ? packetSubject : scheduleSubject || packetSubject;
  let fallbackName = '';
  const title = String(item.packet?.title || '').trim();
  if (title.includes('•')) {
    const parts = title
      .split('•')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (candidate && !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
        fallbackName = candidate;
      }
    }
  }
  const pickedIsGeneric = isGenericSubject(picked?.name, picked?.code);
  const useFallbackName = Boolean(fallbackName) && pickedIsGeneric;
  return {
    name: String((useFallbackName ? fallbackName : picked?.name) || fallbackName || 'Mata pelajaran'),
    code: useFallbackName ? '' : String(picked?.code || '').trim(),
  };
}

function resolveCardMediaUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/api/uploads/${raw.replace(/^\/+/, '')}`;
}

export default function StudentExamsScreen() {
  const params = useLocalSearchParams<{ programCode?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const { isAuthenticated, isLoading, user } = useAuth();
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';
  const isScreenActive = useIsScreenActive();
  const isCandidateMode = user?.role === 'CALON_SISWA';
  const isApplicantMode = user?.role === 'UMUM';
  const applicantVerificationLocked =
    isApplicantMode && String(user?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED';
  const examsQuery = useStudentExamsQuery({ enabled: isAuthenticated && !applicantVerificationLocked, user });
  const pageContentPadding = getStandardPagePadding(insets);
  const lockedProgramCode = normalizeProgramCode(Array.isArray(params.programCode) ? params.programCode[0] : params.programCode);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [expandedExamDayKey, setExpandedExamDayKey] = useState<string | null>(null);
  const [expandedProctorDayKey, setExpandedProctorDayKey] = useState<string | null>(null);
  const [selectedExam, setSelectedExam] = useState<StudentExamItem | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<NonNullable<typeof studentPlacements>[number] | null>(null);
  const [selectedPlacementGroup, setSelectedPlacementGroup] = useState<PlacementRoomGroup | null>(null);
  const [isCardsExpanded, setIsCardsExpanded] = useState(false);
  const [isPlacementsExpanded, setIsPlacementsExpanded] = useState(false);
  const screenBecameActiveRef = useRef(false);
  const foregroundExamRefreshAtRef = useRef(0);
  const seatBlink = useMemo(() => new Animated.Value(1), []);
  const warningBlink = useMemo(() => new Animated.Value(1), []);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showProctorListModal, setShowProctorListModal] = useState(false);
  const studentExamPlacementsQuery = useQuery({
    queryKey: ['mobile-student-exam-placements', user?.id || 'anon'],
    enabled:
      isAuthenticated &&
      !isCandidateMode &&
      !isApplicantMode &&
      !applicantVerificationLocked &&
      user?.role === 'STUDENT',
    staleTime: 60_000,
    refetchOnMount: false,
    queryFn: () => examApi.getMyExamSittings(),
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-student-exam-programs'],
    enabled: isAuthenticated && canAccessExams && !applicantVerificationLocked,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        roleContext: isCandidateMode ? 'candidate' : isApplicantMode ? 'applicant' : 'student',
      }),
  });

  const activePrograms = useMemo(
    () =>
      (examProgramsQuery.data?.programs || [])
        .filter((program: ExamProgramItem) => program.isActive && ((isCandidateMode || isApplicantMode) ? true : program.showOnStudentMenu))
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)),
    [examProgramsQuery.data?.programs, isApplicantMode, isCandidateMode],
  );
  const selectedProgram = useMemo(
    () => activePrograms.find((program) => normalizeProgramCode(program.code) === lockedProgramCode) || null,
    [activePrograms, lockedProgramCode],
  );
  const shouldShowExamCardSections =
    !isCandidateMode &&
    !isApplicantMode &&
    !!selectedProgram &&
    !/FORMATIF|ULANGANHARIAN|UH/.test(normalizeProgramCode(selectedProgram.code));
  const studentExamCardsQuery = useQuery({
    queryKey: ['mobile-student-exam-cards', user?.id || 'anon', lockedProgramCode || 'all'],
    enabled:
      isAuthenticated &&
      !isCandidateMode &&
      !isApplicantMode &&
      !applicantVerificationLocked &&
      user?.role === 'STUDENT' &&
      shouldShowExamCardSections,
    staleTime: 60_000,
    refetchOnMount: false,
    queryFn: () => examCardApi.getMyCards({ programCode: lockedProgramCode || undefined }),
  });

  const effectiveTypeFilter = lockedProgramCode || 'ALL';

  const examTypeLabels = useMemo<ExamLabelMap>(() => {
    const map: ExamLabelMap = {};
    const programs = activePrograms;

    programs.forEach((program: ExamProgramItem) => {
      const code = normalizeProgramCode(program?.code);
      const label = String(program?.label || '').trim();
      if (!label) return;
      map[code] = label;
    });

    return map;
  }, [activePrograms]);
  const lockedProgramLabel =
    (lockedProgramCode && examTypeLabels[lockedProgramCode]) ||
    String(selectedProgram?.label || '').trim();
  const examScheduleTitle = isApplicantMode
    ? `Jadwal Tes ${lockedProgramLabel || 'BKK'}`
    : isCandidateMode
      ? `Jadwal Tes ${lockedProgramLabel || 'Seleksi'}`
      : lockedProgramLabel
        ? `Jadwal Ujian ${lockedProgramLabel}`
        : 'Jadwal Ujian';

  const examTypeLabel = (type: string) => resolveExamTypeLabel(type, examTypeLabels);
  const isRefreshingExamData =
    (examsQuery.isFetching && !examsQuery.isLoading) ||
    (!isCandidateMode && !isApplicantMode && studentExamCardsQuery.isFetching && !studentExamCardsQuery.isLoading) ||
    (!isCandidateMode && !isApplicantMode && studentExamPlacementsQuery.isFetching && !studentExamPlacementsQuery.isLoading);
  const handleRefreshExamData = useCallback(() => {
    void examsQuery.refetch();
    if (!isCandidateMode && !isApplicantMode) {
      void studentExamCardsQuery.refetch();
      void studentExamPlacementsQuery.refetch();
    }
  }, [examsQuery, isApplicantMode, isCandidateMode, studentExamCardsQuery, studentExamPlacementsQuery]);
  useEffect(() => {
    const becameActive = isScreenActive && !screenBecameActiveRef.current;
    screenBecameActiveRef.current = isScreenActive;
    if (!becameActive || !canAccessExams || applicantVerificationLocked) return;
    const now = Date.now();
    const shouldRefetchExamList = shouldRunForegroundRefetch({
      dataUpdatedAt: examsQuery.dataUpdatedAt,
      isFetching: examsQuery.isFetching,
      lastTriggeredAt: foregroundExamRefreshAtRef.current,
      minIntervalMs: MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS,
      now,
    });
    const shouldRefetchExamCards =
      !isCandidateMode &&
      !isApplicantMode &&
      user?.role === 'STUDENT' &&
      shouldShowExamCardSections &&
      shouldRunForegroundRefetch({
        dataUpdatedAt: studentExamCardsQuery.dataUpdatedAt,
        isFetching: studentExamCardsQuery.isFetching,
        lastTriggeredAt: foregroundExamRefreshAtRef.current,
        minIntervalMs: MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS,
        now,
      });
    const shouldRefetchExamPlacements =
      !isCandidateMode &&
      !isApplicantMode &&
      user?.role === 'STUDENT' &&
      shouldRunForegroundRefetch({
        dataUpdatedAt: studentExamPlacementsQuery.dataUpdatedAt,
        isFetching: studentExamPlacementsQuery.isFetching,
        lastTriggeredAt: foregroundExamRefreshAtRef.current,
        minIntervalMs: MOBILE_FOREGROUND_REFETCH_MIN_INTERVAL_MS,
        now,
      });
    if (!shouldRefetchExamList && !shouldRefetchExamCards && !shouldRefetchExamPlacements) return;
    foregroundExamRefreshAtRef.current = now;
    if (shouldRefetchExamList) {
      void examsQuery.refetch();
    }
    if (shouldRefetchExamCards) {
      void studentExamCardsQuery.refetch();
    }
    if (shouldRefetchExamPlacements) {
      void studentExamPlacementsQuery.refetch();
    }
  }, [
    applicantVerificationLocked,
    canAccessExams,
    examsQuery.dataUpdatedAt,
    examsQuery.isFetching,
    isScreenActive,
    isApplicantMode,
    isCandidateMode,
    shouldShowExamCardSections,
    studentExamCardsQuery.dataUpdatedAt,
    studentExamCardsQuery.isFetching,
    studentExamPlacementsQuery.dataUpdatedAt,
    studentExamPlacementsQuery.isFetching,
    user?.role,
  ]);
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(seatBlink, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(seatBlink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [seatBlink]);
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(warningBlink, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(warningBlink, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
    };
  }, [warningBlink]);
  const studentPlacements = useMemo(() => {
    const rows = studentExamPlacementsQuery.data || [];
    return rows
      .filter((item) => {
        const type = normalizeProgramCode(item.examType);
        if (effectiveTypeFilter !== 'ALL' && type !== effectiveTypeFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(String(a.startTime || 0)).getTime() - new Date(String(b.startTime || 0)).getTime());
  }, [effectiveTypeFilter, studentExamPlacementsQuery.data]);
  const groupedPlacements = useMemo<PlacementRoomGroup[]>(() => {
    const groupMap = new Map<string, PlacementRoomGroup>();
    studentPlacements.forEach((placement) => {
      const key = [
        normalizeProgramCode(placement.examType),
        String(placement.roomName || '').trim(),
        String(placement.seatLabel || '').trim(),
      ].join('::');
      const existing = groupMap.get(key);
      if (existing) {
        existing.entries.push(placement);
        existing.entries.sort(
          (left, right) =>
            new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
        );
        return;
      }
      groupMap.set(key, {
        key,
        roomName: placement.roomName,
        examType: placement.examType,
        seatLabel: placement.seatLabel || null,
        seatPosition: placement.seatPosition || null,
        layout: placement.layout || null,
        entries: [placement],
        primaryPlacement: placement,
      });
    });
    return Array.from(groupMap.values()).sort((left, right) => {
      const roomCompare = String(left.roomName || '').localeCompare(String(right.roomName || ''), 'id', {
        sensitivity: 'base',
        numeric: true,
      });
      if (roomCompare !== 0) return roomCompare;
      return String(left.seatLabel || '').localeCompare(String(right.seatLabel || ''), 'id', {
        sensitivity: 'base',
        numeric: true,
      });
    });
  }, [studentPlacements]);
  const selectedPlacementCard = useMemo(() => {
    if (!selectedPlacement) return null;
    const cards = studentExamCardsQuery.data || [];
    const placementProgramCode = normalizeProgramCode(selectedPlacement.examType);
    return cards.find((card) => normalizeProgramCode(card.payload.programCode || card.programCode) === placementProgramCode) || null;
  }, [selectedPlacement, studentExamCardsQuery.data]);
  const fallbackIdentityCard = useMemo(() => (studentExamCardsQuery.data || [])[0] || null, [studentExamCardsQuery.data]);
  const statusFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Status' },
      { value: 'OPEN', label: 'Sedang Dibuka' },
      { value: 'MAKEUP', label: 'Susulan' },
      { value: 'UPCOMING', label: 'Akan Datang' },
      { value: 'COMPLETED', label: 'Selesai' },
      { value: 'MISSED', label: 'Terlewat' },
    ],
    [],
  );
  const filtered = useMemo(() => {
    const rows = examsQuery.data?.exams || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
      const status = resolveStudentExamRuntimeStatus(item);
      if (effectiveTypeFilter !== 'ALL' && type !== effectiveTypeFilter) return false;
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!q) return true;
      const resolvedSubject = resolveSubjectLabel(item);
      const subjectName = String(resolvedSubject.name || '').toLowerCase();
      const subjectCode = String(resolvedSubject.code || '').toLowerCase();
      const vacancyTitle = String(item.jobVacancy?.title || '').toLowerCase();
      const vacancyCompany = String(
        item.jobVacancy?.industryPartner?.name || item.jobVacancy?.companyName || '',
      ).toLowerCase();
      return (
        String(item.packet?.title || '').toLowerCase().includes(q) ||
        subjectName.includes(q) ||
        subjectCode.includes(q) ||
        vacancyTitle.includes(q) ||
        vacancyCompany.includes(q)
      );
    });
  }, [effectiveTypeFilter, examsQuery.data?.exams, searchQuery, statusFilter]);
  const groupedFilteredExams = useMemo<ExamDayGroup[]>(() => {
    const groupMap = new Map<string, ExamDayGroup>();
    filtered.forEach((item) => {
      const key = buildExamDayKey(item.startTime);
      const existing = groupMap.get(key);
      if (existing) {
        existing.exams.push(item);
        existing.exams.sort(
          (left, right) => new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
        );
        return;
      }
      groupMap.set(key, {
        key,
        label: formatExamDayLabel(item.startTime),
        startTime: item.startTime,
        exams: [item],
      });
    });
    return Array.from(groupMap.values()).sort(
      (left, right) => new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
    );
  }, [filtered]);
  const groupedProctorEntries = useMemo(() => {
    if (!selectedPlacementGroup) return [] as { key: string; label: string; entries: StudentExamPlacement[] }[];
    const groupMap = new Map<string, { key: string; label: string; entries: StudentExamPlacement[] }>();
    selectedPlacementGroup.entries.forEach((entry) => {
      const key = buildExamDayKey(entry.startTime || '');
      const existing = groupMap.get(key);
      if (existing) {
        existing.entries.push(entry);
        existing.entries.sort(
          (left, right) => new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
        );
        return;
      }
      groupMap.set(key, {
        key,
        label: formatExamDayLabel(entry.startTime || ''),
        entries: [entry],
      });
    });
    return Array.from(groupMap.values()).sort(
      (left, right) =>
        new Date(String(left.entries[0]?.startTime || 0)).getTime() - new Date(String(right.entries[0]?.startTime || 0)).getTime(),
    );
  }, [selectedPlacementGroup]);
  const schoolLogoUrl = useMemo(() => resolveCardMediaUrl('/logo-kgb2.png'), []);
  const watermarkLogoUrl = useMemo(() => resolveCardMediaUrl('/logo_sis_kgb2.png'), []);

  useEffect(() => {
    setExpandedExamDayKey(null);
  }, [effectiveTypeFilter, searchQuery, statusFilter]);

  useEffect(() => {
    setExpandedProctorDayKey(null);
  }, [selectedPlacementGroup, showProctorListModal]);

  if (isLoading) return <AppLoadingScreen message="Memuat ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!canAccessExams) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>Ujian</Text>
        <QueryStateView type="error" message="Halaman ini hanya tersedia untuk peserta ujian yang aktif." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingExamData}
          onRefresh={handleRefreshExamData}
        />
      }
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 6 }}>
            {isCandidateMode
              ? lockedProgramLabel || 'Tes Seleksi'
              : isApplicantMode
                ? lockedProgramLabel || 'Tes BKK'
                : lockedProgramLabel || 'Ujian'}
          </Text>
          <Text style={{ color: '#64748b', fontSize: scaleFont(14), lineHeight: scaleLineHeight(22) }}>
            {isCandidateMode
              ? lockedProgramLabel
                ? `Lihat jadwal ${lockedProgramLabel.toLowerCase()} yang tersedia untuk calon siswa.`
                : 'Lihat jadwal tes yang tersedia untuk calon siswa.'
              : isApplicantMode
                ? lockedProgramLabel
                  ? `Lihat jadwal ${lockedProgramLabel.toLowerCase()} yang terhubung dengan lamaran BKK Anda.`
                  : 'Lihat jadwal tes rekrutmen yang terhubung dengan lamaran BKK Anda.'
                : lockedProgramLabel
                  ? `Lihat jadwal ${lockedProgramLabel.toLowerCase()} yang tersedia untuk kelas Anda.`
                  : 'Lihat jadwal ujian yang tersedia untuk kelas Anda.'}
          </Text>
          <Text style={{ color: '#2563eb', fontSize: scaleFont(11), lineHeight: scaleLineHeight(17), fontWeight: '700', marginTop: 6 }}>
            Tarik ke bawah atau tekan Refresh Data untuk memuat ulang jadwal ujian.
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 10 }}>
          <Pressable
            onPress={handleRefreshExamData}
            disabled={isRefreshingExamData}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: isRefreshingExamData ? 0.7 : 1,
            }}
          >
            <Feather name="refresh-cw" size={14} color="#1d4ed8" />
            <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), fontWeight: '700' }}>
              {isRefreshingExamData ? 'Memuat...' : 'Refresh Data'}
            </Text>
          </Pressable>
          <Animated.View style={{ opacity: warningBlink }}>
            <Pressable
              onPress={() => setShowRulesModal(true)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 21,
                borderWidth: 1,
                borderColor: '#fde68a',
                backgroundColor: '#fef3c7',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Feather name="alert-circle" size={20} color="#ca8a04" />
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {applicantVerificationLocked ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK menunggu verifikasi admin</Text>
          <Text style={{ color: '#92400e' }}>
            Akun pelamar Anda belum diverifikasi. Lengkapi profil pelamar lalu tunggu verifikasi admin sebelum mengikuti Tes BKK.
          </Text>
        </View>
      ) : null}

      {shouldShowExamCardSections ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Pressable
            onPress={() => setIsCardsExpanded((current) => !current)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: scaleFont(18), fontWeight: '700' }}>Kartu Ujian Digital</Text>
              <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                Kartu ujian akan muncul di sini setelah dipublikasikan oleh Kepala TU.
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(12) }}>
                {studentExamCardsQuery.data?.length || 0} kartu
              </Text>
            </View>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#dbe7fb',
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#64748b', fontWeight: '700' }}>{isCardsExpanded ? '▲' : '▼'}</Text>
            </View>
          </Pressable>

          {isCardsExpanded && studentExamCardsQuery.isLoading ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>Memuat kartu ujian digital...</Text>
            </View>
          ) : isCardsExpanded && studentExamCardsQuery.isError ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff1f2',
              }}
            >
              <Text style={{ color: '#be123c', fontWeight: '700' }}>Gagal memuat kartu ujian digital.</Text>
              <Pressable
                onPress={() => studentExamCardsQuery.refetch()}
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#fecdd3',
                  backgroundColor: '#fff',
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>Coba Lagi</Text>
              </Pressable>
            </View>
          ) : isCardsExpanded && studentExamCardsQuery.data && studentExamCardsQuery.data.length > 0 ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              {studentExamCardsQuery.data.map((card) => {
                const primaryEntry = card.payload.placement || card.payload.entries[0] || null;
                return (
                  <View
                    key={card.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      borderRadius: 16,
                      backgroundColor: '#f8fbff',
                      overflow: 'hidden',
                      maxWidth: 480,
                      alignSelf: 'center',
                      width: '100%',
                    }}
                  >
                    {watermarkLogoUrl ? (
                      <Image
                        source={{ uri: watermarkLogoUrl }}
                        style={{
                          position: 'absolute',
                          width: 148,
                          height: 148,
                          alignSelf: 'center',
                          top: 18,
                          opacity: 0.07,
                        }}
                        resizeMode="contain"
                      />
                    ) : null}

                    <View
                      style={{
                        borderBottomWidth: 1,
                        borderBottomColor: '#dbe7fb',
                        paddingHorizontal: 8,
                        paddingVertical: 8,
                      }}
                    >
                      <View
                        style={{
                          alignSelf: 'center',
                          maxWidth: 292,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 4,
                          columnGap: 12,
                        }}
                      >
                        <View style={{ width: 48, alignItems: 'center', justifyContent: 'center' }}>
                          {schoolLogoUrl ? (
                            <Image
                              source={{ uri: schoolLogoUrl }}
                              style={{ width: 48, height: 48 }}
                              resizeMode="contain"
                            />
                          ) : null}
                        </View>
                        <View style={{ maxWidth: 228, flexShrink: 1, paddingHorizontal: 10 }}>
                          <Text
                            style={{
                              color: '#0f172a',
                              fontSize: scaleFont(10, { max: 12 }),
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              textAlign: 'center',
                              lineHeight: scaleLineHeight(13, { max: 15 }),
                            }}
                          >
                            {card.payload.cardTitle || 'Kartu Peserta'}
                          </Text>
                          <Text
                            style={{
                              color: '#0f172a',
                              fontSize: scaleFont(10, { max: 12 }),
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              textAlign: 'center',
                              marginTop: 1,
                              lineHeight: scaleLineHeight(13, { max: 15 }),
                            }}
                          >
                            {card.payload.examTitle || card.payload.programLabel}
                          </Text>
                          <Text
                            style={{
                              color: '#0f172a',
                              fontSize: scaleFont(10, { max: 12 }),
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              textAlign: 'center',
                              marginTop: 1,
                              lineHeight: scaleLineHeight(13, { max: 15 }),
                            }}
                          >
                            {card.payload.institutionName || card.payload.schoolName}
                          </Text>
                          <Text
                            style={{
                              color: '#0f172a',
                              fontSize: scaleFont(10, { max: 12 }),
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              textAlign: 'center',
                              marginTop: 1,
                              lineHeight: scaleLineHeight(13, { max: 15 }),
                            }}
                          >
                            {`Tahun Ajaran ${card.payload.academicYearName}`}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={{ paddingHorizontal: 8, paddingVertical: 8, gap: 8 }}>
                      <View
                        style={{
                          alignSelf: 'center',
                          width: '100%',
                          maxWidth: 292,
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          gap: 8,
                        }}
                      >
                        <View style={{ flex: 1, gap: 3 }}>
                          {[
                            ['Nama Siswa', card.payload.student.name],
                            ['Kelas', card.payload.student.className || '-'],
                            ['Username', card.payload.student.username || '-'],
                            ['No. Peserta', card.payload.participantNumber || '-'],
                            ['Ruang', primaryEntry?.roomName || '-'],
                            ['Sesi', primaryEntry?.sessionLabel || '-'],
                          ].map(([label, value]) => (
                            <View key={label} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                              <Text style={{ width: 54, color: '#334155', fontSize: scaleFont(9, { max: 10.5 }), lineHeight: scaleLineHeight(12, { max: 13.5 }) }}>{label}</Text>
                              <Text style={{ width: 8, color: '#334155', fontSize: scaleFont(9, { max: 10.5 }), lineHeight: scaleLineHeight(12, { max: 13.5 }) }}>:</Text>
                              <Text
                                style={{
                                  flex: 1,
                                  color: label === 'No. Peserta' ? '#1d4ed8' : '#0f172a',
                                  fontSize: scaleFont(9, { max: 10.5 }),
                                  lineHeight: scaleLineHeight(12, { max: 13.5 }),
                                  fontWeight: label === 'No. Peserta' ? '700' : '400',
                                }}
                              >
                                {value}
                              </Text>
                            </View>
                          ))}
                        </View>

                        <View style={{ width: 98, alignItems: 'center' }}>
                          <Text style={{ color: '#334155', fontSize: scaleFont(8.5, { max: 10 }), textAlign: 'center', lineHeight: scaleLineHeight(11, { max: 12.5 }) }}>
                            {card.payload.issue?.signLabel || `Bekasi, ${formatDateOnly(card.payload.issue?.date || card.generatedAt)}`}
                          </Text>
                          <Text style={{ color: '#334155', fontSize: scaleFont(8.5, { max: 10 }), textAlign: 'center', marginTop: 2, lineHeight: scaleLineHeight(11, { max: 12.5 }) }}>
                            {card.payload.legality.principalTitle || 'Kepala Sekolah'}
                          </Text>
                          {card.payload.legality.principalBarcodeDataUrl ? (
                            <Image
                              source={{ uri: card.payload.legality.principalBarcodeDataUrl }}
                              style={{
                                width: 80,
                                height: 80,
                                marginTop: 6,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#dbe7fb',
                                backgroundColor: '#fff',
                              }}
                              resizeMode="contain"
                            />
                          ) : null}
                          <Text
                            style={{
                              color: '#0f172a',
                              fontWeight: '700',
                              marginTop: 5,
                              fontSize: scaleFont(8, { max: 9.5 }),
                              lineHeight: scaleLineHeight(10, { max: 11.5 }),
                              textAlign: 'center',
                              width: '100%',
                            }}
                          >
                            {card.payload.legality.principalName}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#dbe7fb',
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                      }}
                    >
                      <Text style={{ color: '#047857', fontSize: scaleFont(9, { max: 10.5 }), fontStyle: 'italic', lineHeight: scaleLineHeight(11, { max: 12.5 }) }}>
                        {card.payload.legality.footerNote || 'Berkas digital yang sah secara internal'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : isCardsExpanded ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>
                Belum ada kartu ujian digital yang dipublikasikan untuk akun Anda.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {shouldShowExamCardSections ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Pressable
            onPress={() => setIsPlacementsExpanded((current) => !current)}
            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: scaleFont(18), fontWeight: '700' }}>Denah Ruang Ujian</Text>
              <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                Ruang, sesi, dan kursi yang ditetapkan Kurikulum akan muncul di sini meski kartu ujian digital belum dipublikasikan.
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(12) }}>
                {groupedPlacements.length} ruang
              </Text>
            </View>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#dbe7fb',
                backgroundColor: '#fff',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: '#64748b', fontWeight: '700' }}>{isPlacementsExpanded ? '▲' : '▼'}</Text>
            </View>
          </Pressable>

          {isPlacementsExpanded && studentExamPlacementsQuery.isLoading ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>Memuat penempatan ujian...</Text>
            </View>
          ) : isPlacementsExpanded && studentExamPlacementsQuery.isError ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff1f2',
              }}
            >
              <Text style={{ color: '#be123c', fontWeight: '700' }}>Gagal memuat penempatan ujian.</Text>
              <Pressable
                onPress={() => studentExamPlacementsQuery.refetch()}
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#fecdd3',
                  backgroundColor: '#fff',
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>Coba Lagi</Text>
              </Pressable>
            </View>
          ) : isPlacementsExpanded && groupedPlacements.length > 0 ? (
            <View style={{ marginTop: 12, gap: 10 }}>
                  {groupedPlacements.map((group) => {
                    const chip = placementGroupStatusStyle(group.entries);
                    return (
                      <View
                        key={group.key}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      backgroundColor: '#fff',
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleFont(15) }}>{group.roomName}</Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          {examTypeLabel(group.examType)} • {group.entries.length} jadwal
                        </Text>
                      </View>
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: chip.border,
                          backgroundColor: chip.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: chip.text, fontSize: scaleFont(11), fontWeight: '700' }}>{chip.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: scaleFont(12), marginTop: 6 }}>
                      Kursi: {group.seatLabel || 'Menunggu denah dipublikasikan'}
                    </Text>
                    <Text style={{ color: '#334155', fontSize: scaleFont(12), marginTop: 4 }}>
                      Slot pertama: {formatDateTime(group.primaryPlacement.startTime || '')} - {formatDateTime(group.primaryPlacement.endTime || '')}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                      {group.entries.length} slot ujian memakai ruang ini.
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                      <Pressable
                        onPress={() => {
                          setSelectedPlacement(group.primaryPlacement);
                        }}
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(11) }}>Lihat Denah</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setSelectedPlacementGroup(group);
                          setShowProctorListModal(true);
                        }}
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: '#a7f3d0',
                          backgroundColor: '#ecfdf5',
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: '#047857', fontWeight: '700', fontSize: scaleFont(11) }}>Daftar Pengawas</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : isPlacementsExpanded ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>
                Belum ada penempatan ruang ujian yang dipublikasikan untuk akun Anda.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <Text
        style={{
          color: '#334155',
          fontSize: scaleFont(12),
          fontWeight: '600',
          marginBottom: 4,
        }}
      >
        Cari Tes
      </Text>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={isApplicantMode ? 'Cari judul tes / lowongan...' : 'Cari judul ujian / mapel...'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      />

      <Text
        style={{
          color: '#334155',
          fontSize: scaleFont(12),
          fontWeight: '600',
          marginBottom: 4,
        }}
      >
        Filter Jadwal
      </Text>
      <MobileSelectField
        label="Status"
        value={statusFilter}
        options={statusFilterOptions}
        onChange={(next) => setStatusFilter((next as StatusFilter) || 'ALL')}
        placeholder="Pilih status"
        helperText={lockedProgramCode ? `Program tetap: ${examTypeLabel(lockedProgramCode)}` : undefined}
      />

      {examsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil daftar ujian..." /> : null}
      {examsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat daftar ujian." onRetry={() => examsQuery.refetch()} />
      ) : null}
      {examsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={examsQuery.data.cachedAt} /> : null}

      {!examsQuery.isLoading && !examsQuery.isError ? (
        applicantVerificationLocked ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#fde68a',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK belum tersedia</Text>
            <Text style={{ color: '#64748b' }}>
              Tes BKK akan tampil di sini setelah akun pelamar diverifikasi dan lowongan Anda memiliki jadwal tes aktif.
            </Text>
          </View>
        ) : filtered.length > 0 ? (
          <View style={{ gap: 10 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 14,
                padding: 14,
              }}
            >
              <Text style={{ color: '#0f172a', fontSize: scaleFont(18), fontWeight: '700' }}>{examScheduleTitle}</Text>
              <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                Menampilkan {filtered.length} dari {(examsQuery.data?.exams || []).filter((item) => {
                  const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
                  return effectiveTypeFilter === 'ALL' || type === effectiveTypeFilter;
                }).length} {isApplicantMode ? 'tes' : 'ujian'}
              </Text>
            </View>
            {groupedFilteredExams.map((group) => {
              const isOpen = expandedExamDayKey === group.key;
              return (
                <View
                  key={group.key}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    onPress={() => setExpandedExamDayKey((current) => (current === group.key ? null : group.key))}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#0f172a', fontSize: scaleFont(17), fontWeight: '700' }}>{group.label}</Text>
                      <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 4 }}>
                        {group.exams.length} {isApplicantMode ? 'tes' : 'mata pelajaran'} terjadwal
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View
                        style={{
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                        }}
                      >
                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(12) }}>
                          {group.exams.length} slot
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ color: '#2563eb', fontSize: scaleFont(12), fontWeight: '700' }}>
                          {isOpen ? 'Tutup Hari' : 'Buka Hari'}
                        </Text>
                        <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#2563eb" />
                      </View>
                    </View>
                  </Pressable>

                  {isOpen ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#e2e8f0', padding: 10, gap: 8 }}>
                      {group.exams.map((item: StudentExamItem) => {
                        const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
                        const status = resolveStudentExamRuntimeStatus(item);
                        const style = statusStyle(status);
                        const isReady = item.isReady !== false;
                        const statusChip = isReady
                          ? style
                          : { bg: '#fffbeb', border: '#fcd34d', text: '#d97706', label: 'Soal Belum Siap' };
                        const resolvedSubject = resolveSubjectLabel(item);
                        const subjectName = resolvedSubject.name;
                        const subjectCode = resolvedSubject.code;
                        const vacancyTitle = String(item.jobVacancy?.title || '').trim();
                        const vacancyCompany = String(
                          item.jobVacancy?.industryPartner?.name || item.jobVacancy?.companyName || '',
                        ).trim();
                        return (
                          <View
                            key={item.id}
                            style={{
                              backgroundColor: '#fff',
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                              borderRadius: 10,
                              padding: 12,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                              <Text
                                style={{
                                  color: '#0f172a',
                                  fontWeight: '700',
                                  fontSize: scaleFont(15),
                                  flex: 1,
                                  paddingRight: 8,
                                }}
                              >
                                {item.packet.title}
                              </Text>
                              <Text
                                style={{
                                  color: statusChip.text,
                                  backgroundColor: statusChip.bg,
                                  borderColor: statusChip.border,
                                  borderWidth: 1,
                                  borderRadius: 999,
                                  paddingHorizontal: 8,
                                  paddingVertical: 2,
                                  fontSize: scaleFont(11),
                                  fontWeight: '700',
                                }}
                              >
                                {isReady && status === 'UPCOMING' && item.makeupMode === 'FORMAL' && item.makeupScheduled
                                  ? 'Jadwal Susulan'
                                  : statusChip.label}
                              </Text>
                            </View>
                            <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
                              {isApplicantMode
                                ? `${vacancyTitle || subjectName}${vacancyCompany ? ` • ${vacancyCompany}` : ''} • ${examTypeLabel(type)}`
                                : `${subjectName}${subjectCode ? ` (${subjectCode})` : ''} • ${examTypeLabel(type)}`}
                            </Text>
                            <Text style={{ color: '#334155', fontSize: scaleFont(12), marginBottom: 4 }}>
                              Mulai: {formatDateTime(item.startTime)}
                            </Text>
                            <Text style={{ color: '#334155', fontSize: scaleFont(12), marginBottom: 6 }}>
                              Selesai: {formatDateTime(item.endTime)} • Durasi: {item.packet.duration} menit
                            </Text>
                            {!isReady ? (
                              <View
                                style={{
                                  marginBottom: 8,
                                  borderWidth: 1,
                                  borderColor: '#fde68a',
                                  backgroundColor: '#fffbeb',
                                  borderRadius: 8,
                                  padding: 8,
                                }}
                              >
                                <Text style={{ color: '#92400e', fontSize: scaleFont(12), fontWeight: '700' }}>Soal Belum Siap</Text>
                                <Text style={{ color: '#92400e', fontSize: scaleFont(11), lineHeight: scaleLineHeight(17), marginTop: 4 }}>
                                  {item.notReadyReason || 'Soal untuk jadwal ini belum disiapkan guru.'}
                                </Text>
                              </View>
                            ) : null}
                            {item.makeupMode === 'FORMAL' && item.makeupStartTime ? (
                              <Text style={{ color: '#c2410c', fontSize: scaleFont(12), marginBottom: 4 }}>
                                Jadwal susulan: {formatDateTime(item.makeupStartTime)}
                              </Text>
                            ) : null}
                            {item.makeupDeadline ? (
                              <Text style={{ color: '#c2410c', fontSize: scaleFont(12), marginBottom: 4 }}>
                                {status === 'MAKEUP' ? 'Susulan sampai' : 'Batas susulan'}: {formatDateTime(item.makeupDeadline)}
                              </Text>
                            ) : null}
                            {item.makeupReason ? (
                              <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 6 }}>
                                Alasan susulan: {item.makeupReason}
                              </Text>
                            ) : null}
                            {item.isBlocked ? (
                              <View
                                style={{
                                  backgroundColor: '#fee2e2',
                                  borderWidth: 1,
                                  borderColor: '#fca5a5',
                                  borderRadius: 8,
                                  padding: 8,
                                  marginBottom: 8,
                                }}
                              >
                                <Text style={{ color: '#991b1b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '600' }}>
                                  {item.manualBlocked ? 'Diblokir wali kelas' : 'Diblokir'}:{' '}
                                  {item.manualBlocked
                                    ? item.blockReason || 'Akses ujian dibatasi secara manual.'
                                    : item.blockReason || 'Akses dibatasi wali kelas'}
                                </Text>
                                {item.financeClearance?.hasOutstanding ? (
                                  <View
                                    style={{
                                      marginTop: 8,
                                      borderWidth: 1,
                                      borderColor: '#fde68a',
                                      backgroundColor: '#fffbeb',
                                      borderRadius: 8,
                                      padding: 8,
                                    }}
                                  >
                                    <Text style={{ color: '#92400e', fontSize: scaleFont(11), fontWeight: '700' }}>Clearance finance</Text>
                                    <Text style={{ color: '#92400e', fontSize: scaleFont(11), marginTop: 2 }}>
                                      Outstanding: {formatExamCurrency(item.financeClearance.outstandingAmount)}
                                    </Text>
                                    <Text style={{ color: '#92400e', fontSize: scaleFont(11), marginTop: 2 }}>
                                      Tagihan aktif: {item.financeClearance.outstandingInvoices} • overdue: {item.financeClearance.overdueInvoices}
                                    </Text>
                                    {!item.financeClearance.blocksExam ? (
                                      <Text style={{ color: '#92400e', fontSize: scaleFont(11), lineHeight: scaleLineHeight(17), marginTop: 4 }}>
                                        Status finance ini tidak menjadi penyebab blokir pada program ujian ini.
                                      </Text>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            ) : null}
                            {!item.isBlocked && item.financeClearance?.warningOnly && item.financeClearance.hasOutstanding ? (
                              <View
                                style={{
                                  marginBottom: 8,
                                  borderWidth: 1,
                                  borderColor: '#fde68a',
                                  backgroundColor: '#fffbeb',
                                  borderRadius: 8,
                                  padding: 8,
                                }}
                              >
                                <Text style={{ color: '#92400e', fontSize: scaleFont(11), fontWeight: '700' }}>Info finance</Text>
                                <Text style={{ color: '#92400e', fontSize: scaleFont(11), marginTop: 2 }}>
                                  Outstanding: {formatExamCurrency(item.financeClearance.outstandingAmount)}
                                </Text>
                                <Text style={{ color: '#92400e', fontSize: scaleFont(11), marginTop: 2 }}>
                                  Tagihan aktif: {item.financeClearance.outstandingInvoices} • overdue: {item.financeClearance.overdueInvoices}
                                </Text>
                                <Text style={{ color: '#92400e', fontSize: scaleFont(11), lineHeight: scaleLineHeight(17), marginTop: 4 }}>
                                  Program ini hanya memberi peringatan dan tidak memblokir ujian.
                                </Text>
                              </View>
                            ) : null}
                            {!item.isBlocked && item.academicClearance?.warningOnly ? (
                              <View
                                style={{
                                  marginBottom: 8,
                                  borderWidth: 1,
                                  borderColor: item.academicClearance.hasBelowKkm ? '#fecaca' : '#fde68a',
                                  backgroundColor: item.academicClearance.hasBelowKkm ? '#fef2f2' : '#fffbeb',
                                  borderRadius: 8,
                                  padding: 8,
                                }}
                              >
                                <Text
                                  style={{
                                    color: item.academicClearance.hasBelowKkm ? '#b91c1c' : '#92400e',
                                    fontSize: scaleFont(11),
                                    fontWeight: '700',
                                  }}
                                >
                                  Warning akademik
                                </Text>
                                <Text
                                  style={{
                                    color: item.academicClearance.hasBelowKkm ? '#b91c1c' : '#92400e',
                                    fontSize: scaleFont(11),
                                    lineHeight: scaleLineHeight(17),
                                    marginTop: 4,
                                  }}
                                >
                                  {item.academicClearance.reason ||
                                    'Program ini tetap mengizinkan Anda ikut SBTS, tetapi status akademik tetap ditandai.'}
                                </Text>
                                <Text
                                  style={{
                                    color: item.academicClearance.hasBelowKkm ? '#b91c1c' : '#92400e',
                                    fontSize: scaleFont(11),
                                    lineHeight: scaleLineHeight(17),
                                    marginTop: 4,
                                  }}
                                >
                                  {item.academicClearance.hasBelowKkm ? 'Nilai di bawah KKM tetap ditandai merah.' : ''}
                                  {item.academicClearance.hasBelowKkm && item.academicClearance.hasMissingScores ? ' ' : ''}
                                  {item.academicClearance.hasMissingScores ? 'Masih ada nilai mapel yang belum lengkap.' : ''}
                                </Text>
                              </View>
                            ) : null}
                            <Pressable
                              onPress={async () => {
                                if ((status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked && isReady) {
                                  setSelectedExam(item);
                                  return;
                                }
                                const upcomingMessage =
                                  item.makeupMode === 'FORMAL' && item.makeupScheduled
                                    ? 'Jadwal susulan belum dimulai. Silakan tunggu waktu susulan yang ditetapkan.'
                                    : isApplicantMode
                                      ? 'Tes BKK belum dimulai. Silakan tunggu jadwal mulai.'
                                      : 'Ujian belum dimulai. Silakan tunggu jadwal mulai.';
                                Alert.alert(
                                  isApplicantMode ? 'Tes BKK' : 'Ujian Mobile',
                                  status === 'COMPLETED'
                                    ? isApplicantMode
                                      ? 'Tes BKK ini sudah selesai dikerjakan.'
                                      : 'Ujian ini sudah selesai dikerjakan.'
                                    : status === 'MISSED'
                                      ? isApplicantMode
                                        ? 'Waktu tes BKK sudah berakhir.'
                                        : 'Waktu ujian sudah berakhir.'
                                      : status === 'UPCOMING'
                                        ? upcomingMessage
                                      : status === 'MAKEUP'
                                        ? isApplicantMode
                                          ? 'Tes BKK susulan tidak tersedia saat ini.'
                                          : 'Ujian susulan tidak tersedia saat ini.'
                                        : isApplicantMode
                                          ? 'Tes BKK tidak dapat dikerjakan dari mobile untuk status ini.'
                                          : !isReady
                                            ? item.notReadyReason || 'Soal untuk jadwal ini belum disiapkan guru.'
                                            : 'Ujian tidak dapat dikerjakan dari mobile untuk status ini.',
                                );
                              }}
                              style={{
                                backgroundColor: (status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked && isReady ? '#1d4ed8' : '#cbd5e1',
                                borderRadius: 8,
                                paddingVertical: 9,
                                alignItems: 'center',
                              }}
                            >
                              <Text style={{ color: '#fff', fontWeight: '700' }}>
                                {(status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked && isReady
                                  ? isApplicantMode
                                    ? status === 'MAKEUP'
                                      ? 'Mulai Tes Susulan'
                                      : 'Mulai Tes BKK'
                                    : status === 'MAKEUP'
                                      ? 'Mulai Susulan'
                                      : 'Mulai Ujian'
                                  : !isReady
                                    ? 'Menunggu Soal'
                                    : isApplicantMode
                                      ? 'Detail Tes BKK'
                                      : 'Detail Ujian'}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
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
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
              {isApplicantMode ? 'Tidak ada tes BKK' : 'Tidak ada ujian'}
            </Text>
            <Text style={{ color: '#64748b' }}>
              {isApplicantMode
                ? 'Belum ada tes BKK sesuai filter yang dipilih.'
                : 'Belum ada ujian sesuai filter yang dipilih.'}
            </Text>
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
      <MobileDetailModal
        visible={showRulesModal}
        title={isApplicantMode ? 'Aturan Tes BKK' : 'Aturan Ujian'}
        subtitle="Pastikan Anda memahami ketentuan berikut sebelum mulai."
        iconName="alert-circle"
        accentColor="#ca8a04"
        onClose={() => setShowRulesModal(false)}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            borderRadius: 14,
            padding: 12,
          }}
        >
          {[
            `${isApplicantMode ? 'Tes BKK' : 'Ujian'} akan berjalan dalam mode fullscreen.`,
            'Jangan keluar dari fullscreen atau membuka tab/aplikasi lain.',
            'Anda memiliki 3x kesempatan pelanggaran.',
            `Pelanggaran ke-4 akan otomatis submit ${isApplicantMode ? 'tes' : 'ujian'} Anda.`,
            'Pastikan koneksi internet stabil sepanjang sesi berjalan.',
          ].map((rule) => (
            <Text key={rule} style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(20), marginBottom: 4 }}>
              • {rule}
            </Text>
          ))}
        </View>
      </MobileDetailModal>
      <MobileDetailModal
        visible={Boolean(selectedExam)}
        title={isApplicantMode ? 'Mulai Tes BKK?' : 'Mulai Ujian?'}
        subtitle="Pastikan Anda siap sebelum soal dibuka. Setelah mulai, sistem akan memantau pelanggaran selama ujian berlangsung."
        iconName="play-circle"
        accentColor="#2563eb"
        onClose={() => setSelectedExam(null)}
      >
        {selectedExam ? (
          <View>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                backgroundColor: '#f8fbff',
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontSize: scaleFont(17), fontWeight: '800' }}>{selectedExam.packet.title}</Text>
              <Text style={{ color: '#64748b', marginTop: 4, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
                {resolveSubjectLabel(selectedExam).name}
                {resolveSubjectLabel(selectedExam).code ? ` (${resolveSubjectLabel(selectedExam).code})` : ''}
              </Text>
              <Text style={{ color: '#334155', marginTop: 8, fontSize: scaleFont(12) }}>
                Mulai: {formatDateTime(selectedExam.startTime)}
              </Text>
              <Text style={{ color: '#334155', marginTop: 4, fontSize: scaleFont(12) }}>
                Selesai: {formatDateTime(selectedExam.endTime)} • Durasi: {selectedExam.packet.duration} menit
              </Text>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: '#fde68a',
                backgroundColor: '#fffbeb',
                borderRadius: 14,
                padding: 12,
              }}
            >
              {[
                'Pastikan koneksi internet stabil sebelum mulai.',
                'Jangan menekan tombol kembali, Home, atau membuka recent apps.',
                'Perpindahan aplikasi akan dihitung sebagai pelanggaran.',
                'Pelanggaran ke-4 akan mengumpulkan ujian otomatis.',
                'Gambar soal dapat diperbesar tanpa keluar dari ujian.',
              ].map((rule) => (
                <Text key={rule} style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(20), marginBottom: 4 }}>
                  • {rule}
                </Text>
              ))}
            </View>

            <Pressable
              onPress={() => {
                const target = `/exams/${selectedExam.id}/take?ready=1`;
                setSelectedExam(null);
                router.push(target as never);
              }}
              style={{
                marginTop: 14,
                backgroundColor: '#16a34a',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {isApplicantMode ? 'Mulai Tes BKK' : 'Mulai Ujian'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </MobileDetailModal>
      <MobileDetailModal
        visible={Boolean(selectedPlacement)}
        title="Denah Ruang Ujian"
        subtitle="Kotak hijau menandakan posisi duduk Anda pada denah ruang ujian."
        iconName="grid"
        accentColor="#16a34a"
        onClose={() => {
          setSelectedPlacement(null);
        }}
      >
        {selectedPlacement ? (
          selectedPlacement.layout?.rows && selectedPlacement.layout?.columns ? (
            <View style={{ alignItems: 'stretch' }}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{
                  paddingHorizontal: 2,
                  flexGrow: 1,
                  justifyContent: 'center',
                }}
                style={{ alignSelf: 'stretch' }}
              >
                <View style={{ gap: 8, alignItems: 'center' }}>
                  {Array.from({ length: selectedPlacement.layout?.rows || 0 }).map((_, rowIndex) => (
                    <View key={`row-${rowIndex}`} style={{ flexDirection: 'row', gap: 8 }}>
                      {Array.from({ length: selectedPlacement.layout?.columns || 0 }).map((__, columnIndex) => {
                        const isSeat =
                          selectedPlacement.seatPosition &&
                          selectedPlacement.seatPosition.rowIndex === rowIndex &&
                          selectedPlacement.seatPosition.columnIndex === columnIndex;
                        const seatSize = (selectedPlacement.layout?.columns || 0) >= 10 ? 24 : 28;
                        return isSeat ? (
                          <Animated.View
                            key={`${rowIndex}-${columnIndex}`}
                            style={{
                              width: seatSize,
                              height: seatSize,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: '#34d399',
                              backgroundColor: '#bbf7d0',
                              opacity: seatBlink,
                            }}
                          />
                        ) : (
                          <View
                            key={`${rowIndex}-${columnIndex}`}
                            style={{
                              width: seatSize,
                              height: seatSize,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                              backgroundColor: '#f8fafc',
                            }}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <View
                style={{
                  alignSelf: 'stretch',
                  marginTop: 14,
                  borderWidth: 1,
                  borderColor: '#bbf7d0',
                  borderRadius: 14,
                  backgroundColor: '#f0fdf4',
                  padding: 12,
                  gap: 6,
                }}
              >
                <Text style={{ color: '#166534', fontWeight: '700' }}>Detail Kursi Peserta</Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>
                  Nama: {selectedPlacementCard?.payload.student.name || fallbackIdentityCard?.payload.student.name || '-'}
                </Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>
                  Kelas: {selectedPlacementCard?.payload.student.className || fallbackIdentityCard?.payload.student.className || '-'}
                </Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>
                  Username: {selectedPlacementCard?.payload.student.username || fallbackIdentityCard?.payload.student.username || '-'}
                </Text>
                <Text style={{ color: '#1d4ed8', fontSize: scaleFont(13), fontWeight: '700' }}>
                  No. Peserta: {selectedPlacementCard?.payload.participantNumber || '-'}
                </Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>Ruang: {selectedPlacement.roomName}</Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>Kursi: {selectedPlacement.seatLabel || '-'}</Text>
                <Text style={{ color: '#166534', fontSize: scaleFont(13) }}>Sesi: {selectedPlacement.sessionLabel || '-'}</Text>
              </View>
            </View>
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>Denah belum dipublikasikan oleh Kurikulum.</Text>
            </View>
          )
        ) : null}
      </MobileDetailModal>
      <MobileDetailModal
        visible={showProctorListModal && Boolean(selectedPlacementGroup)}
        title="Daftar Pengawas"
        subtitle={
          selectedPlacementGroup
            ? `${selectedPlacementGroup.roomName} • ${examTypeLabel(selectedPlacementGroup.examType)}`
            : 'Rincian pengawas per slot ujian'
        }
        iconName="users"
        accentColor="#047857"
        onClose={() => {
          setShowProctorListModal(false);
          setSelectedPlacementGroup(null);
        }}
      >
        {selectedPlacementGroup ? (
          <View style={{ gap: 12 }}>
            {groupedProctorEntries.map((group) => {
              const isOpen = expandedProctorDayKey === group.key;
              return (
                <View
                  key={group.key}
                  style={{
                    borderWidth: 1,
                    borderColor: '#bbf7d0',
                    backgroundColor: '#f0fdf4',
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  <Pressable
                    onPress={() => setExpandedProctorDayKey((current) => (current === group.key ? null : group.key))}
                    style={{
                      padding: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#166534', fontWeight: '700' }}>{group.label}</Text>
                      <Text style={{ color: '#15803d', fontSize: scaleFont(12), marginTop: 4 }}>{group.entries.length} slot pengawas</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ color: '#047857', fontSize: scaleFont(12), fontWeight: '700' }}>
                        {isOpen ? 'Tutup Hari' : 'Buka Hari'}
                      </Text>
                      <Feather name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#047857" />
                    </View>
                  </Pressable>

                  {isOpen ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#bbf7d0', padding: 12, gap: 8 }}>
                      {group.entries.map((entry: StudentExamPlacement) => (
                        <View
                          key={entry.id}
                          style={{
                            borderWidth: 1,
                            borderColor: '#dcfce7',
                            backgroundColor: '#fff',
                            borderRadius: 12,
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleFont(13) }}>
                            {formatDateTime(entry.startTime || '')} - {formatDateTime(entry.endTime || '')}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 4 }}>
                            {entry.sessionLabel || 'Sesi belum diatur'}
                          </Text>
                          <Text style={{ color: '#166534', fontSize: scaleFont(12), marginTop: 6 }}>
                            Pengawas: <Text style={{ fontWeight: '700' }}>{entry.proctor?.name || 'Belum ditentukan'}</Text>
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
