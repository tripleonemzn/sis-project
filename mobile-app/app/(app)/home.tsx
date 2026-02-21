import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useProfileQuery } from '../../src/features/profile/useProfileQuery';
import { getGroupedRoleMenu, RoleMenuGroup, RoleMenuItem } from '../../src/features/dashboard/roleMenu';
import { useTeacherAssignmentsQuery } from '../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { scheduleApi } from '../../src/features/schedule/scheduleApi';
import type { DayOfWeek, ScheduleEntry } from '../../src/features/schedule/types';
import { academicYearApi } from '../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../src/features/admin/adminApi';
import { principalApi } from '../../src/features/principal/principalApi';
import { staffApi } from '../../src/features/staff/staffApi';
import { useParentFinanceOverviewQuery } from '../../src/features/parent/useParentFinanceOverviewQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { applyAppUpdate, checkAppUpdate } from '../../src/features/appUpdate/updateService';
import { BRAND_COLORS } from '../../src/config/brand';
import { ENV } from '../../src/config/env';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../src/lib/ui/feedback';
import type { AuthUser } from '../../src/features/auth/types';

type FeatherIconName = ComponentProps<typeof Feather>['name'];
type DashboardStatItem = { label: string; value: string; color: string; icon?: FeatherIconName; menuKey?: string };
type DashboardIconStatItem = {
  label: string;
  value: string;
  color: string;
  icon: FeatherIconName;
  menuKey?: string;
};
type MenuIconTone = {
  bg: string;
  border: string;
  fg: string;
};

const getTeachingHourValue = (entry: ScheduleEntry) =>
  typeof entry.teachingHour === 'number' ? entry.teachingHour : entry.period;

type TeacherScheduleGroup = {
  key: string;
  periodStart: number;
  periodEnd: number;
  subjectName: string;
  className: string;
  roomLabel: string;
  entries: ScheduleEntry[];
};

const CARD_ACCENTS = [
  BRAND_COLORS.blue,
  BRAND_COLORS.teal,
  BRAND_COLORS.gold,
  BRAND_COLORS.pink,
  BRAND_COLORS.sky,
];
const MENU_ICON_TONES: MenuIconTone[] = [
  { bg: '#eff6ff', border: '#bfdbfe', fg: '#1d4ed8' },
  { bg: '#ecfeff', border: '#a5f3fc', fg: '#0e7490' },
  { bg: '#f0fdf4', border: '#bbf7d0', fg: '#15803d' },
  { bg: '#fff7ed', border: '#fed7aa', fg: '#c2410c' },
  { bg: '#faf5ff', border: '#e9d5ff', fg: '#7e22ce' },
  { bg: '#fef2f2', border: '#fecaca', fg: '#b91c1c' },
];

const JS_DAY_TO_SCHEDULE_DAY: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

function defaultSemesterByDate(): 'ODD' | 'EVEN' {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

function resolveMediaUrl(path?: string | null) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return path.startsWith('/') ? `${webBaseUrl}${path}` : `${webBaseUrl}/${path}`;
}

function toAvatarInitial(name: string) {
  const normalized = String(name || '').trim();
  if (!normalized) return 'U';
  return normalized.charAt(0).toUpperCase();
}

function hashText(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getMenuIconTone(menuKey: string): MenuIconTone {
  return MENU_ICON_TONES[hashText(menuKey) % MENU_ICON_TONES.length];
}

const getMenuIcon = (menu: RoleMenuItem): FeatherIconName => {
  if (menu.key.includes('profile')) return 'user';
  if (menu.key.includes('diagnostics')) return 'activity';
  if (menu.key.includes('schedule')) return 'calendar';
  if (menu.key.includes('academic')) return 'book-open';
  if (menu.key.includes('learning') || menu.key.includes('materials')) return 'book-open';
  if (menu.key.includes('permissions')) return 'shield';
  if (menu.key.includes('grades') || menu.key.includes('report')) return 'bar-chart-2';
  if (menu.key.includes('attendance')) return 'check-square';
  if (menu.key.includes('exams') || menu.key.includes('exam')) return 'file-text';
  if (menu.key.includes('assessment')) return 'clipboard';
  if (menu.key.includes('user')) return 'users';
  if (menu.key.includes('students')) return 'users';
  if (menu.key.includes('payment') || menu.key.includes('finance')) return 'credit-card';
  if (menu.key.includes('approval')) return 'clipboard';
  if (menu.key.includes('master') || menu.key.includes('documents')) return 'archive';
  if (menu.key.includes('child')) return 'heart';
  if (menu.key.includes('tutor')) return 'user-check';
  return 'grid';
};

const getGroupIcon = (group: RoleMenuGroup): FeatherIconName => {
  const key = group.key.toLowerCase();
  if (key.includes('dashboard')) return 'home';
  if (key.includes('academic')) return 'book-open';
  if (key.includes('exams') || key.includes('cbt')) return 'file-text';
  if (key.includes('finance') || key.includes('administration') || key.includes('payments')) return 'credit-card';
  if (key.includes('settings')) return 'settings';
  if (key.includes('users') || key.includes('students') || key.includes('teachers') || key.includes('children')) return 'users';
  if (key.includes('master-data')) return 'database';
  if (key.includes('training')) return 'layers';
  if (key.includes('homeroom')) return 'user-check';
  if (key.includes('internship') || key.includes('kakom')) return 'briefcase';
  if (key.includes('sarpras')) return 'archive';
  if (key.includes('humas')) return 'globe';
  if (key.includes('extracurricular')) return 'award';
  return 'grid';
};

const getMenuSubtitle = (menu: RoleMenuItem) => {
  if (menu.route && menu.webPath) return `Buka modul ${menu.label.toLowerCase()} - tekan lama untuk versi web`;
  if (menu.route) return `Buka modul ${menu.label.toLowerCase()}`;
  if (menu.webPath) return 'Buka modul versi web';
  return 'Modul ini akan segera tersedia';
};

const getStatIcon = (item: DashboardStatItem, linkedMenu?: RoleMenuItem): FeatherIconName => {
  if (item.icon) return item.icon;
  if (linkedMenu) return getMenuIcon(linkedMenu);

  const key = `${item.label} ${item.value}`.toLowerCase();
  if (key.includes('siswa') || key.includes('anak')) return 'users';
  if (key.includes('guru')) return 'user-check';
  if (key.includes('kelas')) return 'layers';
  if (key.includes('mapel')) return 'book-open';
  if (key.includes('jurusan')) return 'grid';
  if (key.includes('keuangan') || key.includes('nominal') || key.includes('tagihan')) return 'credit-card';
  if (key.includes('hadir') || key.includes('absensi')) return 'check-square';
  if (key.includes('rata') || key.includes('nilai') || key.includes('ranking')) return 'bar-chart-2';
  if (key.includes('assignment')) return 'clipboard';
  return 'circle';
};

function AvatarCircle({
  name,
  photoUrl,
  size,
  backgroundColor,
  textColor,
  borderColor,
}: {
  name: string;
  photoUrl?: string | null;
  size: number;
  backgroundColor: string;
  textColor: string;
  borderColor?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: 'hidden',
        backgroundColor,
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor || 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      ) : (
        <Text style={{ color: textColor, fontWeight: '700', fontSize: Math.max(12, Math.floor(size * 0.36)) }}>
          {toAvatarInitial(name)}
        </Text>
      )}
    </View>
  );
}

const ROLE_PRIMARY_ACTION_KEYS: Record<string, string[]> = {
  STUDENT: ['student-schedule', 'student-learning', 'student-grade-history'],
  TEACHER: ['teaching-schedule'],
  ADMIN: ['admin-user-student', 'admin-schedule', 'admin-teacher-assignment'],
  PRINCIPAL: ['principal-attendance', 'principal-finance-requests', 'principal-reports'],
  STAFF: ['staff-payments', 'staff-students', 'staff-admin'],
  PARENT: ['child-progress', 'parent-finance', 'child-attendance'],
  EXAMINER: ['assessment', 'examiner-schemes'],
  EXTRACURRICULAR_TUTOR: ['tutor-members'],
  CALON_SISWA: ['candidate-application'],
  UMUM: ['public-information'],
};

const FALLBACK_PROFILE: AuthUser = {
  id: 0,
  name: 'Pengguna',
  role: 'UMUM',
  username: 'guest',
};

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const profileQuery = useProfileQuery(isAuthenticated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [openingMenuKey, setOpeningMenuKey] = useState<string | null>(null);
  const openingMenuResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (openingMenuResetTimerRef.current) {
        clearTimeout(openingMenuResetTimerRef.current);
        openingMenuResetTimerRef.current = null;
      }
    };
  }, []);

  const profile = profileQuery.data?.profile ?? user ?? FALLBACK_PROFILE;
  const homeContentPadding = getStandardPagePadding(insets, { horizontal: 18, bottom: 148 });
  const menuGroups = useMemo(
    () =>
      getGroupedRoleMenu(profile).filter((group) => {
        const key = group.key.toLowerCase();
        const label = group.label.toLowerCase();
        return key !== 'dashboard' && label !== 'dashboard';
      }),
    [profile],
  );
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user: profile });
  const activeAcademicYearQuery = useQuery({
    queryKey: ['mobile-home-active-academic-year', profile.id],
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const teacherScheduleQuery = useQuery({
    queryKey: ['mobile-home-teacher-schedule', profile.id, teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: profile.role === 'TEACHER' && !!teacherAssignmentsQuery.data?.activeYear?.id,
    queryFn: () =>
      scheduleApi.list({
        academicYearId: teacherAssignmentsQuery.data!.activeYear.id,
        teacherId: profile.id,
      }),
  });
  const adminStatsQuery = useQuery({
    queryKey: ['mobile-home-admin-stats', profile.id],
    enabled: profile.role === 'ADMIN',
    queryFn: async () => {
      const activeYear = await adminApi.getActiveAcademicYear().catch(() => null);
      const [majorsResult, classesResult, subjectsResult, studentsResult, teachersResult, assignmentsResult] =
        await Promise.all([
          adminApi.listMajors({ page: 1, limit: 1 }),
          adminApi.listClasses({
            page: 1,
            limit: 1,
            academicYearId: activeYear?.id,
          }),
          adminApi.listSubjects({ page: 1, limit: 1 }),
          adminApi.listUsers({ role: 'STUDENT' }),
          adminApi.listUsers({ role: 'TEACHER' }),
          activeYear?.id ? adminApi.listTeacherAssignments({ academicYearId: activeYear.id, page: 1, limit: 1 }) : null,
        ]);

      return {
        activeYearName: activeYear?.name || null,
        majors: majorsResult.pagination.total,
        classes: classesResult.pagination.total,
        subjects: subjectsResult.pagination.total,
        students: studentsResult.length,
        teachers: teachersResult.length,
        assignments: assignmentsResult?.pagination.total ?? 0,
      };
    },
  });

  const principalStatsQuery = useQuery({
    queryKey: ['mobile-home-principal-stats', profile.id, defaultSemesterByDate()],
    enabled: profile.role === 'PRINCIPAL',
    queryFn: async () => {
      const overview = await principalApi.getAcademicOverview({ semester: defaultSemesterByDate() });
      const majors = overview.majors || [];
      const totalStudents = majors.reduce((sum, item) => sum + Number(item.totalStudents || 0), 0);
      const weightedScore = majors.reduce(
        (sum, item) => sum + Number(item.averageScore || 0) * Number(item.totalStudents || 0),
        0,
      );

      return {
        semester: overview.semester || defaultSemesterByDate(),
        schoolAverage: totalStudents > 0 ? weightedScore / totalStudents : 0,
        totalStudents,
        totalMajors: majors.length,
        topStudents: overview.topStudents?.length || 0,
      };
    },
  });

  const staffStatsQuery = useQuery({
    queryKey: ['mobile-home-staff-stats', profile.id],
    enabled: profile.role === 'STAFF',
    queryFn: async () => {
      const [students, budgets] = await Promise.all([staffApi.listStudents(), staffApi.listBudgetRequests()]);
      const pending = budgets.filter((item) => item.status === 'PENDING').length;
      const approved = budgets.filter((item) => item.status === 'APPROVED').length;
      const rejected = budgets.filter((item) => item.status === 'REJECTED').length;
      const totalAmount = budgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

      return {
        students: students.length,
        budgets: budgets.length,
        pending,
        approved,
        rejected,
        totalAmount,
      };
    },
  });

  const parentOverviewQuery = useParentFinanceOverviewQuery({
    enabled: isAuthenticated,
    user: profile,
    childId: null,
    limit: 10,
  });

  const allMenuItems = useMemo(() => menuGroups.flatMap((group) => group.items), [menuGroups]);
  const hasAnyWebFallbackMenu = useMemo(() => allMenuItems.some((item) => !!item.webPath), [allMenuItems]);
  const menuItemByKey = useMemo(() => {
    return new Map(allMenuItems.map((item) => [item.key, item] as const));
  }, [allMenuItems]);

  const roleQuickMenus = useMemo(() => {
    const preferredKeys = ROLE_PRIMARY_ACTION_KEYS[profile.role] || [];
    const menuByKey = new Map(allMenuItems.map((item) => [item.key, item]));
    const result: RoleMenuItem[] = [];
    const picked = new Set<string>();

    for (const key of preferredKeys) {
      const item = menuByKey.get(key);
      if (!item || picked.has(item.key)) continue;
      result.push(item);
      picked.add(item.key);
      if (result.length >= 3) return result;
    }

    for (const item of allMenuItems) {
      if (picked.has(item.key)) continue;
      if (item.key.includes('dashboard') || item.key === 'profile' || item.key.endsWith('profile')) continue;
      result.push(item);
      picked.add(item.key);
      if (result.length >= 3) break;
    }

    return result;
  }, [allMenuItems, profile.role]);

  const teacherStats = useMemo(() => {
    const assignments = teacherAssignmentsQuery.data?.assignments || [];
    const uniqueClasses = new Set(assignments.map((item) => item.class.id)).size;
    const uniqueSubjects = new Set(assignments.map((item) => item.subject.id)).size;

    const now = new Date();
    const jsDay = now.getDay();
    const currentDay: DayOfWeek | null = jsDay >= 1 && jsDay <= 6 ? JS_DAY_TO_SCHEDULE_DAY[jsDay - 1] : null;
    const scheduleEntries = teacherScheduleQuery.data || [];
    const todaySessions = currentDay
      ? scheduleEntries.filter((entry) => entry.dayOfWeek === currentDay && entry.teachingHour !== null).length
      : 0;

    return {
      assignments: assignments.length,
      uniqueClasses,
      uniqueSubjects,
      todaySessions,
    };
  }, [teacherAssignmentsQuery.data?.assignments, teacherScheduleQuery.data]);

  const teacherIconStats: DashboardIconStatItem[] = useMemo(
    () => [
      {
        label: 'Assignment',
        value: String(teacherStats.assignments),
        color: BRAND_COLORS.navy,
        icon: 'clipboard',
        menuKey: 'teacher-classes',
      },
      {
        label: 'Kelas',
        value: String(teacherStats.uniqueClasses),
        color: BRAND_COLORS.blue,
        icon: 'users',
        menuKey: 'teacher-classes',
      },
      {
        label: 'Mapel',
        value: String(teacherStats.uniqueSubjects),
        color: BRAND_COLORS.teal,
        icon: 'book-open',
        menuKey: 'grade-input',
      },
      {
        label: 'Jadwal Hari Ini',
        value: String(teacherStats.todaySessions),
        color: BRAND_COLORS.gold,
        icon: 'calendar',
        menuKey: 'teaching-schedule',
      },
    ],
    [teacherStats],
  );

  const adminStatCards: DashboardStatItem[] = useMemo(() => {
    const stats = adminStatsQuery.data;
    if (!stats) return [];
    return [
      { label: 'Siswa', value: String(stats.students), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'admin-user-student' },
      { label: 'Guru', value: String(stats.teachers), color: BRAND_COLORS.navy, icon: 'user-check', menuKey: 'admin-user-teacher' },
      { label: 'Kelas', value: String(stats.classes), color: BRAND_COLORS.teal, icon: 'layers', menuKey: 'admin-classes' },
      { label: 'Mapel', value: String(stats.subjects), color: BRAND_COLORS.gold, icon: 'book-open', menuKey: 'admin-subjects' },
      { label: 'Jurusan', value: String(stats.majors), color: BRAND_COLORS.pink, icon: 'grid', menuKey: 'admin-majors' },
      { label: 'Assignment', value: String(stats.assignments), color: BRAND_COLORS.sky, icon: 'clipboard', menuKey: 'admin-teacher-assignment' },
    ];
  }, [adminStatsQuery.data]);

  const principalStatCards: DashboardStatItem[] = useMemo(() => {
    const stats = principalStatsQuery.data;
    if (!stats) return [];
    return [
      {
        label: 'Rata-rata Sekolah',
        value: stats.schoolAverage.toFixed(2),
        color: BRAND_COLORS.navy,
        icon: 'bar-chart-2',
        menuKey: 'principal-reports',
      },
      { label: 'Total Siswa', value: String(stats.totalStudents), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'principal-students' },
      { label: 'Total Jurusan', value: String(stats.totalMajors), color: BRAND_COLORS.teal, icon: 'grid', menuKey: 'principal-reports' },
      { label: 'Top Siswa', value: String(stats.topStudents), color: BRAND_COLORS.gold, icon: 'award', menuKey: 'principal-reports' },
    ];
  }, [principalStatsQuery.data]);

  const staffStatCards: DashboardStatItem[] = useMemo(() => {
    const stats = staffStatsQuery.data;
    if (!stats) return [];
    return [
      { label: 'Total Siswa', value: String(stats.students), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'staff-students' },
      { label: 'Pengajuan', value: String(stats.budgets), color: BRAND_COLORS.navy, icon: 'file-text', menuKey: 'staff-payments' },
      { label: 'Menunggu', value: String(stats.pending), color: BRAND_COLORS.gold, icon: 'clock', menuKey: 'staff-payments' },
      { label: 'Disetujui', value: String(stats.approved), color: BRAND_COLORS.teal, icon: 'check-circle', menuKey: 'staff-payments' },
      { label: 'Ditolak', value: String(stats.rejected), color: BRAND_COLORS.pink, icon: 'x-circle', menuKey: 'staff-payments' },
      {
        label: 'Nominal',
        value: `Rp ${Math.round(stats.totalAmount).toLocaleString('id-ID')}`,
        color: BRAND_COLORS.sky,
        icon: 'credit-card',
        menuKey: 'staff-payments',
      },
    ];
  }, [staffStatsQuery.data]);

  const parentStatCards: DashboardStatItem[] = useMemo(() => {
    const summary = parentOverviewQuery.data?.overview.summary;
    if (!summary) return [];
    return [
      { label: 'Jumlah Anak', value: String(summary.childCount), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'child-progress' },
      {
        label: 'Total Tagihan',
        value: `Rp ${Math.round(summary.totalAmount).toLocaleString('id-ID')}`,
        color: BRAND_COLORS.navy,
        icon: 'file-text',
        menuKey: 'parent-finance',
      },
      {
        label: 'Sudah Bayar',
        value: `Rp ${Math.round(summary.paidAmount).toLocaleString('id-ID')}`,
        color: BRAND_COLORS.teal,
        icon: 'check-circle',
        menuKey: 'parent-finance',
      },
      {
        label: 'Belum Lunas',
        value: `Rp ${Math.round(summary.pendingAmount + summary.partialAmount).toLocaleString('id-ID')}`,
        color: BRAND_COLORS.gold,
        icon: 'alert-circle',
        menuKey: 'parent-finance',
      },
    ];
  }, [parentOverviewQuery.data?.overview.summary]);

  const studentStatCards: DashboardStatItem[] = useMemo(
    () => [
      { label: 'Role', value: profile.role, color: BRAND_COLORS.blue, icon: 'shield' },
      {
        label: 'Kelas',
        value: profile.studentClass?.name || '-',
        color: BRAND_COLORS.navy,
        icon: 'layers',
        menuKey: 'student-schedule',
      },
      {
        label: 'Jurusan',
        value: profile.studentClass?.major?.code || profile.studentClass?.major?.name || '-',
        color: BRAND_COLORS.teal,
        icon: 'grid',
        menuKey: 'student-learning',
      },
      {
        label: 'Status',
        value: profile.studentStatus || '-',
        color: BRAND_COLORS.gold,
        icon: 'activity',
        menuKey: 'student-grade-history',
      },
    ],
    [profile.role, profile.studentClass?.name, profile.studentClass?.major?.code, profile.studentClass?.major?.name, profile.studentStatus],
  );

  const displayName = (profile.name?.trim() || profile.username || 'Pengguna').trim();
  const profilePhotoUrl = useMemo(() => resolveMediaUrl(profile.photo), [profile.photo]);
  const activeAcademicYearLabel = useMemo(() => {
    return (
      activeAcademicYearQuery.data?.name ||
      teacherAssignmentsQuery.data?.activeYear?.name ||
      adminStatsQuery.data?.activeYearName ||
      '-'
    );
  }, [activeAcademicYearQuery.data?.name, teacherAssignmentsQuery.data?.activeYear?.name, adminStatsQuery.data?.activeYearName]);
  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }),
    [],
  );
  const todayTeacherSchedules = useMemo(() => {
    if (profile.role !== 'TEACHER') return [];
    const now = new Date();
    const jsDay = now.getDay();
    const currentDay: DayOfWeek | null = jsDay >= 1 && jsDay <= 6 ? JS_DAY_TO_SCHEDULE_DAY[jsDay - 1] : null;
    if (!currentDay) return [];

    return [...(teacherScheduleQuery.data || [])]
      .filter((entry) => entry.dayOfWeek === currentDay && entry.teachingHour !== null)
      .sort((a, b) => getTeachingHourValue(a) - getTeachingHourValue(b));
  }, [profile.role, teacherScheduleQuery.data]);
  const todayTeacherScheduleGroups = useMemo(() => {
    if (!todayTeacherSchedules.length) return [] as TeacherScheduleGroup[];

    const groups: TeacherScheduleGroup[] = [];
    let currentGroupEntries: ScheduleEntry[] = [todayTeacherSchedules[0]];
    let currentStart = getTeachingHourValue(todayTeacherSchedules[0]);
    let currentEnd = getTeachingHourValue(todayTeacherSchedules[0]);

    for (let index = 1; index < todayTeacherSchedules.length; index += 1) {
      const entry = todayTeacherSchedules[index];
      const prev = currentGroupEntries[currentGroupEntries.length - 1];
      const entryTeachingHour = getTeachingHourValue(entry);

      const isSameSubject = entry.teacherAssignment.subject.id === prev.teacherAssignment.subject.id;
      const isSameClass = entry.teacherAssignment.class.id === prev.teacherAssignment.class.id;
      const isSameRoom = (entry.room || '') === (prev.room || '');
      const isConsecutivePeriod = entryTeachingHour === currentEnd + 1;

      if (isSameSubject && isSameClass && isSameRoom && isConsecutivePeriod) {
        currentGroupEntries.push(entry);
        currentEnd = entryTeachingHour;
        continue;
      }

      const first = currentGroupEntries[0];
      groups.push({
        key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.class.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
        periodStart: currentStart,
        periodEnd: currentEnd,
        subjectName: first.teacherAssignment.subject.name,
        className: first.teacherAssignment.class.name,
        roomLabel: first.room || '-',
        entries: currentGroupEntries,
      });

      currentGroupEntries = [entry];
      currentStart = entryTeachingHour;
      currentEnd = entryTeachingHour;
    }

    const first = currentGroupEntries[0];
    groups.push({
      key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.class.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
      periodStart: currentStart,
      periodEnd: currentEnd,
      subjectName: first.teacherAssignment.subject.name,
      className: first.teacherAssignment.class.name,
      roomLabel: first.room || '-',
      entries: currentGroupEntries,
    });

    return groups;
  }, [todayTeacherSchedules]);
  const query = menuSearch.trim().toLowerCase();
  const filteredGroups = useMemo(() => {
    if (!query) return menuGroups;
    return menuGroups
      .map((group) => {
        const groupMatches = group.label.toLowerCase().includes(query);
        const items = groupMatches
          ? group.items
          : group.items.filter((menu) => menu.label.toLowerCase().includes(query));
        return { ...group, items };
      })
      .filter((group) => group.items.length > 0);
  }, [menuGroups, query]);

  useEffect(() => {
    if (!filteredGroups.length) {
      setOpenGroupKey(null);
      return;
    }

    setOpenGroupKey((prev) => {
      if (query) {
        return filteredGroups[0]?.key ?? null;
      }

      if (prev && filteredGroups.some((group) => group.key === prev)) {
        return prev;
      }

      return null;
    });
  }, [filteredGroups, query]);

  const isMenuTransitioning = openingMenuKey !== null;

  const clearOpeningMenuState = () => {
    if (openingMenuResetTimerRef.current) {
      clearTimeout(openingMenuResetTimerRef.current);
      openingMenuResetTimerRef.current = null;
    }

    if (isMountedRef.current) {
      setOpeningMenuKey(null);
    }
  };

  const scheduleOpeningMenuReset = (delayMs = 1500) => {
    if (openingMenuResetTimerRef.current) {
      clearTimeout(openingMenuResetTimerRef.current);
    }

    openingMenuResetTimerRef.current = setTimeout(() => {
      openingMenuResetTimerRef.current = null;
      if (isMountedRef.current) {
        setOpeningMenuKey(null);
      }
    }, delayMs);
  };

  const handleMenuPress = async (menu?: RoleMenuItem) => {
    if (!menu) return;
    if (isMenuTransitioning && openingMenuKey !== menu.key) return;

    setOpeningMenuKey(menu.key);

    if (menu.route) {
      try {
        router.push(menu.route as never);
        scheduleOpeningMenuReset();
      } catch {
        clearOpeningMenuState();
        Alert.alert('Gagal Membuka Modul', `Tidak bisa membuka menu "${menu.label}" saat ini.`);
      }
      return;
    }

    if (menu.webPath) {
      clearOpeningMenuState();
      Alert.alert(
        'Belum Tersedia Native',
        `Modul "${menu.label}" sedang proses migrasi ke mobile native.`,
      );
      return;
    }

    clearOpeningMenuState();
    Alert.alert('Segera Hadir', `Menu "${menu.label}" akan diimplementasikan pada tahap berikutnya.`);
  };

  const handleMenuWebPress = async (menu?: RoleMenuItem) => {
    if (!menu?.webPath) {
      notifyInfo('Menu ini belum punya fallback versi web.');
      return;
    }
    if (isMenuTransitioning && openingMenuKey !== menu.key) return;

    setOpeningMenuKey(menu.key);

    try {
      router.push(`/web-module/${menu.key}` as never);
      scheduleOpeningMenuReset();
    } catch {
      clearOpeningMenuState();
      Alert.alert('Gagal Membuka Modul', `Tidak bisa membuka versi web untuk menu "${menu.label}".`);
    }
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const startedAt = Date.now();
    try {
      const refetches: Array<Promise<unknown>> = [profileQuery.refetch()];
      if (profile.role === 'TEACHER') {
        refetches.push(teacherAssignmentsQuery.refetch());
        refetches.push(teacherScheduleQuery.refetch());
      }
      if (profile.role === 'ADMIN') {
        refetches.push(adminStatsQuery.refetch());
      }
      if (profile.role === 'PRINCIPAL') {
        refetches.push(principalStatsQuery.refetch());
      }
      if (profile.role === 'STAFF') {
        refetches.push(staffStatsQuery.refetch());
      }
      if (profile.role === 'PARENT') {
        refetches.push(parentOverviewQuery.refetch());
      }

      await Promise.all(refetches);
      const updateResult = await checkAppUpdate();
      if (!updateResult.supported) return;

      if (updateResult.available) {
        Alert.alert(
          'Update Tersedia',
          `Ada pembaruan terbaru di channel ${updateResult.channel}. Ingin update sekarang?`,
          [
            { text: 'Nanti', style: 'cancel' },
            {
              text: 'Update Sekarang',
              style: 'default',
              onPress: () => {
                void applyAppUpdate().catch((error: any) => {
                  notifyApiError(error, 'Gagal memasang update.');
                });
              },
            },
          ],
        );
      }
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 700) {
        await new Promise((resolve) => setTimeout(resolve, 700 - elapsed));
      }
      setLastRefreshAt(new Date().toISOString());
      setIsRefreshing(false);
    }
  };

  const renderStatGrid = (items: DashboardStatItem[]) => {
    const columns = items.length > 4 ? 3 : 4;
    const itemWidth = `${100 / columns}%` as `${number}%`;
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {items.map((item) => {
          const linkedMenu = item.menuKey ? menuItemByKey.get(item.menuKey) : undefined;
          const isOpeningThisMenu = linkedMenu ? openingMenuKey === linkedMenu.key : false;
          const iconName = getStatIcon(item, linkedMenu);
          const tone = getMenuIconTone(item.label);

          return (
            <View key={item.label} style={{ width: itemWidth, paddingHorizontal: 4, marginBottom: 10 }}>
              <Pressable
                disabled={!linkedMenu || isMenuTransitioning}
                onPress={() => {
                  if (!linkedMenu) return;
                  void handleMenuPress(linkedMenu);
                }}
                onLongPress={() => {
                  if (!linkedMenu?.webPath) return;
                  void handleMenuWebPress(linkedMenu);
                }}
                delayLongPress={220}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 4,
                  opacity: pressed || isOpeningThisMenu ? 0.82 : 1,
                })}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    backgroundColor: tone.bg,
                    borderWidth: 1,
                    borderColor: tone.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isOpeningThisMenu ? (
                    <ActivityIndicator size="small" color={tone.fg} />
                  ) : (
                    <Feather name={iconName} size={17} color={tone.fg} />
                  )}
                </View>
                <Text style={{ color: item.color, fontWeight: '700', fontSize: item.value.length > 12 ? 12 : 15, marginTop: 6 }}>
                  {item.value}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 10, textAlign: 'center' }} numberOfLines={2}>
                  {isOpeningThisMenu ? 'Membuka...' : item.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    );
  };

  const renderIconStatGrid = (items: DashboardIconStatItem[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
      {items.map((item) => {
        const linkedMenu = item.menuKey ? menuItemByKey.get(item.menuKey) : undefined;
        const isOpeningThisMenu = linkedMenu ? openingMenuKey === linkedMenu.key : false;
        return (
          <View key={item.label} style={{ width: '25%', paddingHorizontal: 4, marginBottom: 8 }}>
            <Pressable
              disabled={!linkedMenu || isMenuTransitioning}
              onPress={() => {
                if (!linkedMenu) return;
                void handleMenuPress(linkedMenu);
              }}
              onLongPress={() => {
                if (!linkedMenu?.webPath) return;
                void handleMenuWebPress(linkedMenu);
              }}
              delayLongPress={220}
              style={({ pressed }) => ({
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 4,
                opacity: pressed || isOpeningThisMenu ? 0.82 : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: item.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isOpeningThisMenu ? (
                  <ActivityIndicator size="small" color={BRAND_COLORS.white} />
                ) : (
                  <Feather name={item.icon} size={18} color={BRAND_COLORS.white} />
                )}
              </View>
              <Text style={{ color: item.color, fontWeight: '700', fontSize: 17, marginTop: 6 }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 10, textAlign: 'center' }} numberOfLines={2}>
                {isOpeningThisMenu ? 'Membuka...' : item.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );

  const handleLogout = () => {
    if (isLoggingOut) return;
    Alert.alert('Konfirmasi Logout', 'Yakin ingin keluar dari akun ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setIsLoggingOut(true);
              await logout();
              router.replace('/welcome');
              notifySuccess('Logout berhasil');
              setIsLoggingOut(false);
            } catch (error: any) {
              setIsLoggingOut(false);
              notifyApiError(error, 'Gagal logout.');
            }
          })();
        },
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard..." />;
  if (!isAuthenticated || !user) return <Redirect href="/welcome" />;

  const teachingScheduleMenu = menuItemByKey.get('teaching-schedule');

  return (
    <View style={{ flex: 1, backgroundColor: '#e9eefb' }}>
      <View
        style={{
          position: 'absolute',
          right: -55,
          top: -40,
          width: 185,
          height: 185,
          borderRadius: 999,
          backgroundColor: BRAND_COLORS.sky,
          opacity: 0.24,
        }}
      />
      <View
        style={{
          position: 'absolute',
          left: -75,
          top: 210,
          width: 170,
          height: 170,
          borderRadius: 999,
          backgroundColor: BRAND_COLORS.pink,
          opacity: 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: -55,
          bottom: 42,
          width: 160,
          height: 160,
          borderRadius: 999,
          backgroundColor: BRAND_COLORS.teal,
          opacity: 0.18,
        }}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          ...homeContentPadding,
          flexGrow: 1,
        }}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} />}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.push('/profile')} style={{ marginRight: 12 }}>
            <AvatarCircle
              name={displayName}
              photoUrl={profilePhotoUrl}
              size={52}
              backgroundColor={BRAND_COLORS.navy}
              textColor={BRAND_COLORS.white}
              borderColor="#d2dcf8"
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Tahun Ajaran Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 14 }}>
              {activeAcademicYearLabel}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
              {todayLabel}
            </Text>
          </View>
        </View>

        <Text
          style={{
            marginTop: 12,
            color: BRAND_COLORS.textDark,
            fontSize: 24,
            fontWeight: '700',
            fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
          }}
        >
          Halo, {displayName}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, marginBottom: 12 }}>
          Pilih modul yang ingin Anda akses hari ini.
        </Text>

        {profile.role === 'TEACHER' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Statistik Mengajar</Text>
            {teacherAssignmentsQuery.isLoading || teacherScheduleQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat statistik mengajar...</Text>
            ) : null}
            {(teacherAssignmentsQuery.isError || teacherScheduleQuery.isError) &&
            !(teacherAssignmentsQuery.isLoading || teacherScheduleQuery.isLoading) ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat statistik mengajar. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!teacherAssignmentsQuery.isLoading &&
            !teacherScheduleQuery.isLoading &&
            !teacherAssignmentsQuery.isError &&
            !teacherScheduleQuery.isError
              ? renderIconStatGrid(teacherIconStats)
              : null}
          </View>
        ) : null}

        {profile.role === 'ADMIN' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Statistik Admin</Text>
            {adminStatsQuery.data?.activeYearName ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                Tahun ajaran aktif: {adminStatsQuery.data.activeYearName}
              </Text>
            ) : null}
            {adminStatsQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat statistik admin...</Text>
            ) : null}
            {adminStatsQuery.isError && !adminStatsQuery.isLoading ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat statistik admin. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!adminStatsQuery.isLoading && !adminStatsQuery.isError ? renderStatGrid(adminStatCards) : null}
          </View>
        ) : null}

        {profile.role === 'PRINCIPAL' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Statistik Kepala Sekolah</Text>
            {principalStatsQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat ringkasan kepala sekolah...</Text>
            ) : null}
            {principalStatsQuery.isError && !principalStatsQuery.isLoading ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat ringkasan kepala sekolah. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!principalStatsQuery.isLoading && !principalStatsQuery.isError ? (
              <>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Semester: {principalStatsQuery.data?.semester === 'EVEN' ? 'Genap' : 'Ganjil'}
                </Text>
                {renderStatGrid(principalStatCards)}
              </>
            ) : null}
          </View>
        ) : null}

        {profile.role === 'STAFF' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Statistik Staff</Text>
            {staffStatsQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat statistik staff...</Text>
            ) : null}
            {staffStatsQuery.isError && !staffStatsQuery.isLoading ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat statistik staff. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!staffStatsQuery.isLoading && !staffStatsQuery.isError ? renderStatGrid(staffStatCards) : null}
          </View>
        ) : null}

        {profile.role === 'PARENT' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Ringkasan Keuangan Anak</Text>
            {parentOverviewQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat ringkasan keuangan...</Text>
            ) : null}
            {parentOverviewQuery.isError && !parentOverviewQuery.isLoading ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat ringkasan keuangan. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!parentOverviewQuery.isLoading && !parentOverviewQuery.isError ? renderStatGrid(parentStatCards) : null}
          </View>
        ) : null}

        {profile.role === 'STUDENT' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Info Siswa</Text>
            {renderStatGrid(studentStatCards)}
          </View>
        ) : null}

        {profile.role === 'TEACHER' ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Jadwal Mengajar Hari Ini
            </Text>
            {teacherScheduleQuery.isLoading ? (
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat jadwal mengajar hari ini...</Text>
            ) : null}
            {teacherScheduleQuery.isError && !teacherScheduleQuery.isLoading ? (
              <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                Gagal memuat jadwal hari ini. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}

            {!teacherScheduleQuery.isLoading && !teacherScheduleQuery.isError ? (
              <>
                {todayTeacherScheduleGroups.length > 0 ? (
                  <View>
                    {todayTeacherScheduleGroups.map((group) => (
                      <View
                        key={group.key}
                        style={{
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: '#d6e2f7',
                          backgroundColor: '#f8fbff',
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            minWidth: 90,
                            paddingHorizontal: 8,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: BRAND_COLORS.blue,
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.white, fontWeight: '700', fontSize: 12 }}>
                            {group.periodStart === group.periodEnd
                              ? `Jam ke ${group.periodStart}`
                              : `Jam ke ${group.periodStart}-${group.periodEnd}`}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                            {group.subjectName}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            {group.className}
                            {group.roomLabel !== '-' ? ` • ${group.roomLabel}` : ''}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: '#cbd5e1',
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center' }}>
                      Tidak ada jadwal mengajar untuk hari ini.
                    </Text>
                  </View>
                )}

                {teachingScheduleMenu ? (
                  <Pressable
                    disabled={isMenuTransitioning}
                    onPress={() => {
                      void handleMenuPress(teachingScheduleMenu);
                    }}
                    onLongPress={() => {
                      if (!teachingScheduleMenu.webPath) return;
                      void handleMenuWebPress(teachingScheduleMenu);
                    }}
                    delayLongPress={220}
                    style={({ pressed }) => ({
                      marginTop: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      backgroundColor: '#f8fbff',
                      paddingVertical: 10,
                      alignItems: 'center',
                      opacity: pressed || openingMenuKey === teachingScheduleMenu.key ? 0.82 : 1,
                    })}
                  >
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>
                      {openingMenuKey === teachingScheduleMenu.key ? 'Membuka modul...' : 'Lihat Jadwal Lengkap'}
                    </Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </View>
        ) : roleQuickMenus.length > 0 ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Aksi Cepat</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {roleQuickMenus.map((menu) => {
                const icon = getMenuIcon(menu);
                const tone = getMenuIconTone(menu.key);
                const isOpeningThisMenu = openingMenuKey === menu.key;
                return (
                  <View key={menu.key} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 10 }}>
                    <Pressable
                      disabled={isMenuTransitioning}
                      onPress={() => {
                        void handleMenuPress(menu);
                      }}
                      onLongPress={() => {
                        if (!menu.webPath) return;
                        void handleMenuWebPress(menu);
                      }}
                      delayLongPress={220}
                      style={({ pressed }) => ({
                        paddingHorizontal: 6,
                        paddingVertical: 6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed || isOpeningThisMenu ? 0.82 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          backgroundColor: tone.bg,
                          borderWidth: 1,
                          borderColor: tone.border,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {isOpeningThisMenu ? (
                          <ActivityIndicator size="small" color={tone.fg} />
                        ) : (
                          <Feather name={icon} size={18} color={tone.fg} />
                        )}
                      </View>
                      <Text
                        style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 11, marginTop: 5, textAlign: 'center' }}
                        numberOfLines={2}
                      >
                        {isOpeningThisMenu ? 'Membuka...' : menu.label}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: BRAND_COLORS.white,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#d5e0f5',
            paddingHorizontal: 14,
            marginBottom: 14,
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={menuSearch}
            onChangeText={setMenuSearch}
            placeholder="Cari menu atau submenu"
            placeholderTextColor="#9aa6be"
            style={{
              flex: 1,
              paddingVertical: 11,
              paddingHorizontal: 9,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        {profileQuery.isLoading ? (
          <View style={{ marginBottom: 12 }}>
            <QueryStateView type="loading" message="Sinkronisasi dashboard..." />
          </View>
        ) : null}

        {profileQuery.isError ? (
          <View style={{ marginBottom: 12 }}>
            <QueryStateView type="error" message="Gagal memuat data dashboard." onRetry={() => profileQuery.refetch()} />
          </View>
        ) : null}

        {profileQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={profileQuery.data.cachedAt} /> : null}

        {openingMenuKey ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              backgroundColor: BRAND_COLORS.white,
              paddingVertical: 8,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <ActivityIndicator size="small" color={BRAND_COLORS.navy} />
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginLeft: 8 }}>
              Membuka modul...
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>Menu Berdasarkan Kategori</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{profile.role}</Text>
        </View>
        {hasAnyWebFallbackMenu ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              backgroundColor: '#f8fbff',
              paddingVertical: 8,
              paddingHorizontal: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
              Tekan lama menu untuk membuka versi web lengkap jika fitur native belum sepenuhnya tersedia.
            </Text>
          </View>
        ) : null}

        {filteredGroups.length === 0 ? (
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontWeight: '600' }}>
              Menu tidak ditemukan.
            </Text>
          </View>
        ) : null}

        {filteredGroups.map((group, groupIndex) => {
          const accent = CARD_ACCENTS[groupIndex % CARD_ACCENTS.length];
          const groupIcon = getGroupIcon(group);
          const isOpen = openGroupKey === group.key;
          const submenuColumns = group.items.length <= 2 ? 2 : 3;
          const submenuWidth = `${100 / submenuColumns}%` as `${number}%`;

          return (
            <View
              key={group.key}
              style={{
                backgroundColor: BRAND_COLORS.white,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: '#d6e0f2',
                marginBottom: 11,
                overflow: 'hidden',
              }}
            >
              <Pressable
                onPress={() => {
                  setOpenGroupKey((prev) => (prev === group.key ? null : group.key));
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderBottomWidth: isOpen ? 1 : 0,
                  borderBottomColor: '#e8eefb',
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    backgroundColor: `${accent}20`,
                    borderWidth: 1,
                    borderColor: `${accent}4A`,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 10,
                  }}
                >
                  <Feather name={groupIcon} size={18} color={accent} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>{group.label}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {group.items.length} submenu
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 12 }}>
                  <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} color={BRAND_COLORS.textMuted} />
                </View>
              </Pressable>

              {isOpen ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {group.items.map((menu) => {
                      const tone = getMenuIconTone(menu.key);
                      const isOpeningThisMenu = openingMenuKey === menu.key;
                      const menuIcon = getMenuIcon(menu);
                      return (
                        <View key={menu.key} style={{ width: submenuWidth, paddingHorizontal: 4, marginBottom: 10 }}>
                          <Pressable
                            disabled={isMenuTransitioning}
                            onPress={() => {
                              void handleMenuPress(menu);
                            }}
                            onLongPress={() => {
                              if (!menu.webPath) return;
                              void handleMenuWebPress(menu);
                            }}
                            delayLongPress={220}
                            style={({ pressed }) => ({
                              alignItems: 'center',
                              justifyContent: 'center',
                              paddingHorizontal: 6,
                              paddingVertical: 5,
                              opacity: pressed || isOpeningThisMenu ? 0.82 : 1,
                            })}
                          >
                            <View
                              style={{
                                width: 46,
                                height: 46,
                                borderRadius: 999,
                                backgroundColor: tone.bg,
                                borderWidth: 1,
                                borderColor: tone.border,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {isOpeningThisMenu ? (
                                <ActivityIndicator size="small" color={tone.fg} />
                              ) : (
                                <Feather name={menuIcon} size={18} color={tone.fg} />
                              )}
                            </View>
                            <Text
                              style={{
                                color: BRAND_COLORS.textDark,
                                fontWeight: '700',
                                fontSize: 11,
                                marginTop: 6,
                                textAlign: 'center',
                              }}
                              numberOfLines={2}
                            >
                              {isOpeningThisMenu ? 'Membuka...' : menu.label}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 6 }}>
          Refresh terakhir: {lastRefreshAt ? new Date(lastRefreshAt).toLocaleTimeString('id-ID') : '-'}
        </Text>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Platform.OS === 'ios' ? 22 : 14,
        }}
      >
        <View
          style={{
            backgroundColor: BRAND_COLORS.navy,
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#0b1b42',
            shadowOffset: { width: 0, height: 7 },
            shadowOpacity: 0.2,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          <Pressable onPress={() => router.replace('/home')} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="home" size={17} color={BRAND_COLORS.gold} />
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Home</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/profile')} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="user" size={17} color={BRAND_COLORS.white} />
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Profil</Text>
          </Pressable>

          <View style={{ width: 58 }} />

          <Pressable onPress={() => void handleRefresh()} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="bell" size={17} color={BRAND_COLORS.white} />
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Update</Text>
          </Pressable>

          <Pressable onPress={handleLogout} disabled={isLoggingOut} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="log-out" size={17} color={BRAND_COLORS.white} />
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>
              {isLoggingOut ? 'Proses' : 'Logout'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push('/profile')}
          style={{
            position: 'absolute',
            alignSelf: 'center',
            top: -22,
            width: 52,
            height: 52,
            borderRadius: 999,
            backgroundColor: '#ffffff',
            borderWidth: 5,
            borderColor: '#e9eefb',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AvatarCircle
            name={displayName}
            photoUrl={profilePhotoUrl}
            size={42}
            backgroundColor={BRAND_COLORS.navy}
            textColor={BRAND_COLORS.white}
          />
        </Pressable>
      </View>
    </View>
  );
}
