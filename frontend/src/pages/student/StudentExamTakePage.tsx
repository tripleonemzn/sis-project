import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useOutletContext, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { authService } from '../../services/auth.service'
import api from '../../services/api'
import {
  Clock,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Send,
  Shield,
  CheckCircle,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { QuestionMediaImage } from '../../components/common/QuestionMediaImage'
import {
  useStudentExamWarningRealtime,
  type StudentExamWarningRealtimePayload,
} from '../../features/exams/useStudentExamWarningRealtime'
import { enhanceQuestionHtml } from '../../utils/questionMedia'

type StudentExamAnswerValue =
  | string
  | string[]
  | number
  | null
  | Record<string, unknown>

type StudentExamAnswers = Record<string, StudentExamAnswerValue>

type MonitoringStats = {
  totalViolations: number
  tabSwitchCount: number
  fullscreenExitCount: number
  appSwitchCount: number
  lastViolationType: string | null
  lastViolationAt: string | null
  currentQuestionIndex: number
  currentQuestionNumber: number
  currentQuestionId: string | null
  lastSyncAt: string | null
}

type ProctorWarningSignal = {
  id: number
  title: string
  message: string
  warnedAt: string
  proctorId?: number | null
  proctorName?: string | null
  category?: string | null
  room?: string | null
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void
  mozRequestFullScreen?: () => Promise<void> | void
  msRequestFullscreen?: () => Promise<void> | void
}

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null
  mozFullScreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

type BrowserNetworkInformation = {
  effectiveType?: string
  rtt?: number
  downlink?: number
  saveData?: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
}

type WakeLockSentinelLike = {
  release: () => Promise<void> | void
  addEventListener?: (type: 'release', listener: () => void) => void
}

type WakeLockNavigator = Navigator & {
  wakeLock?: {
    request?: (type: 'screen') => Promise<WakeLockSentinelLike>
  }
}

type NetworkQuality = 'stabil' | 'sedang' | 'lambat' | 'offline'

type NetworkStatusBadge = {
  quality: NetworkQuality
  label: 'Stabil' | 'Sedang' | 'Lambat' | 'Offline'
}

type ExamQuestionOption = Record<string, unknown> & {
  id?: string | number
  option_text?: string
  content?: string
  option_image_url?: string | null
  image_url?: string | null
}

type ExamQuestionMatrixColumn = {
  id: string
  content: string
}

type ExamQuestionMatrixPromptColumn = {
  id: string
  label: string
}

type ExamQuestionMatrixRowCell = {
  columnId: string
  content: string
}

type ExamQuestionMatrixRow = {
  id: string
  content: string
  cells?: ExamQuestionMatrixRowCell[]
  correctOptionId?: string | null
}

interface Question {
  id: string
  question_text: string
  content?: string // Added fallback
  question_type: 'MULTIPLE_CHOICE' | 'ESSAY' | 'TRUE_FALSE' | 'COMPLEX_MULTIPLE_CHOICE' | 'MATRIX_SINGLE_CHOICE'
  type?: 'MULTIPLE_CHOICE' | 'ESSAY' | 'TRUE_FALSE' | 'COMPLEX_MULTIPLE_CHOICE' | 'MATRIX_SINGLE_CHOICE' // Added fallback
  question_image_url?: string | null
  image_url?: string | null
  question_video_url?: string | null
  question_video_type?: 'upload' | 'youtube'
  question_media_position?: 'top' | 'bottom' | 'left' | 'right'
  video_url?: string | null
  option_a: string | null
  option_b: string | null
  option_c: string | null
  option_d: string | null
  option_e: string | null
  option_a_image_url: string | null
  option_b_image_url: string | null
  option_c_image_url: string | null
  option_d_image_url: string | null
  option_e_image_url: string | null
  points: number
  order_number: number
  section: 'OBJECTIVE' | 'ESSAY'
  correct_answer: unknown
  options?: ExamQuestionOption[]
  matrixPromptColumns?: ExamQuestionMatrixPromptColumn[]
  matrixColumns?: ExamQuestionMatrixColumn[]
  matrixRows?: ExamQuestionMatrixRow[]
}

interface Exam {
  id: string
  title: string
  description: string
  type: string
  duration: number
  start_time: string
  end_time: string
  subject: {
    name: string
  }
  instructions?: string
  questions: Question[]
}

function hasAnsweredValue(value: StudentExamAnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') {
    return Object.values(value).some((item) => String(item || '').trim().length > 0)
  }
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function normalizeMatrixColumns(question: Question | null | undefined): ExamQuestionMatrixColumn[] {
  const raw = question?.matrixColumns
  if (!Array.isArray(raw)) return []
  return raw
    .map((column, index) => ({
      id: String(column?.id || `matrix-col-${index + 1}`),
      content: String(column?.content || '').trim(),
    }))
    .filter((column) => column.content.length > 0)
}

function normalizeMatrixPromptColumns(question: Question | null | undefined): ExamQuestionMatrixPromptColumn[] {
  const raw = question?.matrixPromptColumns
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ id: 'prompt-default', label: 'Pernyataan' }]
  }
  return raw.map((column, index) => ({
    id: String(column?.id || `matrix-prompt-col-${index + 1}`),
    label: String(column?.label || '').trim() || `Kolom ${index + 1}`,
  }))
}

function normalizeMatrixRows(question: Question | null | undefined): ExamQuestionMatrixRow[] {
  const raw = question?.matrixRows
  if (!Array.isArray(raw)) return []
  return raw
    .map((row, index) => ({
      id: String(row?.id || `matrix-row-${index + 1}`),
      content: String(row?.content || '').trim(),
      cells: Array.isArray(row?.cells)
        ? row.cells.map((cell) => ({
            columnId: String(cell?.columnId || '').trim(),
            content: String(cell?.content || '').trim(),
          }))
        : [],
      correctOptionId: row?.correctOptionId ? String(row.correctOptionId) : null,
    }))
    .filter((row) => row.content.length > 0 || (row.cells || []).some((cell) => cell.content.length > 0))
}

function getMatrixRowCellContent(row: ExamQuestionMatrixRow, promptColumnId: string, promptColumnIndex: number): string {
  if (Array.isArray(row.cells) && row.cells.length > 0) {
    const cell = row.cells.find((item) => item.columnId === promptColumnId)
    return String(cell?.content || '').trim()
  }
  return promptColumnIndex === 0 ? String(row.content || '').trim() : ''
}

function isMatrixQuestionAnswered(question: Question | null | undefined, value: StudentExamAnswerValue | undefined): boolean {
  const rows = normalizeMatrixRows(question)
  if (rows.length === 0 || !value || typeof value !== 'object' || Array.isArray(value)) return false
  const answerMap = value as Record<string, unknown>
  return rows.every((row) => String(answerMap[row.id] || '').trim().length > 0)
}

function isLikelyMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const userAgent = navigator.userAgent || ''
  const mobileUserAgent =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)
  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  return mobileUserAgent || coarsePointer
}

function supportsDocumentFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const root = document.documentElement as FullscreenElement
  return Boolean(
    root?.requestFullscreen ||
      root?.webkitRequestFullscreen ||
      root?.mozRequestFullScreen ||
      root?.msRequestFullscreen,
  )
}

const MIN_PROGRESS_SYNC_GAP_MS = 5000
const DEFAULT_PROGRESS_SYNC_DELAY_MS = 1400
const FAST_PROGRESS_SYNC_DELAY_MS = 850
const HEARTBEAT_PROGRESS_SYNC_MIN_MS = 17000
const HEARTBEAT_PROGRESS_SYNC_MAX_MS = 25000

function getHeartbeatProgressSyncDelayMs() {
  const spread = HEARTBEAT_PROGRESS_SYNC_MAX_MS - HEARTBEAT_PROGRESS_SYNC_MIN_MS
  if (spread <= 0) return HEARTBEAT_PROGRESS_SYNC_MIN_MS
  return HEARTBEAT_PROGRESS_SYNC_MIN_MS + Math.round(Math.random() * spread)
}

function getNavigatorConnection(): BrowserNetworkInformation | null {
  if (typeof navigator === 'undefined') return null
  const navWithConnection = navigator as Navigator & {
    connection?: BrowserNetworkInformation
    mozConnection?: BrowserNetworkInformation
    webkitConnection?: BrowserNetworkInformation
  }
  return navWithConnection.connection || navWithConnection.mozConnection || navWithConnection.webkitConnection || null
}

function getNetworkStatusBadge(): NetworkStatusBadge {
  if (typeof navigator === 'undefined') return { quality: 'sedang', label: 'Sedang' }
  if (!navigator.onLine) return { quality: 'offline', label: 'Offline' }

  const connection = getNavigatorConnection()
  if (!connection) return { quality: 'sedang', label: 'Sedang' }

  const effectiveType = String(connection.effectiveType || '').toLowerCase()
  const rtt = Number(connection.rtt || 0)
  const downlink = Number(connection.downlink || 0)
  const saveData = Boolean(connection.saveData)

  const verySlow =
    saveData ||
    effectiveType === 'slow-2g' ||
    effectiveType === '2g' ||
    (rtt > 0 && rtt >= 600) ||
    (downlink > 0 && downlink < 1)
  if (verySlow) return { quality: 'lambat', label: 'Lambat' }

  const medium =
    effectiveType === '3g' ||
    (rtt > 0 && rtt >= 250) ||
    (downlink > 0 && downlink < 5)
  if (medium) return { quality: 'sedang', label: 'Sedang' }

  return { quality: 'stabil', label: 'Stabil' }
}

function parseExamSessionAnswers(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return {}
    }
  }
  return {}
}

function normalizeProctorWarning(raw: unknown): ProctorWarningSignal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const id = Number(source.id || 0)
  const message = String(source.message || '').trim()
  if (!Number.isFinite(id) || id <= 0 || !message) return null
  return {
    id,
    title: String(source.title || 'Peringatan Pengawas Ujian').trim() || 'Peringatan Pengawas Ujian',
    message,
    warnedAt: String(source.warnedAt || new Date().toISOString()),
    proctorId: Number.isFinite(Number(source.proctorId)) ? Number(source.proctorId) : null,
    proctorName: String(source.proctorName || '').trim() || null,
    category: String(source.category || '').trim() || null,
    room: String(source.room || '').trim() || null,
  }
}

function formatWarningDateTime(value?: string | null) {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function extractMonitoringStats(rawAnswers: Record<string, unknown>): Partial<MonitoringStats> | null {
  const monitoring = rawAnswers.__monitoring
  if (!monitoring || typeof monitoring !== 'object' || Array.isArray(monitoring)) {
    return null
  }
  return monitoring as Partial<MonitoringStats>
}

function resolveRestoredQuestionIndex(params: {
  questions: Array<{ id?: string | number | null }>
  rawSessionAnswers: unknown
  fallbackIndex: number
}): number {
  const totalQuestions = params.questions.length
  if (totalQuestions <= 0) return 0

  const persistedAnswers = parseExamSessionAnswers(params.rawSessionAnswers)
  const persistedMonitoring = extractMonitoringStats(persistedAnswers)
  const preferredQuestionId = String(persistedMonitoring?.currentQuestionId || '').trim()
  if (preferredQuestionId) {
    const matchedIndex = params.questions.findIndex(
      (question) => String(question?.id || '').trim() === preferredQuestionId,
    )
    if (matchedIndex >= 0) return matchedIndex
  }

  const persistedIndex = Number(persistedMonitoring?.currentQuestionIndex)
  if (Number.isFinite(persistedIndex) && persistedIndex >= 0) {
    return Math.min(Math.max(0, persistedIndex), totalQuestions - 1)
  }

  if (Number.isFinite(params.fallbackIndex) && params.fallbackIndex >= 0) {
    return Math.min(Math.max(0, params.fallbackIndex), totalQuestions - 1)
  }

  return 0
}

function resolveExamTakeBaseRoute(pathname: string): '/student/exams' | '/candidate/exams' | '/public/exams' {
  if (pathname.startsWith('/candidate')) return '/candidate/exams'
  if (pathname.startsWith('/public')) return '/public/exams'
  return '/student/exams'
}

export default function StudentExamTakePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const baseExamRoute = useMemo(() => resolveExamTakeBaseRoute(location.pathname), [location.pathname])
  const examTakeLabel = useMemo(() => {
    if (location.pathname.startsWith('/candidate')) return 'Tes Seleksi'
    if (location.pathname.startsWith('/public')) return 'Tes BKK'
    return 'Ujian'
  }, [location.pathname])
  const requiresFullscreen = useMemo(
    () => supportsDocumentFullscreen() && !isLikelyMobileDevice(),
    [],
  )
  
  // Exam data
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<StudentExamAnswers>({})
  
  // Timer
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [examStartTime, setExamStartTime] = useState<Date | null>(null)
  
  // Lockdown & Violations
  const [violations, setViolations] = useState(0)
  const [showViolationWarning, setShowViolationWarning] = useState(false)
  const [lastViolationType, setLastViolationType] = useState('')
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null)
  const [previewImageZoom, setPreviewImageZoom] = useState(1)
  const [activeProctorWarning, setActiveProctorWarning] = useState<ProctorWarningSignal | null>(null)
  const [showProctorWarningModal, setShowProctorWarningModal] = useState(false)
  
  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
  const [isRefreshingExam, setIsRefreshingExam] = useState(false)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const violationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const endTimeRef = useRef<number | null>(null)
  const fetchedExamKeyRef = useRef<string | null>(null)
  const violationsRef = useRef(0)

  const hasStartedRef = useRef(false)
  const answersRef = useRef<StudentExamAnswers>({})
  const hasDirtyProgressRef = useRef(false)
  const lastSyncedFingerprintRef = useRef('')
  const lastProgressSyncAtRef = useRef(0)
  const monitoringStatsRef = useRef<MonitoringStats>({
    totalViolations: 0,
    tabSwitchCount: 0,
    fullscreenExitCount: 0,
    appSwitchCount: 0,
    lastViolationType: null as string | null,
    lastViolationAt: null as string | null,
    currentQuestionIndex: 0,
    currentQuestionNumber: 1,
    currentQuestionId: null as string | null,
    lastSyncAt: null as string | null,
  })
  const lastViolationFingerprintRef = useRef<{ key: string; at: number } | null>(null)
  const lastWindowBlurAtRef = useRef(0)
  const blurViolationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusMonitorIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const lastFocusLossObservedRef = useRef(false)
  const translationWarningShownRef = useRef(false)
  const latestHandledProctorWarningIdRef = useRef(0)
  
  // Get current user
  const { user: contextUser } = useOutletContext<{ user: Record<string, unknown> }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  })
  const user = contextUser || authData?.data

  const handleIncomingProctorWarning = useCallback((warning: ProctorWarningSignal | StudentExamWarningRealtimePayload) => {
    const normalizedWarning = normalizeProctorWarning(warning)
    if (!normalizedWarning) return
    if (normalizedWarning.id === latestHandledProctorWarningIdRef.current) return
    latestHandledProctorWarningIdRef.current = normalizedWarning.id
    setActiveProctorWarning(normalizedWarning)
    setShowProctorWarningModal(true)
    toast.error(normalizedWarning.title, {
      duration: 5000,
      icon: '⚠️',
    })
  }, [])

  useStudentExamWarningRealtime({
    enabled: Boolean(id && user?.id && !submitting),
    scheduleId: Number.isFinite(Number(id)) ? Number(id) : null,
    studentId: Number.isFinite(Number(user?.id)) ? Number(user?.id) : null,
    onWarning: handleIncomingProctorWarning,
  })

  // Keep ref in sync so async callbacks can read latest value
  useEffect(() => {
    violationsRef.current = violations
  }, [violations])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

  const releaseWakeLock = useCallback(async () => {
    const wakeLock = wakeLockRef.current
    wakeLockRef.current = null
    if (!wakeLock) return
    try {
      await wakeLock.release()
    } catch {
      // Ignore best-effort release failures; browser may already release it automatically.
    }
  }, [])

  const requestWakeLock = useCallback(async () => {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return
    const wakeLockNavigator = navigator as WakeLockNavigator
    if (!wakeLockNavigator.wakeLock?.request || wakeLockRef.current) return
    try {
      const wakeLock = await wakeLockNavigator.wakeLock.request('screen')
      wakeLockRef.current = wakeLock
      wakeLock.addEventListener?.('release', () => {
        if (wakeLockRef.current === wakeLock) {
          wakeLockRef.current = null
        }
      })
    } catch {
      // Ignore wake-lock acquisition failures; exam flow must continue normally.
    }
  }, [])

  // Fetch exam data once per exam+student key
  useEffect(() => {
    if (!id || !user?.id) return
    const fetchKey = `${id}:${user.id}`
    if (fetchedExamKeyRef.current === fetchKey) return
    fetchedExamKeyRef.current = fetchKey
    fetchExam()
  }, [id, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Check fullscreen status
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatusBadge>(() =>
    getNetworkStatusBadge(),
  )

  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlTranslate = html.getAttribute('translate')
    const prevBodyTranslate = body.getAttribute('translate')
    const prevHtmlClass = html.className
    const prevBodyClass = body.className
    const prevLang = html.getAttribute('lang')

    html.setAttribute('translate', 'no')
    html.setAttribute('lang', 'id')
    body.setAttribute('translate', 'no')
    if (!html.classList.contains('notranslate')) html.classList.add('notranslate')
    if (!body.classList.contains('notranslate')) body.classList.add('notranslate')

    return () => {
      if (prevHtmlTranslate === null) html.removeAttribute('translate')
      else html.setAttribute('translate', prevHtmlTranslate)
      if (prevBodyTranslate === null) body.removeAttribute('translate')
      else body.setAttribute('translate', prevBodyTranslate)
      html.className = prevHtmlClass
      body.className = prevBodyClass
      if (prevLang === null) html.removeAttribute('lang')
      else html.setAttribute('lang', prevLang)
    }
  }, [])

  useEffect(() => {
    const disableTranslateArtifacts = () => {
      const html = document.documentElement
      const body = document.body
      const translatedClassPattern = /translated-ltr|translated-rtl|skiptranslate/i
      const hasTranslatedClass =
        translatedClassPattern.test(String(html.className || '')) ||
        translatedClassPattern.test(String(body.className || ''))
      const googleBanner = document.querySelector('iframe.goog-te-banner-frame, .goog-te-banner-frame')

      if (!hasTranslatedClass && !googleBanner) return

      html.classList.remove('translated-ltr', 'translated-rtl', 'skiptranslate')
      body.classList.remove('translated-ltr', 'translated-rtl', 'skiptranslate')
      body.style.top = '0px'
      googleBanner?.remove()

      if (!translationWarningShownRef.current) {
        translationWarningShownRef.current = true
        toast.error('Auto-translate dinonaktifkan agar soal tidak berubah saat ujian.')
      }
    }

    disableTranslateArtifacts()
    const observer = new MutationObserver(() => {
      disableTranslateArtifacts()
    })
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    const poller = window.setInterval(disableTranslateArtifacts, 2000)

    return () => {
      observer.disconnect()
      window.clearInterval(poller)
    }
  }, [])
  
  useEffect(() => {
    const checkFullscreen = () => {
      const isFS = !!(
        document.fullscreenElement ||
        (document as FullscreenDocument).webkitFullscreenElement ||
        (document as FullscreenDocument).mozFullScreenElement ||
        (document as FullscreenDocument).msFullscreenElement
      )
      setIsFullscreen(isFS)
    }
    
    checkFullscreen()
    document.addEventListener('fullscreenchange', checkFullscreen)
    document.addEventListener('webkitfullscreenchange', checkFullscreen)
    document.addEventListener('mozfullscreenchange', checkFullscreen)
    
    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreen)
      document.removeEventListener('webkitfullscreenchange', checkFullscreen)
      document.removeEventListener('mozfullscreenchange', checkFullscreen)
    }
  }, [])

  useEffect(() => {
    const shouldKeepScreenAwake = Boolean(
      exam &&
      exam.questions &&
      exam.questions.length > 0 &&
      examStartTime &&
      !submitting,
    )

    if (!shouldKeepScreenAwake) {
      void releaseWakeLock()
      return
    }

    const syncWakeLock = () => {
      if (document.visibilityState === 'visible') {
        void requestWakeLock()
        return
      }
      void releaseWakeLock()
    }

    syncWakeLock()
    document.addEventListener('visibilitychange', syncWakeLock)

    return () => {
      document.removeEventListener('visibilitychange', syncWakeLock)
      void releaseWakeLock()
    }
  }, [exam, examStartTime, releaseWakeLock, requestWakeLock, submitting])

  useEffect(() => {
    const updateNetworkStatus = () => {
      setNetworkStatus(getNetworkStatusBadge())
    }

    updateNetworkStatus()

    const connection = getNavigatorConnection()
    window.addEventListener('online', updateNetworkStatus)
    window.addEventListener('offline', updateNetworkStatus)
    connection?.addEventListener?.('change', updateNetworkStatus)

    const fallbackPoller = window.setInterval(updateNetworkStatus, 10000)

    return () => {
      window.removeEventListener('online', updateNetworkStatus)
      window.removeEventListener('offline', updateNetworkStatus)
      connection?.removeEventListener?.('change', updateNetworkStatus)
      window.clearInterval(fallbackPoller)
    }
  }, [])
  
  const enterFullscreen = async () => {
    if (!requiresFullscreen) {
      setIsFullscreen(true)
      return
    }
    const elem = document.documentElement
    const fullscreenElem = elem as FullscreenElement
    try {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen()
      } else if (fullscreenElem.webkitRequestFullscreen) {
        await fullscreenElem.webkitRequestFullscreen()
      } else if (fullscreenElem.mozRequestFullScreen) {
        await fullscreenElem.mozRequestFullScreen()
      } else if (fullscreenElem.msRequestFullscreen) {
        await fullscreenElem.msRequestFullscreen()
      }
      setIsFullscreen(true)
    } catch (err) {
      console.error('Fullscreen error:', err)
      toast.error('Gagal masuk fullscreen otomatis. Izinkan fullscreen lalu coba lagi.')
    }
  }

  // Setup lockdown when exam is loaded AND fullscreen is active
  useEffect(() => {
    if (
      exam &&
      exam.questions &&
      exam.questions.length > 0 &&
      !loading &&
      (isFullscreen || !requiresFullscreen) &&
      !hasStartedRef.current
    ) {
      hasStartedRef.current = true
      setupLockdown()
      startTimer()
    }
  }, [exam, loading, isFullscreen, requiresFullscreen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupLockdown()
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
      if (progressSyncTimeoutRef.current) {
        clearTimeout(progressSyncTimeoutRef.current)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const hasAutoSubmitted = useRef(false)
  const suppressNextFullscreenViolationRef = useRef(false)

  const buildFormattedAnswers = useCallback(
    (answerSource: StudentExamAnswers) => {
      const formattedAnswers: StudentExamAnswers = {}
      exam?.questions.forEach(q => {
        formattedAnswers[q.id] = answerSource[q.id] ?? null
      })
      formattedAnswers.__monitoring = {
        ...monitoringStatsRef.current,
      }
      return formattedAnswers
    },
    [exam],
  )

  const buildSyncFingerprint = useCallback((formattedAnswers: StudentExamAnswers) => {
    const monitoring =
      formattedAnswers.__monitoring && typeof formattedAnswers.__monitoring === 'object'
        ? { ...(formattedAnswers.__monitoring as Record<string, unknown>) }
        : null
    if (monitoring) {
      delete monitoring.lastSyncAt
    }
    const normalized = monitoring
      ? { ...formattedAnswers, __monitoring: monitoring }
      : formattedAnswers
    return JSON.stringify(normalized)
  }, [])

  const syncProgressInBackground = useCallback(
    async (answerSource: StudentExamAnswers, options?: { force?: boolean }) => {
      if (!id || !user || !exam || submitting || hasAutoSubmitted.current) return
      const nowMs = Date.now()
      if (!options?.force && nowMs - lastProgressSyncAtRef.current < MIN_PROGRESS_SYNC_GAP_MS) {
        return
      }

      const formattedAnswers = buildFormattedAnswers(answerSource)
      const syncFingerprint = buildSyncFingerprint(formattedAnswers)
      if (!options?.force && syncFingerprint === lastSyncedFingerprintRef.current) {
        hasDirtyProgressRef.current = false
        return
      }

      try {
        await api.post(`/exams/${id}/answers`, {
          student_id: user.id,
          answers: formattedAnswers,
          finish: false,
          is_final_submit: false,
        })
        lastProgressSyncAtRef.current = Date.now()
        lastSyncedFingerprintRef.current = syncFingerprint
        hasDirtyProgressRef.current = false
        monitoringStatsRef.current = {
          ...monitoringStatsRef.current,
          lastSyncAt: new Date().toISOString(),
        }
      } catch {
        // Silent: jangan ganggu siswa saat ujian berjalan
        hasDirtyProgressRef.current = true
      }
    },
    [id, user, exam, submitting, buildFormattedAnswers, buildSyncFingerprint],
  )

  const queueProgressSync = useCallback(
    (answerSource: StudentExamAnswers, delay = DEFAULT_PROGRESS_SYNC_DELAY_MS, options?: { force?: boolean }) => {
      hasDirtyProgressRef.current = true
      if (progressSyncTimeoutRef.current) {
        clearTimeout(progressSyncTimeoutRef.current)
      }
      progressSyncTimeoutRef.current = setTimeout(() => {
        syncProgressInBackground(answerSource, options)
      }, delay)
    },
    [syncProgressInBackground],
  )

  const syncCurrentQuestionProgress = useCallback(
    (nextQuestionIndex: number, answerSource?: StudentExamAnswers) => {
      const question = exam?.questions?.[nextQuestionIndex]
      monitoringStatsRef.current = {
        ...monitoringStatsRef.current,
        currentQuestionIndex: nextQuestionIndex,
        currentQuestionNumber: nextQuestionIndex + 1,
        currentQuestionId: question?.id || null,
      }
      queueProgressSync(answerSource ?? answers, FAST_PROGRESS_SYNC_DELAY_MS)
    },
    [exam, answers, queueProgressSync],
  )

  useEffect(() => {
    if (!examStartTime || !exam) return
    syncCurrentQuestionProgress(currentQuestionIndex)
  }, [examStartTime, exam, currentQuestionIndex, syncCurrentQuestionProgress])

  useEffect(() => {
    if (!examStartTime || !exam || hasAutoSubmitted.current) return
    let cancelled = false
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

    const scheduleNextHeartbeat = () => {
      if (cancelled) return
      heartbeatTimer = setTimeout(() => {
        if (cancelled) return
        if (
          hasDirtyProgressRef.current &&
          !document.hidden &&
          (typeof navigator === 'undefined' || navigator.onLine)
        ) {
          void syncProgressInBackground(answersRef.current)
        }
        scheduleNextHeartbeat()
      }, getHeartbeatProgressSyncDelayMs())
    }

    scheduleNextHeartbeat()

    return () => {
      cancelled = true
      if (heartbeatTimer) {
        clearTimeout(heartbeatTimer)
      }
    }
  }, [examStartTime, exam, syncProgressInBackground])

  const handleAutoSubmit = useCallback(async (reason: string) => {
    // Prevent multiple auto-submits
    if (hasAutoSubmitted.current || submitting) {
      return
    }
    
    hasAutoSubmitted.current = true
    
    // Cleanup lockdown immediately (preserve fullscreen until submit flow completes)
    cleanupLockdown({ preserveFullscreen: true })
    
    // Show notification
    toast.error(`Ujian otomatis disubmit: ${reason}`, { duration: 3000 })
    
    setSubmitting(true)

    const formattedAnswers = buildFormattedAnswers(answers)

    try {
      await api.post(
        `/exams/${id}/answers`,
        {
          student_id: user?.id,
          answers: formattedAnswers,
          is_final_submit: true,
          force_submit: true,
        }
      )
      
      // Navigate immediately regardless of response
      await ensureExitFullscreen()
      await new Promise((resolve) => setTimeout(resolve, 120))
      await ensureExitFullscreen()
      try {
        sessionStorage.setItem('just_submitted_exam_id', String(id))
      } catch {
        // Ignore sessionStorage failures during forced navigation.
      }
      const returnRoute = sessionStorage.getItem('last_exam_route') || baseExamRoute
      navigate(returnRoute, { replace: true })
    } catch (error: unknown) {
      console.error('Error auto-submitting:', error)
      // Still navigate even if submit fails
      await ensureExitFullscreen()
      await new Promise((resolve) => setTimeout(resolve, 120))
      await ensureExitFullscreen()
      const returnRoute = sessionStorage.getItem('last_exam_route') || baseExamRoute
      navigate(returnRoute, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting, answers, id, navigate, buildFormattedAnswers])

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining <= 0 && examStartTime && !hasAutoSubmitted.current) {
      handleAutoSubmit('Waktu habis')
    }
  }, [timeRemaining, examStartTime, handleAutoSubmit])

  // Auto-submit on 4th violation
  useEffect(() => {
    const effectiveViolations = Math.max(violations, monitoringStatsRef.current.totalViolations)
    if (effectiveViolations >= 4 && examStartTime && !hasAutoSubmitted.current) {
      handleAutoSubmit('Terlalu banyak pelanggaran')
    }
  }, [violations, examStartTime, handleAutoSubmit])

  const fetchExam = async (options?: { background?: boolean }) => {
    const isBackgroundRefresh = options?.background === true
    try {
      if (!isBackgroundRefresh) {
        setLoading(true)
      }
      if (!user) return

      // Use the startExam endpoint which includes validation
      // Add timestamp to prevent caching + force fresh data
      const response = await api.get(
        `/exams/${id}/start?student_id=${user.id}&_t=${Date.now()}`,
        { 
          headers: { 
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          } 
        }
      )

      if (response.data.success) {
        const examData = response.data.data
        const initialProctorWarning = normalizeProctorWarning((examData as { proctorWarning?: unknown }).proctorWarning)
        if (initialProctorWarning) {
          setActiveProctorWarning(initialProctorWarning)
          if (initialProctorWarning.id !== latestHandledProctorWarningIdRef.current) {
            handleIncomingProctorWarning(initialProctorWarning)
          }
        }
        
        // Check if exam is already completed/submitted
	        if (examData.session && (examData.session.status === 'COMPLETED' || examData.session.status === 'GRADED')) {
	           try {
               await ensureExitFullscreen()
	             sessionStorage.setItem('just_submitted_exam_id', String(id))
	           } catch {
	             // Ignore sessionStorage failures during redirect.
	           }
	           const returnRoute = sessionStorage.getItem('last_exam_route') || baseExamRoute
	           navigate(returnRoute, { replace: true })
	           return
        }

        // Handle wrapper structure from backend (session + packet)
        const packet = examData.packet || examData
        let restoredQuestionIndex = currentQuestionIndex
        const existingSessionAnswers = (examData.session?.answers && typeof examData.session.answers === 'object')
          ? { ...(examData.session.answers as Record<string, unknown>) }
          : null;

        if (existingSessionAnswers) {
          const monitoring = existingSessionAnswers.__monitoring;
          if (monitoring && typeof monitoring === 'object') {
            const monitoringPayload = monitoring as Partial<MonitoringStats>;
            const normalizedStats = {
              totalViolations: Number(monitoringPayload.totalViolations || 0),
              tabSwitchCount: Number(monitoringPayload.tabSwitchCount || 0),
              fullscreenExitCount: Number(monitoringPayload.fullscreenExitCount || 0),
              appSwitchCount: Number(monitoringPayload.appSwitchCount || 0),
              lastViolationType: monitoringPayload.lastViolationType ? String(monitoringPayload.lastViolationType) : null,
              lastViolationAt: monitoringPayload.lastViolationAt ? String(monitoringPayload.lastViolationAt) : null,
              currentQuestionIndex: Number.isFinite(Number(monitoringPayload.currentQuestionIndex))
                ? Number(monitoringPayload.currentQuestionIndex)
                : 0,
              currentQuestionNumber: Number.isFinite(Number(monitoringPayload.currentQuestionNumber))
                ? Number(monitoringPayload.currentQuestionNumber)
                : 1,
              currentQuestionId: monitoringPayload.currentQuestionId ? String(monitoringPayload.currentQuestionId) : null,
              lastSyncAt: monitoringPayload.lastSyncAt ? String(monitoringPayload.lastSyncAt) : null,
            }
            const mergedStats = {
              totalViolations: Math.max(
                normalizedStats.totalViolations,
                monitoringStatsRef.current.totalViolations,
                violationsRef.current,
              ),
              tabSwitchCount: Math.max(normalizedStats.tabSwitchCount, monitoringStatsRef.current.tabSwitchCount),
              fullscreenExitCount: Math.max(
                normalizedStats.fullscreenExitCount,
                monitoringStatsRef.current.fullscreenExitCount,
              ),
              appSwitchCount: Math.max(normalizedStats.appSwitchCount, monitoringStatsRef.current.appSwitchCount),
              lastViolationType:
                normalizedStats.lastViolationType || monitoringStatsRef.current.lastViolationType || null,
              lastViolationAt: normalizedStats.lastViolationAt || monitoringStatsRef.current.lastViolationAt || null,
              currentQuestionIndex: Number.isFinite(normalizedStats.currentQuestionIndex)
                ? normalizedStats.currentQuestionIndex
                : monitoringStatsRef.current.currentQuestionIndex,
              currentQuestionNumber: Number.isFinite(normalizedStats.currentQuestionNumber)
                ? normalizedStats.currentQuestionNumber
                : monitoringStatsRef.current.currentQuestionNumber,
              currentQuestionId: normalizedStats.currentQuestionId || monitoringStatsRef.current.currentQuestionId || null,
              lastSyncAt: normalizedStats.lastSyncAt || monitoringStatsRef.current.lastSyncAt || null,
            }
            monitoringStatsRef.current = mergedStats
            setViolations(mergedStats.totalViolations)
            restoredQuestionIndex = Number.isFinite(mergedStats.currentQuestionIndex)
              ? mergedStats.currentQuestionIndex
              : restoredQuestionIndex
          }
          delete existingSessionAnswers.__monitoring;
          setAnswers(existingSessionAnswers as StudentExamAnswers);
        }
        
        // Normalize questions
        let questions = packet.questions;
        if (typeof questions === 'string') {
          try {
            questions = JSON.parse(questions);
          } catch (e) {
            console.error('Failed to parse questions JSON:', e);
            questions = [];
          }
        }

        if (questions && Array.isArray(questions)) {
          packet.questions = questions
            .filter((q: Record<string, unknown>) => q)
            .map((q: Record<string, unknown>) => ({
              ...q,
              question_text: q.question_text || q.content,
              question_type: q.question_type || q.type,
              matrixPromptColumns: Array.isArray(q.matrixPromptColumns)
                ? q.matrixPromptColumns
                : Array.isArray(q.matrix_prompt_columns)
                  ? q.matrix_prompt_columns
                  : [],
              matrixColumns: Array.isArray(q.matrixColumns)
                ? q.matrixColumns
                : Array.isArray(q.matrix_columns)
                  ? q.matrix_columns
                  : [],
              matrixRows: Array.isArray(q.matrixRows)
                ? q.matrixRows
                : Array.isArray(q.matrix_rows)
                  ? q.matrix_rows
                  : [],
              options: Array.isArray(q.options)
                ? q.options.map((opt: Record<string, unknown>) => ({
                    ...opt,
                    option_text: opt.option_text || opt.content
                  }))
                : []
            }));
        } else {
          packet.questions = []
        }

        restoredQuestionIndex = resolveRestoredQuestionIndex({
          questions: Array.isArray(packet.questions) ? packet.questions : [],
          rawSessionAnswers: examData.session?.answers,
          fallbackIndex: restoredQuestionIndex,
        })

        // Validate duration
        if (!packet.duration || packet.duration <= 0) {
          console.warn('Invalid duration, defaulting to 60 mins');
          packet.duration = 60;
        }

        setExam(packet)
        setCurrentQuestionIndex(restoredQuestionIndex)
        
        // Calculate remaining time based on session start time
        if (examData.session && examData.session.startTime) {
          const startTime = new Date(examData.session.startTime).getTime();
          const durationMs = packet.duration * 60 * 1000;
          const now = Date.now();
          const elapsedMs = now - startTime;
          const remainingSeconds = Math.max(0, Math.floor((durationMs - elapsedMs) / 1000));
           
           setTimeRemaining(remainingSeconds);
           endTimeRef.current = startTime + durationMs;
         } else {
           setTimeRemaining(packet.duration * 60) // Fallback
           endTimeRef.current = Date.now() + (packet.duration * 60 * 1000);
         }
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      console.error('❌ Error fetching exam:', apiError.response?.data || error)
      const errorMessage = apiError.response?.data?.message || 'Gagal memuat ujian'
      if (isBackgroundRefresh) {
        toast.error(errorMessage)
        return
      }
      fetchedExamKeyRef.current = null
      toast.error(errorMessage)
      navigate(baseExamRoute)
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false)
      }
    }
  }

  const getActiveFullscreenElement = (): Element | null => {
    return (
      document.fullscreenElement ||
      (document as FullscreenDocument).webkitFullscreenElement ||
      (document as FullscreenDocument).mozFullScreenElement ||
      (document as FullscreenDocument).msFullscreenElement ||
      null
    )
  }

  const isDocumentFullscreen = () => Boolean(getActiveFullscreenElement())

  const setupLockdown = () => {
    // Fullscreen already requested from button click
    // Just setup event listeners

    // Prevent context menu
    document.addEventListener('contextmenu', preventContextMenu)
    
    // Prevent keyboard shortcuts
    window.addEventListener('keydown', preventKeyboardShortcuts, true)
    
    // Detect fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)
    
    // Detect visibility changes (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // Detect window blur (switching to other apps)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    window.addEventListener('focusout', handleWindowBlur)
    
    // Prevent copy/paste
    document.addEventListener('copy', preventCopyPaste)
    document.addEventListener('paste', preventCopyPaste)
    document.addEventListener('cut', preventCopyPaste)
    
    // Disable text selection
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'

    focusMonitorIntervalRef.current = setInterval(() => {
      if (!examStartTime || submitting || hasAutoSubmitted.current) return
      const hidden = document.hidden || document.visibilityState === 'hidden'
      const hasFocus = typeof document.hasFocus === 'function' ? document.hasFocus() : true
      const lostFocus = hidden || !hasFocus

      if (lostFocus && !lastFocusLossObservedRef.current) {
        const now = Date.now()
        const recentlyBlurred = now - lastWindowBlurAtRef.current < 1500
        recordViolation(
          hidden
            ? (recentlyBlurred ? 'Alt+Tab / berpindah aplikasi' : 'Berpindah tab')
            : 'Berpindah aplikasi',
        )
      }

      lastFocusLossObservedRef.current = lostFocus
    }, 700)
  }

  const cleanupLockdown = (options?: { preserveFullscreen?: boolean }) => {
    document.removeEventListener('contextmenu', preventContextMenu)
    window.removeEventListener('keydown', preventKeyboardShortcuts, true)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('pagehide', handlePageHide)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('focus', handleWindowFocus)
    window.removeEventListener('focusout', handleWindowBlur)
    document.removeEventListener('copy', preventCopyPaste)
    document.removeEventListener('paste', preventCopyPaste)
    document.removeEventListener('cut', preventCopyPaste)

    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
      blurViolationTimeoutRef.current = null
    }

    if (focusMonitorIntervalRef.current) {
      clearInterval(focusMonitorIntervalRef.current)
      focusMonitorIntervalRef.current = null
    }

    lastFocusLossObservedRef.current = false
    
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
    
    if (!options?.preserveFullscreen) {
      void exitFullscreen()
    }
  }

  const requestFullscreen = () => {
    if (!requiresFullscreen) return
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
        recordViolation('Gagal masuk fullscreen')
      })
    } else if ((elem as FullscreenElement).webkitRequestFullscreen) {
      (elem as FullscreenElement).webkitRequestFullscreen?.()
    } else if ((elem as FullscreenElement).mozRequestFullScreen) {
      (elem as FullscreenElement).mozRequestFullScreen?.()
    } else if ((elem as FullscreenElement).msRequestFullscreen) {
      (elem as FullscreenElement).msRequestFullscreen?.()
    }
  }

  const exitFullscreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen()
      } else if ((document as FullscreenDocument).webkitExitFullscreen) {
        await Promise.resolve((document as FullscreenDocument).webkitExitFullscreen?.())
      } else if ((document as FullscreenDocument).mozCancelFullScreen) {
        await Promise.resolve((document as FullscreenDocument).mozCancelFullScreen?.())
      } else if ((document as FullscreenDocument).msExitFullscreen) {
        await Promise.resolve((document as FullscreenDocument).msExitFullscreen?.())
      }
    } catch {
      // Ignore browser-specific fullscreen exit failures.
    }
  }

  const ensureExitFullscreen = async () => {
    if (!requiresFullscreen || !isDocumentFullscreen()) {
      setIsFullscreen(false)
      return
    }

    await exitFullscreen()

    await new Promise<void>((resolve) => {
      let settled = false
      const done = () => {
        if (settled) return
        settled = true
        document.removeEventListener('fullscreenchange', handleChange)
        document.removeEventListener('webkitfullscreenchange', handleChange)
        document.removeEventListener('mozfullscreenchange', handleChange)
        document.removeEventListener('MSFullscreenChange', handleChange)
        clearTimeout(fallbackTimer)
        resolve()
      }

      const handleChange = () => {
        if (!isDocumentFullscreen()) {
          done()
        }
      }

      const fallbackTimer = setTimeout(done, 1200)
      document.addEventListener('fullscreenchange', handleChange)
      document.addEventListener('webkitfullscreenchange', handleChange)
      document.addEventListener('mozfullscreenchange', handleChange)
      document.addEventListener('MSFullscreenChange', handleChange)

      if (!isDocumentFullscreen()) {
        done()
      }
    })

    setIsFullscreen(false)
  }

  const preventContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    return false
  }

  const preventKeyboardShortcuts = (e: KeyboardEvent) => {
    const normalizedKey = String(e.key || '').toLowerCase()
    
    // Prevent F11, Esc, Ctrl+W, Ctrl+T, Alt+Tab, etc.
    const forbiddenKeys = [
      'F11', 'Escape', 'F5', 'F12',
      'PrintScreen', 'Home', 'End'
    ]
    
    const forbiddenCombos = [
      e.ctrlKey && normalizedKey === 'w', // Close tab
      e.ctrlKey && normalizedKey === 't', // New tab
      e.ctrlKey && normalizedKey === 'tab', // Switch tab
      e.ctrlKey && e.shiftKey && normalizedKey === 'tab', // Previous tab
      e.ctrlKey && normalizedKey === 'n', // New window
      e.ctrlKey && e.shiftKey && normalizedKey === 'n', // New incognito
      e.ctrlKey && normalizedKey === 'r', // Refresh
      e.ctrlKey && normalizedKey === 'l', // Focus address bar
      e.ctrlKey && e.shiftKey && normalizedKey === 'i', // Dev tools
      e.ctrlKey && e.shiftKey && normalizedKey === 'j', // Dev tools
      e.ctrlKey && e.shiftKey && normalizedKey === 'c', // Inspect
      e.ctrlKey && normalizedKey === 'u', // View source
      e.ctrlKey && normalizedKey === 's', // Save
      e.ctrlKey && normalizedKey === 'p', // Print
      e.altKey && normalizedKey === 'tab', // Switch app
      e.altKey && normalizedKey === 'd', // Focus address bar
      e.altKey && normalizedKey === 'space', // Window menu
      e.altKey && normalizedKey === 'f4', // Close window
      e.metaKey && normalizedKey === 'w', // Mac close
      e.metaKey && normalizedKey === 't', // Mac new tab
      e.metaKey && normalizedKey === 'n', // Mac new window
      e.metaKey && normalizedKey === 'r', // Mac refresh
      e.metaKey && normalizedKey === 'p', // Mac print
      e.metaKey && normalizedKey === 'l', // Mac address bar
    ]

    if (forbiddenKeys.includes(e.key) || forbiddenCombos.some(combo => combo)) {
      e.preventDefault()
      e.stopPropagation()
      recordViolation(`Tombol terlarang: ${e.key}`)
      return false
    }
  }

  const preventCopyPaste = (e: Event) => {
    e.preventDefault()
    recordViolation('Copy/Paste tidak diizinkan')
    return false
  }

  const handleFullscreenChange = () => {
    if (!requiresFullscreen) return
    const activeFullscreenElement = getActiveFullscreenElement()
    const isCurrentlyFullscreen = Boolean(activeFullscreenElement)
    setIsFullscreen(isCurrentlyFullscreen)

    if (submitting || hasAutoSubmitted.current) {
      return
    }

    if (activeFullscreenElement && activeFullscreenElement !== document.documentElement) {
      suppressNextFullscreenViolationRef.current = true
      recordViolation('Fullscreen video tidak diizinkan')
      toast.error('Fullscreen video dinonaktifkan saat ujian.')
      void exitFullscreen().finally(() => {
        if (requiresFullscreen) {
          setTimeout(() => {
            requestFullscreen()
          }, 100)
        }
      })
      return
    }

    if (!isCurrentlyFullscreen && (examStartTime || hasStartedRef.current)) {
      if (suppressNextFullscreenViolationRef.current) {
        suppressNextFullscreenViolationRef.current = false
        if (requiresFullscreen) {
          setTimeout(() => {
            requestFullscreen()
          }, 100)
        }
        return
      }
      recordViolation('Keluar dari fullscreen')
      // Try to re-enter fullscreen
      setTimeout(() => {
        requestFullscreen()
      }, 100)
    }
  }

  const handleVisibilityChange = () => {
    if (!examStartTime || !document.hidden) return
    const now = Date.now()
    const recentlyBlurred = now - lastWindowBlurAtRef.current < 1200
    recordViolation(recentlyBlurred ? 'Alt+Tab / berpindah aplikasi' : 'Berpindah tab')
  }

  const handlePageHide = () => {
    if (!examStartTime || submitting || hasAutoSubmitted.current) return
    recordViolation('Meninggalkan halaman ujian')
  }

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!examStartTime || submitting || hasAutoSubmitted.current) return
    event.preventDefault()
    event.returnValue = ''
  }

  const handleWindowFocus = () => {
    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
      blurViolationTimeoutRef.current = null
    }
    lastFocusLossObservedRef.current = false
  }

  const handleWindowBlur = () => {
    if (!examStartTime) return
    lastWindowBlurAtRef.current = Date.now()
    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
    }
    // Delay short time: if tab becomes hidden immediately after blur,
    // visibilitychange handler will classify it as Alt+Tab/tab switch.
    // Fallback di bawah menangani browser yang event visibilitychange-nya tidak konsisten.
    blurViolationTimeoutRef.current = setTimeout(() => {
      const stillNotFocused = typeof document.hasFocus === 'function' ? !document.hasFocus() : true
      if (stillNotFocused) {
        recordViolation(document.hidden ? 'Alt+Tab / berpindah aplikasi' : 'Berpindah aplikasi')
      }
      blurViolationTimeoutRef.current = null
    }, 180)
  }

  const recordViolation = (type: string) => {
    const normalizedType = type.toLowerCase()
    const isAppSwitchViolation =
      normalizedType.includes('alt+tab') ||
      normalizedType.includes('aplikasi') ||
      normalizedType.includes('window blur')
    const isTabSwitchViolation = !isAppSwitchViolation && normalizedType.includes('tab')
    const isFullscreenOrShortcut = normalizedType.includes('fullscreen') || normalizedType.includes('tombol terlarang')

    // Grace period: only for soft signals (tab/app) to avoid false positives right after exam starts
    if (!isFullscreenOrShortcut && examStartTime && (new Date().getTime() - examStartTime.getTime()) < 1000) {
      return;
    }

    const fingerprintKey = normalizedType.includes('fullscreen')
      ? 'fullscreen'
      : isAppSwitchViolation
        ? 'app'
        : isTabSwitchViolation
          ? 'tab'
          : normalizedType.includes('tombol terlarang')
            ? `shortcut:${normalizedType}`
            : normalizedType
    const nowMs = Date.now()
    if (
      lastViolationFingerprintRef.current &&
      lastViolationFingerprintRef.current.key === fingerprintKey &&
      nowMs - lastViolationFingerprintRef.current.at < 700
    ) {
      return
    }
    lastViolationFingerprintRef.current = { key: fingerprintKey, at: nowMs }

    setViolations(prev => {
      const newCount = prev + 1
      const nextStats = {
        ...monitoringStatsRef.current,
        totalViolations: newCount,
        lastViolationType: type,
        lastViolationAt: new Date().toISOString(),
      }
      if (isAppSwitchViolation) {
        nextStats.appSwitchCount += 1
      } else if (isTabSwitchViolation) {
        nextStats.tabSwitchCount += 1
      } else if (normalizedType.includes('fullscreen')) {
        nextStats.fullscreenExitCount += 1
      }
      monitoringStatsRef.current = nextStats
      
      setLastViolationType(type)
      setShowViolationWarning(true)

      // Auto-hide warning after 5 seconds
      if (violationTimeoutRef.current) {
        clearTimeout(violationTimeoutRef.current)
      }
      violationTimeoutRef.current = setTimeout(() => {
        setShowViolationWarning(false)
      }, 5000)

      // Show toast
      if (newCount < 4) {
        toast.error(`Pelanggaran ${newCount}/3: ${type}`, {
          duration: 5000,
          icon: '⚠️'
        })
      } else {
        toast.error(`PELANGGARAN KE-4! Ujian akan disubmit otomatis!`, {
          duration: 5000,
          icon: '🚨'
        })
      }
      queueProgressSync(answers, FAST_PROGRESS_SYNC_DELAY_MS)

      return newCount
    })
  }

  const startTimer = () => {
    setExamStartTime(new Date())
    
    timerIntervalRef.current = setInterval(() => {
      if (endTimeRef.current) {
        const remaining = Math.max(0, Math.floor((endTimeRef.current - Date.now()) / 1000));
        setTimeRemaining(remaining)
        
        if (remaining <= 0) {
           if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
        }
      } else {
        setTimeRemaining(prev => {
          if (prev <= 0) {
            if (timerIntervalRef.current) {
              clearInterval(timerIntervalRef.current)
            }
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)
  }

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  const getTimeColor = () => {
    if (timeRemaining <= 180) return 'border-red-200 bg-red-50 text-red-600 animate-pulse'
    if (timeRemaining <= 600) return 'border-amber-200 bg-amber-50 text-amber-600'
    return 'border-emerald-200 bg-emerald-50 text-emerald-600'
  }

  const handleRefreshExam = async () => {
    if (submitting || loading || isRefreshingExam) return

    setIsRefreshingExam(true)
    try {
      await syncProgressInBackground(answersRef.current, { force: true })
      await fetchExam({ background: true })
      toast.success('Data ujian diperbarui')
    } finally {
      setIsRefreshingExam(false)
    }
  }

  const handleAnswerChange = (questionId: string, answer: StudentExamAnswerValue, isComplex: boolean = false) => {
    setAnswers(prev => {
      let nextAnswers: StudentExamAnswers = prev
      if (isComplex) {
        // Handle Complex Multiple Choice (Array of IDs)
        const currentAnswers = (prev[questionId] as string[]) || [];
        const answerId = answer as string;
        
        if (currentAnswers.includes(answerId)) {
          // Remove if exists
          nextAnswers = {
            ...prev,
            [questionId]: currentAnswers.filter(id => id !== answerId)
          };
          queueProgressSync(nextAnswers);
          return nextAnswers;
        } else {
          // Add if not exists
          nextAnswers = {
            ...prev,
            [questionId]: [...currentAnswers, answerId]
          };
          queueProgressSync(nextAnswers);
          return nextAnswers;
        }
      }
      
      // Simple Multiple Choice / Essay
      nextAnswers = {
        ...prev,
        [questionId]: answer
      };
      queueProgressSync(nextAnswers);
      return nextAnswers;
    });
  }

  const handleMatrixAnswerChange = (questionId: string, rowId: string, columnId: string) => {
    setAnswers(prev => {
      const currentValue =
        prev[questionId] && typeof prev[questionId] === 'object' && !Array.isArray(prev[questionId])
          ? { ...(prev[questionId] as Record<string, unknown>) }
          : {}
      const nextAnswers = {
        ...prev,
        [questionId]: {
          ...currentValue,
          [rowId]: columnId,
        },
      }
      queueProgressSync(nextAnswers)
      return nextAnswers
    })
  }

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1)
    }
  }

  const handleNextQuestion = () => {
    if (exam && currentQuestionIndex < exam.questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1)
    }
  }

  const handleQuestionNavigation = (index: number) => {
    setCurrentQuestionIndex(index)
  }

  const handleSubmitClick = () => {
    if (answeredCount < totalQuestions) {
      toast.error(
        `Masih ada ${totalQuestions - answeredCount} soal belum dijawab. Jawab semua soal sebelum mengumpulkan ujian.`,
      )
      return
    }
    setShowSubmitConfirm(true)
  }

  const handleConfirmSubmit = async () => {
    setShowSubmitConfirm(false)
    await submitExam()
  }

  const submitExam = async () => {
    // Prevent double submit
    if (submitting || hasAutoSubmitted.current) return
    if (answeredCount < totalQuestions) {
      toast.error(
        `Masih ada ${totalQuestions - answeredCount} soal belum dijawab. Jawab semua soal sebelum mengumpulkan ujian.`,
      )
      return
    }

    // Set auto-submitted flag to prevent other submissions
    hasAutoSubmitted.current = true

    try {
      setSubmitting(true)

      // Format answers
      const formattedAnswers = buildFormattedAnswers(answers)

      const response = await api.post(
        `/exams/${id}/answers`,
        {
          student_id: user?.id,
          answers: formattedAnswers,
          is_final_submit: true
        }
      )

      if (response.data.success) {
        cleanupLockdown({ preserveFullscreen: true })
        await ensureExitFullscreen()
        await new Promise((resolve) => setTimeout(resolve, 120))
        await ensureExitFullscreen()
        
        // Immediate navigation without toast as requested by user
        try {
          sessionStorage.setItem('just_submitted_exam_id', String(id))
        } catch {
          // Ignore sessionStorage failures during submit navigation.
        }
        
        const returnRoute = sessionStorage.getItem('last_exam_route') || baseExamRoute
        navigate(returnRoute, { replace: true })
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      console.error('Error submitting exam:', error)
      toast.error(apiError.response?.data?.message || 'Gagal mengumpulkan ujian')
      setSubmitting(false)
    }
  }

  const currentQuestion = exam?.questions?.[currentQuestionIndex] ?? null
  const currentMatrixPromptColumns = normalizeMatrixPromptColumns(currentQuestion)
  const currentMatrixColumns = normalizeMatrixColumns(currentQuestion)
  const currentMatrixRows = normalizeMatrixRows(currentQuestion)
  const currentQuestionHtml = useMemo(
    () =>
      enhanceQuestionHtml(currentQuestion?.question_text || currentQuestion?.content || '', {
        useQuestionImageThumbnail: true,
      }),
    [currentQuestion?.question_text, currentQuestion?.content],
  )
  const optionHtmlById = useMemo(() => {
    const mapped = new Map<string, string>()
    const options = Array.isArray(currentQuestion?.options) ? currentQuestion.options : []
    options.forEach((option) => {
      const optionId = String(option.id ?? '')
      if (!optionId) return
      mapped.set(
        optionId,
        enhanceQuestionHtml(option.option_text || option.content || '', {
          useQuestionImageThumbnail: true,
        }),
      )
    })
    return mapped
  }, [currentQuestion?.options])

  // Fullscreen Gate - MUST enter fullscreen before starting exam
  if (requiresFullscreen && !isFullscreen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-12 h-12 text-red-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Mode Fullscreen Diperlukan
            </h1>
            <p className="text-gray-600">
              Untuk menjaga integritas {examTakeLabel.toLowerCase()}, Anda harus masuk mode fullscreen
            </p>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 text-left">
            <h3 className="font-bold text-yellow-800 mb-2">Peraturan {examTakeLabel}:</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>✓ {examTakeLabel} akan berjalan dalam mode fullscreen</li>
              <li>✓ Jangan keluar dari fullscreen atau buka tab lain</li>
              <li>✓ Anda memiliki 3x kesempatan pelanggaran</li>
              <li>✓ Pelanggaran ke-4 akan otomatis submit {examTakeLabel.toLowerCase()}</li>
            </ul>
          </div>

          <button
            onClick={enterFullscreen}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg mb-4"
          >
            <Shield className="w-6 h-6" />
            Masuk Fullscreen & Mulai {examTakeLabel}
          </button>

          <p className="text-sm text-gray-500">
            Fullscreen akan aktif otomatis setelah tombol di atas ditekan.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading {examTakeLabel.toLowerCase()}...</div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">{examTakeLabel} tidak ditemukan</div>
      </div>
    )
  }

  if (!exam.questions || exam.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-white text-xl mb-4 text-center">Soal {examTakeLabel.toLowerCase()} tidak tersedia atau belum dibuat.</div>
        <button 
          onClick={() => navigate(baseExamRoute)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
        >
          Kembali ke Daftar Tes
        </button>
      </div>
    )
  }

  // Safety check for current question
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center">
        <div className="text-white text-xl mb-4">Terjadi kesalahan memuat soal no {currentQuestionIndex + 1}</div>
         <button 
          onClick={() => navigate(baseExamRoute)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
        >
          Kembali
        </button>
      </div>
    )
  }

  const answeredCount = exam.questions.reduce((count, question) => {
    const questionType = String(question.question_type || question.type || 'MULTIPLE_CHOICE').toUpperCase()
    if (questionType === 'MATRIX_SINGLE_CHOICE') {
      return count + (isMatrixQuestionAnswered(question, answers[question.id]) ? 1 : 0)
    }
    return count + (hasAnsweredValue(answers[question.id]) ? 1 : 0)
  }, 0)
  const totalQuestions = exam.questions.length
  const effectiveViolations = Math.max(violations, monitoringStatsRef.current.totalViolations)
  const networkBadgeStyle = (() => {
    if (networkStatus.quality === 'offline') {
      return 'bg-gray-100 text-gray-700 border-gray-200'
    }
    if (networkStatus.quality === 'lambat') {
      return 'bg-red-50 text-red-700 border-red-100'
    }
    if (networkStatus.quality === 'sedang') {
      return 'bg-yellow-50 text-yellow-700 border-yellow-100'
    }
    return 'bg-green-50 text-green-700 border-green-100'
  })()

  const mediaSection = (
    <>
      {(currentQuestion.question_image_url || currentQuestion.image_url) && (
        <div className="mb-8 flex justify-center">
          <button
            type="button"
            onClick={() => setPreviewImageSrc(currentQuestion.question_image_url || currentQuestion.image_url || '')}
            className="group focus:outline-none"
          >
            <QuestionMediaImage
              src={currentQuestion.question_image_url || currentQuestion.image_url || ''} 
              alt="Question" 
              preferThumbnail
              className="max-w-full max-h-[500px] rounded-lg shadow-sm border border-gray-200 cursor-zoom-in transition-transform group-hover:scale-[1.01]"
            />
          </button>
        </div>
      )}

      {(currentQuestion.question_video_url || currentQuestion.video_url) && (
        <div className="mb-8">
          {(currentQuestion.question_video_url || currentQuestion.video_url || '').includes('youtube') ? (
             <div className="aspect-video rounded-lg overflow-hidden shadow-sm max-w-3xl mx-auto">
                <iframe
                    src={currentQuestion.question_video_url || currentQuestion.video_url || ''}
                    className="w-full h-full"
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                    title="YouTube Video"
                />
            </div>
          ) : (
            <video 
              src={currentQuestion.question_video_url || currentQuestion.video_url || ''} 
              controls 
              controlsList="nofullscreen noremoteplayback nodownload"
              disablePictureInPicture
              onDoubleClick={(event) => event.preventDefault()}
              preload="metadata"
              className="max-w-full max-h-[500px] mx-auto rounded-lg shadow-sm border border-gray-200"
            />
          )}
        </div>
      )}
    </>
  );

  useEffect(() => {
    setPreviewImageZoom(1)
  }, [previewImageSrc])

  return (
    <div className="min-h-screen bg-gray-50 notranslate" translate="no">
      {/* Top Bar - Fixed */}
      <div className="fixed top-0 left-0 right-0 bg-white shadow-lg z-50">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3">
          <div className="flex flex-wrap items-center gap-3 md:gap-4">
            {/* Left: SIS Branding */}
            <div className="min-w-0 flex items-center gap-3 pl-10 lg:pl-14 pr-2 flex-shrink-0">
              <img src="/logo_sis_kgb2.png" alt="Logo SIS" className="w-10 h-10 object-contain flex-shrink-0" />
              <div className="leading-tight flex-shrink-0">
                <div className="text-sm font-bold text-blue-700">Sistem Integrasi Sekolah</div>
                <div className="text-xs text-gray-500">SMKS Karya Guna Bhakti 2</div>
              </div>
            </div>
            <div className="hidden xl:block h-10 w-px bg-gray-200" />
            {/* Center: Exam Info */}
            <div className="min-w-[260px] flex-1 xl:max-w-[46%]">
              <h1 className="text-lg font-bold text-gray-900 truncate">{exam.title}</h1>
              <p className="text-sm text-gray-600 truncate">{exam.subject?.name || 'Mata Pelajaran'}</p>
              {exam.instructions && (
                <div className="mt-1 text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded border border-orange-100 inline-block max-w-full truncate">
                  Note: {exam.instructions}
                </div>
              )}
            </div>

            {/* Right: Timer + Submit */}
            <div className="ml-auto flex items-center gap-2 lg:gap-3 pr-2 sm:pr-10 lg:pr-14 flex-shrink-0">
              <div className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 md:px-4 ${getTimeColor()}`}>
                <Clock className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-base md:text-xl font-bold font-mono">{formatTime(timeRemaining)}</span>
              </div>
              <button
                onClick={handleSubmitClick}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Kumpulkan
              </button>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full h-1 bg-gray-200">
          <div 
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${(answeredCount / totalQuestions) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-36 lg:pt-40 pb-24 max-w-7xl mx-auto px-4 overflow-x-hidden">
        <div className="flex gap-6 items-start">
          {/* Left: Question Area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[60vh]">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRefreshExam}
                    disabled={isRefreshingExam}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                    title="Refresh halaman ujian"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshingExam ? 'animate-spin' : ''}`} />
                  </button>
                  <div className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 ${networkBadgeStyle}`}>
                    {networkStatus.quality === 'offline' ? (
                      <WifiOff className="w-4 h-4" />
                    ) : (
                      <Wifi className="w-4 h-4" />
                    )}
                    <span className="text-xs font-semibold tracking-wide uppercase">{networkStatus.label}</span>
                  </div>
                  <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-4 text-red-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-bold">{effectiveViolations}/3</span>
                    <span className="text-xs">Pelanggaran</span>
                  </div>
                </div>
                <span className="inline-flex h-11 items-center rounded-xl border border-gray-200 bg-gray-50 px-4 font-bold text-gray-600">
                  Soal No. {currentQuestionIndex + 1}
                </span>
              </div>
              <p className="-mt-2 mb-6 text-xs text-slate-500">
                Gunakan tombol refresh bila guru mengubah soal. Refresh data ini tidak dihitung pelanggaran.
              </p>
              {activeProctorWarning ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{activeProctorWarning.title}</p>
                      <p className="mt-1 leading-6">{activeProctorWarning.message}</p>
                      <p className="mt-2 text-xs text-amber-700">
                        {activeProctorWarning.proctorName ? `Dari ${activeProctorWarning.proctorName} • ` : ''}
                        {formatWarningDateTime(activeProctorWarning.warnedAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowProctorWarningModal(true)}
                      className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Lihat Peringatan
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Media (Top - Default) */}
              {(!currentQuestion.question_media_position || currentQuestion.question_media_position === 'top') && mediaSection}

              {/* Question Text */}
              <div 
                className="prose max-w-none text-lg text-gray-800 mb-8 notranslate [&_*]:max-w-full [&_*]:!whitespace-normal [&_*]:break-normal [&_p]:my-3 [&_p]:text-justify [&_div]:my-3 [&_div]:text-justify [&_li]:my-1 [&_li]:text-justify [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:ml-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:ml-2"
                style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                translate="no"
                dangerouslySetInnerHTML={{ __html: currentQuestionHtml }}
              />

              {/* Media (Bottom) */}
              {currentQuestion.question_media_position === 'bottom' && mediaSection}

		              {/* Options */}
		              {currentQuestion.question_type === 'MATRIX_SINGLE_CHOICE' && (
                    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            {currentMatrixPromptColumns.map((column) => (
                              <th
                                key={column.id}
                                className="border-b border-r border-gray-200 px-4 py-3 text-left font-semibold text-slate-700"
                              >
                                {column.label}
                              </th>
                            ))}
                            {currentMatrixColumns.map((column) => (
                              <th
                                key={column.id}
                                className="border-b border-gray-200 px-4 py-3 text-center font-semibold text-slate-700"
                              >
                                {column.content}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {currentMatrixRows.map((row, rowIndex) => {
                            const answerMap =
                              answers[currentQuestion.id] &&
                              typeof answers[currentQuestion.id] === 'object' &&
                              !Array.isArray(answers[currentQuestion.id])
                                ? (answers[currentQuestion.id] as Record<string, unknown>)
                                : {}
                            const selectedColumnId = String(answerMap[row.id] || '')
                            return (
                              <tr key={row.id || `matrix-row-${rowIndex + 1}`} className="bg-white">
                                {currentMatrixPromptColumns.map((column, promptColumnIndex) => (
                                  <td
                                    key={`${row.id}-${column.id}`}
                                    className="border-b border-r border-gray-200 px-4 py-3 align-top text-gray-800"
                                  >
                                    {getMatrixRowCellContent(row, column.id, promptColumnIndex) || '-'}
                                  </td>
                                ))}
                                {currentMatrixColumns.map((column) => {
                                  const selected = selectedColumnId === column.id
                                  return (
                                    <td
                                      key={`${row.id}-${column.id}`}
                                      className={`border-b border-gray-200 px-4 py-3 text-center ${
                                        selected ? 'bg-blue-50/60' : ''
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`question-${currentQuestion.id}-${row.id}`}
                                        value={column.id}
                                        checked={selected}
                                        onChange={() => handleMatrixAnswerChange(currentQuestion.id, row.id, column.id)}
                                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                                      />
                                    </td>
                                  )
                                })}
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

		              {currentQuestion.question_type !== 'ESSAY' && currentQuestion.question_type !== 'MATRIX_SINGLE_CHOICE' && (
		                <div className="space-y-3">
			                  {currentQuestion.options?.map((option) => {
		                    const isComplex = currentQuestion.question_type === 'COMPLEX_MULTIPLE_CHOICE';
                      const optionId = String(option.id ?? '');
                      const optionImageSrc =
                        typeof option.option_image_url === 'string'
                          ? option.option_image_url
                          : typeof option.image_url === 'string'
                            ? option.image_url
                            : null;
	                    const isSelected = isComplex 
	                        ? (answers[currentQuestion.id] as string[] || []).includes(optionId)
	                        : String(answers[currentQuestion.id] ?? '') === optionId;

	                    return (
	                    <label 
	                      key={optionId}
                      className={`
                        flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all hover:bg-gray-50 min-w-0
                        ${isSelected 
                          ? 'border-blue-500 bg-blue-50/50' 
                          : 'border-gray-200'}
                      `}
                    >
                      <div className="flex items-center h-full pt-1">
                        <input
	                          type={isComplex ? "checkbox" : "radio"}
	                          name={`question-${currentQuestion.id}`}
	                          value={optionId}
	                          checked={isSelected}
	                          onChange={() => handleAnswerChange(currentQuestion.id, optionId, isComplex)}
	                          className={`w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 ${isComplex ? 'rounded' : ''}`}
	                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Support both option_text (legacy) and content (new) */}
	                        <div
		                          className="text-gray-700 break-normal notranslate [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:ml-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:ml-2 [&_li]:my-1"
		                          style={{ overflowWrap: 'break-word', wordBreak: 'normal' }}
                            translate="no"
	                          dangerouslySetInnerHTML={{ __html: optionHtmlById.get(optionId) || '' }}
	                        ></div>
	                        {optionImageSrc && (
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => setPreviewImageSrc(optionImageSrc)}
                                className="inline-flex focus:outline-none"
                              >
	                              <QuestionMediaImage
	                                src={optionImageSrc}
	                                alt="Option" 
	                                preferThumbnail
	                                className="max-h-28 rounded border border-gray-200 cursor-zoom-in"
                              />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPreviewImageSrc(optionImageSrc)}
                                className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                              >
                                Perbesar gambar
                              </button>
                            </div>
                        )}
                      </div>
                    </label>
                  )})}
                </div>
              )}

              {/* Essay Input */}
	              {currentQuestion.question_type === 'ESSAY' && (
	                <div>
                  {(() => {
                    const essayValue = answers[currentQuestion.id];
                    const normalizedEssayValue =
                      typeof essayValue === 'string' || typeof essayValue === 'number'
                        ? String(essayValue)
                        : '';
                    return (
	                  <textarea
	                    value={normalizedEssayValue}
	                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
	                    className="w-full h-48 p-4 border border-gray-300 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-700"
	                    placeholder="Tulis jawaban Anda di sini..."
	                  />
                    )
                  })()}
	                </div>
	              )}
            </div>

            {/* Navigation Buttons */}
            <div className="flex justify-between mt-6">
              <button
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
                Sebelumnya
              </button>

              <button
                onClick={handleNextQuestion}
                disabled={currentQuestionIndex === totalQuestions - 1}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm transition-colors"
              >
                Selanjutnya
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Right: Navigation Grid */}
          <div className="w-80 flex-shrink-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <h3 className="font-bold text-gray-900 mb-4">Navigasi Soal</h3>
              
              <div className="grid grid-cols-5 gap-2 mb-6">
                {exam.questions.map((q, idx) => {
                  const questionType = String(q.question_type || q.type || 'MULTIPLE_CHOICE').toUpperCase()
                  const isAnswered =
                    questionType === 'MATRIX_SINGLE_CHOICE'
                      ? isMatrixQuestionAnswered(q, answers[q.id])
                      : hasAnsweredValue(answers[q.id])
                  const isCurrent = idx === currentQuestionIndex
                  
                  return (
                    <button
                      key={q.id}
                      onClick={() => handleQuestionNavigation(idx)}
                      className={`
                        h-10 rounded-lg text-sm font-bold transition-all border
                        ${isCurrent 
                          ? 'bg-blue-600 text-white border-blue-600 ring-1 ring-blue-200' 
                          : isAnswered
                            ? 'bg-green-500 text-white border-green-500'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}
                      `}
                    >
                      {idx + 1}
                    </button>
                  )
                })}
              </div>

              <div className="space-y-3 text-sm text-gray-600 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-sm"></div>
                  <span>Sedang dikerjakan</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
                  <span>Sudah dijawab</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-white border border-gray-300 rounded-sm"></div>
                  <span>Belum dijawab</span>
                </div>
              </div>

              <button
                onClick={handleSubmitClick}
                className="w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                <CheckCircle className="w-5 h-5" />
                Selesai Ujian
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Violation Warning Modal */}
      {showViolationWarning && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-red-500 text-white px-8 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-bounce">
            <AlertTriangle className="w-8 h-8" />
            <div>
              <h3 className="font-bold text-lg">PELANGGARAN TERDETEKSI!</h3>
              <p>{lastViolationType}</p>
            </div>
          </div>
        </div>
      )}

      {showProctorWarningModal && activeProctorWarning ? (
        <div
          className="fixed inset-0 z-[105] flex items-center justify-center bg-slate-900/18 px-4 py-6 backdrop-blur-[1px]"
          onClick={() => setShowProctorWarningModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-amber-100 px-6 py-5">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Peringatan Pengawas
                </div>
                <h3 className="mt-3 text-lg font-bold text-slate-900">{activeProctorWarning.title}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {activeProctorWarning.proctorName ? `Dari ${activeProctorWarning.proctorName}` : 'Pesan resmi dari pengawas ruang'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProctorWarningModal(false)}
                className="rounded-full border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              >
                <span className="sr-only">Tutup peringatan</span>
                ×
              </button>
            </div>
            <div className="px-6 py-5">
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
                {activeProctorWarning.message}
              </div>
              <div className="mt-4 text-xs text-slate-500">
                {formatWarningDateTime(activeProctorWarning.warnedAt)}
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setShowProctorWarningModal(false)}
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                Saya Mengerti
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4" onClick={() => setShowSubmitConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-section-title font-bold text-gray-900 mb-2">Kumpulkan Ujian?</h2>
              <p className="text-gray-600">
                Anda telah menjawab <span className="font-bold text-gray-900">{answeredCount}</span> dari <span className="font-bold text-gray-900">{totalQuestions}</span> soal.
              </p>
              {answeredCount < totalQuestions && (
                <p className="text-red-500 text-sm mt-2 font-medium">
                  Masih ada {totalQuestions - answeredCount} soal yang belum dijawab!
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmSubmit}
                disabled={answeredCount < totalQuestions}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {answeredCount < totalQuestions ? 'Jawab Semua Soal Dulu' : 'Ya, Kumpulkan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewImageSrc && (
        <div
          className="fixed inset-0 z-[110] bg-slate-950/85 flex items-center justify-center p-4"
          onClick={() => setPreviewImageSrc(null)}
        >
          <div className="relative max-w-6xl w-full flex justify-center" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewImageSrc(null)}
              className="absolute right-0 top-0 -mt-12 inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/95 text-slate-700 shadow"
            >
              ✕
            </button>
            <div className="w-full overflow-hidden rounded-2xl border border-white/15 bg-white/95 shadow-2xl">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Preview Gambar Soal</div>
                  <div className="text-xs text-slate-500">Perbesar gambar lalu geser jika ingin melihat detail lain.</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewImageZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))))}
                    disabled={previewImageZoom <= 1}
                    className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Perkecil
                  </button>
                  <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Zoom {Math.round(previewImageZoom * 100)}%
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewImageZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
                    disabled={previewImageZoom >= 3}
                    className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Perbesar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewImageZoom(1)}
                    className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div className="max-h-[80vh] overflow-auto bg-slate-100 p-4">
                <div className="flex min-h-[60vh] min-w-full items-center justify-center">
                  <img
                    src={previewImageSrc}
                    alt="Preview soal"
                    className="rounded-xl border border-slate-200 bg-white"
                    style={{
                      maxWidth: '100%',
                      height: 'auto',
                      transform: `scale(${previewImageZoom})`,
                      transformOrigin: 'center center',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
