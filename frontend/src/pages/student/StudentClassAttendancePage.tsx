import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  Calendar, 
  Save, 
  Loader2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  PlusCircle,
  FileText
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { attendanceService } from '../../services/attendance.service';
import type { AttendanceStatus, AttendanceRecord } from '../../services/attendance.service';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';

type AttendanceClassPresidentUser = {
  id?: number;
  studentClass?: {
    id?: number;
    name?: string;
    presidentId?: number;
  } | null;
};

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: LucideIcon; color: string; activeClass: string; inactiveClass: string }[] = [
  { 
    value: 'PRESENT', 
    label: 'Hadir', 
    icon: CheckCircle, 
    color: 'text-green-600',
    activeClass: 'bg-green-100 text-green-700 border-green-200 ring-1 ring-green-400',
    inactiveClass: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
  },
  { 
    value: 'SICK', 
    label: 'Sakit', 
    icon: PlusCircle, 
    color: 'text-blue-600',
    activeClass: 'bg-blue-100 text-blue-700 border-blue-200 ring-1 ring-blue-400',
    inactiveClass: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
  },
  { 
    value: 'PERMISSION', 
    label: 'Izin', 
    icon: FileText, 
    color: 'text-yellow-600',
    activeClass: 'bg-yellow-100 text-yellow-700 border-yellow-200 ring-1 ring-yellow-400',
    inactiveClass: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
  },
  { 
    value: 'ABSENT', 
    label: 'Alpha', 
    icon: XCircle, 
    color: 'text-red-600',
    activeClass: 'bg-red-100 text-red-700 border-red-200 ring-1 ring-red-400',
    inactiveClass: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
  },
  { 
    value: 'LATE', 
    label: 'Telat', 
    icon: Clock, 
    color: 'text-orange-600',
    activeClass: 'bg-orange-100 text-orange-700 border-orange-200 ring-1 ring-orange-400',
    inactiveClass: 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
  },
];

export const StudentClassAttendancePage = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceData, setAttendanceData] = useState<Record<number, { status: AttendanceStatus; note: string }>>({});

  // Get current user data
  const { data: userResponse } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
  });

  const user = (userResponse as { data?: AttendanceClassPresidentUser } | undefined)?.data;
  const studentClass = user?.studentClass;
  const studentClassId = studentClass?.id;
  const isPresident = studentClass?.presidentId === user?.id;

  // Get active academic year
  const { data: activeYear } = useQuery({
    queryKey: ['active-academic-year'],
    queryFn: async () => {
      const res = await academicYearService.getActive();
      return res.data;
    },
  });
  const activeYearId = activeYear?.id;

  // Fetch daily attendance data
  const { data: dailyData, isLoading, isError } = useQuery({
    queryKey: ['student-daily-attendance', studentClassId, selectedDate],
    queryFn: () => {
      if (!studentClassId || !activeYearId) {
        throw new Error('Kelas atau tahun ajaran aktif tidak tersedia.');
      }
      return attendanceService.getDailyAttendance({
        date: selectedDate,
        classId: studentClassId,
        academicYearId: activeYearId,
      });
    },
    enabled: !!studentClassId && !!activeYearId && isPresident,
  });

  // Initialize form data when dailyData changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (dailyData?.data) {
      const initialData: Record<number, { status: AttendanceStatus; note: string }> = {};
      dailyData.data.forEach((item) => {
        if (item.student.id) {
            initialData[item.student.id] = {
            status: item.status || 'PRESENT', // Default to PRESENT if null
            note: item.note || '',
            };
        }
      });
      setAttendanceData(initialData);
    }
  }, [dailyData]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleStatusChange = (studentId: number, status: AttendanceStatus) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status
      }
    }));
  };

  const handleNoteChange = (studentId: number, note: string) => {
    setAttendanceData(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note
      }
    }));
  };

  const saveMutation = useMutation({
    mutationFn: (records: AttendanceRecord[]) => {
      if (!studentClassId || !activeYearId) {
        throw new Error('Kelas atau tahun ajaran aktif tidak tersedia.');
      }
      return attendanceService.saveDailyAttendance({
        date: selectedDate,
        classId: studentClassId,
        academicYearId: activeYearId,
        records,
      });
    },
    onSuccess: () => {
      toast.success('Presensi berhasil disimpan');
      queryClient.invalidateQueries({ queryKey: ['student-daily-attendance'] });
    },
    onError: (error: unknown) => {
      const message =
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof (error as { response?: { data?: { message?: string } } }).response?.data?.message ===
          'string'
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : 'Gagal menyimpan presensi';
      toast.error(message || 'Gagal menyimpan presensi');
    },
  });

  const handleSubmit = () => {
    const records: AttendanceRecord[] = Object.entries(attendanceData).map(([studentId, data]) => ({
      studentId: parseInt(studentId),
      status: data.status,
      note: data.note
    }));

    saveMutation.mutate(records);
  };

  if (!user) {
      return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
  }

  if (!isPresident) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex flex-col items-center justify-center text-center">
          <XCircle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Akses Ditolak</h2>
          <p className="text-gray-600">
            Halaman ini hanya dapat diakses oleh Ketua Murid.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Presensi Kelas</h1>
          <p className="text-gray-500 text-sm">
            Input kehadiran harian siswa kelas {studentClass?.name}
          </p>
        </div>
        
        <div className="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
          <Calendar className="w-5 h-5 text-gray-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="border-none focus:ring-0 text-sm text-gray-700 p-0"
            max={new Date().toISOString().split('T')[0]}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : isError ? (
           <div className="p-12 text-center text-red-500">
              Gagal memuat data presensi. Silakan coba lagi.
           </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 w-10 text-center">No</th>
                    <th className="px-4 py-3 min-w-[100px] text-center">NIS</th>
                    <th className="px-4 py-3 min-w-[200px]">Nama Siswa</th>
                    <th className="px-4 py-3 min-w-[350px] text-center">Status Kehadiran</th>
                    <th className="px-4 py-3 min-w-[200px]">Keterangan</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {dailyData?.data?.map((item, index) => (
                    <tr key={item.student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {index + 1}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">
                        {item.student.nis || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-gray-900">{item.student.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-2 justify-center">
                          {STATUS_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`
                                cursor-pointer flex items-center justify-center w-10 h-10 rounded-full border transition-all select-none relative group
                                ${attendanceData[item.student.id]?.status === option.value 
                                  ? option.activeClass
                                  : option.inactiveClass
                                }
                              `}
                              title={option.label}
                            >
                              <input
                                type="radio"
                                name={`status-${item.student.id}`}
                                value={option.value}
                                checked={attendanceData[item.student.id]?.status === option.value}
                                onChange={() => handleStatusChange(item.student.id, option.value)}
                                className="sr-only"
                              />
                              <option.icon className={`w-5 h-5 ${attendanceData[item.student.id]?.status === option.value ? option.color : 'text-gray-400 group-hover:text-gray-600'}`} />
                              {attendanceData[item.student.id]?.status === option.value && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${option.color.replace('text-', 'bg-')}`}></span>
                                  <span className={`relative inline-flex rounded-full h-3 w-3 ${option.color.replace('text-', 'bg-')}`}></span>
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="text"
                          value={attendanceData[item.student.id]?.note || ''}
                          onChange={(e) => handleNoteChange(item.student.id, e.target.value)}
                          placeholder="Catatan (opsional)..."
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Floating Save Button */}
            <div className="fixed bottom-6 right-6 z-10">
              <button
                onClick={handleSubmit}
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-1"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Save className="w-5 h-5" />
                )}
                <span className="font-bold">Simpan Presensi</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudentClassAttendancePage;
