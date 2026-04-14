import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { 
  ArrowLeft, 
  Calendar, 
  Save, 
  CheckCircle, 
  Users, 
  BookOpen, 
  Loader2,
  XCircle,
  PlusCircle,
  Clock,
  FileText
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import { attendanceService, type AttendanceStatus } from '../../services/attendance.service';

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

export const TeacherAttendancePage = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const normalizedAssignmentId = Number(assignmentId);
  const hasValidAssignmentId = Number.isInteger(normalizedAssignmentId) && normalizedAssignmentId > 0;
  
  // Local state for attendance records before saving
  const [attendanceRecords, setAttendanceRecords] = useState<Record<number, { status: AttendanceStatus; note: string }>>({});

  useEffect(() => {
    if (assignmentId && !hasValidAssignmentId) {
      navigate('/teacher/attendance', { replace: true });
    }
  }, [assignmentId, hasValidAssignmentId, navigate]);

  // 1. Fetch Assignment Details (including students)
  const { data: assignmentData, isLoading: isLoadingAssignment } = useQuery({
    queryKey: ['teacher-assignment', normalizedAssignmentId],
    queryFn: () => teacherAssignmentService.getById(normalizedAssignmentId),
    enabled: hasValidAssignmentId,
  });

  const assignment = assignmentData?.data;

  // 2. Fetch Existing Attendance for Selected Date
  const { data: attendanceData, isLoading: isLoadingAttendance } = useQuery({
    queryKey: ['subject-attendance', assignmentId, selectedDate],
    queryFn: () => attendanceService.getSubjectAttendance({
      date: selectedDate,
      classId: assignment!.classId,
      subjectId: assignment!.subjectId,
      academicYearId: assignment!.academicYearId,
    }),
    enabled:
      Boolean(assignment?.classId) &&
      Boolean(assignment?.subjectId) &&
      Boolean(assignment?.academicYearId) &&
      Boolean(selectedDate),
  });

  // 3. Initialize/Update Local State when data changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!assignment?.class.students) return;

    const initialRecords: Record<number, { status: AttendanceStatus; note: string }> = {};
    
    // Default to PRESENT for all students if no existing data
    assignment.class.students.forEach(student => {
      initialRecords[student.id] = { status: 'PRESENT', note: '' };
    });

    // If existing data found, override defaults
    if (attendanceData?.data?.records) {
      attendanceData.data.records.forEach(record => {
        if (initialRecords[record.studentId]) {
          initialRecords[record.studentId] = {
            status: record.status,
            note: record.note || '',
          };
        }
      });
    }

    setAttendanceRecords(initialRecords);
  }, [assignment, attendanceData, selectedDate]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mutation for saving
  const saveMutation = useMutation({
    mutationFn: attendanceService.saveSubjectAttendance,
    onSuccess: () => {
      toast.success('Data presensi berhasil disimpan');
      queryClient.invalidateQueries({ queryKey: ['subject-attendance', assignmentId, selectedDate] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal menyimpan presensi');
    },
  });

  const handleStatusChange = (studentId: number, status: AttendanceStatus) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleNoteChange = (studentId: number, note: string) => {
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], note }
    }));
  };

  const handleSave = () => {
    if (!assignment) return;

    const records = Object.entries(attendanceRecords).map(([studentId, data]) => ({
      studentId: Number(studentId),
      status: data.status,
      note: data.note || null,
    }));

    saveMutation.mutate({
      date: selectedDate,
      classId: assignment.classId,
      subjectId: assignment.subjectId,
      academicYearId: assignment.academicYearId,
      records,
    });
  };

  const markAll = (status: AttendanceStatus) => {
    setAttendanceRecords(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(key => {
        next[Number(key)].status = status;
      });
      return next;
    });
  };

  if (isLoadingAssignment) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-500">Memuat data kelas...</p>
      </div>
    );
  }

  if (!assignment) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-gray-900">Penugasan tidak ditemukan</h2>
        <button onClick={() => navigate(-1)} className="mt-4 text-blue-600 hover:underline">
          Kembali
        </button>
      </div>
    );
  }

  const students = Array.isArray(assignment.class?.students) ? assignment.class.students : [];
  const className = String(assignment.class?.name || 'Kelas belum tersedia');
  const subjectName = String(assignment.subject?.name || 'Mata pelajaran belum tersedia');

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Input Presensi</h1>
              <p className="text-sm text-gray-500">Catat kehadiran siswa di kelas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="date"
                id="attendance-date"
                name="attendance-date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
              <Calendar className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-blue-600 shadow-sm">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-semibold uppercase tracking-wider">Kelas</p>
              <p className="font-bold text-gray-900">{className}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-indigo-600 shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider">Mata Pelajaran</p>
              <p className="font-bold text-gray-900">{subjectName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white rounded-lg text-teal-600 shadow-sm">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-teal-600 font-semibold uppercase tracking-wider">Total Siswa</p>
              <p className="font-bold text-gray-900">{students.length} Siswa</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button 
          onClick={() => markAll('PRESENT')}
          className="whitespace-nowrap px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-200 hover:bg-green-100 transition-colors"
        >
          Semua Hadir
        </button>
        {/* Add more quick actions if needed */}
      </div>

      {/* Attendance List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {students.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Belum ada data siswa di kelas ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10 text-center">No</th>
                  <th className="px-4 py-3 min-w-[200px]">Nama Siswa</th>
                  <th className="px-4 py-3 text-center">L/P</th>
                  <th className="px-4 py-3 min-w-[350px]">Status Kehadiran</th>
                  <th className="px-4 py-3 min-w-[200px]">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {students.map((student, index) => {
                  const record = attendanceRecords[student.id] || { status: 'PRESENT', note: '' };
                  return (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-center text-gray-500">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{student.name}</div>
                        <div className="text-xs text-gray-500">
                          {student.nisn ? `${student.nisn} / ` : ''}{student.nis || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          student.gender === 'MALE' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                        }`}>
                          {student.gender === 'MALE' ? 'L' : 'P'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {STATUS_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`
                                cursor-pointer flex items-center justify-center w-10 h-10 rounded-full border transition-all select-none relative group
                                ${record.status === option.value 
                                  ? option.activeClass
                                  : option.inactiveClass
                                }
                              `}
                              title={option.label}
                            >
                              <input
                                type="radio"
                                name={`status-${student.id}`}
                                id={`status-${student.id}-${option.value}`}
                                value={option.value}
                                checked={record.status === option.value}
                                onChange={() => handleStatusChange(student.id, option.value)}
                                className="sr-only"
                              />
                              <option.icon className={`w-5 h-5 ${record.status === option.value ? option.color : 'text-gray-400 group-hover:text-gray-600'}`} />
                              {record.status === option.value && (
                                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${option.color.replace('text-', 'bg-')}`}></span>
                                  <span className={`relative inline-flex rounded-full h-3 w-3 ${option.color.replace('text-', 'bg-')}`}></span>
                                </span>
                              )}
                            </label>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          id={`note-${student.id}`}
                          name={`note-${student.id}`}
                          value={record.note || ''}
                          onChange={(e) => handleNoteChange(student.id, e.target.value)}
                          placeholder="Catatan (opsional)..."
                          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Floating Save Button */}
      <div className="fixed bottom-6 right-6 z-10">
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending || isLoadingAttendance}
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
    </div>
  );
};
