import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
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
  CheckCircle
} from 'lucide-react'
import { QuestionMediaImage } from '../../components/common/QuestionMediaImage'
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

type ExamQuestionOption = Record<string, unknown> & {
  id?: string | number
  option_text?: string
  content?: string
  option_image_url?: string | null
  image_url?: string | null
}

interface Question {
  id: string
  question_text: string
  content?: string // Added fallback
  question_type: 'MULTIPLE_CHOICE' | 'ESSAY' | 'TRUE_FALSE' | 'COMPLEX_MULTIPLE_CHOICE'
  type?: 'MULTIPLE_CHOICE' | 'ESSAY' | 'TRUE_FALSE' | 'COMPLEX_MULTIPLE_CHOICE' // Added fallback
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
const HEARTBEAT_PROGRESS_SYNC_INTERVAL_MS = 20000

export default function StudentExamTakePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
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
  
  // Submission
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false)
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
  
  // Get current user
  const { user: contextUser } = useOutletContext<{ user: Record<string, unknown> }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  })
  const user = contextUser || authData?.data

  // Keep ref in sync so async callbacks can read latest value
  useEffect(() => {
    violationsRef.current = violations
  }, [violations])

  useEffect(() => {
    answersRef.current = answers
  }, [answers])

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
      toast.error('Gagal masuk fullscreen. Coba tekan F11 pada keyboard!')
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
    const heartbeat = setInterval(() => {
      if (!hasDirtyProgressRef.current) return
      syncProgressInBackground(answersRef.current)
    }, HEARTBEAT_PROGRESS_SYNC_INTERVAL_MS)
    return () => clearInterval(heartbeat)
  }, [examStartTime, exam, syncProgressInBackground])

  const handleAutoSubmit = useCallback(async (reason: string) => {
    // Prevent multiple auto-submits
    if (hasAutoSubmitted.current || submitting) {
      return
    }
    
    hasAutoSubmitted.current = true
    
    // Cleanup lockdown immediately
    cleanupLockdown()
    
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
          is_final_submit: true
        }
      )
      
      // Navigate immediately regardless of response
      try {
        sessionStorage.setItem('just_submitted_exam_id', String(id))
      } catch {
        // Ignore sessionStorage failures during forced navigation.
      }
      const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
      navigate(returnRoute, { replace: true })
    } catch (error: unknown) {
      console.error('Error auto-submitting:', error)
      // Still navigate even if submit fails
      const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
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

  const fetchExam = async () => {
    try {
      setLoading(true)
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
        
        // Check if exam is already completed/submitted
	        if (examData.session && (examData.session.status === 'COMPLETED' || examData.session.status === 'GRADED')) {
	           try {
	             sessionStorage.setItem('just_submitted_exam_id', String(id))
	           } catch {
	             // Ignore sessionStorage failures during redirect.
	           }
	           const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
	           navigate(returnRoute, { replace: true })
	           return
        }

        // Handle wrapper structure from backend (session + packet)
        const packet = examData.packet || examData
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
          // Helper for randomization
          const shuffleArray = <T,>(array: T[]) => {
            for (let i = array.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
          };

          // 1. Process questions and randomize options
          let processedQuestions = questions
            .filter((q: Record<string, unknown>) => q)
            .map((q: Record<string, unknown>) => ({
              ...q,
              question_text: q.question_text || q.content,
              question_type: q.question_type || q.type,
              options: Array.isArray(q.options) ? shuffleArray(q.options.map((opt: Record<string, unknown>) => ({
                ...opt,
                option_text: opt.option_text || opt.content
              }))) : []
            }));

          // 2. Randomize questions order
          processedQuestions = shuffleArray(processedQuestions);

          packet.questions = processedQuestions;
        } else {
          packet.questions = []
        }

        // Validate duration
        if (!packet.duration || packet.duration <= 0) {
          console.warn('Invalid duration, defaulting to 60 mins');
          packet.duration = 60;
        }

        setExam(packet)
        
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
      fetchedExamKeyRef.current = null
      console.error('❌ Error fetching exam:', apiError.response?.data || error)
      const errorMessage = apiError.response?.data?.message || 'Gagal memuat ujian'
      toast.error(errorMessage)
      navigate('/student/exams')
    } finally {
      setLoading(false)
    }
  }

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
    
    // Detect window blur (switching to other apps)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('focus', handleWindowFocus)
    
    // Prevent copy/paste
    document.addEventListener('copy', preventCopyPaste)
    document.addEventListener('paste', preventCopyPaste)
    document.addEventListener('cut', preventCopyPaste)
    
    // Disable text selection
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }

  const cleanupLockdown = () => {
    document.removeEventListener('contextmenu', preventContextMenu)
    window.removeEventListener('keydown', preventKeyboardShortcuts, true)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('blur', handleWindowBlur)
    window.removeEventListener('focus', handleWindowFocus)
    document.removeEventListener('copy', preventCopyPaste)
    document.removeEventListener('paste', preventCopyPaste)
    document.removeEventListener('cut', preventCopyPaste)

    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
      blurViolationTimeoutRef.current = null
    }
    
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
    
    exitFullscreen()
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

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    } else if ((document as FullscreenDocument).webkitExitFullscreen) {
      (document as FullscreenDocument).webkitExitFullscreen?.()
    } else if ((document as FullscreenDocument).mozCancelFullScreen) {
      (document as FullscreenDocument).mozCancelFullScreen?.()
    } else if ((document as FullscreenDocument).msExitFullscreen) {
      (document as FullscreenDocument).msExitFullscreen?.()
    }
  }

  const preventContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    return false
  }

  const preventKeyboardShortcuts = (e: KeyboardEvent) => {
    
    // Prevent F11, Esc, Ctrl+W, Ctrl+T, Alt+Tab, etc.
    const forbiddenKeys = [
      'F11', 'Escape', 'F5', 'F12',
      'PrintScreen', 'Home', 'End'
    ]
    
    const forbiddenCombos = [
      e.ctrlKey && e.key === 'w', // Close tab
      e.ctrlKey && e.key === 't', // New tab
      e.ctrlKey && e.key === 'n', // New window
      e.ctrlKey && e.shiftKey && e.key === 'n', // New incognito
      e.ctrlKey && e.key === 'r', // Refresh
      e.ctrlKey && e.shiftKey && e.key === 'i', // Dev tools
      e.ctrlKey && e.shiftKey && e.key === 'j', // Dev tools
      e.ctrlKey && e.shiftKey && e.key === 'c', // Inspect
      e.ctrlKey && e.key === 'u', // View source
      e.ctrlKey && e.key === 's', // Save
      e.ctrlKey && e.key === 'p', // Print
      e.altKey && e.key === 'Tab', // Switch app
      e.altKey && e.key === 'F4', // Close window
      e.metaKey && e.key === 'w', // Mac close
      e.metaKey && e.key === 't', // Mac new tab
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
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as FullscreenDocument).webkitFullscreenElement ||
      (document as FullscreenDocument).mozFullScreenElement ||
      (document as FullscreenDocument).msFullscreenElement
    )

    if (!isCurrentlyFullscreen && (examStartTime || hasStartedRef.current)) {
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

  const handleWindowFocus = () => {
    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
      blurViolationTimeoutRef.current = null
    }
  }

  const handleWindowBlur = () => {
    if (!examStartTime) return
    lastWindowBlurAtRef.current = Date.now()
    if (blurViolationTimeoutRef.current) {
      clearTimeout(blurViolationTimeoutRef.current)
    }
    // Delay short time: if tab becomes hidden immediately after blur,
    // visibilitychange handler will classify it as Alt+Tab/tab switch.
    blurViolationTimeoutRef.current = setTimeout(() => {
      if (!document.hidden) {
        recordViolation('Berpindah aplikasi')
      }
      blurViolationTimeoutRef.current = null
    }, 180)
  }

  const recordViolation = (type: string) => {
    const normalizedType = type.toLowerCase()
    const isFullscreenOrShortcut = normalizedType.includes('fullscreen') || normalizedType.includes('tombol terlarang')

    // Grace period: only for soft signals (tab/app) to avoid false positives right after exam starts
    if (!isFullscreenOrShortcut && examStartTime && (new Date().getTime() - examStartTime.getTime()) < 1000) {
      return;
    }

    const fingerprintKey = normalizedType.includes('fullscreen')
      ? 'fullscreen'
      : normalizedType.includes('tab')
        ? 'tab'
        : normalizedType.includes('aplikasi')
          ? 'app'
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
      if (normalizedType.includes('tab')) {
        nextStats.tabSwitchCount += 1
      } else if (normalizedType.includes('fullscreen')) {
        nextStats.fullscreenExitCount += 1
      } else if (normalizedType.includes('aplikasi')) {
        nextStats.appSwitchCount += 1
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
    const percentage = (timeRemaining / (exam!.duration * 60)) * 100
    if (percentage <= 10) return 'text-red-600'
    if (percentage <= 25) return 'text-orange-600'
    return 'text-green-600'
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
    setShowSubmitConfirm(true)
  }

  const handleConfirmSubmit = async () => {
    setShowSubmitConfirm(false)
    await submitExam()
  }

  const submitExam = async () => {
    // Prevent double submit
    if (submitting || hasAutoSubmitted.current) return

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
        cleanupLockdown()
        
        // Immediate navigation without toast as requested by user
        try {
          sessionStorage.setItem('just_submitted_exam_id', String(id))
        } catch {
          // Ignore sessionStorage failures during submit navigation.
        }
        
        const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
        navigate(returnRoute)
      }
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } }
      console.error('Error submitting exam:', error)
      toast.error(apiError.response?.data?.message || 'Gagal mengumpulkan ujian')
      setSubmitting(false)
    }
  }

  const currentQuestion = exam?.questions?.[currentQuestionIndex] ?? null
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
              Untuk menjaga integritas ujian, Anda harus masuk mode fullscreen
            </p>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 text-left">
            <h3 className="font-bold text-yellow-800 mb-2">Peraturan Ujian:</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>✓ Ujian akan berjalan dalam mode fullscreen</li>
              <li>✓ Jangan keluar dari fullscreen atau buka tab lain</li>
              <li>✓ Anda memiliki 3x kesempatan pelanggaran</li>
              <li>✓ Pelanggaran ke-4 akan otomatis submit ujian</li>
            </ul>
          </div>

          <button
            onClick={enterFullscreen}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-2 text-lg mb-4"
          >
            <Shield className="w-6 h-6" />
            Masuk Fullscreen & Mulai Ujian
          </button>

          <p className="text-sm text-gray-500">
            Atau tekan <kbd className="px-2 py-1 bg-gray-200 rounded">F11</kbd> pada keyboard
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading ujian...</div>
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Ujian tidak ditemukan</div>
      </div>
    )
  }

  if (!exam.questions || exam.questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
        <div className="text-white text-xl mb-4 text-center">Soal ujian tidak tersedia atau belum dibuat.</div>
        <button 
          onClick={() => navigate('/student/exams')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
        >
          Kembali ke Daftar Ujian
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
          onClick={() => navigate('/student/exams')}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold"
        >
          Kembali
        </button>
      </div>
    )
  }

  const answeredCount = Object.keys(answers).length
  const totalQuestions = exam.questions.length
  const effectiveViolations = Math.max(violations, monitoringStatsRef.current.totalViolations)

  const mediaSection = (
    <>
      {(currentQuestion.question_image_url || currentQuestion.image_url) && (
        <div className="mb-8 flex justify-center">
          <QuestionMediaImage
            src={currentQuestion.question_image_url || currentQuestion.image_url || ''} 
            alt="Question" 
            preferThumbnail
            className="max-w-full max-h-[500px] rounded-lg shadow-sm border border-gray-200"
          />
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
                    allowFullScreen
                    title="YouTube Video"
                />
            </div>
          ) : (
            <video 
              src={currentQuestion.question_video_url || currentQuestion.video_url || ''} 
              controls 
              preload="metadata"
              className="max-w-full max-h-[500px] mx-auto rounded-lg shadow-sm border border-gray-200"
            />
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar - Fixed */}
      <div className="fixed top-0 left-0 right-0 bg-white shadow-lg z-50">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Exam Info */}
            <div>
              <h1 className="text-lg font-bold text-gray-900">{exam.title}</h1>
              <p className="text-sm text-gray-600">{exam.subject?.name || 'Mata Pelajaran'}</p>
              {exam.instructions && (
                <div className="mt-1 text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded border border-orange-100 inline-block">
                  Note: {exam.instructions}
                </div>
              )}
            </div>

            {/* Timer */}
            <div className={`flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg ${getTimeColor()}`}>
              <Clock className="w-5 h-5" />
              <span className="text-xl font-bold font-mono">{formatTime(timeRemaining)}</span>
            </div>

            {/* Violations */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg border border-red-100">
                <AlertTriangle className="w-4 h-4" />
                <span className="font-bold">{effectiveViolations}/3</span>
                <span className="text-xs">Pelanggaran</span>
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
      <div className="pt-24 pb-24 max-w-7xl mx-auto px-4 overflow-x-hidden">
        <div className="flex gap-6 items-start">
          {/* Left: Question Area */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 min-h-[60vh]">
              {/* Question Header */}
              <div className="flex justify-between items-start mb-6">
                <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg font-bold">
                  Soal No. {currentQuestionIndex + 1}
                </span>
              </div>

              {/* Media (Top - Default) */}
              {(!currentQuestion.question_media_position || currentQuestion.question_media_position === 'top') && mediaSection}

              {/* Question Text */}
              <div 
                className="prose max-w-none text-lg text-gray-800 mb-8 [&_*]:max-w-full [&_*]:whitespace-normal [&_*]:break-words [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:ml-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:ml-2 [&_li]:my-1"
                style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
                dangerouslySetInnerHTML={{ __html: currentQuestionHtml }}
              />

              {/* Media (Bottom) */}
              {currentQuestion.question_media_position === 'bottom' && mediaSection}

              {/* Options */}
              {currentQuestion.question_type !== 'ESSAY' && (
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
                        flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-gray-50 min-w-0
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
	                          className="font-medium text-gray-700 break-words [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:ml-2 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:ml-2 [&_li]:my-1"
	                          style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}
	                          dangerouslySetInnerHTML={{ __html: optionHtmlById.get(optionId) || '' }}
	                        ></div>
	                        {optionImageSrc && (
	                          <QuestionMediaImage
	                            src={optionImageSrc}
	                            alt="Option" 
	                            preferThumbnail
	                            className="mt-2 max-h-40 rounded border border-gray-200"
                          />
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
                  const isAnswered = answers[q.id] !== undefined && answers[q.id] !== null && answers[q.id] !== ''
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

      {/* Submit Confirmation Modal */}
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4" onClick={() => setShowSubmitConfirm(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Kumpulkan Ujian?</h2>
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
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold"
              >
                Ya, Kumpulkan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
