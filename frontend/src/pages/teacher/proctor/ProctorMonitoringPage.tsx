import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, Clock, BookOpen, UserCircle2, MapPin } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface StudentData {
  id: number; // student ID
  name: string;
  nis: string;
  className: string;
  answeredCount?: number;
  totalQuestions?: number;
  monitoring?: {
    totalViolations?: number;
    tabSwitchCount?: number;
    fullscreenExitCount?: number;
    appSwitchCount?: number;
    lastViolationType?: string | null;
    lastViolationAt?: string | null;
    currentQuestionIndex?: number;
    currentQuestionNumber?: number;
    currentQuestionId?: string | null;
    lastSyncAt?: string | null;
  };
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';
  startTime: string | null;
  submitTime: string | null;
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  token: string | null;
  displayTitle?: string;
  subjectName?: string;
  classNames?: string[];
  teacherNames?: string[];
  monitoredScheduleIds?: number[];
  packet: {
    title: string;
    subject: { name: string };
    duration: number;
  } | null;
  class: {
    id: number;
    name: string;
  } | null;
}

const ProctorMonitoringPage: React.FC = () => {
  const { id: scheduleId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const pollingInFlightRef = useRef(false);

  // Berita Acara State
  const [notes, setNotes] = useState('');
  const [incident, setIncident] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    if (!scheduleId || pollingInFlightRef.current) return;
    pollingInFlightRef.current = true;
    try {
      const res = await api.get(`/proctoring/schedules/${scheduleId}`);
      setSchedule(res.data.data.schedule);
      setStudents(res.data.data.students);
    } catch (error) {
      console.error('Error fetching proctoring data:', error);
      if (!options?.silent) {
        toast.error('Gagal memuat data ujian');
      }
    } finally {
      pollingInFlightRef.current = false;
    }
  }, [scheduleId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchData({ silent: true }).finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [fetchData]);

  useEffect(() => {
    const polling = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchData({ silent: true });
    }, 7000);
    return () => clearInterval(polling);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData({ silent: false });
    setRefreshing(false);
    toast.success('Data diperbarui');
  };

  const handleSubmitReport = async () => {
    if (!confirm('Apakah Anda yakin ingin menyimpan Berita Acara ini?')) return;

    setSubmittingReport(true);
    try {
      const presentCount = students.filter(s => s.startTime).length;
      const absentCount = students.length - presentCount;

      await api.post(`/proctoring/schedules/${scheduleId}/report`, {
        notes,
        incident,
        studentCountPresent: presentCount,
        studentCountAbsent: absentCount
      });
      toast.success('Berita Acara berhasil disimpan');
    } catch (error) {
      console.error('Error submitting report:', error);
      toast.error('Gagal menyimpan Berita Acara');
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!schedule) return <div className="p-6">Jadwal tidak ditemukan</div>;

  const romanLevelRank = (level: string): number => {
    const value = String(level || '').toUpperCase();
    if (value === 'X') return 10;
    if (value === 'XI') return 11;
    if (value === 'XII') return 12;
    return 99;
  };

  const parseClassName = (raw: string) => {
    const text = String(raw || '').trim();
    const parts = text.split(/\s+/).filter(Boolean);
    const level = parts[0] || '';
    const tail = parts.slice(1).join(' ');
    const numberMatch = tail.match(/(\d+)\s*$/);
    const roomNumber = numberMatch ? Number(numberMatch[1]) : Number.MAX_SAFE_INTEGER;
    const major = numberMatch ? tail.replace(/\s*\d+\s*$/, '').trim() : tail;
    return {
      levelRank: romanLevelRank(level),
      major: major.toUpperCase(),
      roomNumber,
      original: text,
    };
  };

  const compareClassName = (a: string, b: string) => {
    const pa = parseClassName(a);
    const pb = parseClassName(b);
    if (pa.levelRank !== pb.levelRank) return pa.levelRank - pb.levelRank;
    if (pa.major !== pb.major) return pa.major.localeCompare(pb.major, 'id');
    if (pa.roomNumber !== pb.roomNumber) return pa.roomNumber - pb.roomNumber;
    return pa.original.localeCompare(pb.original, 'id');
  };

  const title = schedule.displayTitle || schedule.packet?.title || `Ujian ${schedule.subjectName || schedule.packet?.subject?.name || '-'}`;
  const subjectName = schedule.subjectName || schedule.packet?.subject?.name || '-';
  const classNames = schedule.classNames?.length ? schedule.classNames : (schedule.class?.name ? [schedule.class.name] : ['-']);
  const teacherNames = schedule.teacherNames?.length ? schedule.teacherNames : ['-'];
  const orderedClassNames = [...classNames].sort(compareClassName);
  const orderedStudents = [...students].sort((a, b) => {
    const classCompare = compareClassName(a.className || '', b.className || '');
    if (classCompare !== 0) return classCompare;
    return String(a.name || '').localeCompare(String(b.name || ''), 'id');
  });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
          <button 
            onClick={() => navigate('/teacher/proctoring')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
            <div className="h-6 w-px bg-gray-200 mt-1 hidden sm:block"></div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600 mt-1">{orderedClassNames.join(' • ')}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button 
              onClick={handleRefresh} 
              disabled={refreshing}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-5">
        <div className="space-y-5">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Status Peserta Ujian</h3>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Siswa</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Mulai</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Selesai</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {orderedStudents.map((student) => (
                      <tr key={student.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{student.nis || '-'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.className || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {student.status === 'NOT_STARTED' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Belum Mulai
                            </span>
                          )}
                          {student.status === 'IN_PROGRESS' && (
                            <div className="space-y-1">
                              <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                                Sedang Mengerjakan
                              </span>
                              <div className="text-xs text-blue-700">
                                {student.answeredCount || 0} dari {student.totalQuestions || 0} soal
                              </div>
                              <div className="text-[11px] text-blue-600">
                                Soal aktif: {student.monitoring?.currentQuestionNumber || ((student.monitoring?.currentQuestionIndex || 0) + 1)}
                              </div>
                            </div>
                          )}
                          {student.status === 'COMPLETED' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                              Selesai
                            </span>
                          )}
                          {student.status === 'TIMEOUT' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                              Waktu Habis
                            </span>
                          )}
                          {!!student.monitoring && (
                            <div className="text-[11px] text-gray-500 mt-1">
                              Pelanggaran: {student.monitoring.totalViolations || 0} (tab: {student.monitoring.tabSwitchCount || 0}, fullscreen: {student.monitoring.fullscreenExitCount || 0}, app: {student.monitoring.appSwitchCount || 0})
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.startTime ? new Date(student.startTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.submitTime ? new Date(student.submitTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Informasi Ujian</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm text-gray-500">Mata Pelajaran</label>
                <div className="mt-1 flex items-center gap-2 text-gray-900 font-medium">
                  <BookOpen className="h-4 w-4 text-gray-400" />
                  <span>{subjectName}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Guru Pengampu</label>
                <div className="mt-1 flex items-start gap-2 text-gray-900">
                  <UserCircle2 className="h-4 w-4 text-gray-400 mt-0.5" />
                  <span className="font-medium">{teacherNames.join(', ')}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Waktu</label>
                <div className="flex items-center mt-1">
                  <Clock className="h-4 w-4 mr-2 text-gray-400" />
                  <span>{new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - {new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-500">Ruangan</label>
                <div className="mt-1 flex items-center gap-2 font-medium text-gray-900">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span>{schedule.room || 'Belum ditentukan'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Berita Acara</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Catatan Pelaksanaan</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  rows={3}
                  placeholder="Contoh: Ujian berjalan lancar..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Kejadian Khusus (Opsional)</label>
                <textarea
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  rows={2}
                  placeholder="Contoh: Siswa A sakit..."
                  value={incident}
                  onChange={(e) => setIncident(e.target.value)}
                />
              </div>
              <button 
                className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                onClick={handleSubmitReport}
                disabled={submittingReport}
              >
                <Save className="h-4 w-4 mr-2" />
                {submittingReport ? 'Menyimpan...' : 'Simpan Berita Acara'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProctorMonitoringPage;
