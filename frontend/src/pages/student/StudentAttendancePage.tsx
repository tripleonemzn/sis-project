import { useState, useEffect, useCallback } from 'react';
import { 
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText
} from 'lucide-react';
import clsx from 'clsx';

interface Attendance {
  id: number;
  date: string;
  status: 'PRESENT' | 'SICK' | 'PERMISSION' | 'ALPHA' | 'ABSENT' | 'LATE';
  notes?: string | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
}

const STATUS_LABELS = {
  PRESENT: { label: 'Hadir', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  SICK: { label: 'Sakit', color: 'bg-blue-100 text-blue-700', icon: AlertCircle },
  PERMISSION: { label: 'Izin', color: 'bg-yellow-100 text-yellow-700', icon: FileText }, // Need to import FileText
  ALPHA: { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle },
  ABSENT: { label: 'Alpha', color: 'bg-red-100 text-red-700', icon: XCircle },
  LATE: { label: 'Terlambat', color: 'bg-orange-100 text-orange-700', icon: Clock },
};

import { attendanceService } from '../../services/attendance.service';

export default function StudentAttendancePage() {
  const [loading, setLoading] = useState(true);
  const [attendances, setAttendances] = useState<Attendance[]>([]);
  const [filterMonth, setFilterMonth] = useState<number>(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear());

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true);
      
      const response = await attendanceService.getStudentHistory({
        month: filterMonth,
        year: filterYear,
      });

      if (response.success) {
        setAttendances(response.data);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
      // toast.error('Gagal memuat riwayat kehadiran'); // Optional to avoid spam if just empty
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  const stats = {
    present: attendances.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length,
    sick: attendances.filter(a => a.status === 'SICK').length,
    permission: attendances.filter(a => a.status === 'PERMISSION').length,
    alpha: attendances.filter(a => a.status === 'ALPHA').length,
    late: attendances.filter(a => a.status === 'LATE').length,
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Riwayat Kehadiran
          </h1>
          <p className="text-gray-500 mt-1">Pantau kehadiran Anda setiap hari</p>
        </div>

        <div className="flex items-center bg-white p-1.5 rounded-xl border border-gray-200 shadow-sm">
          <div className="relative">
            <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="pl-9 pr-2 py-2 bg-transparent text-sm font-medium text-gray-700 outline-none focus:outline-none focus:ring-0 border-none cursor-pointer hover:text-blue-600 appearance-none"
            >
              {[...Array(12)].map((_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(0, i).toLocaleString('id-ID', { month: 'long' })}
                </option>
              ))}
            </select>
          </div>
          
          {/* Vertical Separator */}
          <div className="h-5 w-px bg-gray-300 mx-2"></div>

          <div className="relative">
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(Number(e.target.value))}
              className="py-2 px-2 bg-transparent text-sm font-medium text-gray-700 outline-none focus:outline-none focus:ring-0 border-none cursor-pointer hover:text-blue-600 appearance-none text-center"
            >
              {[0, 1, 2].map(i => {
                const y = new Date().getFullYear() - i;
                return <option key={y} value={y}>{y}</option>;
              })}
            </select>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-green-100 rounded-lg text-green-600">
              <CheckCircle className="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500 font-medium">Hadir</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.present}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500 font-medium">Sakit</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.sick}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-yellow-100 rounded-lg text-yellow-600">
              <FileText className="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500 font-medium">Izin</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.permission}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-red-100 rounded-lg text-red-600">
              <XCircle className="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500 font-medium">Alpha</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.alpha}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
              <Clock className="w-5 h-5" />
            </div>
            <span className="text-sm text-gray-500 font-medium">Telat</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{stats.late}</p>
        </div>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Detail Kehadiran</h3>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : attendances.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3">Tanggal</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Waktu Masuk</th>
                  <th className="px-6 py-3">Waktu Pulang</th>
                  <th className="px-6 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attendances.map((attendance) => {
                  const StatusIcon = STATUS_LABELS[attendance.status].icon;
                  return (
                    <tr key={attendance.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 font-medium text-gray-900">
                        {new Date(attendance.date).toLocaleDateString('id-ID', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                          STATUS_LABELS[attendance.status].color
                        )}>
                          <StatusIcon className="w-3.5 h-3.5" />
                          {STATUS_LABELS[attendance.status].label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono">
                        {attendance.checkInTime || '-'}
                      </td>
                      <td className="px-6 py-4 text-gray-600 font-mono">
                        {attendance.checkOutTime || '-'}
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {attendance.notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 bg-white">
            <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900">Tidak ada data kehadiran</h3>
            <p className="text-gray-500">Pilih bulan lain untuk melihat riwayat</p>
          </div>
        )}
      </div>
    </div>
  );
}
