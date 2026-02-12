import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save, Clock } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface StudentData {
  id: number; // student ID
  name: string;
  nis: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';
  startTime: string | null;
  submitTime: string | null;
  score?: number;
}

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  token: string;
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
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState<ExamSchedule | null>(null);
  const [students, setStudents] = useState<StudentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Berita Acara State
  const [notes, setNotes] = useState('');
  const [incident, setIncident] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const fetchData = async () => {
    try {
      const res = await api.get(`/proctoring/schedules/${scheduleId}`);
      setSchedule(res.data.data.schedule);
      setStudents(res.data.data.students);
    } catch (error) {
      console.error('Error fetching proctoring data:', error);
      toast.error('Gagal memuat data ujian');
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [scheduleId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate('/teacher/proctoring')}
            className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{schedule.packet?.title || 'Paket Tidak Ditemukan'}</h1>
            <p className="text-gray-500">{schedule.class?.name || '-'} - {schedule.packet?.subject?.name || '-'}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Status Peserta Ujian</h3>
            </div>
            <div className="p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Mulai</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu Selesai</th>
                      <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nilai</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {students.map((student) => (
                      <tr key={student.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{student.name}</div>
                          <div className="text-sm text-gray-500">{student.nis}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {student.status === 'NOT_STARTED' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">
                              Belum Mulai
                            </span>
                          )}
                          {student.status === 'IN_PROGRESS' && (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                              Mengerjakan
                            </span>
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
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.startTime ? new Date(student.startTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.submitTime ? new Date(student.submitTime).toLocaleTimeString('id-ID') : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {student.score !== undefined ? student.score : '-'}
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
                <label className="text-sm text-gray-500">Token Ujian</label>
                <div className="text-2xl font-mono font-bold text-gray-900 tracking-widest mt-1">
                  {schedule.token}
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
                <div className="mt-1 font-medium">{schedule.room || 'Belum ditentukan'}</div>
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
