import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'
import { examService } from '../../services/exam.service'
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

interface Exam {
  id: string
  title: string
  description: string
  type: 'QUIZ' | 'SBTS' | 'SAS'
  start_time: string
  end_time: string
  duration: number
  is_published: boolean
  subject: {
    id: string
    name: string
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
}

export default function StudentExamsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState<Exam[]>([])
  const [filteredExams, setFilteredExams] = useState<Exam[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showStartModal, setShowStartModal] = useState(false)
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (location.pathname.includes('/formatif')) {
      setTypeFilter('FORMATIF')
    } else if (location.pathname.includes('/sbts')) {
      setTypeFilter('SBTS')
    } else if (location.pathname.includes('/sas')) {
      setTypeFilter('SAS')
    } else if (location.pathname.includes('/sat')) {
      setTypeFilter('SAT')
    } else {
      setTypeFilter('all')
    }
  }, [location.pathname])

  useEffect(() => {
    const lastType = sessionStorage.getItem('last_exam_type')
    if (lastType) {
      setTypeFilter(lastType)
      sessionStorage.removeItem('last_exam_type')
    }
  }, [])

  useEffect(() => {
    filterExams()
  }, [exams, searchQuery, typeFilter, statusFilter])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      const res = await examService.getAvailableExams()

      const resData = res.data || []
      // support new shape: { exams: [], suppressed: [] } or legacy array
      const rawData = Array.isArray(resData) ? resData : (resData.exams || [])
      const suppressed = Array.isArray(resData) ? [] : (resData.suppressed || [])
      
      const mappedExams = rawData.map((item: any) => ({
        id: item.id,
        title: item.packet?.title || 'Untitled Exam',
        description: item.packet?.description || '',
        type: item.packet?.type || 'QUIZ',
        start_time: item.startTime,
        end_time: item.endTime,
        duration: item.packet?.duration || 0,
        is_published: true,
        subject: item.packet?.subject || { name: 'Unknown Subject' },
        question_count: Array.isArray(item.packet?.questions) ? item.packet.questions.length : 0,
        total_points: 100,
        status: item.status,
        has_submitted: 
          item.has_submitted || 
          item.status === 'COMPLETED' || 
          item.status === 'GRADED' || 
          !!(item.sessions?.[0]?.submittedAt || item.sessions?.[0]?.endTime || item.sessions?.[0]?.isFinal),
        score: item.sessions?.[0] ? {
            score: item.sessions[0].score || 0,
            max_score: 100,
            percentage: 0
        } : undefined,
        isBlocked: item.isBlocked,
        blockReason: item.blockReason
      }))

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
              {suppressed.slice(0,3).map((s: any) => (<li key={s.exam_id}>{s.title}{s.reason ? ` — ${s.reason}` : ''}</li>))}
            </ul>
            <div className="text-xs mt-2">Hubungi wali kelas untuk informasi lebih lanjut</div>
          </div>
        ), { duration: 10000 })
      }
    } catch (error: any) {
      toast.error('Gagal memuat data ujian')
    } finally {
      setLoading(false)
    }
  }

  const filterExams = () => {
    let filtered = [...exams]

    if (typeFilter !== 'all') {
      filtered = filtered.filter(e => e.type === typeFilter)
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(e => {
        const status = getExamStatus(e)
        return status === statusFilter
      })
    }

    if (searchQuery) {
      filtered = filtered.filter(e =>
        (e.title || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.subject?.name || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    setFilteredExams(filtered)
  }

  const getExamStatus = (exam: Exam) => {
    if (exam.status === 'ongoing' || exam.status === 'IN_PROGRESS' && !exam.has_submitted) return 'available'
    if (exam.status === 'completed' || exam.has_submitted) return 'completed'
    if (exam.status === 'upcoming') return 'upcoming'
    if (exam.status === 'missed') return 'expired'
    
    const now = new Date()
    const startTime = new Date(exam.start_time)
    const endTime = new Date(exam.end_time)

    if (exam.score) return 'graded'
    if (exam.has_submitted) return 'completed'
    if (now < startTime) return 'upcoming'
    if (now > endTime) return 'expired'
    return 'available'
  }

  const canTakeExam = (exam: Exam) => {
    const status = getExamStatus(exam)
    const now = new Date()
    const startTime = new Date(exam.start_time)
    const endTime = new Date(exam.end_time)
    
    const canTake = status === 'available' && 
                    exam.is_published && 
                    !exam.has_submitted &&
                    now >= startTime && 
                    now <= endTime &&
                    !exam.isBlocked
    
    return canTake
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

    // Request fullscreen FIRST to preserve user gesture
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
    } catch (err) {
      toast.error('Gagal masuk fullscreen otomatis. Mohon tekan F11.')
    }

    setShowStartModal(false)

    // Persist last visited exams page context for return navigation
    try {
      if (selectedExam?.type) {
        sessionStorage.setItem('last_exam_type', selectedExam.type)
      }
      sessionStorage.setItem('last_exam_route', location.pathname)
    } catch {}

    // Give browser a moment to update state before navigating
    // This prevents the next page from thinking we're not in fullscreen
    setTimeout(() => {
      navigate(`/student/exams/${selectedExam.id}/take`, { state: { exam: selectedExam } })
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

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'QUIZ':
      case 'FORMATIF':
        return 'bg-blue-100 text-blue-800'
      case 'SBTS':
        return 'bg-orange-100 text-orange-800'
      case 'SAS':
        return 'bg-red-100 text-red-800'
      case 'SAT':
        return 'bg-purple-100 text-purple-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const relevantTotal = exams.filter(e => typeFilter === 'all' || e.type === typeFilter).length

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
        <h1 className="text-2xl font-bold text-gray-900">Ujian</h1>
        <p className="text-gray-500 mt-1">Lihat dan kerjakan ujian yang tersedia</p>
      </div>

      {/* Warning Info */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
          <div className="flex">
            <AlertCircle className="w-5 h-5 text-yellow-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800 mb-1">
                Perhatian Sebelum Mengerjakan Ujian
              </h3>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                <li>Ujian akan berjalan dalam mode fullscreen</li>
                <li>Jangan keluar dari fullscreen atau membuka tab/aplikasi lain</li>
                <li>Anda memiliki 3x kesempatan pelanggaran</li>
                <li>Pelanggaran ke-4 akan otomatis submit ujian Anda</li>
                <li>Pastikan koneksi internet stabil</li>
              </ul>
            </div>
          </div>
        </div>

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
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Semua Status</option>
                <option value="available">Berlangsung</option>
                <option value="upcoming">Akan Datang</option>
                <option value="completed">Sudah Dikerjakan</option>
                <option value="graded">Sudah Dinilai</option>
              </select>
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            Menampilkan {filteredExams.length} dari {relevantTotal} ujian
          </div>
        </div>

        {/* Exams Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {filteredExams.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Belum Ada Ujian</h3>
              <p className="text-gray-600">
                {searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Tidak ada ujian yang sesuai dengan filter'
                  : 'Belum ada ujian yang tersedia'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ujian
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Mata Pelajaran
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
                              {exam.description && (
                                <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                                  {exam.description}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Mata Pelajaran */}
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{exam.subject.name}</div>
                        </td>

                        {/* Jenis */}
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${getTypeColor(exam.type)}`}>
                            {exam.type}
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
                              <span>Mulai</span>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 animate-in fade-in zoom-in duration-200">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-blue-600 ml-1" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Mulai Ujian?</h2>
              <p className="text-gray-600 font-medium">{selectedExam.title}</p>
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
