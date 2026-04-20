import { Feather } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  BackHandler,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar as NativeStatusBar,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import ExamImagePreviewModal from '../../../../src/components/ExamImagePreviewModal';
import ExamHtmlContent from '../../../../src/components/ExamHtmlContent';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { examApi } from '../../../../src/features/exams/examApi';
import { ExamQuestion, ExamQuestionOption, ExamQuestionType } from '../../../../src/features/exams/types';
import { useStudentExamStartQuery } from '../../../../src/features/exams/useStudentExamStartQuery';
import {
  useStudentExamWarningRealtime,
  type MobileStudentExamWarningRealtimePayload,
} from '../../../../src/features/exams/useStudentExamWarningRealtime';
import { ENV } from '../../../../src/config/env';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

function parseScheduleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseReadyFlag(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function toMediaUrl(url?: string | null) {
  const normalized = String(url || '').trim();
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  const base = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
}

type MonitoringStats = {
  totalViolations: number;
  tabSwitchCount: number;
  fullscreenExitCount: number;
  appSwitchCount: number;
  lastViolationType: string | null;
  lastViolationAt: string | null;
  currentQuestionIndex: number;
  currentQuestionNumber: number;
  currentQuestionId: string | null;
  lastSyncAt: string | null;
};

type ProctorWarningSignal = {
  id: number;
  title: string;
  message: string;
  warnedAt: string;
  proctorId?: number | null;
  proctorName?: string | null;
  category?: string | null;
  room?: string | null;
};

function extractPersistedMonitoring(rawAnswers: Record<string, unknown>): MonitoringStats | null {
  const source = rawAnswers.__monitoring;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const stats = source as Record<string, unknown>;
  const totalViolations = Number(stats.totalViolations || 0);
  const tabSwitchCount = Number(stats.tabSwitchCount || 0);
  const fullscreenExitCount = Number(stats.fullscreenExitCount || 0);
  const appSwitchCount = Number(stats.appSwitchCount || 0);
  const currentQuestionIndex = Number(stats.currentQuestionIndex || 0);
  const currentQuestionNumber = Number(stats.currentQuestionNumber || 1);
  return {
    totalViolations: Number.isFinite(totalViolations) ? Math.max(0, totalViolations) : 0,
    tabSwitchCount: Number.isFinite(tabSwitchCount) ? Math.max(0, tabSwitchCount) : 0,
    fullscreenExitCount: Number.isFinite(fullscreenExitCount) ? Math.max(0, fullscreenExitCount) : 0,
    appSwitchCount: Number.isFinite(appSwitchCount) ? Math.max(0, appSwitchCount) : 0,
    lastViolationType: stats.lastViolationType ? String(stats.lastViolationType) : null,
    lastViolationAt: stats.lastViolationAt ? String(stats.lastViolationAt) : null,
    currentQuestionIndex: Number.isFinite(currentQuestionIndex) ? Math.max(0, currentQuestionIndex) : 0,
    currentQuestionNumber: Number.isFinite(currentQuestionNumber) ? Math.max(1, currentQuestionNumber) : 1,
    currentQuestionId: stats.currentQuestionId ? String(stats.currentQuestionId) : null,
    lastSyncAt: stats.lastSyncAt ? String(stats.lastSyncAt) : null,
  };
}

function normalizeProctorWarning(raw: unknown): ProctorWarningSignal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const id = Number(source.id || 0);
  const message = String(source.message || '').trim();
  if (!Number.isFinite(id) || id <= 0 || !message) return null;
  return {
    id,
    title: String(source.title || 'Peringatan Pengawas Ujian').trim() || 'Peringatan Pengawas Ujian',
    message,
    warnedAt: String(source.warnedAt || new Date().toISOString()),
    proctorId: Number.isFinite(Number(source.proctorId)) ? Number(source.proctorId) : null,
    proctorName: String(source.proctorName || '').trim() || null,
    category: String(source.category || '').trim() || null,
    room: String(source.room || '').trim() || null,
  };
}

function formatWarningDateTime(value?: string | null): string {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()] || '';
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${hour}:${minute}`;
}

function normalizeQuestionType(question: ExamQuestion): ExamQuestionType {
  const raw = String(question.question_type || question.type || '').toUpperCase();
  if (raw === 'ESSAY') return 'ESSAY';
  if (raw === 'TRUE_FALSE') return 'TRUE_FALSE';
  if (raw === 'COMPLEX_MULTIPLE_CHOICE') return 'COMPLEX_MULTIPLE_CHOICE';
  if (raw === 'MATRIX_SINGLE_CHOICE') return 'MATRIX_SINGLE_CHOICE';
  if (raw === 'MATCHING') return 'MATCHING';
  return 'MULTIPLE_CHOICE';
}

function normalizeMatrixColumns(question?: ExamQuestion | null) {
  if (!Array.isArray(question?.matrixColumns)) return [];
  return question.matrixColumns
    .map((column, index) => ({
      id: String(column?.id || `matrix-col-${index + 1}`),
      content: String(column?.content || '').trim(),
    }))
    .filter((column) => column.content.length > 0);
}

function normalizeMatrixPromptColumns(question?: ExamQuestion | null) {
  if (!Array.isArray(question?.matrixPromptColumns) || question.matrixPromptColumns.length === 0) {
    return [{ id: 'prompt-default', label: 'Pernyataan' }];
  }
  return question.matrixPromptColumns.map((column, index) => ({
    id: String(column?.id || `matrix-prompt-col-${index + 1}`),
    label: String(column?.label || '').trim() || `Kolom ${index + 1}`,
  }));
}

function normalizeMatrixRows(question?: ExamQuestion | null) {
  if (!Array.isArray(question?.matrixRows)) return [];
  return question.matrixRows
    .map((row, index) => ({
      id: String(row?.id || `matrix-row-${index + 1}`),
      content: String(row?.content || '').trim(),
      cells: Array.isArray(row?.cells)
        ? row.cells.map((cell) => ({
            columnId: String(cell?.columnId || '').trim(),
            content: String(cell?.content || '').trim(),
          }))
        : [],
    }))
    .filter((row) => row.content.length > 0 || (row.cells || []).some((cell) => cell.content.length > 0));
}

function getMatrixRowCellContent(
  row: ReturnType<typeof normalizeMatrixRows>[number],
  promptColumnId: string,
  promptColumnIndex: number,
) {
  if (Array.isArray(row.cells) && row.cells.length > 0) {
    const cell = row.cells.find((item) => item.columnId === promptColumnId);
    return String(cell?.content || '').trim();
  }
  return promptColumnIndex === 0 ? String(row.content || '').trim() : '';
}

function isMatrixQuestionAnswered(question: ExamQuestion | null | undefined, value: unknown) {
  const rows = normalizeMatrixRows(question);
  if (rows.length === 0 || !value || typeof value !== 'object' || Array.isArray(value)) return false;
  return rows.every((row) => String((value as Record<string, unknown>)[row.id] || '').trim().length > 0);
}

function parseQuestions(raw: unknown): ExamQuestion[] {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const q = item as Record<string, unknown>;
      const qId = String(q.id || `q-${idx + 1}`);
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const options: ExamQuestionOption[] = rawOptions
        .filter((option) => option && typeof option === 'object')
        .map((option, optIdx) => {
          const opt = option as Record<string, unknown>;
          return {
            id: String(opt.id || `${qId}-opt-${optIdx + 1}`),
            content: typeof opt.content === 'string' ? opt.content : null,
            option_text: typeof opt.option_text === 'string' ? opt.option_text : null,
            isCorrect: Boolean(opt.isCorrect),
            image_url: typeof opt.image_url === 'string' ? opt.image_url : null,
            option_image_url:
              typeof opt.option_image_url === 'string' ? opt.option_image_url : null,
          };
        });

      return {
        id: qId,
        content: typeof q.content === 'string' ? q.content : null,
        question_text: typeof q.question_text === 'string' ? q.question_text : null,
        question_image_url:
          typeof q.question_image_url === 'string' ? q.question_image_url : null,
        image_url: typeof q.image_url === 'string' ? q.image_url : null,
        question_video_url:
          typeof q.question_video_url === 'string' ? q.question_video_url : null,
        video_url: typeof q.video_url === 'string' ? q.video_url : null,
        question_video_type:
          q.question_video_type === 'youtube' || q.question_video_type === 'upload'
            ? q.question_video_type
            : undefined,
        type: typeof q.type === 'string' ? (q.type as ExamQuestionType) : undefined,
        question_type:
          typeof q.question_type === 'string' ? (q.question_type as ExamQuestionType) : undefined,
        score: typeof q.score === 'number' ? q.score : 1,
        matrixPromptColumns: Array.isArray(q.matrixPromptColumns)
          ? (q.matrixPromptColumns as ExamQuestion['matrixPromptColumns'])
          : Array.isArray((q.metadata as Record<string, unknown> | undefined)?.matrixPromptColumns)
            ? (((q.metadata as Record<string, unknown> | undefined)?.matrixPromptColumns) as ExamQuestion['matrixPromptColumns'])
            : [],
        matrixColumns: Array.isArray(q.matrixColumns) ? (q.matrixColumns as ExamQuestion['matrixColumns']) : [],
        matrixRows: Array.isArray(q.matrixRows) ? (q.matrixRows as ExamQuestion['matrixRows']) : [],
        options,
      };
    });
}

function parseAnswers(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
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

function getYoutubeEmbedUrl(url?: string | null) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace(/\//g, '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : '';
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const embedIndex = parts.findIndex((part) => part === 'embed' || part === 'shorts');
      if (embedIndex >= 0 && parts[embedIndex + 1]) {
        return `https://www.youtube.com/embed/${parts[embedIndex + 1]}`;
      }
    }
  } catch {
    return '';
  }

  return '';
}

const MIN_PROGRESS_SYNC_GAP_MS = 5000;
const DEFAULT_PROGRESS_SYNC_DELAY_MS = 1400;
const FAST_PROGRESS_SYNC_DELAY_MS = 850;
const APP_FOCUS_VIOLATION_THROTTLE_MS = 5000;
const HEARTBEAT_PROGRESS_SYNC_MIN_MS = 17000;
const HEARTBEAT_PROGRESS_SYNC_MAX_MS = 25000;
const EXAM_KEEP_AWAKE_TAG = 'student-exam-take-screen';

function getHeartbeatProgressSyncDelayMs() {
  const spread = HEARTBEAT_PROGRESS_SYNC_MAX_MS - HEARTBEAT_PROGRESS_SYNC_MIN_MS;
  if (spread <= 0) return HEARTBEAT_PROGRESS_SYNC_MIN_MS;
  return HEARTBEAT_PROGRESS_SYNC_MIN_MS + Math.round(Math.random() * spread);
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

function resolveTakeExamSubject(packet: {
  title?: string | null;
  subject?: {
    name?: string | null;
    code?: string | null;
  } | null;
}) {
  const packetSubject = packet?.subject || null;
  let fallbackName = '';
  const title = String(packet?.title || '').trim();
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

  const pickedIsGeneric = isGenericSubject(packetSubject?.name, packetSubject?.code);
  const useFallbackName = Boolean(fallbackName) && pickedIsGeneric;
  return {
    name: String(
      (useFallbackName ? fallbackName : packetSubject?.name) || fallbackName || 'Mata pelajaran',
    ),
    code: useFallbackName ? '' : String(packetSubject?.code || '').trim(),
  };
}

function resolveRestoredQuestionIndex(params: {
  questions: Array<{ id?: string | null }>;
  rawSessionAnswers: unknown;
  fallbackIndex: number;
}) {
  const totalQuestions = params.questions.length;
  if (totalQuestions <= 0) return 0;

  const persistedAnswers = parseAnswers(params.rawSessionAnswers);
  const persistedMonitoring = extractPersistedMonitoring(persistedAnswers);
  const preferredQuestionId = String(persistedMonitoring?.currentQuestionId || '').trim();
  if (preferredQuestionId) {
    const matchedIndex = params.questions.findIndex(
      (question) => String(question?.id || '').trim() === preferredQuestionId,
    );
    if (matchedIndex >= 0) return matchedIndex;
  }

  const persistedIndex = Number(persistedMonitoring?.currentQuestionIndex);
  if (Number.isFinite(persistedIndex) && persistedIndex >= 0) {
    return Math.min(Math.max(0, persistedIndex), totalQuestions - 1);
  }

  if (Number.isFinite(params.fallbackIndex) && params.fallbackIndex >= 0) {
    return Math.min(Math.max(0, params.fallbackIndex), totalQuestions - 1);
  }

  return 0;
}

export default function StudentExamTakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const params = useLocalSearchParams<{ id?: string | string[]; ready?: string | string[] }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';
  const isCandidateMode = user?.role === 'CALON_SISWA';
  const isApplicantMode = user?.role === 'UMUM';
  const applicantVerificationLocked =
    isApplicantMode && String(user?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED';
  const examTakeLabel = isCandidateMode ? 'Tes Seleksi' : isApplicantMode ? 'Tes BKK' : 'Ujian';
  const pageContentPadding = getStandardPagePadding(insets);
  const pageContentPaddingCompact = getStandardPagePadding(insets, { horizontal: 20 });
  const scheduleId = useMemo(() => parseScheduleId(params.id), [params.id]);
  const hasReadyFlag = useMemo(() => parseReadyFlag(params.ready), [params.ready]);

  const startQuery = useStudentExamStartQuery({
    enabled: isAuthenticated && !!scheduleId && !applicantVerificationLocked,
    user,
    scheduleId,
  });

  const questions = useMemo(
    () => parseQuestions(startQuery.data?.packet?.questions),
    [startQuery.data?.packet?.questions],
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isRefreshingExam, setIsRefreshingExam] = useState(false);
  const [hasAcknowledgedStart, setHasAcknowledgedStart] = useState(hasReadyFlag);
  const [violations, setViolations] = useState(0);
  const [lastViolationMessage, setLastViolationMessage] = useState<string | null>(null);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [activeProctorWarning, setActiveProctorWarning] = useState<ProctorWarningSignal | null>(null);
  const [showProctorWarningModal, setShowProctorWarningModal] = useState(false);
  const answersRef = useRef<Record<string, unknown>>({});
  const autoSubmitGuardRef = useRef(false);
  const autoSubmitFailedRef = useRef(false);
  const finalSubmitOriginRef = useRef<'manual' | 'auto' | 'violation' | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const violationsRef = useRef(0);
  const backAttemptRef = useRef(0);
  const lastViolationFingerprintRef = useRef<{ key: string; at: number } | null>(null);
  const lastAppFocusViolationAtRef = useRef(0);
  const lastAndroidOverlayViolationAtRef = useRef(0);
  const androidOverlayBlurredRef = useRef(false);
  const latestHandledProctorWarningIdRef = useRef(0);
  const violationSubmitGuardRef = useRef(false);
  const progressSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressHeartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasDirtyProgressRef = useRef(false);
  const lastSyncedFingerprintRef = useRef('');
  const lastProgressSyncAtRef = useRef(0);
  const lastQueuedQuestionIndexRef = useRef<number | null>(null);
  const monitoringStatsRef = useRef<MonitoringStats>({
    totalViolations: 0,
    tabSwitchCount: 0,
    fullscreenExitCount: 0,
    appSwitchCount: 0,
    lastViolationType: null,
    lastViolationAt: null,
    currentQuestionIndex: 0,
    currentQuestionNumber: 1,
    currentQuestionId: null,
    lastSyncAt: null,
  });
  const isExamReady = Boolean(startQuery.data);
  const persistedAnswers = useMemo(
    () => parseAnswers(startQuery.data?.session?.answers),
    [startQuery.data?.session?.answers],
  );
  const effectiveAnswers = useMemo(
    () => ({
      ...persistedAnswers,
      ...answers,
    }),
    [persistedAnswers, answers],
  );
  const persistedMonitoring = useMemo(
    () => extractPersistedMonitoring(persistedAnswers),
    [persistedAnswers],
  );

  const handleIncomingProctorWarning = useCallback(
    (warning: ProctorWarningSignal | MobileStudentExamWarningRealtimePayload) => {
      const normalizedWarning = normalizeProctorWarning(warning);
      if (!normalizedWarning) return;
      if (normalizedWarning.id === latestHandledProctorWarningIdRef.current) return;
      latestHandledProctorWarningIdRef.current = normalizedWarning.id;
      setActiveProctorWarning(normalizedWarning);
      setShowProctorWarningModal(true);
      Alert.alert(
        normalizedWarning.title,
        normalizedWarning.message,
        [
          {
            text: 'Saya Mengerti',
            onPress: () => setShowProctorWarningModal(true),
          },
        ],
        { cancelable: false },
      );
    },
    [],
  );

  useStudentExamWarningRealtime({
    enabled: Boolean(isAuthenticated && scheduleId && user?.id && !isFinished),
    scheduleId,
    studentId: Number.isFinite(Number(user?.id)) ? Number(user?.id) : null,
    onWarning: handleIncomingProctorWarning,
    onAppActiveSync: () => {
      if (isFinished || !hasAcknowledgedStart) return;
      void startQuery.refetch();
    },
  });

  useEffect(() => {
    const initialWarning = normalizeProctorWarning(startQuery.data?.proctorWarning);
    if (!initialWarning) return;
    setActiveProctorWarning(initialWarning);
    if (initialWarning.id !== latestHandledProctorWarningIdRef.current) {
      handleIncomingProctorWarning(initialWarning);
    }
  }, [handleIncomingProctorWarning, startQuery.data?.proctorWarning]);
  const remainingSeconds = useMemo(() => {
    if (!startQuery.data) return 0;
    const durationMinutes =
      typeof startQuery.data.packet.duration === 'number' && startQuery.data.packet.duration > 0
        ? startQuery.data.packet.duration
        : 60;
    const startedAt = new Date(startQuery.data.session.startTime).getTime();
    if (Number.isNaN(startedAt)) return durationMinutes * 60;
    const endAt = startedAt + durationMinutes * 60 * 1000;
    return Math.max(0, Math.floor((endAt - nowMs) / 1000));
  }, [startQuery.data, nowMs]);
  const displayViolations = Math.max(
    violations,
    violationsRef.current,
    monitoringStatsRef.current.totalViolations,
    persistedMonitoring?.totalViolations || 0,
  );
  const timerChipPalette = useMemo(() => {
    if (remainingSeconds <= 180) {
      return { backgroundColor: '#fef2f2', borderColor: '#fecaca', textColor: '#dc2626' };
    }
    if (remainingSeconds <= 600) {
      return { backgroundColor: '#fffbeb', borderColor: '#fcd34d', textColor: '#d97706' };
    }
    return { backgroundColor: '#ecfeff', borderColor: '#a5f3fc', textColor: '#0f766e' };
  }, [remainingSeconds]);
  const timerPulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    timerPulseOpacity.stopAnimation();
    if (remainingSeconds > 0 && remainingSeconds <= 180) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(timerPulseOpacity, {
            toValue: 0.45,
            duration: 650,
            useNativeDriver: true,
          }),
          Animated.timing(timerPulseOpacity, {
            toValue: 1,
            duration: 650,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return () => {
        loop.stop();
        timerPulseOpacity.setValue(1);
      };
    }

    timerPulseOpacity.setValue(1);
    return undefined;
  }, [remainingSeconds, timerPulseOpacity]);

  const buildSubmissionAnswers = useCallback((answerSource: Record<string, unknown>) => {
    const monitoringPayload: MonitoringStats = {
      ...monitoringStatsRef.current,
      currentQuestionIndex: currentIndex,
      currentQuestionNumber: currentIndex + 1,
      currentQuestionId: questions[currentIndex]?.id || null,
      lastSyncAt: new Date().toISOString(),
    };
    monitoringStatsRef.current = monitoringPayload;
    return {
      ...answerSource,
      __monitoring: monitoringPayload,
    };
  }, [currentIndex, questions]);

  const buildSyncFingerprint = useCallback((submissionAnswers: Record<string, unknown>) => {
    const monitoring =
      submissionAnswers.__monitoring && typeof submissionAnswers.__monitoring === 'object'
        ? { ...(submissionAnswers.__monitoring as Record<string, unknown>) }
        : null;
    if (monitoring) {
      delete monitoring.lastSyncAt;
    }
    const normalizedPayload = monitoring
      ? { ...submissionAnswers, __monitoring: monitoring }
      : submissionAnswers;
    return JSON.stringify(normalizedPayload);
  }, []);

  const markProgressDirty = useCallback(() => {
    hasDirtyProgressRef.current = true;
    setAutosaveState((prev) => (prev === 'saving' ? prev : 'idle'));
  }, []);

  const submitMutation = useMutation({
    mutationFn: async (payload: { answers: Record<string, unknown>; isFinalSubmit: boolean }) => {
      if (!scheduleId) throw new Error('Schedule ID tidak valid.');
      return examApi.submitStudentAnswers({
        scheduleId,
        answers: payload.answers,
        isFinalSubmit: payload.isFinalSubmit,
      });
    },
  });

  useEffect(() => {
    if (hasReadyFlag) {
      setHasAcknowledgedStart(true);
    }
  }, [hasReadyFlag]);

  useEffect(() => {
    answersRef.current = effectiveAnswers;
  }, [effectiveAnswers]);

  useEffect(() => {
    if (questions.length === 0) return;
    setCurrentIndex((prev) =>
      resolveRestoredQuestionIndex({
        questions,
        rawSessionAnswers: startQuery.data?.session?.answers,
        fallbackIndex: prev,
      }),
    );
  }, [questions, startQuery.data?.session?.answers]);

  useEffect(() => {
    return () => {
      if (progressSyncTimeoutRef.current) {
        clearTimeout(progressSyncTimeoutRef.current);
      }
      if (progressHeartbeatTimeoutRef.current) {
        clearTimeout(progressHeartbeatTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    violationsRef.current = violations;
  }, [violations]);

  useEffect(() => {
    if (!persistedMonitoring) return;
    monitoringStatsRef.current = {
      ...monitoringStatsRef.current,
      ...persistedMonitoring,
    };
    violationsRef.current = Math.max(violationsRef.current, persistedMonitoring.totalViolations);
    setViolations((prev) => Math.max(prev, persistedMonitoring.totalViolations));
    if (persistedMonitoring.lastViolationType) {
      setLastViolationMessage((prev) => prev || `Pelanggaran ${Math.min(persistedMonitoring.totalViolations, 4)}/3: ${persistedMonitoring.lastViolationType}`);
    }
  }, [persistedMonitoring]);

  useEffect(() => {
    monitoringStatsRef.current = {
      ...monitoringStatsRef.current,
      currentQuestionIndex: currentIndex,
      currentQuestionNumber: currentIndex + 1,
      currentQuestionId: questions[currentIndex]?.id || null,
    };
  }, [currentIndex, questions]);

  useEffect(() => {
    if (!isExamReady || isFinished) return;

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [isExamReady, isFinished]);

  useEffect(() => {
    const shouldHideStatusBar = hasAcknowledgedStart && !isFinished;
    NativeStatusBar.setHidden(shouldHideStatusBar, 'none');

    return () => {
      NativeStatusBar.setHidden(false, 'none');
    };
  }, [hasAcknowledgedStart, isFinished]);

  useEffect(() => {
    const shouldKeepScreenAwake = hasAcknowledgedStart && isExamReady && !isFinished;

    if (!shouldKeepScreenAwake) {
      try {
        deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG);
      } catch {
        // Ignore best-effort cleanup when keep-awake has not been acquired.
      }
      return;
    }

    let released = false;

    void activateKeepAwakeAsync(EXAM_KEEP_AWAKE_TAG).catch(() => {
      // Ignore keep-awake acquisition failures; exam flow must continue normally.
    });

    return () => {
      if (released) return;
      released = true;
      try {
        deactivateKeepAwake(EXAM_KEEP_AWAKE_TAG);
      } catch {
        // Ignore best-effort cleanup when keep-awake has already been released.
      }
    };
  }, [hasAcknowledgedStart, isExamReady, isFinished]);

  const saveProgress = useCallback(async (
    isFinalSubmit: boolean,
    options?: { force?: boolean },
  ): Promise<boolean> => {
    if (isFinished) return false;
    if (submitMutation.isPending && !isFinalSubmit) return false;

    const submissionAnswers = buildSubmissionAnswers(answersRef.current);
    const syncFingerprint = isFinalSubmit ? '' : buildSyncFingerprint(submissionAnswers);
    if (!isFinalSubmit) {
      const nowMs = Date.now();
      if (!options?.force && nowMs - lastProgressSyncAtRef.current < MIN_PROGRESS_SYNC_GAP_MS) {
        hasDirtyProgressRef.current = true;
        return false;
      }
      if (!options?.force && syncFingerprint === lastSyncedFingerprintRef.current) {
        hasDirtyProgressRef.current = false;
        return true;
      }
    }

    try {
      if (!isFinalSubmit) setAutosaveState('saving');
      const savedSession = await submitMutation.mutateAsync({
        answers: submissionAnswers,
        isFinalSubmit,
      });
      const savedStatus = String(savedSession?.status || '').toUpperCase();
      if (!isFinalSubmit) {
        lastProgressSyncAtRef.current = Date.now();
        lastSyncedFingerprintRef.current = syncFingerprint;
        hasDirtyProgressRef.current = false;
      }
      if (!isFinalSubmit && savedStatus === 'TIMEOUT') {
        setAutosaveState('saved');
        setIsFinished(true);
        Alert.alert('Ujian Ditutup', 'Sesi ujian ditutup otomatis karena pelanggaran berulang.', [
          {
            text: 'OK',
            onPress: () => router.replace('/exams'),
          },
        ]);
        return true;
      }
      if (!isFinalSubmit) {
        setAutosaveState('saved');
        setLastSavedAt(new Date().toISOString());
      } else {
        finalSubmitOriginRef.current = null;
      }
      return true;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || 'Gagal menyimpan jawaban.';
      if (!isFinalSubmit) {
        hasDirtyProgressRef.current = true;
        setAutosaveState('error');
      } else {
        if (finalSubmitOriginRef.current === 'auto' || finalSubmitOriginRef.current === 'violation') {
          autoSubmitFailedRef.current = true;
          Alert.alert('Waktu Ujian Berakhir', msg, [
            {
              text: 'OK',
              onPress: () => router.replace('/exams'),
            },
          ]);
        } else {
          autoSubmitGuardRef.current = false;
          Alert.alert('Submit Gagal', msg);
        }
        finalSubmitOriginRef.current = null;
      }
      return false;
    }
  }, [buildSubmissionAnswers, buildSyncFingerprint, isFinished, router, submitMutation]);

  const queueProgressSync = useCallback(
    (delay = DEFAULT_PROGRESS_SYNC_DELAY_MS, options?: { force?: boolean }) => {
      hasDirtyProgressRef.current = true;
      if (progressSyncTimeoutRef.current) {
        clearTimeout(progressSyncTimeoutRef.current);
      }
      progressSyncTimeoutRef.current = setTimeout(() => {
        void saveProgress(false, options);
      }, delay);
    },
    [saveProgress],
  );

  useEffect(() => {
    if (!isExamReady || isFinished || !hasAcknowledgedStart) return;
    if (lastQueuedQuestionIndexRef.current === null) {
      lastQueuedQuestionIndexRef.current = currentIndex;
      return;
    }
    if (lastQueuedQuestionIndexRef.current === currentIndex) {
      return;
    }
    lastQueuedQuestionIndexRef.current = currentIndex;
    markProgressDirty();
    queueProgressSync(FAST_PROGRESS_SYNC_DELAY_MS, { force: true });
  }, [currentIndex, hasAcknowledgedStart, isExamReady, isFinished, markProgressDirty, queueProgressSync]);

  useEffect(() => {
    if (!isExamReady || isFinished || isFinalSubmitting || !hasAcknowledgedStart) return;

    let cancelled = false;
    const scheduleNextSync = () => {
      if (cancelled) return;
      if (progressHeartbeatTimeoutRef.current) {
        clearTimeout(progressHeartbeatTimeoutRef.current);
      }
      progressHeartbeatTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        if (appStateRef.current === 'active' && hasDirtyProgressRef.current) {
          void saveProgress(false);
        }
        scheduleNextSync();
      }, getHeartbeatProgressSyncDelayMs());
    };

    scheduleNextSync();

    return () => {
      cancelled = true;
      if (progressHeartbeatTimeoutRef.current) {
        clearTimeout(progressHeartbeatTimeoutRef.current);
      }
    };
  }, [hasAcknowledgedStart, isExamReady, isFinished, isFinalSubmitting, saveProgress]);

  const toggleOptionValue = useCallback(
    (questionId: string, optionId: string, type: ExamQuestionType) => {
      if (type === 'COMPLEX_MULTIPLE_CHOICE') {
        setAnswers((prev) => {
          const existing = Array.isArray(prev[questionId]) ? [...(prev[questionId] as string[])] : [];
          if (existing.includes(optionId)) {
            return {
              ...prev,
              [questionId]: existing.filter((value) => value !== optionId),
            };
          }
          return {
            ...prev,
            [questionId]: [...existing, optionId],
          };
        });
        markProgressDirty();
        return;
      }
      setAnswers((prev) => ({
        ...prev,
        [questionId]: optionId,
      }));
      markProgressDirty();
    },
    [markProgressDirty],
  );

  const setMatrixAnswerValue = useCallback((questionId: string, rowId: string, columnId: string) => {
    setAnswers((prev) => {
      const currentValue =
        prev[questionId] && typeof prev[questionId] === 'object' && !Array.isArray(prev[questionId])
          ? { ...(prev[questionId] as Record<string, unknown>) }
          : {};
      return {
        ...prev,
        [questionId]: {
          ...currentValue,
          [rowId]: columnId,
        },
      };
    });
    markProgressDirty();
  }, [markProgressDirty]);

  const triggerViolationAutoSubmit = useCallback((reason: string) => {
    if (violationSubmitGuardRef.current || isFinished || autoSubmitGuardRef.current) return;
    violationSubmitGuardRef.current = true;
    autoSubmitGuardRef.current = true;
    finalSubmitOriginRef.current = 'violation';
    setIsFinalSubmitting(true);
    Alert.alert('Batas Pelanggaran Tercapai', `Ujian akan dikumpulkan otomatis karena ${reason}.`);
    void (async () => {
      const ok = await saveProgress(true);
      setIsFinalSubmitting(false);
      if (!ok) return;
      setIsFinished(true);
      Alert.alert('Ujian Dikumpulkan', 'Sesi ujian dikumpulkan otomatis karena pelanggaran berulang.', [
        {
          text: 'OK',
          onPress: () => router.replace('/exams'),
        },
      ]);
    })();
  }, [isFinished, router, saveProgress]);

  const recordViolation = useCallback((type: string) => {
    if (!hasAcknowledgedStart || !isExamReady || isFinished) return;
    const normalizedType = String(type || '').trim().toLowerCase();
    if (!normalizedType) return;
    const now = Date.now();
    if (
      lastViolationFingerprintRef.current &&
      lastViolationFingerprintRef.current.key === normalizedType &&
      now - lastViolationFingerprintRef.current.at < 900
    ) {
      return;
    }
    lastViolationFingerprintRef.current = { key: normalizedType, at: now };

    const nextCount = violationsRef.current + 1;
    monitoringStatsRef.current = {
      ...monitoringStatsRef.current,
      totalViolations: nextCount,
      lastViolationType: type,
      lastViolationAt: new Date().toISOString(),
      appSwitchCount:
        monitoringStatsRef.current.appSwitchCount +
        (normalizedType.includes('aplikasi') || normalizedType.includes('home') || normalizedType.includes('recent')
          ? 1
          : 0),
      tabSwitchCount:
        monitoringStatsRef.current.tabSwitchCount + (normalizedType.includes('tab') ? 1 : 0),
    };
    violationsRef.current = nextCount;
    setViolations(nextCount);
    setLastViolationMessage(`Pelanggaran ${Math.min(nextCount, 4)}/3: ${type}`);

    if (nextCount >= 4) {
      triggerViolationAutoSubmit(type);
      return;
    }

    queueProgressSync(FAST_PROGRESS_SYNC_DELAY_MS, { force: true });

    Alert.alert(
      'Pelanggaran Terdeteksi',
      `${type}\n\nPelanggaran ${nextCount}/3. Pelanggaran ke-4 akan mengumpulkan ujian otomatis.`,
    );
  }, [hasAcknowledgedStart, isExamReady, isFinished, queueProgressSync, triggerViolationAutoSubmit]);

  const handleBackAttempt = useCallback(() => {
    if (!hasAcknowledgedStart || !isExamReady || isFinished) return true;

    const nextAttempt = backAttemptRef.current + 1;
    if (nextAttempt < 3) {
      backAttemptRef.current = nextAttempt;
      Alert.alert(
        'Tetap di Layar Ujian',
        nextAttempt === 1
          ? 'Anda mencoba kembali/keluar dari layar ujian. Percobaan ini belum dihitung sebagai pelanggaran.\n\nJika tombol kembali atau slide back ditekan 2 kali lagi, sistem akan mencatat 1 pelanggaran.'
          : 'Ini adalah peringatan kedua untuk tombol kembali. Satu percobaan lagi akan dihitung sebagai 1 pelanggaran.',
      );
      return true;
    }

    backAttemptRef.current = 0;
    recordViolation('Menekan tombol kembali berulang');
    return true;
  }, [hasAcknowledgedStart, isExamReady, isFinished, recordViolation]);

  useEffect(() => {
    if (!isExamReady || isFinished || isFinalSubmitting) return;
    if (remainingSeconds > 0) return;
    if (autoSubmitGuardRef.current) return;
    if (autoSubmitFailedRef.current) return;

    autoSubmitGuardRef.current = true;
    finalSubmitOriginRef.current = 'auto';
    void (async () => {
      const ok = await saveProgress(true);
      if (!ok) return;
      setIsFinished(true);
      Alert.alert('Waktu Habis', 'Ujian otomatis dikumpulkan.', [
        {
          text: 'OK',
          onPress: () => router.replace('/exams'),
        },
      ]);
    })();
  }, [isExamReady, remainingSeconds, isFinished, isFinalSubmitting, router, saveProgress]);

  useEffect(() => {
    if (!isExamReady || isFinished || !hasAcknowledgedStart) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextAppState;
      if (previousState !== 'active' || nextAppState === 'active') return;
      if (Platform.OS === 'android' && nextAppState === 'inactive') return;

      const now = Date.now();
      if (now - lastAppFocusViolationAtRef.current < APP_FOCUS_VIOLATION_THROTTLE_MS) return;
      lastAppFocusViolationAtRef.current = now;

      const violationType =
        nextAppState === 'background'
          ? 'Berpindah aplikasi / tekan Home'
          : 'Membuka panel notifikasi / recent apps / keluar fokus ujian';
      recordViolation(violationType);
      void saveProgress(false, { force: true });
    });

    return () => {
      subscription.remove();
    };
  }, [hasAcknowledgedStart, isExamReady, isFinished, recordViolation, saveProgress]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !isExamReady || isFinished || !hasAcknowledgedStart) return;

    const blurSubscription = AppState.addEventListener('blur', () => {
      if (androidOverlayBlurredRef.current) return;
      androidOverlayBlurredRef.current = true;

      const now = Date.now();
      if (now - lastAndroidOverlayViolationAtRef.current < APP_FOCUS_VIOLATION_THROTTLE_MS) return;
      lastAndroidOverlayViolationAtRef.current = now;

      recordViolation('Aplikasi mengambang / panel sistem menutupi layar ujian');
      void saveProgress(false, { force: true });
    });

    const focusSubscription = AppState.addEventListener('focus', () => {
      androidOverlayBlurredRef.current = false;
    });

    return () => {
      blurSubscription.remove();
      focusSubscription.remove();
      androidOverlayBlurredRef.current = false;
    };
  }, [hasAcknowledgedStart, isExamReady, isFinished, recordViolation, saveProgress]);

  useEffect(() => {
    if (!isExamReady || isFinished || !hasAcknowledgedStart) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (previewImageSrc) {
        setPreviewImageSrc(null);
        return true;
      }
      return handleBackAttempt();
    });

    return () => {
      subscription.remove();
    };
  }, [handleBackAttempt, hasAcknowledgedStart, isExamReady, isFinished, previewImageSrc]);

  const submitFinal = () => {
    if (isFinalSubmitting || isFinished || autoSubmitGuardRef.current) return;
    if (answeredCount < questions.length) {
      Alert.alert(
        'Jawaban Belum Lengkap',
        `Masih ada ${questions.length - answeredCount} soal yang belum dijawab. Lengkapi semua jawaban sebelum mengumpulkan ujian.`,
      );
      return;
    }

    Alert.alert(
      'Kumpulkan Ujian',
      `Semua ${questions.length} soal sudah dijawab. Yakin ingin mengumpulkan ujian?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kumpulkan',
          style: 'destructive',
          onPress: () => {
            autoSubmitGuardRef.current = true;
            finalSubmitOriginRef.current = 'manual';
            setIsFinalSubmitting(true);
            void (async () => {
              const ok = await saveProgress(true);
              setIsFinalSubmitting(false);
              if (!ok) return;
              setIsFinished(true);
              Alert.alert('Sukses', 'Ujian berhasil dikumpulkan.', [
                {
                  text: 'OK',
                  onPress: () => router.replace('/exams'),
                },
              ]);
            })();
          },
        },
      ],
    );
  };

  const handleRefreshExam = useCallback(async () => {
    if (
      !hasAcknowledgedStart ||
      !isExamReady ||
      isFinished ||
      isFinalSubmitting ||
      isRefreshingExam
    ) {
      return;
    }

    setIsRefreshingExam(true);
    try {
      await saveProgress(false, { force: true });
      const refreshResult = await startQuery.refetch();
      if (refreshResult.error) {
        const refreshError = refreshResult.error as { message?: string };
        Alert.alert('Refresh Gagal', refreshError.message || 'Data ujian belum berhasil diperbarui.');
      }
    } finally {
      setIsRefreshingExam(false);
    }
  }, [
    hasAcknowledgedStart,
    isExamReady,
    isFinished,
    isFinalSubmitting,
    isRefreshingExam,
    saveProgress,
    startQuery,
  ]);

  const currentQuestion = questions[currentIndex];
  const currentType = currentQuestion ? normalizeQuestionType(currentQuestion) : 'MULTIPLE_CHOICE';
  const currentOptions = currentQuestion?.options || [];
  const currentMatrixPromptColumns = normalizeMatrixPromptColumns(currentQuestion);
  const currentMatrixColumns = normalizeMatrixColumns(currentQuestion);
  const currentMatrixRows = normalizeMatrixRows(currentQuestion);
  const currentVideoUrl = currentQuestion?.question_video_url || currentQuestion?.video_url || '';
  const currentVideoType = currentQuestion?.question_video_type || null;
  const isCurrentYoutubeVideo =
    currentVideoType === 'youtube' || /youtu\.?be|youtube\.com/i.test(String(currentVideoUrl || ''));
  const currentInlineVideoUrl =
    isCurrentYoutubeVideo ? getYoutubeEmbedUrl(currentVideoUrl) : String(currentVideoUrl || '').trim();
  const resolvedTakeSubject = useMemo(
    () => resolveTakeExamSubject(startQuery.data?.packet || {}),
    [startQuery.data?.packet],
  );

  const answeredCount = questions.reduce((total, question) => {
    const value = effectiveAnswers[question.id];
    const type = normalizeQuestionType(question);
    if (type === 'ESSAY') {
      return typeof value === 'string' && value.trim().length > 0 ? total + 1 : total;
    }
    if (type === 'MATRIX_SINGLE_CHOICE') {
      return isMatrixQuestionAnswered(question, value) ? total + 1 : total;
    }
    if (type === 'COMPLEX_MULTIPLE_CHOICE') {
      return Array.isArray(value) && value.length > 0 ? total + 1 : total;
    }
    return typeof value === 'string' && value.length > 0 ? total + 1 : total;
  }, 0);
  if (isLoading) return <AppLoadingScreen message="Memuat ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!canAccessExams) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>
          {`Mengerjakan ${examTakeLabel}`}
        </Text>
        <QueryStateView type="error" message="Halaman ini hanya tersedia untuk peserta ujian yang aktif." />
      </ScrollView>
    );
  }

  if (applicantVerificationLocked) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 12,
            backgroundColor: '#fffbeb',
            padding: 14,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK menunggu verifikasi admin</Text>
          <Text style={{ color: '#92400e' }}>
            Akun pelamar Anda belum diverifikasi. Lengkapi profil pelamar lalu tunggu verifikasi admin sebelum mengikuti Tes BKK.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!scheduleId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView type="error" message={`ID jadwal ${examTakeLabel.toLowerCase()} tidak valid.`} />
      </ScrollView>
    );
  }

  if (startQuery.isLoading) return <AppLoadingScreen message="Menyiapkan sesi ujian..." />;

  if (startQuery.isError || !startQuery.data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView
          type="error"
          message={`Gagal memulai sesi ${examTakeLabel.toLowerCase()}.`}
          onRetry={() => startQuery.refetch()}
        />
        <Pressable
          onPress={() => router.replace('/exams')}
          style={{
            marginTop: 12,
            backgroundColor: '#1d4ed8',
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Tes</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (questions.length === 0 || !currentQuestion) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView type="error" message={`Soal ${examTakeLabel.toLowerCase()} tidak tersedia.`} />
        <Pressable
          onPress={() => router.replace('/exams')}
          style={{
            marginTop: 12,
            backgroundColor: '#1d4ed8',
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Tes</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!hasAcknowledgedStart) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
        <View
          style={{
            backgroundColor: '#ffffff',
            borderWidth: 1,
            borderColor: '#dbeafe',
            borderRadius: 18,
            padding: 16,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: scaleFont(20), marginBottom: 6 }}>
            {startQuery.data.packet.title}
          </Text>
          <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 10 }}>
            {resolvedTakeSubject.name}
            {resolvedTakeSubject.code ? ` (${resolvedTakeSubject.code})` : ''}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <View style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), fontWeight: '700' }}>
                Mulai {formatDateTime(startQuery.data.session.startTime)}
              </Text>
            </View>
            <View style={{ backgroundColor: '#ecfeff', borderColor: '#a5f3fc', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
              <Text style={{ color: '#0f766e', fontSize: scaleFont(12), fontWeight: '700' }}>Durasi {formatTime(remainingSeconds)}</Text>
            </View>
          </View>
        </View>

        <View
          style={{
            backgroundColor: '#fffbeb',
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 16,
            padding: 16,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '800', fontSize: scaleFont(18), marginBottom: 8 }}>
            Perhatian Sebelum Mengerjakan {examTakeLabel}
          </Text>
          <Text style={{ color: '#92400e', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 6 }}>
            Sesi Anda sudah disiapkan. Baca aturan berikut sebelum soal dibuka.
          </Text>
          {[
            'Pastikan koneksi internet stabil sebelum mulai.',
            'Jangan menekan tombol kembali, Home, membuka recent apps, atau panel notifikasi.',
            'Jangan gunakan aplikasi mengambang / floating app / split screen di atas layar ujian.',
            'Perpindahan aplikasi akan dihitung sebagai pelanggaran.',
            'Aplikasi mengambang atau panel sistem yang menutupi ujian akan dihitung sebagai pelanggaran.',
            'Tombol kembali / slide back akan diberi 2x peringatan, percobaan ke-3 baru dihitung 1 pelanggaran.',
            'Pelanggaran ke-4 akan mengumpulkan ujian secara otomatis.',
            'Bar status disembunyikan selama ujian untuk meminimalkan akses notifikasi.',
            'Gambar pada soal dapat diketuk untuk diperbesar tanpa keluar dari ujian.',
            'Jika guru meminta sinkron ulang soal, gunakan tombol Refresh Data di layar ujian. Refresh ini tidak dihitung pelanggaran.',
          ].map((rule) => (
            <Text key={rule} style={{ color: '#92400e', fontSize: scaleFont(13), lineHeight: scaleLineHeight(21), marginBottom: 4 }}>
              • {rule}
            </Text>
          ))}
        </View>

        <Pressable
          onPress={() => {
            setHasAcknowledgedStart(true);
          }}
          style={{
            backgroundColor: '#16a34a',
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(15) }}>{`Mulai ${examTakeLabel}`}</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPaddingCompact}>
      <View
        style={{
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#dbeafe',
          borderRadius: 18,
          padding: 16,
          marginBottom: 12,
          shadowColor: '#0f172a',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: scaleFont(18), marginBottom: 6 }}>
          {startQuery.data.packet.title}
        </Text>
        <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 10 }}>
          {resolvedTakeSubject.name}
          {resolvedTakeSubject.code ? ` (${resolvedTakeSubject.code})` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Animated.View
            style={{
              backgroundColor: timerChipPalette.backgroundColor,
              borderColor: timerChipPalette.borderColor,
              borderWidth: 1,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
              opacity: timerPulseOpacity,
            }}
          >
            <Text style={{ color: timerChipPalette.textColor, fontSize: scaleFont(12), fontWeight: '700' }}>
              Sisa waktu {formatTime(remainingSeconds)}
            </Text>
          </Animated.View>
          <View style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), fontWeight: '700' }}>Mulai {formatDateTime(startQuery.data.session.startTime)}</Text>
          </View>
          <View style={{ backgroundColor: displayViolations > 0 ? '#fff1f2' : '#f8fafc', borderColor: displayViolations > 0 ? '#fecdd3' : '#e2e8f0', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: displayViolations > 0 ? '#be123c' : '#475569', fontSize: scaleFont(12), fontWeight: '700' }}>Pelanggaran {displayViolations}/3</Text>
          </View>
        </View>
        <Text style={{ color: '#475569', fontSize: scaleFont(12), marginTop: 10 }}>
          Autosave:{' '}
          {autosaveState === 'saving'
            ? 'menyimpan...'
            : autosaveState === 'saved'
              ? `tersimpan (${formatDateTime(lastSavedAt)})`
              : autosaveState === 'error'
                ? 'gagal, akan dicoba lagi'
                : '-'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Pressable
            onPress={handleRefreshExam}
            disabled={isRefreshingExam || isFinalSubmitting}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
              opacity: isRefreshingExam || isFinalSubmitting ? 0.65 : 1,
            }}
          >
            <Feather
              name={isRefreshingExam ? 'loader' : 'refresh-cw'}
              size={14}
              color="#1d4ed8"
            />
            <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), fontWeight: '700' }}>
              {isRefreshingExam ? 'Menyegarkan...' : 'Refresh Data'}
            </Text>
          </Pressable>
          <Text
            style={{
              color: '#475569',
              fontSize: scaleFont(11),
              lineHeight: scaleLineHeight(17),
              flexShrink: 1,
            }}
          >
            Gunakan tombol ini bila guru mengubah soal. Refresh data tidak dihitung pelanggaran.
          </Text>
        </View>
        {lastViolationMessage ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#fecdd3',
              backgroundColor: '#fff1f2',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#9f1239', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>{lastViolationMessage}</Text>
          </View>
        ) : null}
        {activeProctorWarning ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#fcd34d',
              backgroundColor: '#fffbeb',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 9,
              gap: 4,
            }}
          >
            <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
              {activeProctorWarning.title}
            </Text>
            <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
              {activeProctorWarning.message}
            </Text>
            <Text style={{ color: '#78350f', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }}>
              {activeProctorWarning.proctorName ? `${activeProctorWarning.proctorName} • ` : ''}
              {formatWarningDateTime(activeProctorWarning.warnedAt)}
            </Text>
            <Pressable
              onPress={() => setShowProctorWarningModal(true)}
              style={{
                alignSelf: 'flex-start',
                marginTop: 4,
                borderWidth: 1,
                borderColor: '#fcd34d',
                backgroundColor: '#ffffff',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#92400e', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>
                Lihat Peringatan
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#334155', fontSize: scaleFont(12), marginBottom: 8 }}>
          Progres: {answeredCount}/{questions.length} soal terisi
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
          {questions.map((question, index) => {
            const value = effectiveAnswers[question.id];
            const type = normalizeQuestionType(question);
            const isAnswered =
              type === 'ESSAY'
                ? typeof value === 'string' && value.trim().length > 0
                : type === 'MATRIX_SINGLE_CHOICE'
                  ? isMatrixQuestionAnswered(question, value)
                : type === 'COMPLEX_MULTIPLE_CHOICE'
                  ? Array.isArray(value) && value.length > 0
                  : typeof value === 'string' && value.length > 0;
            const isCurrent = index === currentIndex;
            return (
              <View key={question.id} style={{ width: '10%', paddingHorizontal: 3, marginBottom: 6 }}>
                <Pressable
                  onPress={() => setCurrentIndex(index)}
                  style={{
                    height: 30,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: isCurrent ? '#1d4ed8' : isAnswered ? '#16a34a' : '#cbd5e1',
                    backgroundColor: isCurrent ? '#dbeafe' : isAnswered ? '#dcfce7' : '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: isCurrent ? '#1d4ed8' : '#0f172a', fontSize: scaleFont(11), fontWeight: '700' }}>
                    {index + 1}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
          Soal {currentIndex + 1} dari {questions.length}
        </Text>
        <View style={{ marginBottom: 12 }}>
          <ExamHtmlContent
            html={currentQuestion.question_text || currentQuestion.content || null}
            imageUrl={currentQuestion.question_image_url || currentQuestion.image_url}
            videoUrl={currentQuestion.question_video_url || currentQuestion.video_url}
            videoType={currentQuestion.question_video_type || null}
            interactive={Boolean(currentQuestion.question_video_url || currentQuestion.video_url)}
            minHeight={24}
            backgroundColor="transparent"
            onImagePress={(src) => setPreviewImageSrc(src)}
            showInlineVideo={false}
            renderMode="native"
            textAlign="justify"
          />
          {currentQuestion.question_image_url || currentQuestion.image_url ? (
            <Text
              style={{
                color: '#2563eb',
                fontSize: scaleFont(11),
                lineHeight: scaleLineHeight(17),
                fontWeight: '700',
                marginTop: 6,
              }}
            >
              Ketuk gambar soal untuk memperbesar.
            </Text>
          ) : null}
        </View>

        {currentInlineVideoUrl ? (
          <View
            style={{
              marginBottom: 12,
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 14,
              backgroundColor: '#ffffff',
              overflow: 'hidden',
            }}
          >
            {isCurrentYoutubeVideo ? (
              <WebView
                originWhitelist={['*']}
                source={{ uri: currentInlineVideoUrl }}
                style={{ height: 220, backgroundColor: '#ffffff' }}
                javaScriptEnabled
                domStorageEnabled
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                allowsFullscreenVideo={false}
                userAgent="Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36"
                startInLoadingState
              />
            ) : (
              <WebView
                originWhitelist={['*']}
                source={{
                  html: `<!DOCTYPE html><html><body style="margin:0;background:#fff;"><video src="${String(
                    currentInlineVideoUrl,
                  ).replace(/"/g, '&quot;')}" controls playsinline style="width:100%;height:220px;background:#000;"></video></body></html>`,
                }}
                style={{ height: 220, backgroundColor: '#ffffff' }}
                javaScriptEnabled
                domStorageEnabled
                mediaPlaybackRequiresUserAction={false}
                setSupportMultipleWindows={false}
                allowsFullscreenVideo={false}
              />
            )}
          </View>
        ) : null}

        {currentType === 'ESSAY' ? (
        <TextInput
          value={typeof effectiveAnswers[currentQuestion.id] === 'string' ? (effectiveAnswers[currentQuestion.id] as string) : ''}
            onChangeText={(value) => {
              setAnswers((prev) => ({
                ...prev,
                [currentQuestion.id]: value,
              }));
              markProgressDirty();
            }}
            multiline
            textAlignVertical="top"
            placeholder="Tulis jawaban Anda..."
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            minHeight: 140,
            paddingHorizontal: 10,
            paddingVertical: 10,
            backgroundColor: '#fff',
            fontSize: scaleFont(14),
            lineHeight: scaleLineHeight(22),
          }}
        />
        ) : currentType === 'MATRIX_SINGLE_CHOICE' ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#f8fafc' }}>
                {currentMatrixPromptColumns.map((column) => (
                  <View
                    key={column.id}
                    style={{
                      width: 180,
                      borderRightWidth: 1,
                      borderBottomWidth: 1,
                      borderColor: '#cbd5e1',
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700', fontSize: scaleFont(12) }}>{column.label}</Text>
                  </View>
                ))}
                {currentMatrixColumns.map((column) => (
                  <View
                    key={column.id}
                    style={{
                      width: 108,
                      borderBottomWidth: 1,
                      borderColor: '#cbd5e1',
                      paddingHorizontal: 8,
                      paddingVertical: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700', fontSize: scaleFont(12), textAlign: 'center' }}>
                      {column.content}
                    </Text>
                  </View>
                ))}
              </View>
              {currentMatrixRows.map((row, rowIndex) => {
                const answerMap =
                  effectiveAnswers[currentQuestion.id] &&
                  typeof effectiveAnswers[currentQuestion.id] === 'object' &&
                  !Array.isArray(effectiveAnswers[currentQuestion.id])
                    ? (effectiveAnswers[currentQuestion.id] as Record<string, unknown>)
                    : {};
                const selectedColumnId = String(answerMap[row.id] || '');
                return (
                  <View
                    key={row.id || `matrix-row-${rowIndex + 1}`}
                    style={{
                      flexDirection: 'row',
                      backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
                    }}
                  >
                    {currentMatrixPromptColumns.map((column, promptColumnIndex) => (
                      <View
                        key={`${row.id}-${column.id}`}
                        style={{
                          width: 180,
                          borderRightWidth: 1,
                          borderBottomWidth: 1,
                          borderColor: '#cbd5e1',
                          paddingHorizontal: 10,
                          paddingVertical: 12,
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          {getMatrixRowCellContent(row, column.id, promptColumnIndex) || '-'}
                        </Text>
                      </View>
                    ))}
                    {currentMatrixColumns.map((column) => {
                      const selected = selectedColumnId === column.id;
                      return (
                        <Pressable
                          key={`${row.id}-${column.id}`}
                          onPress={() => setMatrixAnswerValue(currentQuestion.id, row.id, column.id)}
                          style={{
                            width: 108,
                            borderBottomWidth: 1,
                            borderColor: '#cbd5e1',
                            alignItems: 'center',
                            justifyContent: 'center',
                            paddingVertical: 14,
                            backgroundColor: selected ? '#eff6ff' : 'transparent',
                          }}
                        >
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              borderWidth: 1.5,
                              borderColor: selected ? '#1d4ed8' : '#94a3b8',
                              backgroundColor: selected ? '#dbeafe' : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {selected ? (
                              <View
                                style={{
                                  width: 10,
                                  height: 10,
                                  borderRadius: 999,
                                  backgroundColor: '#1d4ed8',
                                }}
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : currentOptions.length > 0 ? (
          <View>
            {currentOptions.map((option) => {
              const selectedValue = effectiveAnswers[currentQuestion.id];
              const selected =
                currentType === 'COMPLEX_MULTIPLE_CHOICE'
                  ? Array.isArray(selectedValue) && selectedValue.includes(option.id)
                  : selectedValue === option.id;

              return (
                <Pressable
                  key={option.id}
                  onPress={() => toggleOptionValue(currentQuestion.id, option.id, currentType)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                    <View style={{ paddingTop: 2 }}>
                      {currentType === 'COMPLEX_MULTIPLE_CHOICE' ? (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 6,
                            borderWidth: 1.5,
                            borderColor: selected ? '#1d4ed8' : '#94a3b8',
                            backgroundColor: selected ? '#1d4ed8' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selected ? <Text style={{ color: '#fff', fontSize: scaleFont(13), fontWeight: '800' }}>✓</Text> : null}
                        </View>
                      ) : (
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            borderWidth: 1.5,
                            borderColor: selected ? '#1d4ed8' : '#94a3b8',
                            backgroundColor: selected ? '#dbeafe' : 'transparent',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {selected ? (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 999,
                                backgroundColor: '#1d4ed8',
                              }}
                            />
                          ) : null}
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <ExamHtmlContent
                        html={option.option_text || option.content || null}
                        minHeight={20}
                        backgroundColor="transparent"
                        renderMode="native"
                      />
                      {option.option_image_url || option.image_url ? (
                        <View style={{ marginTop: 8 }}>
                          <Pressable
                            onPress={() => setPreviewImageSrc(toMediaUrl(option.option_image_url || option.image_url || undefined))}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            <Image
                              source={{ uri: toMediaUrl(option.option_image_url || option.image_url || undefined) }}
                              resizeMode="contain"
                              style={{
                                width: 124,
                                height: 92,
                                borderRadius: 10,
                                backgroundColor: '#f8fafc',
                                borderWidth: 1,
                                borderColor: '#dbeafe',
                              }}
                            />
                          </Pressable>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                            <Pressable
                              onPress={() => toggleOptionValue(currentQuestion.id, option.id, currentType)}
                              style={{
                                borderWidth: 1,
                                borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                                backgroundColor: selected ? '#dbeafe' : '#ffffff',
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: scaleFont(12), fontWeight: '700' }}>
                                {selected ? 'Jawaban dipilih' : 'Pilih jawaban'}
                              </Text>
                            </Pressable>
                            <Pressable
                              onPress={() => setPreviewImageSrc(toMediaUrl(option.option_image_url || option.image_url || undefined))}
                              style={{
                                borderWidth: 1,
                                borderColor: '#bfdbfe',
                                backgroundColor: '#eff6ff',
                                borderRadius: 999,
                                paddingHorizontal: 10,
                                paddingVertical: 6,
                              }}
                            >
                              <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), fontWeight: '700' }}>Perbesar gambar</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: '#b91c1c', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>Opsi jawaban tidak tersedia pada soal ini.</Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#fff',
              opacity: currentIndex === 0 ? 0.5 : 1,
            }}
            disabled={currentIndex === 0}
          >
            <Text style={{ color: '#334155', fontWeight: '700' }}>Sebelumnya</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            style={{
              borderWidth: 1,
              borderColor: '#1d4ed8',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#1d4ed8',
              opacity: currentIndex === questions.length - 1 ? 0.5 : 1,
            }}
            disabled={currentIndex === questions.length - 1}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Selanjutnya</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={submitFinal}
        disabled={isFinalSubmitting || isFinished}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: isFinalSubmitting || isFinished ? 0.5 : 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {isFinalSubmitting ? 'Mengumpulkan...' : isFinished ? 'Sudah Dikumpulkan' : 'Kumpulkan Ujian'}
        </Text>
      </Pressable>

      <Modal
        visible={showProctorWarningModal && Boolean(activeProctorWarning)}
        animationType="fade"
        transparent
        onRequestClose={() => setShowProctorWarningModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingVertical: 24,
          }}
        >
          <View
            style={{
              borderRadius: 18,
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#fcd34d',
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: '#fde68a',
                flexDirection: 'row',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#92400e', fontWeight: '800', fontSize: scaleFont(16), lineHeight: scaleLineHeight(22) }}>
                  {activeProctorWarning?.title || 'Peringatan Pengawas Ujian'}
                </Text>
                <Text style={{ color: '#78350f', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                  {activeProctorWarning?.proctorName
                    ? `Dari ${activeProctorWarning.proctorName}`
                    : 'Pesan resmi dari pengawas ruang'}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowProctorWarningModal(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#fde68a',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={18} color="#92400e" />
              </Pressable>
            </View>
            <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#fde68a',
                  backgroundColor: '#fffbeb',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ color: '#92400e', fontSize: scaleFont(13), lineHeight: scaleLineHeight(21) }}>
                  {activeProctorWarning?.message || '-'}
                </Text>
              </View>
              <Text style={{ color: '#78350f', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 10 }}>
                {formatWarningDateTime(activeProctorWarning?.warnedAt)}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 16,
                paddingBottom: 16,
                alignItems: 'flex-end',
              }}
            >
              <Pressable
                onPress={() => setShowProctorWarningModal(false)}
                style={{
                  borderRadius: 10,
                  backgroundColor: '#d97706',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  Saya Mengerti
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ExamImagePreviewModal
        visible={Boolean(previewImageSrc)}
        imageUri={previewImageSrc}
        subtitle="Perbesar gambar soal tanpa keluar dari sesi ujian, lalu geser untuk melihat detail lain."
        onClose={() => setPreviewImageSrc(null)}
      />
      </ScrollView>
    </>
  );
}
