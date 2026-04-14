import {
  Users,
  GraduationCap,
  School,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  MoreVertical,
  Calendar,
  LayoutGrid,
  Layers,
  ClipboardList,
  History,
  Briefcase,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { academicYearService } from '../../services/academicYear.service';
import { majorService, type Major } from '../../services/major.service';
import { classService, type Class } from '../../services/class.service';
import { trainingClassService } from '../../services/trainingClass.service';
import { subjectService } from '../../services/subject.service';
import { userService } from '../../services/user.service';
import { teacherAssignmentService, type TeacherAssignment } from '../../services/teacherAssignment.service';
import { humasService } from '../../services/humas.service';

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  trend: number;
  color: 'blue' | 'orange' | 'red' | 'teal';
  trendLabel?: string;
  to?: string;
}

interface DashboardTotals {
  academicYears: number;
  majors: number;
  classes: number;
  trainingClasses: number;
  subjects: number;
  extracurriculars: number;
  users: number;
  students: number;
  teachers: number;
  teacherAssignments: number;
  questionBanks: number;
  examSessions: number;
}

interface ActiveAcademicYear {
  id: number;
  name: string;
}

interface StudentByMajorStat {
  majorId: number;
  name: string;
  code: string;
  totalStudents: number;
  totalClasses: number;
}

interface TeacherAssignmentSummary {
  totalAssignments: number;
  totalTeachersWithAssignments: number;
}

interface DashboardData {
  totals: DashboardTotals;
  activeAcademicYear: ActiveAcademicYear | null;
  studentByMajor: StudentByMajorStat[];
  teacherAssignmentSummary: TeacherAssignmentSummary | null;
  bkkOverview: {
    totalApplicants: number;
    verifiedApplicants: number;
    pendingApplicants: number;
    totalApplications: number;
    inProgressApplications: number;
    shortlistedApplications: number;
    acceptedApplications: number;
  };
}

function getArrayByKey<T>(res: unknown, key: string): T[] {
  if (!res || typeof res !== 'object') return [];
  const typedRes = res as {
    data?: Record<string, unknown> | unknown[];
    [k: string]: unknown;
  };
  const fromData =
    typedRes.data && !Array.isArray(typedRes.data)
      ? (typedRes.data as Record<string, unknown>)[key]
      : undefined;
  if (Array.isArray(fromData)) return fromData as T[];
  const directValue = typedRes[key];
  if (Array.isArray(directValue)) return directValue as T[];
  if (Array.isArray(typedRes.data)) return typedRes.data as T[];
  return [];
}

interface ParsedYearName {
  primary: string;
  secondary?: string;
}

const StatCard = ({ title, value, icon: Icon, trend, color, trendLabel, to }: StatCardProps) => {
  const getColorClasses = (tone: StatCardProps['color']) => {
    switch (tone) {
      case 'blue':
        return {
          bg: 'bg-gradient-to-br from-blue-50 to-sky-100/85 border-blue-100',
          soft: 'bg-blue-100',
          icon: 'text-blue-700',
          textMain: 'text-blue-900',
          textSub: 'text-blue-700/80',
          menu: 'text-blue-700/60 hover:text-blue-800',
          divider: 'border-blue-200/70',
          decor: 'text-blue-200/80',
        };
      case 'orange':
        return {
          bg: 'bg-gradient-to-br from-orange-50 to-amber-100/85 border-orange-100',
          soft: 'bg-orange-100',
          icon: 'text-orange-700',
          textMain: 'text-orange-900',
          textSub: 'text-orange-700/80',
          menu: 'text-orange-700/60 hover:text-orange-800',
          divider: 'border-orange-200/70',
          decor: 'text-orange-200/90',
        };
      case 'red':
        return {
          bg: 'bg-gradient-to-br from-rose-50 to-red-100/85 border-rose-100',
          soft: 'bg-rose-100',
          icon: 'text-rose-700',
          textMain: 'text-rose-900',
          textSub: 'text-rose-700/80',
          menu: 'text-rose-700/60 hover:text-rose-800',
          divider: 'border-rose-200/70',
          decor: 'text-rose-200/90',
        };
      case 'teal':
      default:
        return {
          bg: 'bg-gradient-to-br from-teal-50 to-emerald-100/85 border-teal-100',
          soft: 'bg-teal-100',
          icon: 'text-teal-700',
          textMain: 'text-teal-900',
          textSub: 'text-teal-700/80',
          menu: 'text-teal-700/60 hover:text-teal-800',
          divider: 'border-teal-200/70',
          decor: 'text-teal-200/90',
        };
    }
  };

  const { bg, soft, icon, textMain, textSub, menu, divider, decor } = getColorClasses(color);

  const trendIsPositive = trend > 0;
  const TrendIcon = trendIsPositive ? ArrowUpRight : ArrowDownRight;
  const trendColor = trend === 0 ? 'text-gray-500' : trendIsPositive ? 'text-emerald-700' : 'text-rose-700';

  const cardBody = (
    <div
      className={`relative overflow-hidden p-6 rounded-2xl border shadow-sm transition-all hover:shadow-md group ${bg}`}
    >
      <div className="flex items-start justify-between mb-4 relative z-10">
        <div
          className={`p-3 rounded-xl ${soft} flex items-center justify-center group-hover:scale-105 transition-all`}
        >
          <Icon className={`w-6 h-6 ${icon}`} />
        </div>
        <button
          type="button"
          className={menu}
          aria-label="Opsi statistik kartu"
        >
          <MoreVertical size={18} />
        </button>
      </div>

      <div className="relative z-10">
        <h3 className={`text-3xl font-bold mb-1 ${textMain}`}>{value}</h3>
        <p className={`text-sm font-medium ${textSub}`}>{title}</p>
      </div>

      <div className={`mt-4 flex items-center text-xs font-medium pt-4 border-t relative z-10 ${divider}`}>
        <span className={`flex items-center gap-1 ${trendColor}`}>
          <TrendIcon size={14} />
          {Math.abs(trend)}%
        </span>
        <span className={`${textSub} ml-2`}>{trendLabel || 'dari bulan lalu'}</span>
      </div>
      <Icon
        className={`absolute -bottom-10 -right-6 w-32 h-32 opacity-60 group-hover:opacity-70 group-hover:scale-110 transition-transform ${decor}`}
      />
    </div>
  );

  if (!to) return cardBody;

  return (
    <Link
      to={to}
      className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {cardBody}
    </Link>
  );
};

const parseAcademicYearName = (name: string): ParsedYearName => {
  const match = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  if (match) {
    return { primary: match[1], secondary: match[2] };
  }
  return { primary: name };
};

const getSemesterLabelFromName = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('ganjil')) {
    return 'Semester Ganjil';
  }
  if (lower.includes('genap')) {
    return 'Semester Genap';
  }
  return 'Periode berjalan saat ini';
};

export const AdminDashboard = () => {
  // Use useQuery directly to avoid context propagation issues from RoleRoute
  const { data: userResponse, isLoading: isUserLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      // Reuse the service but ensure typing
      return authService.getMe();
    },
    staleTime: Infinity, // Use cached data if available (likely from DashboardLayout)
  });

  const user = userResponse?.data;

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ['admin-dashboard', 'stats'],
    queryFn: async () => {
      let activeYear: ActiveAcademicYear | null = null;
      try {
        const res = await academicYearService.getActiveSafe();
        activeYear = (res?.data ?? null) as ActiveAcademicYear | null;
      } catch {
        // Ignore if no active year
      }

      // Fetch all required data in parallel
      const [
        majorsRes,
        classesRes,
        trainingClassesRes,
        subjectsRes,
        usersRes,
        studentsRes,
        teachersRes,
        teacherAssignmentsRes,
        applicantUsersRes,
        bkkApplicationsRes,
      ] = await Promise.all([
        majorService.list({ limit: 1000 }),
        classService.list({ limit: 1000 }),
        trainingClassService.list({ limit: 1000 }),
        subjectService.list({ limit: 1000 }),
        userService.getUsers({ limit: 1000 }),
        userService.getUsers({ role: 'STUDENT', limit: 1000 }),
        userService.getUsers({ role: 'TEACHER', limit: 1000 }),
        teacherAssignmentService.list({ limit: 1000 }),
        userService.getUsers({ role: 'UMUM', limit: 1000 }),
        humasService.getApplications({ page: 1, limit: 1 }),
      ]);

      const majorsList = getArrayByKey<Major>(majorsRes, 'majors');
      const classesList = getArrayByKey<Class>(classesRes, 'classes');
      const trainingClassesList = getArrayByKey<{ id: number }>(trainingClassesRes, 'trainingClasses');
      const subjectsList = getArrayByKey<{ id: number }>(subjectsRes, 'subjects');
      const usersList = usersRes.data || []; // userService returns { data: User[] }
      const studentsList = studentsRes.data || [];
      const teachersList = teachersRes.data || [];
      const teacherAssignmentsList = getArrayByKey<TeacherAssignment>(teacherAssignmentsRes, 'assignments');
      const applicantUsersList = applicantUsersRes.data || [];
      const bkkApplicationsPayload = bkkApplicationsRes.data?.data as
        | { total?: number; summary?: Record<string, number> }
        | undefined;
      const bkkSummary = bkkApplicationsPayload?.summary || {};

      // Calculate Student by Major
      const studentByMajor: StudentByMajorStat[] = majorsList.map((major: Major) => {
        const majorClasses = classesList.filter((c: Class) => c.majorId === major.id);
        return {
          majorId: major.id,
          name: major.name,
          code: major.code,
          totalStudents: majorClasses.reduce((sum: number, cls: Class) => sum + (cls._count?.students || 0), 0),
          totalClasses: majorClasses.length,
        };
      });

      return {
        totals: {
          academicYears: 0, 
          majors: majorsList.length,
          classes: classesList.length,
          trainingClasses: trainingClassesList.length,
          subjects: subjectsList.length,
          extracurriculars: 0, 
          users: usersList.length,
          students: studentsList.length,
          teachers: teachersList.length,
          teacherAssignments: teacherAssignmentsList.length,
          questionBanks: 0,
          examSessions: 0,
        },
        activeAcademicYear: activeYear,
        studentByMajor,
        teacherAssignmentSummary: {
          totalAssignments: teacherAssignmentsList.length,
          totalTeachersWithAssignments: new Set(teacherAssignmentsList.map((ta: TeacherAssignment) => ta.teacherId)).size,
        },
        bkkOverview: {
          totalApplicants: applicantUsersList.length,
          verifiedApplicants: applicantUsersList.filter((user) => user.verificationStatus === 'VERIFIED').length,
          pendingApplicants: applicantUsersList.filter((user) => user.verificationStatus === 'PENDING').length,
          totalApplications: bkkApplicationsPayload?.total || 0,
          inProgressApplications:
            (bkkSummary.submitted || 0) +
            (bkkSummary.reviewing || 0) +
            (bkkSummary.shortlisted || 0) +
            (bkkSummary.partnerInterview || 0) +
            (bkkSummary.interview || 0),
          shortlistedApplications: bkkSummary.shortlisted || 0,
          acceptedApplications:
            (bkkSummary.hired || 0) +
            Math.max((bkkSummary.accepted || 0) - (bkkSummary.hired || 0), 0),
        },
      };
    },
    enabled: !!user, // Only fetch stats if user is authenticated
  });

  if (isUserLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Should be handled by layout redirect, but safe fallback
  }

  const totals = data?.totals;
  const activeYear = data?.activeAcademicYear;
  const studentByMajor = data?.studentByMajor || [];
  const teacherAssignmentSummary = data?.teacherAssignmentSummary || null;
  const bkkOverview = data?.bkkOverview;
  const parsedYearName = activeYear ? parseAcademicYearName(activeYear.name) : null;
  const semesterLabel = activeYear ? getSemesterLabelFromName(activeYear.name) : 'Periode berjalan saat ini';

  return (
    <div className="space-y-8">
      <div className="bg-gradient-to-br from-blue-50 to-sky-100/80 rounded-2xl px-6 py-4 shadow-sm border border-blue-100 mt-10 relative flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-6">
          <div className="-mt-16 relative">
            <div
              className="w-36 h-36 rounded-full p-1 bg-white/90 ring-1 ring-blue-200"
              style={{
                boxShadow:
                  'inset 6px 6px 12px rgba(0,0,0,0.06), inset -6px -6px 12px rgba(255,255,255,0.9), 8px 8px 16px rgba(0,0,0,0.08), -3px -3px 8px rgba(255,255,255,0.7)',
              }}
            >
              {user.photo ? (
                <img
                  src={
                    user.photo.startsWith('/api') || user.photo.startsWith('http')
                      ? user.photo
                      : `/api/uploads/${user.photo}`
                  }
                  alt={user.name}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`;
                  }}
                />
              ) : (
                <div className="w-full h-full rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-6xl">
                  {user.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              Selamat Datang, {user.name}! 👋
            </h1>
            <p className="text-body text-gray-500">
              Ringkasan statistik dan aktivitas sekolah hari ini | {user.username}
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Clock className="w-5 h-5 text-blue-500 animate-spin mr-2" />
          <span className="text-sm text-gray-500">Memuat statistik dashboard...</span>
        </div>
      )}

      {isError && !isLoading && (
        <div className="flex items-center justify-center py-16">
          <span className="text-sm text-red-500">
            Gagal memuat statistik dashboard. Silakan muat ulang halaman atau login kembali.
          </span>
        </div>
      )}

      {totals && !isLoading && !isError && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <Link
              to="/admin/academic-years"
              className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
            >
            <div className="relative overflow-hidden p-6 rounded-2xl shadow-[0_2px_10px_-3px_rgba(6,81,237,0.25)] border-none transition-all hover:shadow-[0_10px_35px_-6px_rgba(6,81,237,0.4)] group bg-gradient-to-br from-cyan-600 to-teal-500">
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="p-3 rounded-xl bg-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-all">
                  <Calendar className="w-6 h-6 text-cyan-50" />
                </div>
                <span className="inline-flex items-center rounded-full bg-cyan-50/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-50">
                  {semesterLabel}
                </span>
              </div>
              <div className="relative z-10">
                <p className="text-xs font-medium text-cyan-100 mb-1">Tahun Ajaran Aktif</p>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-white">
                    {parsedYearName ? parsedYearName.primary : '-'}
                  </span>
                  {parsedYearName?.secondary && (
                    <span className="text-lg font-semibold text-cyan-100 mb-0.5">
                      /{parsedYearName.secondary}
                    </span>
                  )}
                </div>
                {activeYear && !parsedYearName?.secondary && (
                  <div className="mt-1 text-xs text-cyan-100 font-medium">
                    {activeYear.name}
                  </div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-[11px] text-cyan-100 pt-3 border-t-2 border-white/25 relative z-10">
                <span>Jumlah Tahun Ajaran</span>
                <span className="font-semibold text-white">
                  {totals.academicYears.toLocaleString('id-ID')}
                </span>
              </div>
              <Calendar className="absolute -bottom-10 -right-6 w-32 h-32 opacity-20 text-black/35 group-hover:opacity-25 group-hover:scale-110 transition-transform" />
            </div>
            </Link>
            <StatCard
              title="Total Pengguna"
              value={totals.users.toLocaleString('id-ID')}
              icon={Users}
              trend={0}
              color="blue"
              trendLabel="Semua role pengguna"
              to="/admin/user-verification"
            />
            <StatCard
              title="Siswa Aktif"
              value={totals.students.toLocaleString('id-ID')}
              icon={GraduationCap}
              trend={0}
              color="orange"
              trendLabel="Berdasarkan role siswa"
              to="/admin/students"
            />
            <StatCard
              title="Guru & Staff"
              value={totals.teachers.toLocaleString('id-ID')}
              icon={School}
              trend={0}
              color="red"
              trendLabel="Guru dan staff terdaftar"
              to="/admin/teachers"
            />
            <StatCard
              title="Pelamar BKK"
              value={(bkkOverview?.totalApplicants || 0).toLocaleString('id-ID')}
              icon={Briefcase}
              trend={0}
              color="teal"
              trendLabel={`${bkkOverview?.verifiedApplicants || 0} terverifikasi • ${bkkOverview?.pendingApplicants || 0} pending`}
              to="/admin/bkk-users"
            />
            <StatCard
              title="Lamaran BKK"
              value={(bkkOverview?.totalApplications || 0).toLocaleString('id-ID')}
              icon={ClipboardList}
              trend={0}
              color="blue"
              trendLabel={`${bkkOverview?.acceptedApplications || 0} diterima • ${bkkOverview?.shortlistedApplications || 0} shortlist`}
              to="/admin/bkk-applications"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-gray-800">Statistik Siswa per Kompetensi Keahlian</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    Distribusi jumlah siswa dan kelas berdasarkan kompetensi keahlian.
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-400 uppercase tracking-[0.16em]">
                  <span>KOMPETENSI KEAHLIAN</span>
                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                  <span>SISWA</span>
                  <span className="w-1 h-1 rounded-full bg-gray-300" />
                  <span>KELAS</span>
                </div>
              </div>
              {studentByMajor.length === 0 && (
                <div className="py-10 text-center text-sm text-gray-400">
                  Belum ada data kelas dengan kompetensi keahlian pada tahun ajaran aktif.
                </div>
              )}
              {studentByMajor.length > 0 && (
                <div className="space-y-3">
                  {studentByMajor.map((item) => {
                    const total = item.totalStudents || 0;
                    const max = studentByMajor[0]?.totalStudents || 1;
                    const percentage = Math.max(8, Math.round((total / max) * 100));
                    return (
                      <div
                        key={item.majorId ?? item.code}
                        className="rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-4 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold">
                            {item.code || '-'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {item.name}
                            </p>
                            <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-sky-400"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex items-end gap-6 text-right">
                          <div>
                            <p className="text-[11px] text-gray-500">SISWA</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {item.totalStudents.toLocaleString('id-ID')}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-500">KELAS</p>
                            <p className="text-sm font-semibold text-gray-900">
                              {item.totalClasses.toLocaleString('id-ID')}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="font-bold text-gray-800 mb-2">Ringkasan Assignment Guru</h3>
                <p className="text-xs text-gray-500 mb-5">
                  Gambaran singkat distribusi assignment mengajar pada tahun ajaran aktif.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <ClipboardList size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">TOTAL ASSIGNMENT</p>
                        <p className="text-base font-semibold text-gray-900">
                          {(teacherAssignmentSummary?.totalAssignments || 0).toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <School size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">GURU DENGAN ASSIGNMENT</p>
                        <p className="text-base font-semibold text-gray-900">
                          {(teacherAssignmentSummary?.totalTeachersWithAssignments || 0).toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <Users size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">TOTAL GURU & STAFF</p>
                        <p className="text-base font-semibold text-gray-900">
                          {totals.teachers.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    {totals.teachers > 0 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-medium text-gray-600">Coverage assignment guru</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-600">
                          {Math.round(
                            Math.min(
                              100,
                              ((teacherAssignmentSummary?.totalTeachersWithAssignments || 0) /
                                totals.teachers) *
                                100,
                            ),
                          )}
                          %
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Belum ada data guru untuk dihitung coverage assignment.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">Ringkasan Menu Admin</h3>
                <p className="text-xs text-gray-500 mt-1">Akses cepat ke menu utama dengan kartu interaktif.</p>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4">
                <Link
                  to="/admin/academic-years"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-blue-200 hover:shadow-[0_10px_25px_-8px_rgba(37,99,235,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-blue-500 mb-1">MASTER DATA</p>
                      <h4 className="text-sm font-semibold text-gray-800">Data Induk Sekolah</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Tahun ajaran, kompetensi keahlian, kelas, kelas training, mapel, dan ekstrakurikuler.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <LayoutGrid size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">TOTAL ENTRI</p>
                      <p className="text-lg font-bold text-gray-900">
                        {(
                          totals.academicYears +
                          totals.majors +
                          totals.classes +
                          totals.trainingClasses +
                          totals.subjects +
                          totals.extracurriculars
                        ).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-blue-600 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/admin-users"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-emerald-200 hover:shadow-[0_10px_25px_-8px_rgba(16,185,129,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-emerald-500 mb-1">USER MANAGEMENT</p>
                      <h4 className="text-sm font-semibold text-gray-800">Manajemen Akun & Penugasan</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Kelola akun guru, siswa, role lain, serta assignment mengajar.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      <Users size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">TOTAL PENGGUNA</p>
                      <p className="text-lg font-bold text-gray-900">
                        {totals.users.toLocaleString('id-ID')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-emerald-600 bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/bkk-applications"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-cyan-200 hover:shadow-[0_10px_25px_-8px_rgba(8,145,178,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-cyan-500 mb-1">BKK</p>
                      <h4 className="text-sm font-semibold text-gray-800">Pelamar & Lamaran</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Pantau akun pelamar BKK, status lamaran, dan proses rekrutmen dari admin.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                      <Briefcase size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">LAMARAN AKTIF</p>
                      <p className="text-lg font-bold text-gray-900">
                        {(bkkOverview?.inProgressApplications || 0).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-cyan-600 bg-cyan-50 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/academic-calendar"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-indigo-200 hover:shadow-[0_10px_25px_-8px_rgba(79,70,229,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-indigo-500 mb-1">AKADEMIK</p>
                      <h4 className="text-sm font-semibold text-gray-800">Aktivitas Akademik</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Kalender akademik, jadwal pelajaran, data KKM, rekap absensi, dan rapor.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Layers size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">DATA TERINTEGRASI</p>
                      <p className="text-lg font-bold text-gray-400">-</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-indigo-600 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/report-cards"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-orange-200 hover:shadow-[0_10px_25px_-8px_rgba(249,115,22,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-orange-500 mb-1">UJIAN & CBT</p>
                      <h4 className="text-sm font-semibold text-gray-800">Ujian Berbasis Komputer</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Pengelolaan bank soal dan sesi ujian CBT.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center group-hover:bg-orange-500 group-hover:text-white transition-colors">
                      <ClipboardList size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">ENTITAS UJIAN</p>
                      <p className="text-lg font-bold text-gray-900">
                        {(totals.questionBanks + totals.examSessions).toLocaleString('id-ID')}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-orange-600 bg-orange-50 group-hover:bg-orange-500 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/audit-logs"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-violet-200 hover:shadow-[0_10px_25px_-8px_rgba(124,58,237,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-violet-500 mb-1">AUDIT</p>
                      <h4 className="text-sm font-semibold text-gray-800">Riwayat Audit</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Jejak perubahan kurikulum: mapel, kategori, dan assignment guru.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      <History size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">CATATAN AUDIT</p>
                      <p className="text-lg font-bold text-gray-400">-</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-violet-600 bg-violet-50 group-hover:bg-violet-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
                <Link
                  to="/admin/admin-users"
                  className="group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white hover:border-slate-200 hover:shadow-[0_10px_25px_-8px_rgba(148,163,184,0.35)] transition-all duration-200"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold tracking-[0.12em] text-slate-500 mb-1">PENGATURAN</p>
                      <h4 className="text-sm font-semibold text-gray-800">Konfigurasi Sistem</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        Profil sekolah dan pengaturan akun admin serta keamanan.
                      </p>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-slate-50 text-slate-600 flex items-center justify-center group-hover:bg-slate-600 group-hover:text-white transition-colors">
                      <LayoutGrid size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">TOTAL PENGATURAN</p>
                      <p className="text-lg font-bold text-gray-400">-</p>
                    </div>
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold text-slate-600 bg-slate-50 group-hover:bg-slate-600 group-hover:text-white transition-colors">
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
