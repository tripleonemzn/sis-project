import { useState, useEffect, useRef } from 'react';
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
  FileText,
  BarChart3,
  Filter,
  Eye,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { teacherAssignmentService } from '../../services/teacherAssignment.service';
import {
  attendanceService,
  type AttendanceDetailStudent,
  type AttendanceRecapPeriod,
  type AttendanceStatus,
} from '../../services/attendance.service';

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; icon: LucideIcon; color: string; activeClass: string; inactiveClass: string }[] = [
  { 
    value: 'PRESENT', 
    label: 'Hadir', 
    icon: CheckCircle, 
    color: 'text-green-600',
    activeClass: 'text-green-700',
    inactiveClass: 'text-gray-400 hover:text-gray-600'
  },
  { 
    value: 'SICK', 
    label: 'Sakit', 
    icon: PlusCircle, 
    color: 'text-blue-600',
    activeClass: 'text-blue-700',
    inactiveClass: 'text-gray-400 hover:text-gray-600'
  },
  { 
    value: 'PERMISSION', 
    label: 'Izin', 
    icon: FileText, 
    color: 'text-yellow-600',
    activeClass: 'text-yellow-700',
    inactiveClass: 'text-gray-400 hover:text-gray-600'
  },
  { 
    value: 'ABSENT', 
    label: 'Alpha', 
    icon: XCircle, 
    color: 'text-red-600',
    activeClass: 'text-red-700',
    inactiveClass: 'text-gray-400 hover:text-gray-600'
  },
  { 
    value: 'LATE', 
    label: 'Telat', 
    icon: Clock, 
    color: 'text-orange-600',
    activeClass: 'text-orange-700',
    inactiveClass: 'text-gray-400 hover:text-gray-600'
  },
];

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  ABSENT: 'Alpha',
  LATE: 'Telat',
};

const formatDate = (value?: string | Date | null) =>
  value ? new Date(value).toLocaleDateString('id-ID') : '-';

const formatDateTime = (value?: string | Date | null) =>
  value
    ? new Date(value).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '-';

export const TeacherAttendancePage = () => {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<'input' | 'recap'>('input');
  const [recapPeriod, setRecapPeriod] = useState<AttendanceRecapPeriod>('SEMESTER');
  const [recapSemester, setRecapSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [recapMonth, setRecapMonth] = useState(new Date().getMonth() + 1);
  const [recapYear, setRecapYear] = useState(new Date().getFullYear());
  const [recapWeekStart, setRecapWeekStart] = useState(new Date().toISOString().split('T')[0]);
  const [selectedRecapStudent, setSelectedRecapStudent] = useState<AttendanceDetailStudent | null>(null);
  const normalizedAssignmentId = Number(assignmentId);
  const hasValidAssignmentId = Number.isInteger(normalizedAssignmentId) && normalizedAssignmentId > 0;
  
  // Local state for attendance records before saving
  const [attendanceRecords, setAttendanceRecords] = useState<Record<number, { status: AttendanceStatus; note: string }>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const hydratedContextKeyRef = useRef<string>('');

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

  const { data: recapData, isLoading: isLoadingRecap } = useQuery({
    queryKey: [
      'subject-attendance-recap',
      assignmentId,
      recapPeriod,
      recapSemester,
      recapMonth,
      recapYear,
      recapWeekStart,
    ],
    queryFn: () => attendanceService.getSubjectRecap({
      classId: assignment!.classId,
      subjectId: assignment!.subjectId,
      academicYearId: assignment!.academicYearId,
      period: recapPeriod,
      semester: recapPeriod === 'SEMESTER' ? recapSemester : undefined,
      month: recapPeriod === 'MONTH' ? recapMonth : undefined,
      year: recapPeriod === 'MONTH' ? recapYear : undefined,
      weekStart: recapPeriod === 'WEEK' ? recapWeekStart : undefined,
    }),
    enabled:
      activeTab === 'recap' &&
      Boolean(assignment?.classId) &&
      Boolean(assignment?.subjectId) &&
      Boolean(assignment?.academicYearId),
  });

  // 3. Initialize/Update Local State when data changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!assignment?.class.students) return;

    const nextContextKey = `${assignment.id}:${selectedDate}`;
    const shouldForceHydrate = hydratedContextKeyRef.current !== nextContextKey;
    if (hasUnsavedChanges && !shouldForceHydrate) {
      return;
    }

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
    hydratedContextKeyRef.current = nextContextKey;
    setHasUnsavedChanges(false);
  }, [assignment, attendanceData, selectedDate, hasUnsavedChanges]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mutation for saving
  const saveMutation = useMutation({
    mutationFn: attendanceService.saveSubjectAttendance,
    onSuccess: () => {
      setHasUnsavedChanges(false);
      toast.success('Data presensi berhasil disimpan');
      queryClient.invalidateQueries({ queryKey: ['subject-attendance', assignmentId, selectedDate] });
      queryClient.invalidateQueries({ queryKey: ['subject-attendance-recap', assignmentId] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal menyimpan presensi');
    },
  });

  const handleStatusChange = (studentId: number, status: AttendanceStatus) => {
    setHasUnsavedChanges(true);
    setAttendanceRecords(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], status }
    }));
  };

  const handleNoteChange = (studentId: number, note: string) => {
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
  const recapStudents = (recapData?.data?.students || [])
    .slice()
    .sort((a, b) => a.student.name.localeCompare(b.student.name));

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
              <p className="text-body text-gray-500">Catat kehadiran siswa di kelas</p>
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

        <div className="mt-4 border-b border-gray-200">
          <div className="flex gap-6 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('input')}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === 'input'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Input Presensi
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('recap')}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium ${
                activeTab === 'recap'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <BarChart3 className="h-4 w-4" />
              Rekap Presensi
            </button>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {activeTab === 'input' && <div className="flex gap-2 overflow-x-auto pb-2">
        <button 
          onClick={() => markAll('PRESENT')}
          className="whitespace-nowrap px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-200 hover:bg-green-100 transition-colors"
        >
          Semua Hadir
        </button>
        {/* Add more quick actions if needed */}
      </div>}

      {/* Attendance List */}
      {activeTab === 'input' && <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                        <div className="flex flex-wrap gap-4">
                          {STATUS_OPTIONS.map((option) => (
                            <label
                              key={option.value}
                              className={`
                                cursor-pointer inline-flex flex-col items-center justify-start min-w-[54px] transition-all select-none relative group
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
                              <span className="relative flex h-7 items-center justify-center">
                                <option.icon className={`w-6 h-6 ${record.status === option.value ? option.color : 'text-gray-400 group-hover:text-gray-600'}`} />
                                {record.status === option.value ? (
                                  <span className={`absolute -top-1.5 right-[-4px] h-2.5 w-2.5 rounded-full ${option.color.replace('text-', 'bg-')}`}></span>
                                ) : null}
                              </span>
                              <span
                                className={`mt-1 text-[11px] font-semibold ${
                                  record.status === option.value ? option.color : 'text-gray-500 group-hover:text-gray-700'
                                }`}
                              >
                                {option.label}
                              </span>
                              {record.status === option.value && (
                                <span className="mt-1 h-0.5 w-8 rounded-full bg-current opacity-70">
                                  <span className="sr-only">Status aktif</span>
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
      </div>}

      {activeTab === 'recap' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-end gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Filter className="h-4 w-4 text-blue-600" />
                Filter Rekap
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Jenis Periode</label>
                <select
                  value={recapPeriod}
                  onChange={(event) => setRecapPeriod(event.target.value as AttendanceRecapPeriod)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="WEEK">Mingguan</option>
                  <option value="MONTH">Bulanan</option>
                  <option value="SEMESTER">Semester</option>
                  <option value="YEAR">1 Tahun Ajaran</option>
                </select>
              </div>
              {recapPeriod === 'WEEK' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Tanggal Minggu</label>
                  <input
                    type="date"
                    value={recapWeekStart}
                    onChange={(event) => setRecapWeekStart(event.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              )}
              {recapPeriod === 'MONTH' && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Bulan</label>
                    <select
                      value={recapMonth}
                      onChange={(event) => setRecapMonth(Number(event.target.value))}
                      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    >
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                        <option key={month} value={month}>
                          {new Date(2026, month - 1, 1).toLocaleString('id-ID', { month: 'long' })}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Tahun</label>
                    <input
                      type="number"
                      value={recapYear}
                      onChange={(event) => setRecapYear(Number(event.target.value))}
                      className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                </>
              )}
              {recapPeriod === 'SEMESTER' && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Semester</label>
                  <select
                    value={recapSemester}
                    onChange={(event) => setRecapSemester(event.target.value as 'ODD' | 'EVEN')}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
              )}
              {recapData?.data?.meta?.dateRange && (
                <div className="text-xs text-gray-500 lg:ml-auto">
                  Periode: <span className="font-semibold text-gray-700">{formatDate(recapData.data.meta.dateRange.start)} - {formatDate(recapData.data.meta.dateRange.end)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {isLoadingRecap ? (
              <div className="flex items-center justify-center p-12 text-gray-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" />
                Memuat rekap presensi...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Siswa</th>
                      <th className="px-4 py-3 text-center">Hadir</th>
                      <th className="px-4 py-3 text-center">Sakit</th>
                      <th className="px-4 py-3 text-center">Izin</th>
                      <th className="px-4 py-3 text-center">Alpha</th>
                      <th className="px-4 py-3 text-center">Telat</th>
                      <th className="px-4 py-3 text-center">Total</th>
                      <th className="px-4 py-3 text-center">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recapStudents.map((student) => (
                      <tr key={student.student.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-gray-900">{student.student.name}</div>
                          <div className="text-xs text-gray-500">NIS: {student.student.nis || '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-emerald-700">{student.summary.present}</td>
                        <td className="px-4 py-3 text-center font-semibold text-blue-700">{student.summary.sick}</td>
                        <td className="px-4 py-3 text-center font-semibold text-yellow-700">{student.summary.permission}</td>
                        <td className="px-4 py-3 text-center font-semibold text-red-700">{student.summary.absent}</td>
                        <td className="px-4 py-3 text-center font-semibold text-orange-700">{student.summary.late}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-800">{student.summary.total}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => setSelectedRecapStudent(student)}
                            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </button>
                        </td>
                      </tr>
                    ))}
                    {recapStudents.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                          Belum ada rekap presensi untuk periode ini.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Save Button */}
      {activeTab === 'input' && <div className="fixed bottom-6 right-6 z-10">
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
      </div>}

      {selectedRecapStudent && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/20 p-4">
          <div className="max-h-[82vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Detail Presensi {selectedRecapStudent.student.name}</h2>
                <p className="text-sm text-gray-500">Tanggal dan status presensi mapel pada periode terpilih.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecapStudent(null)}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[62vh] overflow-y-auto p-5">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Tanggal</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Catatan</th>
                    <th className="px-3 py-2 text-left">Input / Edit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selectedRecapStudent.details.map((detail) => (
                    <tr key={`${detail.attendanceId}-${detail.date}-${detail.status}`}>
                      <td className="px-3 py-2 font-medium text-gray-900">{formatDate(detail.date)}</td>
                      <td className="px-3 py-2">{STATUS_LABELS[detail.status]}</td>
                      <td className="px-3 py-2 text-gray-600">{detail.note || '-'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        <div>Input: {formatDateTime(detail.recordedAt)}</div>
                        <div>Edit: {formatDateTime(detail.editedAt)}</div>
                      </td>
                    </tr>
                  ))}
                  {selectedRecapStudent.details.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-gray-500">
                        Belum ada detail presensi pada periode ini.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
