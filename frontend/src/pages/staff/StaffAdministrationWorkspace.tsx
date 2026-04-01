import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck, FileText, GraduationCap, Loader2, Search, ShieldCheck, Users } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { userService } from '../../services/user.service';
import { officeService } from '../../services/office.service';
import { permissionService, type StudentPermission } from '../../services/permission.service';
import type { User } from '../../types/auth';
import { DashboardWelcomeCard } from '../../components/common/DashboardWelcomeCard';

type PermissionRow = StudentPermission & {
  student?: StudentPermission['student'] & {
    studentClass?: {
      name?: string | null;
    } | null;
  };
};

type CompletenessSummary = {
  filled: number;
  total: number;
  missing: string[];
  label: 'Lengkap' | 'Perlu Lengkapi' | 'Prioritas';
  badgeClass: string;
  textClass: string;
  progressClass: string;
};

type StudentAdministrationRow = User & {
  adminSummary: CompletenessSummary;
};

type TeacherAdministrationRow = User & {
  adminSummary: CompletenessSummary;
};

type CompletenessFilter = 'ALL' | 'Lengkap' | 'Perlu Lengkapi' | 'Prioritas';
type PermissionStatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

function matchesSearch(term: string, values: Array<string | number | null | undefined>) {
  if (!term) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(term));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function isFilled(value: string | number | null | undefined) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'number') return true;
  return String(value).trim().length > 0;
}

function buildCompletenessSummary(fields: Array<[string, string | number | null | undefined]>): CompletenessSummary {
  const missing = fields.filter(([, value]) => !isFilled(value)).map(([label]) => label);
  const total = fields.length;
  const filled = total - missing.length;
  const ratio = total === 0 ? 1 : filled / total;

  if (ratio >= 1) {
    return {
      filled,
      total,
      missing,
      label: 'Lengkap',
      badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      textClass: 'text-emerald-700',
      progressClass: 'bg-emerald-500',
    };
  }

  if (ratio >= 0.6) {
    return {
      filled,
      total,
      missing,
      label: 'Perlu Lengkapi',
      badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
      textClass: 'text-amber-700',
      progressClass: 'bg-amber-500',
    };
  }

  return {
    filled,
    total,
    missing,
    label: 'Prioritas',
    badgeClass: 'bg-rose-50 text-rose-700 border border-rose-200',
    textClass: 'text-rose-700',
    progressClass: 'bg-rose-500',
  };
}

export const StaffAdministrationWorkspace = () => {
  const location = useLocation();
  const pathname = location.pathname;
  const normalizedSearchPath = pathname.replace(/\/+$/, '') || '/staff';

  const isStudentsPage = normalizedSearchPath.startsWith('/staff/administration/students');
  const isTeachersPage = normalizedSearchPath.startsWith('/staff/administration/teachers');
  const isPermissionsPage = normalizedSearchPath.startsWith('/staff/administration/permissions');

  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [studentCompletenessFilter, setStudentCompletenessFilter] = useState<CompletenessFilter>('ALL');
  const [teacherCompletenessFilter, setTeacherCompletenessFilter] = useState<CompletenessFilter>('ALL');
  const [permissionStatusFilter, setPermissionStatusFilter] = useState<PermissionStatusFilter>('ALL');

  const meQuery = useQuery({
    queryKey: ['staff-administration-me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['staff-admin-students'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const teachersQuery = useQuery({
    queryKey: ['staff-admin-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['staff-admin-permissions'],
    queryFn: () => permissionService.getPermissions({ limit: 200 }),
    staleTime: 60_000,
  });

  const administrationSummaryQuery = useQuery({
    queryKey: ['staff-administration-summary'],
    queryFn: () => officeService.getAdministrationSummary(),
    staleTime: 60_000,
  });

  const students = useMemo<User[]>(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);
  const teachers = useMemo<User[]>(() => teachersQuery.data?.data || [], [teachersQuery.data?.data]);
  const permissions = useMemo<PermissionRow[]>(
    () => ((permissionsQuery.data?.data?.permissions as PermissionRow[]) || []),
    [permissionsQuery.data?.data?.permissions],
  );
  const currentUser = meQuery.data?.data;
  const administrationSummary = administrationSummaryQuery.data;

  const studentAdministrationRows = useMemo<StudentAdministrationRow[]>(
    () =>
      students.map((student) => ({
        ...student,
        adminSummary: buildCompletenessSummary([
          ['NIS', student.nis],
          ['NISN', student.nisn],
          ['Kelas', student.studentClass?.name],
          ['Alamat', student.address],
          ['No. HP', student.phone],
          ['Nama Ibu', student.motherName],
        ]),
      })),
    [students],
  );

  const teacherAdministrationRows = useMemo<TeacherAdministrationRow[]>(
    () =>
      teachers.map((teacher) => ({
        ...teacher,
        adminSummary: buildCompletenessSummary([
          ['NIP', teacher.nip],
          ['NUPTK', teacher.nuptk],
          ['PTK', teacher.ptkType],
          ['Status Pegawai', teacher.employeeStatus],
          ['Institusi', teacher.institution],
          ['No. HP', teacher.phone],
        ]),
      })),
    [teachers],
  );

  const normalizedStudentSearch = studentSearch.trim().toLowerCase();
  const normalizedTeacherSearch = teacherSearch.trim().toLowerCase();
  const normalizedPermissionSearch = permissionSearch.trim().toLowerCase();

  const filteredStudents = useMemo(
    () =>
      studentAdministrationRows.filter((student) => {
        const matchesTerm = matchesSearch(normalizedStudentSearch, [
          student.name,
          student.nis,
          student.nisn,
          student.studentClass?.name,
          student.studentClass?.major?.name,
          student.verificationStatus,
          student.studentStatus,
          student.adminSummary.label,
          ...student.adminSummary.missing,
        ]);
        const matchesCompleteness =
          studentCompletenessFilter === 'ALL' || student.adminSummary.label === studentCompletenessFilter;
        return matchesTerm && matchesCompleteness;
      }),
    [studentAdministrationRows, normalizedStudentSearch, studentCompletenessFilter],
  );

  const filteredTeachers = useMemo(
    () =>
      teacherAdministrationRows.filter((teacher) => {
        const matchesTerm = matchesSearch(normalizedTeacherSearch, [
          teacher.name,
          teacher.nip,
          teacher.nuptk,
          teacher.ptkType,
          teacher.employeeStatus,
          teacher.verificationStatus,
          teacher.adminSummary.label,
          ...teacher.adminSummary.missing,
        ]);
        const matchesCompleteness =
          teacherCompletenessFilter === 'ALL' || teacher.adminSummary.label === teacherCompletenessFilter;
        return matchesTerm && matchesCompleteness;
      }),
    [teacherAdministrationRows, normalizedTeacherSearch, teacherCompletenessFilter],
  );

  const filteredPermissions = useMemo(
    () =>
      permissions.filter((permission) => {
        const matchesTerm = matchesSearch(normalizedPermissionSearch, [
          permission.student?.name,
          permission.student?.nis,
          permission.student?.nisn,
          permission.student?.studentClass?.name,
          permission.type,
          permission.status,
          permission.reason,
          permission.approvalNote,
        ]);
        const matchesStatus = permissionStatusFilter === 'ALL' || permission.status === permissionStatusFilter;
        return matchesTerm && matchesStatus;
      }),
    [permissions, normalizedPermissionSearch, permissionStatusFilter],
  );

  const pendingPermissions = permissions.filter((permission) => permission.status === 'PENDING');

  const incompleteStudents = useMemo(
    () =>
      studentAdministrationRows
        .filter((student) => student.adminSummary.filled < student.adminSummary.total)
        .sort((a, b) => {
          const fillDiff = a.adminSummary.filled - b.adminSummary.filled;
          if (fillDiff !== 0) return fillDiff;
          return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
        }),
    [studentAdministrationRows],
  );

  const incompleteTeachers = useMemo(
    () =>
      teacherAdministrationRows
        .filter((teacher) => teacher.adminSummary.filled < teacher.adminSummary.total)
        .sort((a, b) => {
          const fillDiff = a.adminSummary.filled - b.adminSummary.filled;
          if (fillDiff !== 0) return fillDiff;
          return a.name.localeCompare(b.name, 'id-ID', { sensitivity: 'base' });
        }),
    [teacherAdministrationRows],
  );

  const studentCompletenessRate = studentAdministrationRows.length
    ? Math.round(
        (studentAdministrationRows.reduce((acc, row) => acc + row.adminSummary.filled / row.adminSummary.total, 0) /
          studentAdministrationRows.length) *
          100,
      )
    : 0;

  const teacherCompletenessRate = teacherAdministrationRows.length
    ? Math.round(
        (teacherAdministrationRows.reduce((acc, row) => acc + row.adminSummary.filled / row.adminSummary.total, 0) /
          teacherAdministrationRows.length) *
          100,
      )
    : 0;

  if (isStudentsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Administrasi Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">
            Validasi data dasar siswa, status verifikasi, dan kelengkapan administrasi utama.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col md:flex-row gap-3 w-full">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={studentSearch}
                onChange={(event) => setStudentSearch(event.target.value)}
                placeholder="Cari nama, NIS, NISN, kelas, atau status..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <select
              value={studentCompletenessFilter}
              onChange={(event) => setStudentCompletenessFilter(event.target.value as CompletenessFilter)}
              className="w-full md:w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Kelengkapan</option>
              <option value="Lengkap">Lengkap</option>
              <option value="Perlu Lengkapi">Perlu Lengkapi</option>
              <option value="Prioritas">Prioritas</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void studentsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <div className="text-sm text-gray-600 pt-2">
              Menampilkan {filteredStudents.length.toLocaleString('id-ID')} dari {studentAdministrationRows.length.toLocaleString('id-ID')} siswa.
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Prioritas = data inti kurang dari 60%. Lengkap = semua field inti terisi.
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {studentsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : studentsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data siswa.</div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data siswa yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Administrasi Inti</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kontak</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Siswa</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500">@{student.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {student.nis || '-'}</div>
                        <div>NISN: {student.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {student.studentClass?.name || '-'}
                        {student.studentClass?.major?.code ? ` (${student.studentClass.major.code})` : ''}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 min-w-[240px]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${student.adminSummary.badgeClass}`}>
                            {student.adminSummary.label}
                          </span>
                          <span className={`text-xs font-medium ${student.adminSummary.textClass}`}>
                            {student.adminSummary.filled}/{student.adminSummary.total} lengkap
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full ${student.adminSummary.progressClass}`}
                            style={{ width: `${Math.max((student.adminSummary.filled / student.adminSummary.total) * 100, 8)}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          {student.adminSummary.missing.length > 0
                            ? `Kurang: ${student.adminSummary.missing.join(', ')}`
                            : 'Data inti sudah lengkap.'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>{student.phone || '-'}</div>
                        <div className="text-xs text-gray-500">{student.address || 'Alamat belum diisi'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                          {student.verificationStatus || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.studentStatus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isTeachersPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Administrasi Guru</h2>
          <p className="mt-1 text-sm text-gray-500">
            Pantau data dasar guru, status verifikasi akun, dan identitas kepegawaian.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col md:flex-row gap-3 w-full">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={teacherSearch}
                onChange={(event) => setTeacherSearch(event.target.value)}
                placeholder="Cari nama, NIP, NUPTK, PTK, atau status..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <select
              value={teacherCompletenessFilter}
              onChange={(event) => setTeacherCompletenessFilter(event.target.value as CompletenessFilter)}
              className="w-full md:w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Kelengkapan</option>
              <option value="Lengkap">Lengkap</option>
              <option value="Perlu Lengkapi">Perlu Lengkapi</option>
              <option value="Prioritas">Prioritas</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void teachersQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <div className="text-sm text-gray-600 pt-2">
              Menampilkan {filteredTeachers.length.toLocaleString('id-ID')} dari {teacherAdministrationRows.length.toLocaleString('id-ID')} guru.
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Prioritas = data kepegawaian paling mendesak untuk dilengkapi.
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {teachersQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : teachersQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data guru.</div>
          ) : filteredTeachers.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data guru yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PTK</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Administrasi Inti</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kontak & Instansi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Pegawai</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTeachers.map((teacher) => (
                    <tr key={teacher.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{teacher.name}</div>
                        <div className="text-xs text-gray-500">@{teacher.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIP: {teacher.nip || '-'}</div>
                        <div>NUPTK: {teacher.nuptk || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{teacher.ptkType || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 min-w-[240px]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${teacher.adminSummary.badgeClass}`}>
                            {teacher.adminSummary.label}
                          </span>
                          <span className={`text-xs font-medium ${teacher.adminSummary.textClass}`}>
                            {teacher.adminSummary.filled}/{teacher.adminSummary.total} lengkap
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full ${teacher.adminSummary.progressClass}`}
                            style={{ width: `${Math.max((teacher.adminSummary.filled / teacher.adminSummary.total) * 100, 8)}%` }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          {teacher.adminSummary.missing.length > 0
                            ? `Kurang: ${teacher.adminSummary.missing.join(', ')}`
                            : 'Data inti sudah lengkap.'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>{teacher.phone || '-'}</div>
                        <div className="text-xs text-gray-500">{teacher.institution || 'Institusi belum diisi'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{teacher.employeeStatus || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-blue-50 text-blue-700">
                          {teacher.verificationStatus || '-'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isPermissionsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Perizinan Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">
            Monitor pengajuan izin siswa untuk kebutuhan administrasi dan tindak lanjut layanan sekolah.
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex flex-col md:flex-row gap-3 w-full">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={permissionSearch}
                onChange={(event) => setPermissionSearch(event.target.value)}
                placeholder="Cari siswa, NISN, alasan, atau status..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <select
              value={permissionStatusFilter}
              onChange={(event) => setPermissionStatusFilter(event.target.value as PermissionStatusFilter)}
              className="w-full md:w-56 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Ditolak</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void permissionsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <div className="text-sm text-gray-600 pt-2">
              Menampilkan {filteredPermissions.length.toLocaleString('id-ID')} dari {permissions.length.toLocaleString('id-ID')} pengajuan.
            </div>
          </div>
          <div className="text-xs text-gray-500">
            Filter status membantu memisahkan pengajuan baru dari arsip izin yang sudah selesai.
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {permissionsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : permissionsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data perizinan.</div>
          ) : filteredPermissions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada data perizinan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rentang</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPermissions.map((permission) => (
                    <tr key={permission.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{permission.student?.name || '-'}</div>
                        <div className="text-xs text-gray-500">
                          NISN: {permission.student?.nisn || '-'}
                          {permission.student?.studentClass?.name ? ` • ${permission.student.studentClass.name}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.type}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(permission.startDate)} - {formatDate(permission.endDate)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700">
                          {permission.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {permission.reason || permission.approvalNote || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DashboardWelcomeCard
        user={currentUser}
        eyebrow="Staff Administrasi"
        subtitle="Fokus pada administrasi siswa, administrasi guru, dan arus layanan administratif sekolah."
        tone="emerald"
        className="mt-10"
        fallbackName="Staff Administrasi"
      />

      {administrationSummaryQuery.isError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Ringkasan administrasi terpusat gagal dimuat. Dashboard tetap memakai data dasar yang tersedia.
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <Link to="/staff/administration/students" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Data Siswa</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">
              {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.totalStudents ?? studentAdministrationRows.length).toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-blue-800/70">Total siswa terdaftar</p>
          </div>
        </Link>

        <Link to="/staff/administration/teachers" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Data Guru</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">
              {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.totalTeachers ?? teacherAdministrationRows.length).toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-emerald-800/70">Akun guru aktif</p>
          </div>
        </Link>

        <Link to="/staff/administration/students" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Siswa Prioritas</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">
              {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.studentsPriorityCount ?? incompleteStudents.length).toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-amber-800/70">Perlu pembenahan biodata utama</p>
          </div>
        </Link>

        <Link to="/staff/administration/teachers" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Guru Prioritas</p>
            <p className="mt-2 text-2xl font-bold text-violet-900">
              {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.teachersPriorityCount ?? incompleteTeachers.length).toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-violet-800/70">Data kepegawaian perlu dilengkapi</p>
          </div>
        </Link>

        <div className="rounded-xl border border-sky-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-sky-700/80">Verifikasi Pending</p>
          <p className="mt-2 text-2xl font-bold text-sky-900">
            {administrationSummaryQuery.isLoading
              ? '-'
              : ((administrationSummary?.overview.pendingStudentVerification || 0) +
                  (administrationSummary?.overview.pendingTeacherVerification || 0))
                  .toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-xs text-sky-800/70">Akun menunggu validasi administrasi</p>
        </div>

        <Link to="/staff/administration/permissions" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-pink-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Perizinan Pending</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">
              {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.pendingPermissions ?? pendingPermissions.length).toLocaleString('id-ID')}
            </p>
            <p className="mt-1 text-xs text-rose-800/70">Butuh tindak lanjut administrasi</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-sky-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-sky-700/80">Kelengkapan Siswa</p>
          <p className="mt-2 text-2xl font-bold text-sky-900">
            {administrationSummaryQuery.isLoading ? '-' : `${administrationSummary?.overview.studentCompletenessRate ?? studentCompletenessRate}%`}
          </p>
          <p className="mt-1 text-xs text-sky-800/70">Rerata dokumen inti siswa terisi</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-emerald-700/80">Kelengkapan Guru</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">
            {administrationSummaryQuery.isLoading ? '-' : `${administrationSummary?.overview.teacherCompletenessRate ?? teacherCompletenessRate}%`}
          </p>
          <p className="mt-1 text-xs text-emerald-800/70">Rerata data kepegawaian guru terisi</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-amber-700/80">Verifikasi Ditolak</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">
            {administrationSummaryQuery.isLoading
              ? '-'
              : ((administrationSummary?.overview.rejectedStudentVerification || 0) +
                  (administrationSummary?.overview.rejectedTeacherVerification || 0))
                  .toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-xs text-amber-800/70">Perlu koreksi data sebelum diverifikasi ulang</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-white shadow-sm p-4">
          <p className="text-xs uppercase tracking-wider text-rose-700/80">Perizinan Ditolak</p>
          <p className="mt-2 text-2xl font-bold text-rose-900">
            {administrationSummaryQuery.isLoading ? '-' : (administrationSummary?.overview.rejectedPermissions ?? 0).toLocaleString('id-ID')}
          </p>
          <p className="mt-1 text-xs text-rose-800/70">Perlu klarifikasi dan tindak lanjut administrasi</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Pemetaan Kelas Prioritas</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !administrationSummary?.studentClassRecap.length ? (
            <p className="text-sm text-gray-500">Belum ada rekap kelas yang tersedia.</p>
          ) : (
            <div className="space-y-3">
              {administrationSummary.studentClassRecap.slice(0, 6).map((row) => (
                <div key={`${row.classId ?? 0}-${row.className}`} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{row.className}</p>
                      <p className="text-xs text-gray-500 mt-1">{row.totalStudents.toLocaleString('id-ID')} siswa</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-blue-700">{row.completenessRate}%</p>
                      <p className="text-[11px] text-gray-500">kelengkapan</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Prioritas {row.priorityCount} • Perlu lengkapi {row.needAttentionCount} • Pending verifikasi {row.pendingVerificationCount}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Pemetaan PTK Prioritas</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !administrationSummary?.teacherPtkRecap.length ? (
            <p className="text-sm text-gray-500">Belum ada rekap PTK guru yang tersedia.</p>
          ) : (
            <div className="space-y-3">
              {administrationSummary.teacherPtkRecap.slice(0, 6).map((row) => (
                <div key={row.ptkType} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{row.ptkType || '-'}</p>
                      <p className="text-xs text-gray-500 mt-1">{row.totalTeachers.toLocaleString('id-ID')} guru</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-700">{row.completenessRate}%</p>
                      <p className="text-[11px] text-gray-500">kelengkapan</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    Prioritas {row.priorityCount} • Perlu lengkapi {row.needAttentionCount} • Pending verifikasi {row.pendingVerificationCount}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardCheck className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Prioritas Administrasi Siswa</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !(administrationSummary?.studentPriorityQueue.length || 0) ? (
            <p className="text-sm text-gray-500">Seluruh data inti siswa sudah lengkap.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {administrationSummary?.studentPriorityQueue.slice(0, 5).map((student) => (
                <div key={student.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="font-medium text-gray-900">{student.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {student.className || '-'} • kurang {student.missingFields.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-gray-900">Prioritas Administrasi Guru</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !(administrationSummary?.teacherPriorityQueue.length || 0) ? (
            <p className="text-sm text-gray-500">Seluruh data inti guru sudah lengkap.</p>
          ) : (
            <div className="space-y-3 text-sm">
              {administrationSummary?.teacherPriorityQueue.slice(0, 5).map((teacher) => (
                <div key={teacher.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <p className="font-medium text-gray-900">{teacher.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {teacher.ptkType || '-'} • kurang {teacher.missingFields.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">Perizinan Menunggu Tindak Lanjut</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !(administrationSummary?.permissionQueue.length || 0) ? (
            <p className="text-sm text-gray-500">Tidak ada perizinan pending saat ini.</p>
          ) : (
            <div className="space-y-3">
              {administrationSummary?.permissionQueue.slice(0, 5).map((permission) => (
                <div key={permission.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{permission.studentName}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {permission.className} • {permission.type}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                      {permission.ageDays} hari
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatDate(permission.startDate)} - {formatDate(permission.endDate)} • {permission.agingLabel}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-semibold text-gray-900">Antrian Verifikasi</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 mb-2">Siswa</p>
                {!administrationSummary?.studentVerificationQueue.length ? (
                  <p className="text-sm text-gray-500">Tidak ada siswa menunggu verifikasi.</p>
                ) : (
                  <div className="space-y-2">
                    {administrationSummary.studentVerificationQueue.slice(0, 4).map((row) => (
                      <div key={row.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                        <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {row.className} • {row.verificationStatus || '-'} • kurang {row.missingFields.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 mb-2">Guru</p>
                {!administrationSummary?.teacherVerificationQueue.length ? (
                  <p className="text-sm text-gray-500">Tidak ada guru menunggu verifikasi.</p>
                ) : (
                  <div className="space-y-2">
                    {administrationSummary.teacherVerificationQueue.slice(0, 4).map((row) => (
                      <div key={row.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                        <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {row.ptkType || '-'} • {row.verificationStatus || '-'} • kurang {row.missingFields.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-rose-600" />
            <h3 className="text-sm font-semibold text-gray-900">Aging Perizinan Pending</h3>
          </div>
          {administrationSummaryQuery.isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !(administrationSummary?.permissionAging.length || 0) ? (
            <p className="text-sm text-gray-500">Tidak ada perizinan pending yang perlu dipantau.</p>
          ) : (
            <div className="space-y-3">
              {administrationSummary?.permissionAging.map((row) => (
                <div key={row.label} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2.5">
                  <span className="text-sm text-gray-700">{row.label}</span>
                  <span className="text-sm font-semibold text-rose-700">{row.count.toLocaleString('id-ID')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          to="/staff/administration/students"
          className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50"
        >
          <GraduationCap className="w-4 h-4 mr-2" />
          Kelola Administrasi Siswa
        </Link>
        <Link
          to="/staff/administration/teachers"
          className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
        >
          <Users className="w-4 h-4 mr-2" />
          Kelola Administrasi Guru
        </Link>
        <Link
          to="/staff/administration/permissions"
          className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50"
        >
          <ShieldCheck className="w-4 h-4 mr-2" />
          Monitor Perizinan
        </Link>
      </div>
    </div>
  );
};

export default StaffAdministrationWorkspace;
