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
} from '../../services/exam.service'
import { 
  FileText, 
  Calendar, 
  Clock, 
  Play, 
  CheckCircle, 
  XCircle,
  AlertCircle,
  Search,
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
  makeupAvailable?: boolean
  makeupDeadline?: string | null
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
  makeupAvailable?: boolean
  makeupDeadline?: string | null
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
  const [examProgramLabels, setExamProgramLabels] = useState<ExamProgramLabelMap>({})
  const [examPrograms, setExamPrograms] = useState<ExamProgram[]>([])
  const [serverTimeDrift, setServerTimeDrift] = useState<ServerTimeDriftState | null>(null)

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
          makeupAvailable: Boolean(item.makeupAvailable),
          makeupDeadline: item.makeupDeadline || null,
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

  const getStatusBadge = (exam: Exam) => {
    const status = getExamStatus(exam)

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
            Akan Datang
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

  const relevantTotal = exams.filter(e => programFilter === 'all' || normalizeExamProgramCode(e.programCode || e.type) === programFilter).length
  const pageTitle = isCandidateMode ? 'Tes Seleksi' : isApplicantMode ? 'Tes BKK' : 'Ujian'
  const pageDescription = isCandidateMode
    ? 'Lihat dan kerjakan tes yang tersedia untuk calon siswa'
    : isApplicantMode
      ? 'Lihat dan kerjakan tes rekrutmen yang terhubung dengan lowongan BKK Anda'
      : 'Lihat dan kerjakan ujian yang tersedia'
  const contextColumnTitle = isApplicantMode ? 'Lowongan / Konteks' : 'Mata Pelajaran'
  const emptyDescription =
    searchQuery || programFilter !== 'all' || statusFilter !== 'all'
      ? 'Tidak ada ujian yang sesuai dengan filter'
      : isApplicantMode
        ? 'Belum ada tes BKK yang tersedia untuk lamaran aktif Anda'
        : 'Belum ada ujian yang tersedia'

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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
        <p className="text-gray-500 mt-1">{pageDescription}</p>
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

      {/* Warning Info */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800 mb-1">
                Perhatian Sebelum Mengerjakan {isApplicantMode ? 'Tes BKK' : 'Ujian'}
              </h3>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>{isApplicantMode ? 'Tes BKK' : 'Ujian'} akan berjalan dalam mode fullscreen</li>
                <li>Jangan keluar dari fullscreen atau membuka tab/aplikasi lain</li>
                <li>Anda memiliki 3x kesempatan pelanggaran</li>
                <li>Pelanggaran ke-4 akan otomatis submit ujian Anda</li>
                <li>Pastikan koneksi internet stabil</li>
              </ul>
            </div>
          </div>
        </div>

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

          <div className="mt-4 text-sm text-gray-600">
            Menampilkan {filteredExams.length} dari {relevantTotal} {isApplicantMode ? 'tes' : 'ujian'}
          </div>
        </div>

        {/* Exams Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
            <div className="overflow-x-auto">
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
                  {filteredExams.map((exam) => {
                    const status = getExamStatus(exam)
                    const canTake = canTakeExam(exam)

                    return (
                      <tr 
                        key={exam.id} 
                        className={`hover:bg-gray-50 ${canTake ? 'bg-green-50' : ''}`}
                      >
                        {/* Ujian */}
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

                        {/* Mata Pelajaran / Konteks */}
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

                        {/* Jenis */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(exam.programCode || exam.type)}`}>
                            {getExamTypeLabel(exam)}
                          </span>
                        </td>

                        {/* Soal */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {exam.question_count || 0}
                          </div>
                          <div className="text-xs text-gray-500">soal</div>
                        </td>

                        {/* Durasi */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <div className="text-sm font-medium text-gray-900">
                            {exam.duration}
                          </div>
                          <div className="text-xs text-gray-500">menit</div>
                        </td>

                        {/* Waktu */}
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
                            {getExamStatus(exam) === 'makeup' && exam.makeupDeadline ? (
                              <div className="flex items-center gap-1 text-orange-600 mt-1">
                                <Clock className="w-3 h-3" />
                                <span>Susulan sampai: {formatDateShort(exam.makeupDeadline)}</span>
                              </div>
                            ) : null}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {getStatusBadge(exam)}
                        </td>

                        {/* Aksi */}
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
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      {/* Start Exam Confirmation Modal */}
      {showStartModal && selectedExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={() => setShowStartModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-blue-600 ml-1" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Mulai Ujian?</h2>
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
