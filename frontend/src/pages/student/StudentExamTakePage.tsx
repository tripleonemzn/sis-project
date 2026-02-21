import { useState, useEffect, useRef, useCallback } from 'react'
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
  correct_answer: any
  options?: any[]
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

export default function StudentExamTakePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  // Exam data
  const [exam, setExam] = useState<Exam | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  
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
  const endTimeRef = useRef<number | null>(null)

  const hasStartedRef = useRef(false)
  
  // Get current user
  const { user: contextUser } = useOutletContext<{ user: any }>() || {};
  const { data: authData } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    enabled: !contextUser,
    staleTime: 1000 * 60 * 5,
  })
  const user = contextUser || authData?.data

  // Fetch exam data
  useEffect(() => {
    if (id && user) {
      fetchExam()
    }
  }, [id, user])

  // Check fullscreen status
  const [isFullscreen, setIsFullscreen] = useState(false)
  
  useEffect(() => {
    const checkFullscreen = () => {
      const isFS = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
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
    const elem = document.documentElement
    try {
      if (elem.requestFullscreen) {
        await elem.requestFullscreen()
      } else if ((elem as any).webkitRequestFullscreen) {
        await (elem as any).webkitRequestFullscreen()
      } else if ((elem as any).mozRequestFullScreen) {
        await (elem as any).mozRequestFullScreen()
      } else if ((elem as any).msRequestFullscreen) {
        await (elem as any).msRequestFullscreen()
      }
      setIsFullscreen(true)
    } catch (err) {
      console.error('Fullscreen error:', err)
      toast.error('Gagal masuk fullscreen. Coba tekan F11 pada keyboard!')
    }
  }

  // Setup lockdown when exam is loaded AND fullscreen is active
  useEffect(() => {
    if (exam && exam.questions && exam.questions.length > 0 && !loading && isFullscreen && !hasStartedRef.current) {
      hasStartedRef.current = true
      setupLockdown()
      startTimer()
    }
  }, [exam, loading, isFullscreen])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupLockdown()
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current)
      }
    }
  }, [])

  const hasAutoSubmitted = useRef(false)

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

    const formattedAnswers: Record<string, any> = {}
    exam?.questions.forEach(q => {
      formattedAnswers[q.id] = answers[q.id] || null
    })

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
      } catch {}
      const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
      navigate(returnRoute, { replace: true })
    } catch (error: any) {
      console.error('Error auto-submitting:', error)
      // Still navigate even if submit fails
      const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
      navigate(returnRoute, { replace: true })
    }
  }, [submitting, exam, answers, id, navigate])

  // Auto-submit when time runs out
  useEffect(() => {
    if (timeRemaining <= 0 && examStartTime && !hasAutoSubmitted.current) {
      handleAutoSubmit('Waktu habis')
    }
  }, [timeRemaining, examStartTime, handleAutoSubmit])

  // Auto-submit on 4th violation
  useEffect(() => {
    if (violations >= 4 && examStartTime && !hasAutoSubmitted.current) {
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
           } catch {}
           const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
           navigate(returnRoute, { replace: true })
           return
        }

        // Handle wrapper structure from backend (session + packet)
        const packet = examData.packet || examData
        
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
          const shuffleArray = (array: any[]) => {
            for (let i = array.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
          };

          // 1. Process questions and randomize options
          let processedQuestions = questions
            .filter((q: any) => q)
            .map((q: any) => ({
              ...q,
              question_text: q.question_text || q.content,
              question_type: q.question_type || q.type,
              options: q.options ? shuffleArray(q.options.map((opt: any) => ({
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
    } catch (error: any) {
      console.error('❌ Error fetching exam:', error.response?.data || error)
      const errorMessage = error.response?.data?.message || 'Gagal memuat ujian'
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
    document.addEventListener('keydown', preventKeyboardShortcuts)
    
    // Detect fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)
    document.addEventListener('MSFullscreenChange', handleFullscreenChange)
    
    // Detect visibility changes (tab switching)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Detect window blur (switching to other apps)
    window.addEventListener('blur', handleWindowBlur)
    
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
    document.removeEventListener('keydown', preventKeyboardShortcuts)
    document.removeEventListener('fullscreenchange', handleFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    document.removeEventListener('MSFullscreenChange', handleFullscreenChange)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    window.removeEventListener('blur', handleWindowBlur)
    document.removeEventListener('copy', preventCopyPaste)
    document.removeEventListener('paste', preventCopyPaste)
    document.removeEventListener('cut', preventCopyPaste)
    
    document.body.style.userSelect = ''
    document.body.style.webkitUserSelect = ''
    
    exitFullscreen()
  }

  const requestFullscreen = () => {
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch(() => {
        recordViolation('Gagal masuk fullscreen')
      })
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen()
    } else if ((elem as any).mozRequestFullScreen) {
      (elem as any).mozRequestFullScreen()
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen()
    }
  }

  const exitFullscreen = () => {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {})
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen()
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen()
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen()
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
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    )

    if (!isCurrentlyFullscreen && examStartTime) {
      recordViolation('Keluar dari fullscreen')
      // Try to re-enter fullscreen
      setTimeout(() => {
        requestFullscreen()
      }, 100)
    }
  }

  const handleVisibilityChange = () => {
    if (document.hidden && examStartTime) {
      recordViolation('Berpindah tab')
    }
  }

  const handleWindowBlur = () => {
    if (examStartTime) {
      recordViolation('Berpindah aplikasi')
    }
  }

  const recordViolation = (type: string) => {
    // Grace period: Don't record violations in the first 5 seconds
    if (examStartTime && (new Date().getTime() - examStartTime.getTime()) < 5000) {
      return;
    }

    setViolations(prev => {
      const newCount = prev + 1
      
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

  const handleAnswerChange = (questionId: string, answer: any, isComplex: boolean = false) => {
    setAnswers(prev => {
      if (isComplex) {
        // Handle Complex Multiple Choice (Array of IDs)
        const currentAnswers = (prev[questionId] as string[]) || [];
        const answerId = answer as string;
        
        if (currentAnswers.includes(answerId)) {
          // Remove if exists
          return {
            ...prev,
            [questionId]: currentAnswers.filter(id => id !== answerId)
          };
        } else {
          // Add if not exists
          return {
            ...prev,
            [questionId]: [...currentAnswers, answerId]
          };
        }
      }
      
      // Simple Multiple Choice / Essay
      return {
        ...prev,
        [questionId]: answer
      };
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
      const formattedAnswers: Record<string, any> = {}
      exam?.questions.forEach(q => {
        formattedAnswers[q.id] = answers[q.id] || null
      })

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
        } catch {}
        
        const returnRoute = sessionStorage.getItem('last_exam_route') || '/student/exams'
        navigate(returnRoute)
      }
    } catch (error: any) {
      console.error('Error submitting exam:', error)
      toast.error(error.response?.data?.message || 'Gagal mengumpulkan ujian')
      setSubmitting(false)
    }
  }

  // Fullscreen Gate - MUST enter fullscreen before starting exam
  if (!isFullscreen) {
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

  const currentQuestion = exam.questions[currentQuestionIndex]
  
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

  const mediaSection = (
    <>
      {(currentQuestion.question_image_url || currentQuestion.image_url) && (
        <div className="mb-8 flex justify-center">
          <img 
            src={currentQuestion.question_image_url || currentQuestion.image_url || ''} 
            alt="Question" 
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
                    allowFullScreen
                    title="YouTube Video"
                />
            </div>
          ) : (
            <video 
              src={currentQuestion.question_video_url || currentQuestion.video_url || ''} 
              controls 
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
                <span className="font-bold">{violations}/3</span>
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
      <div className="pt-24 pb-24 max-w-7xl mx-auto px-4">
        <div className="flex gap-6">
          {/* Left: Question Area */}
          <div className="flex-1">
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
                className="prose max-w-none text-lg text-gray-800 mb-8"
                dangerouslySetInnerHTML={{ __html: currentQuestion.question_text || currentQuestion.content || '' }}
              />

              {/* Media (Bottom) */}
              {currentQuestion.question_media_position === 'bottom' && mediaSection}

              {/* Options */}
              {currentQuestion.question_type !== 'ESSAY' && (
                <div className="space-y-3">
                  {currentQuestion.options?.map((option) => {
                    const isComplex = currentQuestion.question_type === 'COMPLEX_MULTIPLE_CHOICE';
                    const isSelected = isComplex 
                        ? (answers[currentQuestion.id] as string[] || []).includes(option.id)
                        : answers[currentQuestion.id] === option.id;

                    return (
                    <label 
                      key={option.id}
                      className={`
                        flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-gray-50
                        ${isSelected 
                          ? 'border-blue-500 bg-blue-50/50' 
                          : 'border-gray-200'}
                      `}
                    >
                      <div className="flex items-center h-full pt-1">
                        <input
                          type={isComplex ? "checkbox" : "radio"}
                          name={`question-${currentQuestion.id}`}
                          value={option.id}
                          checked={isSelected}
                          onChange={() => handleAnswerChange(currentQuestion.id, option.id, isComplex)}
                          className={`w-5 h-5 text-blue-600 border-gray-300 focus:ring-blue-500 ${isComplex ? 'rounded' : ''}`}
                        />
                      </div>
                      <div className="flex-1">
                        {/* Support both option_text (legacy) and content (new) */}
                        <div className="font-medium text-gray-700" dangerouslySetInnerHTML={{ __html: option.option_text || option.content || '' }}></div>
                        {(option.option_image_url || option.image_url) && (
                          <img 
                            src={option.option_image_url || option.image_url} 
                            alt="Option" 
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
                  <textarea
                    value={answers[currentQuestion.id] || ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    className="w-full h-48 p-4 border border-gray-300 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-700"
                    placeholder="Tulis jawaban Anda di sini..."
                  />
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
