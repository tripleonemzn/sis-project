import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Monitor, Calendar, Clock, MapPin } from 'lucide-react';
import api from '../../../services/api';
import { toast } from 'react-hot-toast';

interface ExamSchedule {
  id: number;
  startTime: string;
  endTime: string;
  room: string | null;
  proctorId: number | null;
  packet: {
    title: string;
    subject: { name: string };
    duration: number;
  } | null;
  class: {
    name: string;
  } | null;
  _count?: {
    sessions: number;
  };
}

const ProctorSchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<ExamSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'history'>('today');

  useEffect(() => {
    fetchSchedules();
  }, []);

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/exams/schedules');
      setSchedules(res.data.data);
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast.error('Gagal memuat jadwal ujian');
    } finally {
      setLoading(false);
    }
  };

  const getFilteredSchedules = () => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));

    // Get user ID from local storage to filter my proctoring duties
    // Note: The backend returns all schedules visible to the user (Author, Subject Teacher, Proctor).
    // We should visually distinguish or filter based on role if needed.
    // But user requirement says: "guru yang ditugaskan mengawas ada fitur mengawas"
    // and "guru yang mengajar mapel ... juga bisa memantau".
    // So we should show ALL schedules returned by backend because backend logic already filters what they can see/monitor.
    
    return schedules.filter(s => {
      // Filter out orphaned schedules where packet is deleted
      if (!s.packet) return false;

      const examDate = new Date(s.startTime);
      
      if (filter === 'today') {
        return examDate >= todayStart && examDate <= todayEnd;
      } else if (filter === 'upcoming') {
        return examDate > todayEnd;
      } else {
        return examDate < todayStart;
      }
    });
  };

  const filteredSchedules = getFilteredSchedules();

  const getStatusBadge = (schedule: ExamSchedule) => {
    const now = new Date();
    const start = new Date(schedule.startTime);
    const end = new Date(schedule.endTime);

    if (now < start) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Akan Datang</span>;
    } else if (now >= start && now <= end) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Sedang Berlangsung</span>;
    } else {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">Selesai</span>;
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jadwal Mengawas & Monitoring</h1>
          <p className="text-gray-600">Pantau pelaksanaan ujian yang ditugaskan kepada Anda</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow space-x-2">
        <button
          onClick={() => setFilter('today')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            filter === 'today'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Hari Ini
        </button>
        <button
          onClick={() => setFilter('upcoming')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            filter === 'upcoming'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Akan Datang
        </button>
        <button
          onClick={() => setFilter('history')}
          className={`px-4 py-2 rounded-md text-sm font-medium ${
            filter === 'history'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Riwayat
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredSchedules.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
            <Calendar className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Tidak ada jadwal ujian</h3>
            <p className="mt-1 text-sm text-gray-500">
              {filter === 'today' 
                ? 'Tidak ada ujian yang dijadwalkan hari ini.' 
                : filter === 'upcoming' 
                  ? 'Tidak ada ujian mendatang.' 
                  : 'Tidak ada riwayat ujian.'}
            </p>
          </div>
        ) : (
          filteredSchedules.map((schedule) => (
            <div key={schedule.id} className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200">
              <div className="px-4 py-5 sm:p-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900 truncate">
                      {schedule.packet?.title || 'Paket Tidak Ditemukan'}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {schedule.packet?.subject?.name || '-'} - {schedule.class?.name || '-'}
                    </p>
                  </div>
                  {getStatusBadge(schedule)}
                </div>
                
                <div className="mt-4 space-y-3">
                  <div className="flex items-center text-sm text-gray-500">
                    <Clock className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>
                      {new Date(schedule.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - 
                      {new Date(schedule.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <MapPin className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>{schedule.room || 'Ruangan belum ditentukan'}</span>
                  </div>
                  <div className="flex items-center text-sm text-gray-500">
                    <Monitor className="flex-shrink-0 mr-1.5 h-4 w-4 text-gray-400" />
                    <span>{schedule._count?.sessions || 0} Peserta Aktif</span>
                  </div>
                </div>

                <div className="mt-5">
                  <button 
                    onClick={() => navigate(`/teacher/proctoring/${schedule.id}`)}
                    className="w-full flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <Monitor className="mr-2 h-4 w-4" />
                    Pantau Ujian
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ProctorSchedulePage;
