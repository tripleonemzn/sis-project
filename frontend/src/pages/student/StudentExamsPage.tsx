import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authService } from '../../services/auth.service'
import {
  examService,
  findExamProgramBySlug,
  normalizeExamProgramCode,
  type ExamProgram,
  type StudentExamPlacement,
} from '../../services/exam.service'
import { examCardService } from '../../services/examCard.service'
import { isNonScheduledExamProgram } from '../../lib/examProgramMenu'
import { 
  FileText, 
  Calendar, 
  Clock, 
  Play, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'

type ExamProgramLabelMap = Record<string, string>

type ExamPacketPayload = {
  title?: string
  description?: string
  type?: string
  programCode?: string
  duration?: number
  subject?: {
    id?: string
    name?: string
    code?: string
  }
  questionCount?: number
  questions?: unknown[]
}

type ExamSessionPayload = {
  id?: number
  status?: string
  startTime?: string | null
  endTime?: string | null
  submitTime?: string | null
  submittedAt?: string | null
  updatedAt?: string | null
  isFinal?: boolean
  score?: number | null
}

type ExamAvailabilityPayload = {
  id: string
  subject?: {
    id?: string | number
    name?: string
    code?: string
  }
  packet?: ExamPacketPayload
  sessionLabel?: string | null
  startTime: string
  endTime: string
  status: string
  has_submitted?: boolean
  sessions?: ExamSessionPayload[]
  isBlocked?: boolean
  blockReason?: string
  financeClearance?: {
    blocksExam: boolean
    hasOutstanding: boolean
    hasOverdue: boolean
    outstandingAmount: number
    outstandingInvoices: number
    overdueInvoices: number
    mode?: string
    thresholdAmount?: number
    minOverdueInvoices?: number
    notes?: string | null
    warningOnly?: boolean
    reason?: string | null
  } | null
  makeupAvailable?: boolean
  makeupMode?: 'AUTO' | 'FORMAL' | null
  makeupScheduled?: boolean
  makeupStartTime?: string | null
  makeupDeadline?: string | null
  makeupReason?: string | null
  isReady?: boolean
  notReadyReason?: string | null
  jobVacancy?: {
    id?: string | number
    title?: string
    companyName?: string | null
    industryPartner?: {
      id?: string | number
      name?: string
      city?: string | null
      sector?: string | null
    } | null
  } | null
}

type SuppressedExamPayload = {
  exam_id?: string | number
  title?: string
  reason?: string
}

type AvailableExamsResponsePayload = {
  exams?: ExamAvailabilityPayload[]
  suppressed?: SuppressedExamPayload[]
  serverNow?: string
}

type VendorFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
  mozRequestFullScreen?: () => Promise<void>
  msRequestFullscreen?: () => Promise<void>
}

type VendorFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void
  mozCancelFullScreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
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
  const root = document.documentElement as VendorFullscreenElement
  return Boolean(
    root?.requestFullscreen ||
      root?.webkitRequestFullscreen ||
      root?.mozRequestFullScreen ||
      root?.msRequestFullscreen,
  )
}

function normalizeSubjectToken(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function resolveExamRoleContextFromPath(pathname: string): 'student' | 'candidate' | 'applicant' {
  if (pathname.startsWith('/candidate')) return 'candidate'
  if (pathname.startsWith('/public')) return 'applicant'
  return 'student'
}

function resolveExamBaseRouteFromPath(pathname: string): '/student/exams' | '/candidate/exams' | '/public/exams' {
  if (pathname.startsWith('/candidate')) return '/candidate/exams'
  if (pathname.startsWith('/public')) return '/public/exams'
  return '/student/exams'
}

function isGenericSubject(subject?: { name?: string; code?: string } | null): boolean {
  const name = normalizeSubjectToken(subject?.name)
  const code = normalizeSubjectToken(subject?.code)
  if (!name && !code) return true
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(code)) return true
  if (name === 'KONSENTRASI' || name === 'KEJURUAN') return true
  if (name.includes('KONSENTRASI_KEAHLIAN')) return true
  return false
}

function resolveDisplaySubject(
  scheduleSubject?: { id?: string | number; name?: string; code?: string } | null,
  packetSubject?: { id?: string | number; name?: string; code?: string } | null,
  packetTitle?: string | null,
) {
  const scheduleIsGeneric = isGenericSubject(scheduleSubject)
  const packetIsGeneric = isGenericSubject(packetSubject)
  const picked =
    scheduleSubject && !(scheduleIsGeneric && packetSubject && !packetIsGeneric)
      ? scheduleSubject
      : packetSubject || scheduleSubject

  let fallbackName = ''
  const title = String(packetTitle || '').trim()
  if (title.includes('•')) {
    const parts = title
      .split('•')
      .map((part) => String(part || '').trim())
      .filter(Boolean)
    if (parts.length >= 2) {
      const candidate = parts[1]
      if (candidate && !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
        fallbackName = candidate
      }
    }
  }

  const pickedIsGeneric = isGenericSubject(picked)
  const useFallbackName = Boolean(fallbackName) && pickedIsGeneric
  return {
    id: String(picked?.id ?? ''),
    name: String((useFallbackName ? fallbackName : picked?.name) || fallbackName || 'Mata Pelajaran'),
    code: useFallbackName ? '' : String(picked?.code || ''),
  }
}

interface Exam {
  id: string
  title: string
  description: string
  type: string
  programCode?: string
  sessionLabel?: string | null
  start_time: string
  end_time: string
  duration: number
  is_published: boolean
  subject: {
    id: string
    name: string
    code?: string
  }
  question_count: number
  total_points: number
  status: string
  has_submitted: boolean
  score?: {
    score: number
    max_score: number
    percentage: number
  }
  isBlocked?: boolean
  blockReason?: string
  financeClearance?: {
    blocksExam: boolean
    hasOutstanding: boolean
    hasOverdue: boolean
    outstandingAmount: number
    outstandingInvoices: number
    overdueInvoices: number
    mode?: string
    thresholdAmount?: number
    minOverdueInvoices?: number
    notes?: string | null
    warningOnly?: boolean
    reason?: string | null
  } | null
  makeupAvailable?: boolean
  makeupMode?: 'AUTO' | 'FORMAL' | null
  makeupScheduled?: boolean
  makeupStartTime?: string | null
  makeupDeadline?: string | null
  makeupReason?: string | null
  isReady?: boolean
  notReadyReason?: string | null
  jobVacancy?: {
    id: string
    title: string
    companyName: string
  } | null
}

type ServerTimeDriftState = {
  serverNowIso: string
  deviceNowIso: string
  driftMs: number
}

type PlacementRoomGroup = {
  key: string
  roomName: string
  examType: string
  seatLabel?: string | null
  seatPosition?: StudentExamPlacement['seatPosition']
  layout?: StudentExamPlacement['layout']
  entries: StudentExamPlacement[]
  primaryPlacement: StudentExamPlacement
}

type ExamDayGroup = {
  key: string
  label: string
  startTime: string
  exams: Exam[]
}

function formatExamCurrency(value?: number | null): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function resolveCardMediaUrl(value?: string | null): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^(data:|https?:)/i.test(raw)) return raw
  if (typeof window === 'undefined') return raw
  if (raw.startsWith('/')) return new URL(raw, window.location.origin).toString()
  return new URL(`/api/uploads/${raw.replace(/^\/+/, '')}`, window.location.origin).toString()
}

function buildExamDayKey(value?: string | null): string {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return String(value || 'unknown')
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatExamDayLabel(value?: string | null): string {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return 'Tanggal belum diatur'
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export default function StudentExamsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { programCode: programSlugParam } = useParams<{ programCode?: string }>()
  const examRoleContext = useMemo(() => resolveExamRoleContextFromPath(location.pathname), [location.pathname])
  const baseExamRoute = useMemo(() => resolveExamBaseRouteFromPath(location.pathname), [location.pathname])
  const isCandidateMode = examRoleContext === 'candidate'
  const isApplicantMode = examRoleContext === 'applicant'
  const { data: meResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: isApplicantMode,
    staleTime: 1000 * 60 * 5,
  })
  const applicantVerificationLocked =
    isApplicantMode && String(meResponse?.data?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED'
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<Exam[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [programFilter, setProgramFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)
  const [selectedPlacement, setSelectedPlacement] = useState<StudentExamPlacement | null>(null)
  const [selectedPlacementGroup, setSelectedPlacementGroup] = useState<PlacementRoomGroup | null>(null)
  const [showPlacementModal, setShowPlacementModal] = useState(false)
  const [showProctorListModal, setShowProctorListModal] = useState(false)
  const [expandedProctorDayKey, setExpandedProctorDayKey] = useState<string | null>(null)
  const [examProgramLabels, setExamProgramLabels] = useState<ExamProgramLabelMap>({})
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([])
  const [isCardsExpanded, setIsCardsExpanded] = useState(false)
  const [isPlacementsExpanded, setIsPlacementsExpanded] = useState(false)
  const [expandedExamDayKey, setExpandedExamDayKey] = useState<string | null>(null)
  const [showExamRulesModal, setShowExamRulesModal] = useState(false)
  const [serverTimeDrift, setServerTimeDrift] = useState<ServerTimeDriftState | null>(null)
  const lockedProgramCode = programFilter !== 'all' ? programFilter : ''
  const selectedProgram = useMemo(
    () => examPrograms.find((program) => normalizeExamProgramCode(program.code) === lockedProgramCode) || null,
    [examPrograms, lockedProgramCode],
  )
  const shouldShowExamCardSections =
    !isCandidateMode &&
    !isApplicantMode &&
    Boolean(selectedProgram) &&
    !isNonScheduledExamProgram(selectedProgram as ExamProgram)
  const studentExamCardsQuery = useQuery({
    queryKey: ['student-exam-cards-web', lockedProgramCode || 'all'],
    enabled: !isCandidateMode && !isApplicantMode && !applicantVerificationLocked && shouldShowExamCardSections,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await examCardService.getMyCards({
        programCode: lockedProgramCode || undefined,
      })
      return response.data.cards || []
    },
  })
  const studentExamPlacementsQuery = useQuery({
    queryKey: ['student-exam-placements-web'],
    enabled: !isCandidateMode && !isApplicantMode && !applicantVerificationLocked,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const response = await examService.getMyExamSittings()
      return response.data || []
    },
  })

  useEffect(() => {
    const forceExitFullscreen = async () => {
      const isFullscreen = Boolean(document.fullscreenElement)
      const vendorDoc = document as VendorFullscreenDocument

      if (!isFullscreen && !vendorDoc.webkitExitFullscreen && !vendorDoc.mozCancelFullScreen && !vendorDoc.msExitFullscreen) {
        return
      }

      try {
        if (document.exitFullscreen && isFullscreen) {
          await document.exitFullscreen()
          return
        }
        if (vendorDoc.webkitExitFullscreen) {
          await Promise.resolve(vendorDoc.webkitExitFullscreen())
          return
        }
        if (vendorDoc.mozCancelFullScreen) {
          await Promise.resolve(vendorDoc.mozCancelFullScreen())
          return
        }
        if (vendorDoc.msExitFullscreen) {
          await Promise.resolve(vendorDoc.msExitFullscreen())
        }
      } catch {
        // Ignore fullscreen exit failures on unsupported browsers.
      }
    }

    void forceExitFullscreen()
  }, [])

  useEffect(() => {
    fetchData()
    fetchExamProgramLabels()
  }, [examRoleContext, applicantVerificationLocked])

  useEffect(() => {
    if (programSlugParam) {
      const selectedProgram = findExamProgramBySlug(examPrograms, programSlugParam)
      if (selectedProgram) {
        setProgramFilter(normalizeExamProgramCode(selectedProgram.code))
        return
      }
      setProgramFilter(normalizeExamProgramCode(programSlugParam))
      return
    }

    const marker = `${baseExamRoute}/`
    const markerIdx = location.pathname.indexOf(marker)
    if (markerIdx >= 0) {
      const tail = location.pathname.slice(markerIdx + marker.length).split('/')[0]
      if (tail && tail !== 'program' && tail !== 'take') {
        const selectedProgram = findExamProgramBySlug(examPrograms, tail)
        if (selectedProgram) {
          setProgramFilter(normalizeExamProgramCode(selectedProgram.code))
          return
        }
        const normalizedTail = normalizeExamProgramCode(tail)
        if (normalizedTail) {
          setProgramFilter(normalizedTail)
          return
        }
      }
    }
    setProgramFilter('all')
  }, [baseExamRoute, location.pathname, programSlugParam, examPrograms])

  const getSessionPriority = (status: string | null | undefined) => {
    const normalized = String(status || '').toUpperCase()
    if (normalized === 'COMPLETED') return 5
    if (normalized === 'TIMEOUT') return 4
    if (normalized === 'IN_PROGRESS') return 3
    if (normalized === 'NOT_STARTED') return 2
    return 1
  }

  const pickBestSession = (sessions: ExamSessionPayload[] | null | undefined): ExamSessionPayload | null => {
    if (!Array.isArray(sessions) || sessions.length === 0) return null
    const sorted = [...sessions].sort((a, b) => {
      const rankDiff = getSessionPriority(b.status) - getSessionPriority(a.status)
      if (rankDiff !== 0) return rankDiff
      const updatedDiff = new Date(String(b.updatedAt || 0)).getTime() - new Date(String(a.updatedAt || 0)).getTime()
      if (updatedDiff !== 0) return updatedDiff
      const submitDiff = new Date(String(b.submitTime || b.submittedAt || 0)).getTime() - new Date(String(a.submitTime || a.submittedAt || 0)).getTime()
      if (submitDiff !== 0) return submitDiff
      return new Date(String(b.startTime || 0)).getTime() - new Date(String(a.startTime || 0)).getTime()
    })
    return sorted[0] || null
  }

  const fetchExamProgramLabels = async () => {
    try {
      if (applicantVerificationLocked) {
        setExamPrograms([])
        setExamProgramLabels({})
        return
      }
      const res = await examService.getPrograms({ roleContext: examRoleContext })
      const programs = res?.data?.programs || []
      if (!Array.isArray(programs) || programs.length === 0) {
        setExamPrograms([])
        setExamProgramLabels({})
        return
      }
      const normalizedPrograms = programs
        .filter((program: ExamProgram) =>
          Boolean(program?.isActive) && ((isCandidateMode || isApplicantMode) ? true : Boolean(program?.showOnStudentMenu)),
        )
        .map((program: ExamProgram) => ({
          ...program,
          code: normalizeExamProgramCode(program.code),
        }))
      setExamPrograms(normalizedPrograms)

      const nextLabels: ExamProgramLabelMap = {}
      normalizedPrograms.forEach((program: ExamProgram) => {
        const code = normalizeExamProgramCode(program.code)
        if (!code) return
        const label = String(program.label || '').trim()
        if (!label) return
        nextLabels[code] = label
      })
      setExamProgramLabels(nextLabels)
    } catch {
      setExamPrograms([])
      setExamProgramLabels({})
    }
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      if (applicantVerificationLocked) {
        setExams([])
        setServerTimeDrift(null)
        return
      }
      
      const res = await examService.getAvailableExams()

      const resData = res.data || []
      // support new shape: { exams: [], suppressed: [] } or legacy array
      const payload = Array.isArray(resData)
        ? {
            exams: resData as ExamAvailabilityPayload[],
            suppressed: [] as SuppressedExamPayload[],
            serverNow: undefined,
          }
        : (resData as AvailableExamsResponsePayload)
      const rawData = Array.isArray(payload.exams) ? payload.exams : []
      const suppressed = Array.isArray(payload.suppressed) ? payload.suppressed : []
      const serverNowMs = payload.serverNow ? new Date(payload.serverNow).getTime() : NaN
      if (Number.isFinite(serverNowMs)) {
        const deviceNowMs = Date.now()
        const driftMs = Math.abs(deviceNowMs - serverNowMs)
        if (driftMs >= 2 * 60 * 1000) {
          setServerTimeDrift({
            serverNowIso: new Date(serverNowMs).toISOString(),
            deviceNowIso: new Date(deviceNowMs).toISOString(),
            driftMs,
          })
        } else {
          setServerTimeDrift(null)
        }
      } else {
        setServerTimeDrift(null)
      }
      
      const mappedExams: Exam[] = rawData.reduce((acc: Exam[], item: ExamAvailabilityPayload) => {
        if (!item || typeof item !== 'object') return acc
        if (!item.packet || typeof item.packet !== 'object') return acc

        const bestSession = pickBestSession(item.sessions)
        const normalizedStatus = String(item.status || bestSession?.status || '').toUpperCase()
        const resolvedSubject = resolveDisplaySubject(item.subject, item.packet?.subject, item.packet?.title)
        const hasSubmitted =
          Boolean(item.has_submitted) ||
          normalizedStatus === 'COMPLETED' ||
          normalizedStatus === 'TIMEOUT' ||
          Boolean(bestSession?.submitTime || bestSession?.submittedAt || bestSession?.isFinal)

        acc.push({
          id: String(item.id || ''),
          title: item.packet?.title || 'Untitled Exam',
          description: item.packet?.description || '',
          type: item.packet?.type || 'QUIZ',
          programCode: normalizeExamProgramCode(item.packet?.programCode || item.packet?.type || ''),
          sessionLabel: item.sessionLabel || null,
          start_time: String(item.startTime || ''),
          end_time: String(item.endTime || ''),
          duration: Number(item.packet?.duration) || 0,
          is_published: true,
          subject: {
            id: resolvedSubject.id,
            name: resolvedSubject.name,
          },
          question_count:
            Number(item.packet?.questionCount) ||
            (Array.isArray(item.packet?.questions) ? item.packet.questions.length : 0),
          total_points: 100,
          status: normalizedStatus,
          has_submitted: hasSubmitted,
          score: typeof bestSession?.score === 'number' ? {
            score: bestSession.score,
            max_score: 100,
            percentage: 0
          } : undefined,
          isBlocked: item.isBlocked,
          blockReason: item.blockReason,
          financeClearance: item.financeClearance || null,
          makeupAvailable: Boolean(item.makeupAvailable),
          makeupMode: item.makeupMode || null,
          makeupScheduled: Boolean(item.makeupScheduled),
          makeupStartTime: item.makeupStartTime || null,
          makeupDeadline: item.makeupDeadline || null,
          makeupReason: item.makeupReason || null,
          isReady: item.isReady !== false,
          notReadyReason: item.notReadyReason || null,
          jobVacancy: item.jobVacancy
            ? {
                id: String(item.jobVacancy.id || ''),
                title: String(item.jobVacancy.title || 'Lowongan BKK'),
                companyName: String(
                  item.jobVacancy.industryPartner?.name ||
                    item.jobVacancy.companyName ||
                    'Mitra industri',
                ),
              }
            : null,
        })
        return acc
      }, [])

      // If just submitted, ensure the corresponding exam is marked completed
      const justSubmittedId = sessionStorage.getItem('just_submitted_exam_id')
      let patched = mappedExams
      if (justSubmittedId) {
        patched = mappedExams.map((e: Exam) => String(e.id) === justSubmittedId ? { ...e, has_submitted: true, status: 'completed' } : e)
        sessionStorage.removeItem('just_submitted_exam_id')
      }
      
      setExams(patched)
      if (suppressed.length > 0) {
        // show toast warning and keep suppressed list for UI
        toast(() => (
          <div>
            <div className="font-semibold">Beberapa ujian disembunyikan oleh wali kelas</div>
            <ul className="mt-1">
              {suppressed.slice(0, 3).map((suppressedExam) => (
                <li key={String(suppressedExam.exam_id || suppressedExam.title || Math.random())}>
                  {suppressedExam.title || 'Ujian'}{suppressedExam.reason ? ` — ${suppressedExam.reason}` : ''}
                </li>
              ))}
            </ul>
            <div className="text-xs mt-2">Hubungi wali kelas untuk informasi lebih lanjut</div>
          </div>
        ), { duration: 10000 })
      }
    } catch {
      setServerTimeDrift(null)
      toast.error('Gagal memuat data ujian')
    } finally {
      setLoading(false)
    }
  }

  function getExamStatus(exam: Exam) {
    const normalizedStatus = String(exam.status || '').toUpperCase()
    if (exam.has_submitted || normalizedStatus === 'COMPLETED' || normalizedStatus === 'TIMEOUT') return 'completed'
    if (normalizedStatus === 'GRADED') return 'graded'
    if (normalizedStatus === 'MAKEUP_AVAILABLE' || exam.makeupAvailable) return 'makeup'
    if (normalizedStatus === 'IN_PROGRESS' || normalizedStatus === 'OPEN' || normalizedStatus === 'ONGOING') return 'available'
    if (normalizedStatus === 'UPCOMING') return 'upcoming'
    if (normalizedStatus === 'MISSED' || normalizedStatus === 'EXPIRED') return 'expired'
    
    const nowMs = Date.now()
    const startTimeMs = new Date(String(exam.start_time || '')).getTime()
    const endTimeMs = new Date(String(exam.end_time || '')).getTime()

    if (exam.score) return 'graded'
    if (exam.has_submitted) return 'completed'
    if (Number.isFinite(startTimeMs) && nowMs < startTimeMs) return 'upcoming'
    if (Number.isFinite(endTimeMs) && nowMs > endTimeMs) return 'expired'
    return 'available'
  }

  const filteredExams = useMemo(() => {
    let filtered = Array.isArray(exams)
      ? exams.filter((exam) => Boolean(exam) && typeof exam === 'object')
      : []

    try {
      if (programFilter !== 'all') {
        filtered = filtered.filter((e) => normalizeExamProgramCode(e.programCode || e.type) === programFilter)
      }

      if (statusFilter !== 'all') {
        filtered = filtered.filter((e) => getExamStatus(e) === statusFilter)
      }

      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        filtered = filtered.filter(
          (e) =>
            (e.title || '').toLowerCase().includes(query) ||
            (e.subject?.name || '').toLowerCase().includes(query) ||
            (e.subject?.code || '').toLowerCase().includes(query) ||
            (e.jobVacancy?.title || '').toLowerCase().includes(query) ||
            (e.jobVacancy?.companyName || '').toLowerCase().includes(query),
        )
      }
    } catch (error) {
      console.error('Failed to filter student exams:', error)
      return []
    }

    return filtered
  }, [exams, programFilter, searchQuery, statusFilter])
  const groupedFilteredExams = useMemo<ExamDayGroup[]>(() => {
    const groupMap = new Map<string, ExamDayGroup>()
    filteredExams.forEach((exam) => {
      const key = buildExamDayKey(exam.start_time)
      const existing = groupMap.get(key)
      if (existing) {
        existing.exams.push(exam)
        existing.exams.sort(
          (left, right) =>
            new Date(String(left.start_time || 0)).getTime() - new Date(String(right.start_time || 0)).getTime(),
        )
        return
      }
      groupMap.set(key, {
        key,
        label: formatExamDayLabel(exam.start_time),
        startTime: exam.start_time,
        exams: [exam],
      })
    })
    return Array.from(groupMap.values()).sort(
      (left, right) =>
        new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
    )
  }, [filteredExams])

  useEffect(() => {
    setExpandedExamDayKey(null)
  }, [programFilter, searchQuery, statusFilter])

  useEffect(() => {
    setExpandedProctorDayKey(null)
  }, [showProctorListModal, selectedPlacementGroup])

  const canTakeExam = (exam: Exam) => {
    const status = getExamStatus(exam)
    const now = new Date()
    const startTime = new Date(exam.start_time)
    const endTime = new Date(exam.end_time)
    const makeupDeadline = exam.makeupDeadline ? new Date(exam.makeupDeadline) : null
    const isMakeupWindowOpen =
      status === 'makeup' &&
      (!makeupDeadline || now <= makeupDeadline) &&
      now > endTime

    return (
      (status === 'available' || isMakeupWindowOpen) &&
      exam.isReady !== false &&
      exam.is_published &&
      !exam.has_submitted &&
      !exam.isBlocked &&
      (status === 'available' ? now >= startTime && now <= endTime : true)
    )
  }

  const handleStartExam = (exam: Exam) => {
    if (!canTakeExam(exam)) {
      toast.error('Ujian tidak tersedia saat ini')
      return
    }

    setSelectedExam(exam)
    setShowStartModal(true)
  }

  const confirmStartExam = async () => {
    if (!selectedExam) return

    const scheduleId = Number(selectedExam.id)
    if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
      toast.error('ID ujian tidak valid')
      return
    }

    setShowStartModal(false)

    // Persist last visited exams page context for return navigation
    try {
      sessionStorage.setItem('last_exam_route', location.pathname)
    } catch {
      toast.error('Gagal menyimpan konteks ujian.')
    }

    const isDesktopFullscreenRequired = supportsDocumentFullscreen() && !isLikelyMobileDevice()
    let desktopFullscreenReady = !isDesktopFullscreenRequired

    // Request fullscreen early while still in direct user action context.
    if (isDesktopFullscreenRequired) {
      const elem = document.documentElement as VendorFullscreenElement
      try {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen()
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen()
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen()
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen()
        }
      } catch {
        // We'll continue navigation and let the take page handle fullscreen gate.
      }

      desktopFullscreenReady = Boolean(
        document.fullscreenElement ||
          (document as VendorFullscreenDocument & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ||
          (document as VendorFullscreenDocument & { mozFullScreenElement?: Element | null }).mozFullScreenElement ||
          (document as VendorFullscreenDocument & { msFullscreenElement?: Element | null }).msFullscreenElement,
      )

      if (!desktopFullscreenReady) {
        toast('Fullscreen otomatis belum aktif. Lanjutkan, lalu klik tombol fullscreen di halaman ujian.', {
          icon: '⚠️',
        })
      }
    }

    // Give browser a moment to update state before navigating
    // This prevents the next page from thinking we're not in fullscreen
    setTimeout(() => {
      navigate(`${baseExamRoute}/${scheduleId}/take`, {
        state: { exam: { ...selectedExam, programLabel: getExamTypeLabel(selectedExam) } },
      })
      setSelectedExam(null)
    }, 100)
  }

  const formatDateShort = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDateTimeLong = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatDateOnlyLong = (dateString: string) => {
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  const getPlacementGroupStatus = (entries: StudentExamPlacement[]) => {
    const now = Date.now()
    const validRanges = entries
      .map((entry) => ({
        startMs: entry.startTime ? new Date(entry.startTime).getTime() : Number.NaN,
        endMs: entry.endTime ? new Date(entry.endTime).getTime() : Number.NaN,
      }))
      .filter((range) => Number.isFinite(range.startMs) && Number.isFinite(range.endMs))

    if (validRanges.some((range) => range.startMs <= now && now <= range.endMs)) {
      return {
        label: 'Berlangsung',
        className: 'bg-green-100 text-green-800 border border-green-200',
      }
    }

    const hasFuture = validRanges.some((range) => now < range.startMs)
    if (hasFuture || validRanges.length === 0) {
      return {
        label: 'Terjadwal',
        className: 'bg-blue-100 text-blue-800 border border-blue-200',
      }
    }

    return {
      label: 'Selesai',
      className: 'bg-slate-100 text-slate-700 border border-slate-200',
    }
  }

  const getStatusBadge = (exam: Exam) => {
    const status = getExamStatus(exam)

    if (exam.isReady === false && !exam.has_submitted) {
      return (
        <span className="px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded inline-flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          Soal Belum Siap
        </span>
      )
    }

    switch (status) {
      case 'graded':
        return (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Dinilai
          </span>
        )
      case 'completed':
        return (
          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded inline-flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            Sudah Dikerjakan
          </span>
        )
      case 'available':
        return (
          <span className="px-2 py-1 bg-green-500 text-white text-xs font-medium rounded inline-flex items-center gap-1 animate-pulse">
            <Play className="w-3 h-3" />
            Berlangsung
          </span>
        )
      case 'upcoming':
        return (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {exam.makeupMode === 'FORMAL' && exam.makeupScheduled ? 'Jadwal Susulan' : 'Akan Datang'}
          </span>
        )
      case 'makeup':
        return (
          <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-medium rounded inline-flex items-center gap-1">
            <Play className="w-3 h-3" />
            Susulan
          </span>
        )
      case 'expired':
        return (
          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded inline-flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            Terlewat
          </span>
        )
      default:
        return null
    }
  }

  const getTypeColor = (rawCode: string) => {
    const normalized = normalizeExamProgramCode(rawCode)
    const palette = [
      'bg-blue-100 text-blue-800',
      'bg-emerald-100 text-emerald-800',
      'bg-amber-100 text-amber-800',
      'bg-violet-100 text-violet-800',
      'bg-cyan-100 text-cyan-800',
    ]

    if (!normalized) return 'bg-gray-100 text-gray-800'
    let hash = 0
    for (let i = 0; i < normalized.length; i += 1) {
      hash = (hash * 31 + normalized.charCodeAt(i)) % 100000
    }
    return palette[Math.abs(hash) % palette.length]
  }

  const getExamTypeLabel = (exam: Exam) => {
    const normalizedProgram = normalizeExamProgramCode(exam.programCode || exam.type)
    if (normalizedProgram && examProgramLabels[normalizedProgram]) return examProgramLabels[normalizedProgram]

    const normalizedType = normalizeExamProgramCode(exam.type)
    if (normalizedType && examProgramLabels[normalizedType]) return examProgramLabels[normalizedType]

    return normalizedProgram || normalizedType || '-'
  }

  const filteredPlacements = useMemo(() => {
    const rows = Array.isArray(studentExamPlacementsQuery.data) ? studentExamPlacementsQuery.data : []
    return rows
      .filter((placement) => {
        if (programFilter === 'all') return true
        return normalizeExamProgramCode(placement.examType) === programFilter
      })
      .sort(
        (a, b) =>
          new Date(String(a.startTime || 0)).getTime() - new Date(String(b.startTime || 0)).getTime(),
      )
  }, [programFilter, studentExamPlacementsQuery.data])
  const groupedPlacements = useMemo<PlacementRoomGroup[]>(() => {
    const groupMap = new Map<string, PlacementRoomGroup>()
    filteredPlacements.forEach((placement) => {
      const key = [
        normalizeExamProgramCode(placement.examType),
        String(placement.roomName || '').trim(),
        String(placement.seatLabel || '').trim(),
      ].join('::')
      const existing = groupMap.get(key)
      if (existing) {
        existing.entries.push(placement)
        existing.entries.sort(
          (left, right) =>
            new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
        )
        return
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
      })
    })
    return Array.from(groupMap.values()).sort((left, right) => {
      const roomCompare = String(left.roomName || '').localeCompare(String(right.roomName || ''), 'id', {
        sensitivity: 'base',
        numeric: true,
      })
      if (roomCompare !== 0) return roomCompare
      return String(left.seatLabel || '').localeCompare(String(right.seatLabel || ''), 'id', {
        sensitivity: 'base',
        numeric: true,
      })
    })
  }, [filteredPlacements])

  const relevantTotal = exams.filter(e => programFilter === 'all' || normalizeExamProgramCode(e.programCode || e.type) === programFilter).length
  const lockedProgramLabel =
    (lockedProgramCode && examProgramLabels[lockedProgramCode]) ||
    selectedProgram?.label ||
    ''
  const pageTitle = isCandidateMode
    ? lockedProgramLabel || 'Tes Seleksi'
    : isApplicantMode
      ? lockedProgramLabel || 'Tes BKK'
      : lockedProgramLabel || 'Ujian'
  const pageDescription = isCandidateMode
    ? lockedProgramLabel
      ? `Lihat dan kerjakan ${lockedProgramLabel.toLowerCase()} yang tersedia untuk calon siswa`
      : 'Lihat dan kerjakan tes yang tersedia untuk calon siswa'
    : isApplicantMode
      ? lockedProgramLabel
        ? `Lihat dan kerjakan ${lockedProgramLabel.toLowerCase()} yang terhubung dengan lowongan BKK Anda`
        : 'Lihat dan kerjakan tes rekrutmen yang terhubung dengan lowongan BKK Anda'
      : lockedProgramLabel
        ? `Lihat dan kerjakan ${lockedProgramLabel.toLowerCase()} yang tersedia`
        : 'Lihat dan kerjakan ujian yang tersedia'
  const examScheduleTitle = isApplicantMode
    ? `Jadwal Tes ${lockedProgramLabel || 'BKK'}`
    : isCandidateMode
      ? `Jadwal Tes ${lockedProgramLabel || 'Seleksi'}`
      : lockedProgramLabel
        ? `Jadwal Ujian ${lockedProgramLabel}`
        : 'Jadwal Ujian'
  const contextColumnTitle = isApplicantMode ? 'Lowongan / Konteks' : 'Mata Pelajaran'
  const emptyDescription =
    searchQuery || programFilter !== 'all' || statusFilter !== 'all'
      ? 'Tidak ada ujian yang sesuai dengan filter'
      : isApplicantMode
        ? 'Belum ada tes BKK yang tersedia untuk lamaran aktif Anda'
        : 'Belum ada ujian yang tersedia'
  const schoolLogoUrl = useMemo(() => resolveCardMediaUrl('/logo-kgb2.png'), [])
  const watermarkLogoUrl = useMemo(() => resolveCardMediaUrl('/logo_sis_kgb2.png'), [])
  const selectedPlacementCard = useMemo(() => {
    if (!selectedPlacement) return null
    const cards = studentExamCardsQuery.data || []
    const placementProgramCode = normalizeExamProgramCode(selectedPlacement.examType)
    return cards.find((card) => normalizeExamProgramCode(card.payload.programCode || card.programCode) === placementProgramCode) || null
  }, [selectedPlacement, studentExamCardsQuery.data])
  const fallbackIdentityCard = useMemo(() => (studentExamCardsQuery.data || [])[0] || null, [studentExamCardsQuery.data])
  const groupedProctorEntries = useMemo(() => {
    if (!selectedPlacementGroup) return []
    const groupMap = new Map<string, { key: string; label: string; entries: StudentExamPlacement[] }>()
    selectedPlacementGroup.entries.forEach((entry) => {
      const key = buildExamDayKey(entry.startTime || '')
      const existing = groupMap.get(key)
      if (existing) {
        existing.entries.push(entry)
        existing.entries.sort(
          (left, right) =>
            new Date(String(left.startTime || 0)).getTime() - new Date(String(right.startTime || 0)).getTime(),
        )
        return
      }
      groupMap.set(key, {
        key,
        label: formatExamDayLabel(entry.startTime || ''),
        entries: [entry],
      })
    })
    return Array.from(groupMap.values()).sort(
      (left, right) =>
        new Date(String(left.entries[0]?.startTime || 0)).getTime() - new Date(String(right.entries[0]?.startTime || 0)).getTime(),
    )
  }, [selectedPlacementGroup])
  const renderExamRow = (exam: Exam) => {
    const status = getExamStatus(exam)
    const canTake = canTakeExam(exam)

    return (
      <tr
        key={exam.id}
        className={`hover:bg-gray-50 ${canTake ? 'bg-green-50' : ''}`}
      >
        <td className="px-6 py-4">
          <div className="flex items-start">
            <FileText className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-gray-900">
                {exam.title}
              </div>
              {exam.sessionLabel ? (
                <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                  {exam.sessionLabel}
                </span>
              ) : null}
            </div>
          </div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap">
          {isApplicantMode ? (
            <div>
              <div className="text-sm font-medium text-gray-900">
                {exam.jobVacancy?.title || exam.subject?.name || '-'}
              </div>
              <div className="text-xs text-gray-500">
                {exam.jobVacancy?.companyName || exam.subject?.code || 'Lowongan BKK'}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-900">{exam.subject?.name || '-'}</div>
          )}
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center">
          <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(exam.programCode || exam.type)}`}>
            {getExamTypeLabel(exam)}
          </span>
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center">
          <div className="text-sm font-medium text-gray-900">
            {exam.question_count || 0}
          </div>
          <div className="text-xs text-gray-500">soal</div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center">
          <div className="text-sm font-medium text-gray-900">
            {exam.duration}
          </div>
          <div className="text-xs text-gray-500">menit</div>
        </td>

        <td className="px-6 py-4">
          <div className="text-xs text-gray-600">
            <div className="flex items-center gap-1 mb-1">
              <Calendar className="w-3 h-3" />
              <span>Mulai: {formatDateShort(exam.start_time)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              <span>Selesai: {formatDateShort(exam.end_time)}</span>
            </div>
            {exam.makeupMode === 'FORMAL' && exam.makeupStartTime ? (
              <div className="flex items-center gap-1 text-orange-600 mt-1">
                <Clock className="w-3 h-3" />
                <span>Jadwal susulan: {formatDateShort(exam.makeupStartTime)}</span>
              </div>
            ) : null}
            {getExamStatus(exam) === 'makeup' && exam.makeupDeadline ? (
              <div className="flex items-center gap-1 text-orange-600 mt-1">
                <Clock className="w-3 h-3" />
                <span>Susulan sampai: {formatDateShort(exam.makeupDeadline)}</span>
              </div>
            ) : null}
            {exam.makeupMode === 'FORMAL' && exam.makeupReason ? (
              <div className="text-[11px] text-orange-700 mt-1">
                Alasan susulan: {exam.makeupReason}
              </div>
            ) : null}
          </div>
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center">
          {getStatusBadge(exam)}
        </td>

        <td className="px-6 py-4 whitespace-nowrap text-center">
          {exam.isBlocked ? (
            <div className="flex flex-col items-center">
              <span className="inline-flex items-center gap-1 px-3 py-2 bg-red-100 text-red-700 text-sm font-medium rounded mb-1">
                <XCircle className="w-4 h-4" />
                <span>Akses Ditolak</span>
              </span>
              <span className="text-xs text-red-600 max-w-[200px] whitespace-normal text-center">
                {exam.blockReason}
              </span>
              {exam.financeClearance?.hasOutstanding ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] text-amber-800">
                  <div className="font-semibold">Clearance finance</div>
                  <div>Outstanding: {formatExamCurrency(exam.financeClearance.outstandingAmount)}</div>
                  <div>
                    Tagihan aktif: {exam.financeClearance.outstandingInvoices} • overdue:{' '}
                    {exam.financeClearance.overdueInvoices}
                  </div>
                  {!exam.financeClearance.blocksExam ? (
                    <div className="mt-1 text-[11px] text-amber-700">
                      Status finance ini tidak menjadi penyebab blokir pada program ujian ini.
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : exam.isReady === false ? (
            <div className="flex flex-col items-center">
              <span className="inline-flex items-center gap-1 px-3 py-2 bg-amber-100 text-amber-700 text-sm font-medium rounded mb-1">
                <AlertCircle className="w-4 h-4" />
                <span>Menunggu Soal</span>
              </span>
              <span className="text-xs text-amber-700 max-w-[200px] whitespace-normal text-center">
                {exam.notReadyReason || 'Soal untuk jadwal ini belum disiapkan guru.'}
              </span>
            </div>
          ) : canTake ? (
            <button
              onClick={() => handleStartExam(exam)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
            >
              <Play className="w-4 h-4" />
              <span>{getExamStatus(exam) === 'makeup' ? 'Mulai Susulan' : 'Mulai'}</span>
            </button>
          ) : status === 'graded' || status === 'completed' ? (
            <span className="inline-flex items-center gap-1 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded">
              <CheckCircle className="w-4 h-4" />
              <span>Sudah Dikerjakan</span>
            </span>
          ) : (
            <span className="text-sm text-gray-400">-</span>
          )}
          {!exam.isBlocked && exam.financeClearance?.warningOnly && exam.financeClearance.hasOutstanding ? (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left text-[11px] text-amber-800">
              <div className="font-semibold">Info finance</div>
              <div>Outstanding: {formatExamCurrency(exam.financeClearance.outstandingAmount)}</div>
              <div>
                Tagihan aktif: {exam.financeClearance.outstandingInvoices} • overdue:{' '}
                {exam.financeClearance.overdueInvoices}
              </div>
              <div className="mt-1 text-[11px] text-amber-700">
                Program ini hanya memberi peringatan dan tidak memblokir ujian.
              </div>
            </div>
          ) : null}
        </td>
      </tr>
    )
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center items-center h-64">
          <div className="text-lg">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-page-title font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500 mt-1">{pageDescription}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowExamRulesModal(true)}
          className="inline-flex h-11 w-11 items-center justify-center self-start rounded-full border border-yellow-200 bg-yellow-50 text-yellow-600 shadow-sm transition hover:bg-yellow-100 animate-pulse"
          aria-label={`Lihat aturan ${isApplicantMode ? 'tes BKK' : 'ujian'}`}
        >
          <AlertCircle className="h-5 w-5" />
        </button>
      </div>

      {applicantVerificationLocked ? (
        <div className="rounded-r-lg border-l-4 border-amber-400 bg-amber-50 p-4">
          <div className="flex">
            <AlertCircle className="mr-3 mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
            <div>
              <h3 className="mb-1 text-sm font-semibold text-amber-900">Tes BKK menunggu verifikasi admin</h3>
              <p className="text-sm text-amber-800">
                Akun pelamar Anda belum diverifikasi. Lengkapi profil pelamar, lalu tunggu verifikasi admin sebelum mengikuti Tes BKK.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {shouldShowExamCardSections ? (
        <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <button
              type="button"
              onClick={() => setIsCardsExpanded((current) => !current)}
              className="flex w-full flex-col gap-2 text-left md:flex-row md:items-start md:justify-between"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Kartu Ujian Digital</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Kartu ujian akan muncul di sini setelah dipublikasikan oleh Kepala TU.
                </p>
              </div>
              <div className="flex items-center gap-3 self-start md:self-auto">
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {studentExamCardsQuery.data?.length || 0} kartu
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500">
                  {isCardsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </div>
            </button>

            {isCardsExpanded && studentExamCardsQuery.isLoading ? (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Memuat kartu ujian digital...
              </div>
            ) : isCardsExpanded && studentExamCardsQuery.data && studentExamCardsQuery.data.length > 0 ? (
              <div className="mt-4 grid gap-4">
                {studentExamCardsQuery.data.map((card) => {
                  const primaryEntry = card.payload.placement || card.payload.entries[0] || null
                  return (
                    <div
                      key={card.id}
                      className="relative mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-blue-100 bg-[radial-gradient(circle_at_top_right,_rgba(191,219,254,0.55),_transparent_35%),linear-gradient(135deg,_#ffffff_0%,_#f8fbff_55%,_#eefbf4_100%)] shadow-sm"
                    >
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06]">
                        {watermarkLogoUrl ? (
                          <img src={watermarkLogoUrl} alt="" className="h-40 w-40 object-contain" />
                        ) : null}
                      </div>

                      <div className="relative border-b border-gray-200 px-3 py-2.5">
                        <div className="mx-auto grid max-w-[438px] grid-cols-[56px_minmax(0,1fr)_56px] items-center gap-3 text-center">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center justify-self-center md:h-16 md:w-16">
                            {schoolLogoUrl ? (
                              <img src={schoolLogoUrl} alt="Logo KGB2" className="h-14 w-14 object-contain md:h-16 md:w-16" />
                            ) : null}
                          </div>
                          <div className="text-center leading-tight">
                            <div className="text-[11px] font-semibold uppercase leading-tight text-gray-900 md:text-[13px]">
                              {card.payload.cardTitle || 'Kartu Peserta'}
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold uppercase leading-tight text-gray-900 md:text-[13px]">
                              {card.payload.examTitle || card.payload.programLabel}
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold uppercase leading-tight text-gray-900 md:text-[13px]">
                              {card.payload.institutionName || card.payload.schoolName}
                            </div>
                            <div className="mt-0.5 text-[11px] font-semibold uppercase leading-tight text-gray-900 md:text-[13px]">
                              {`Tahun Ajaran ${card.payload.academicYearName}`}
                            </div>
                          </div>
                          <div className="h-14 w-14 md:h-16 md:w-16" aria-hidden="true" />
                        </div>
                      </div>

                      <div className="relative px-3 py-2.5">
                        <div className="mx-auto grid max-w-[438px] gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                          <div className="grid grid-cols-[72px_8px_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px] leading-tight text-gray-800 md:grid-cols-[80px_8px_minmax(0,1fr)] md:text-[11px]">
                          <div className="font-medium">Nama Siswa</div><div>:</div><div className="break-words">{card.payload.student.name}</div>
                          <div className="font-medium">Kelas</div><div>:</div><div className="break-words">{card.payload.student.className || '-'}</div>
                          <div className="font-medium">Username</div><div>:</div><div className="break-words">{card.payload.student.username || '-'}</div>
                          <div className="font-medium">No. Peserta</div><div>:</div><div className="break-all font-semibold tracking-wide text-blue-700">{card.payload.participantNumber || '-'}</div>
                          <div className="font-medium">Ruang</div><div>:</div><div className="break-words">{primaryEntry?.roomName || '-'}</div>
                          <div className="font-medium">Sesi</div><div>:</div><div className="break-words">{primaryEntry?.sessionLabel || '-'}</div>
                          </div>

                          <div className="flex flex-col items-center justify-start text-center text-[10px] leading-tight text-gray-800 md:text-[11px]">
                            <div className="max-w-[160px]">{card.payload.issue?.signLabel || `Bekasi, ${formatDateOnlyLong(card.payload.issue?.date || card.generatedAt)}`}</div>
                            <div className="mt-1">{card.payload.legality.principalTitle || 'Kepala Sekolah'}</div>
                            {card.payload.legality.principalBarcodeDataUrl ? (
                              <img
                                src={card.payload.legality.principalBarcodeDataUrl}
                                alt="Barcode Kepala Sekolah"
                                className="mt-2 h-24 w-24 rounded-lg border border-gray-200 bg-white p-1"
                              />
                            ) : null}
                            <div className="mt-2 w-full px-1 text-[10px] font-semibold leading-tight text-gray-900 md:text-[10px]">
                              {card.payload.legality.principalName}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="relative border-t border-gray-200 px-3 py-1.5 text-[10px] italic leading-tight text-emerald-700">
                        {card.payload.legality.footerNote || 'Berkas digital yang sah secara internal'}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : isCardsExpanded ? (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Belum ada kartu ujian digital yang dipublikasikan untuk akun Anda.
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <button
              type="button"
              onClick={() => setIsPlacementsExpanded((current) => !current)}
              className="flex w-full flex-col gap-2 text-left md:flex-row md:items-start md:justify-between"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Denah Ruang Ujian</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Ruang, sesi, dan kursi yang ditetapkan Kurikulum akan muncul di sini meski kartu ujian digital belum dipublikasikan.
                </p>
              </div>
              <div className="flex items-center gap-3 self-start md:self-auto">
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                  {groupedPlacements.length} ruang
                </div>
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500">
                  {isPlacementsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </span>
              </div>
            </button>

            {isPlacementsExpanded && studentExamPlacementsQuery.isLoading ? (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Memuat penempatan ujian...
              </div>
            ) : isPlacementsExpanded && studentExamPlacementsQuery.isError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                <div className="font-semibold">Gagal memuat penempatan ujian.</div>
                <button
                  type="button"
                  onClick={() => studentExamPlacementsQuery.refetch()}
                  className="mt-3 inline-flex items-center rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Coba Lagi
                </button>
              </div>
            ) : isPlacementsExpanded && groupedPlacements.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {groupedPlacements.map((group) => {
                  const chip = getPlacementGroupStatus(group.entries)
                  return (
                    <div key={group.key} className="rounded-2xl border border-blue-100 bg-white px-4 py-4 text-sm text-gray-700">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-gray-900">{group.roomName}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {examProgramLabels[normalizeExamProgramCode(group.examType)] || normalizeExamProgramCode(group.examType) || '-'} •{' '}
                            {group.entries.length} jadwal
                          </div>
                        </div>
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${chip.className}`}>
                          {chip.label}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-gray-600">
                        <div>Kursi: {group.seatLabel || 'Menunggu denah dipublikasikan'}</div>
                        <div>
                          Slot pertama: {formatDateTimeLong(group.primaryPlacement.startTime || '')} - {formatDateTimeLong(group.primaryPlacement.endTime || '')}
                        </div>
                        <div>{group.entries.length} slot ujian memakai ruang ini.</div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlacement(group.primaryPlacement)
                            setShowPlacementModal(true)
                          }}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          Lihat Denah
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPlacementGroup(group)
                            setExpandedProctorDayKey(null)
                            setShowProctorListModal(true)
                          }}
                          className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                        >
                          Daftar Pengawas
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : isPlacementsExpanded ? (
              <div className="mt-4 rounded-lg border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Belum ada penempatan ruang ujian yang dipublikasikan untuk akun Anda.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

        {serverTimeDrift ? (
          <div className="bg-rose-50 border-l-4 border-rose-400 p-4 rounded-r-lg">
            <div className="flex">
              <AlertCircle className="w-5 h-5 text-rose-500 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-rose-800 mb-1">
                  Waktu perangkat tidak sinkron dengan server
                </h3>
                <p className="text-sm text-rose-700 mb-2">
                  Selisih waktu sekitar {Math.round(serverTimeDrift.driftMs / 60000)} menit. Kondisi ini bisa membuat
                  tombol <strong>Mulai</strong> tidak muncul atau status ujian tidak sesuai.
                </p>
                <ul className="text-xs text-rose-700 list-disc list-inside space-y-1">
                  <li>Jam perangkat: {formatDateTimeLong(serverTimeDrift.deviceNowIso)}</li>
                  <li>Jam server: {formatDateTimeLong(serverTimeDrift.serverNowIso)}</li>
                  <li>Aktifkan pengaturan tanggal & waktu otomatis, lalu muat ulang halaman ini.</li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Search className="w-4 h-4 inline mr-1" />
                Cari Ujian
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul atau mata pelajaran..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  const next = String(e.target.value || 'all')
                  const allowed = new Set(['all', 'available', 'makeup', 'upcoming', 'completed', 'graded', 'expired'])
                  setStatusFilter(allowed.has(next) ? next : 'all')
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Semua Status</option>
                <option value="available">Berlangsung</option>
                <option value="makeup">Susulan</option>
                <option value="upcoming">Akan Datang</option>
                <option value="completed">Sudah Dikerjakan</option>
                <option value="graded">Sudah Dinilai</option>
                <option value="expired">Terlewat</option>
              </select>
            </div>
          </div>

        </div>

        {/* Exams Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">{examScheduleTitle}</h2>
            <p className="mt-1 text-sm text-gray-500">
              Menampilkan {filteredExams.length} dari {relevantTotal} {isApplicantMode ? 'tes' : 'ujian'}
            </p>
          </div>
          {filteredExams.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Belum Ada {isApplicantMode ? 'Tes BKK' : 'Ujian'}</h3>
              <p className="text-gray-600">
                {applicantVerificationLocked
                  ? 'Tes BKK akan muncul di sini setelah akun pelamar diverifikasi dan lowongan Anda memiliki jadwal tes aktif.'
                  : emptyDescription}
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {groupedFilteredExams.map((group) => {
                const isOpen = expandedExamDayKey === group.key
                return (
                  <div key={group.key} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandedExamDayKey((current) => (current === group.key ? null : group.key))}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gray-50"
                    >
                      <div className="min-w-0">
                        <div className="text-lg font-semibold text-gray-900">{group.label}</div>
                        <div className="mt-1 text-sm text-gray-500">
                          {group.exams.length} {isApplicantMode ? 'tes' : 'mata pelajaran'} terjadwal
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {group.exams.length} slot
                        </span>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-700">
                          {isOpen ? 'Tutup Hari' : 'Buka Hari'}
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </div>
                    </button>

                    {isOpen ? (
                      <div className="border-t border-gray-200 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {isApplicantMode ? 'Tes' : 'Ujian'}
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                {contextColumnTitle}
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Jenis
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Soal
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Durasi
                              </th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Waktu
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                              </th>
                              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Aksi
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {group.exams.map((exam) => renderExamRow(exam))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      {showExamRulesModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-yellow-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Aturan Sebelum Mengerjakan {isApplicantMode ? 'Tes BKK' : 'Ujian'}</h3>
                <p className="mt-1 text-sm text-gray-500">Pastikan Anda memahami ketentuan berikut sebelum mulai.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowExamRulesModal(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-gray-700">
              <li>{isApplicantMode ? 'Tes BKK' : 'Ujian'} akan berjalan dalam mode fullscreen.</li>
              <li>Jangan keluar dari fullscreen atau membuka tab/aplikasi lain.</li>
              <li>Anda memiliki 3x kesempatan pelanggaran.</li>
              <li>Pelanggaran ke-4 akan otomatis submit {isApplicantMode ? 'tes' : 'ujian'} Anda.</li>
              <li>Pastikan koneksi internet stabil sepanjang sesi berjalan.</li>
            </ul>
          </div>
        </div>
      ) : null}

      {showPlacementModal && selectedPlacement ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-blue-100 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Denah Ruang Ujian</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedPlacement.roomName} • {examProgramLabels[normalizeExamProgramCode(selectedPlacement.examType)] || normalizeExamProgramCode(selectedPlacement.examType) || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPlacementModal(false)
                  setSelectedPlacement(null)
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>

            {selectedPlacement.layout?.rows && selectedPlacement.layout?.columns ? (
              <div className="mt-5 flex flex-col items-center">
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${selectedPlacement.layout.columns}, minmax(0, 1fr))`,
                  }}
                >
                  {Array.from({ length: selectedPlacement.layout.rows * selectedPlacement.layout.columns }).map((_, idx) => {
                    const rowIndex = Math.floor(idx / (selectedPlacement.layout?.columns || 1))
                    const columnIndex = idx % (selectedPlacement.layout?.columns || 1)
                    const isSeat =
                      selectedPlacement.seatPosition &&
                      selectedPlacement.seatPosition.rowIndex === rowIndex &&
                      selectedPlacement.seatPosition.columnIndex === columnIndex
                    return (
                      <div
                        key={`${rowIndex}-${columnIndex}`}
                        className={`h-8 w-8 rounded border transition ${
                          isSeat
                            ? 'seat-blink border-emerald-400 bg-emerald-200'
                            : 'cursor-default border-slate-200 bg-slate-50'
                        }`}
                        aria-label={isSeat ? 'Posisi kursi saya' : 'Kursi kosong'}
                      />
                    )
                  })}
                </div>
                <p className="mt-4 text-xs text-gray-500">
                  Kotak hijau menandakan posisi duduk Anda pada denah ruang ujian.
                </p>
                <div className="mt-4 w-full rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-left">
                  <div className="text-sm font-semibold text-emerald-900">Detail Kursi Peserta</div>
                  <div className="mt-3 grid gap-y-1 text-sm text-emerald-900 md:grid-cols-[140px_12px_minmax(0,1fr)]">
                    <div className="font-medium">Nama</div><div>:</div><div>{selectedPlacementCard?.payload.student.name || fallbackIdentityCard?.payload.student.name || '-'}</div>
                    <div className="font-medium">Kelas</div><div>:</div><div>{selectedPlacementCard?.payload.student.className || fallbackIdentityCard?.payload.student.className || '-'}</div>
                    <div className="font-medium">Username</div><div>:</div><div>{selectedPlacementCard?.payload.student.username || fallbackIdentityCard?.payload.student.username || '-'}</div>
                    <div className="font-medium">No. Peserta</div><div>:</div><div className="font-semibold text-blue-700">{selectedPlacementCard?.payload.participantNumber || '-'}</div>
                    <div className="font-medium">Ruang</div><div>:</div><div>{selectedPlacement.roomName}</div>
                    <div className="font-medium">Kursi</div><div>:</div><div>{selectedPlacement.seatLabel || '-'}</div>
                    <div className="font-medium">Sesi</div><div>:</div><div>{selectedPlacement.sessionLabel || '-'}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Denah belum dipublikasikan oleh Kurikulum.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {showProctorListModal && selectedPlacementGroup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6">
          <div className="flex max-h-[calc(100vh-96px)] w-full max-w-3xl flex-col rounded-2xl border border-emerald-100 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Daftar Pengawas Ruang</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedPlacementGroup.roomName} • {examProgramLabels[normalizeExamProgramCode(selectedPlacementGroup.examType)] || normalizeExamProgramCode(selectedPlacementGroup.examType) || '-'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProctorListModal(false)
                  setSelectedPlacementGroup(null)
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
              >
                Tutup
              </button>
            </div>

            <div className="mt-5 overflow-y-auto pr-1">
              <div className="space-y-4">
                {groupedProctorEntries.map((group) => {
                  const isOpen = expandedProctorDayKey === group.key
                  return (
                    <div key={group.key} className="overflow-hidden rounded-xl border border-emerald-100 bg-emerald-50/40">
                      <button
                        type="button"
                        onClick={() => setExpandedProctorDayKey((current) => (current === group.key ? null : group.key))}
                        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-emerald-50/80"
                      >
                        <div>
                          <div className="text-sm font-semibold text-emerald-900">{group.label}</div>
                          <div className="mt-1 text-xs text-emerald-700">{group.entries.length} slot pengawas</div>
                        </div>
                        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-800">
                          {isOpen ? 'Tutup Hari' : 'Buka Hari'}
                          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-emerald-100 px-4 py-4">
                          <div className="space-y-2">
                            {group.entries.map((entry) => (
                              <div key={entry.id} className="rounded-lg border border-white bg-white px-3 py-3 text-sm text-gray-700 shadow-sm">
                                <div className="font-medium text-gray-900">
                                  {formatDateTimeLong(entry.startTime || '')} - {formatDateTimeLong(entry.endTime || '')}
                                </div>
                                <div className="mt-1 text-xs text-gray-500">{entry.sessionLabel || 'Sesi belum diatur'}</div>
                                <div className="mt-2 text-sm text-emerald-800">
                                  Pengawas: <span className="font-semibold">{entry.proctor?.name || 'Belum ditentukan'}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Start Exam Confirmation Modal */}
      {showStartModal && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/35" onClick={() => setShowStartModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-blue-600 ml-1" />
              </div>
              <h2 className="text-section-title font-bold text-gray-900 mb-2">Mulai Ujian?</h2>
              <p className="text-gray-600 font-medium">{selectedExam.title}</p>
              {selectedExam.sessionLabel ? (
                <p className="text-sm text-indigo-600 font-medium mt-1">{selectedExam.sessionLabel}</p>
              ) : null}
              <div className="flex items-center justify-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" /> {selectedExam.duration} Menit
                </span>
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" /> {selectedExam.question_count} Soal
                </span>
              </div>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 text-left rounded-r-lg">
              <h3 className="font-bold text-yellow-800 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Aturan Penting:
              </h3>
              <ul className="text-sm text-yellow-700 space-y-1 ml-1">
                <li>• Ujian otomatis masuk mode <strong>Fullscreen</strong>.</li>
                <li>• Dilarang keluar fullscreen atau buka tab lain.</li>
                <li>• <strong>3x Pelanggaran</strong> = Peringatan.</li>
                <li>• <strong>Pelanggaran ke-4</strong> = Auto Submit.</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowStartModal(false)}
                className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 font-bold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={confirmStartExam}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-bold transition-colors shadow-lg shadow-blue-200"
              >
                Siap & Mulai Kerjakan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
