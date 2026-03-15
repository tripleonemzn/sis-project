import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Modal,
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
import { internshipDutyApi } from '../../src/features/internshipDuty/internshipDutyApi';
import { academicYearApi } from '../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../src/features/admin/adminApi';
import { principalApi } from '../../src/features/principal/principalApi';
import { staffApi } from '../../src/features/staff/staffApi';
import { examApi, ExamProgramItem } from '../../src/features/exams/examApi';
import { useStudentExamsQuery } from '../../src/features/exams/useStudentExamsQuery';
import {
  teachingResourceProgramApi,
  TeachingResourceProgramItem,
} from '../../src/features/learningResources/teachingResourceProgramApi';
import { useParentFinanceOverviewQuery } from '../../src/features/parent/useParentFinanceOverviewQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { applyAppUpdate, checkAppUpdate } from '../../src/features/appUpdate/updateService';
import { BRAND_COLORS } from '../../src/config/brand';
import { ENV } from '../../src/config/env';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../src/lib/ui/feedback';
import type { AuthUser } from '../../src/features/auth/types';
import { useUnreadNotificationsQuery } from '../../src/features/notifications/useUnreadNotificationsQuery';

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
type StudentExamStatus = 'OPEN' | 'UPCOMING' | 'MISSED' | 'COMPLETED';

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

type StudentScheduleGroup = {
  key: string;
  periodStart: number;
  periodEnd: number;
  subjectName: string;
  teacherName: string;
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

function toSemesterLabel(value?: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'ODD' || normalized.includes('GANJIL')) return 'Ganjil';
  if (normalized === 'EVEN' || normalized.includes('GENAP')) return 'Genap';
  return null;
}

function normalizeStudentExamStatus(rawStatus: unknown, hasSubmitted: boolean): StudentExamStatus {
  if (hasSubmitted) return 'COMPLETED';
  const value = String(rawStatus || '').toUpperCase();
  if (value.includes('OPEN') || value.includes('IN_PROGRESS')) return 'OPEN';
  if (value.includes('UPCOMING')) return 'UPCOMING';
  if (value.includes('MISSED') || value.includes('TIMEOUT')) return 'MISSED';
  if (value.includes('COMPLETED')) return 'COMPLETED';
  return 'UPCOMING';
}

function getStudentExamStatusTone(status: StudentExamStatus) {
  if (status === 'OPEN') return { label: 'Berlangsung', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (status === 'COMPLETED') return { label: 'Selesai', bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' };
  if (status === 'MISSED') return { label: 'Terlewat', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  return { label: 'Akan Datang', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
}

function formatExamDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  if (menu.key.includes('email') || menu.key.includes('mail')) return 'mail';
  if (menu.key.includes('profile')) return 'user';
  if (menu.key.includes('diagnostics')) return 'activity';
  if (menu.key.includes('schedule')) return 'calendar';
  if (menu.key.includes('academic')) return 'book-open';
  if (menu.key.includes('slideshow')) return 'image';
  if (menu.key.includes('learning') || menu.key.includes('materials')) return 'book-open';
  if (menu.key.includes('permissions')) return 'shield';
  if (menu.key.includes('grades') || menu.key.includes('report')) return 'bar-chart-2';
  if (menu.key.includes('attendance')) return 'check-square';
  if (menu.key.includes('exams') || menu.key.includes('exam')) return 'file-text';
  if (menu.key.includes('assessment')) return 'clipboard';
  if (menu.key.includes('user')) return 'users';
  if (menu.key.includes('students')) return 'users';
  if (menu.key.includes('work-program')) return 'briefcase';
  if (menu.key.includes('inventory')) return 'archive';
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
  if (key.includes('work-program')) return 'briefcase';
  if (key.includes('sarpras')) return 'archive';
  if (key.includes('humas')) return 'globe';
  if (key.includes('extracurricular')) return 'award';
  return 'grid';
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

const readSemesterValue = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;
  const semester = (payload as { semester?: unknown }).semester;
  return typeof semester === 'string' ? semester : null;
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

const TEACHER_EXAM_MENU_KEYS = new Set([
  'teacher-exam-programs',
]);
const TEACHER_HOMEROOM_REPORT_MENU_KEYS = new Set([
  'teacher-homeroom-report',
]);
const STUDENT_EXAM_MENU_KEYS = new Set([
  'student-exam-programs',
]);
const TEACHER_LEARNING_RESOURCE_MENU_KEYS = new Set([
  'teacher-cp',
  'teacher-atp',
  'teacher-prota',
  'teacher-promes',
  'teacher-modules',
  'teacher-kktp',
  'teacher-matriks-sebaran',
]);

const TEACHING_RESOURCE_NATIVE_ROUTES: Record<string, { key: string; route: string; webPath?: string }> = {
  CP: { key: 'teacher-cp', route: '/teacher/learning-cp', webPath: '/teacher/learning-resources/cp' },
  ATP: {
    key: 'teacher-atp',
    route: '/teacher/learning-atp',
    webPath: '/teacher/learning-resources/atp',
  },
  PROTA: {
    key: 'teacher-prota',
    route: '/teacher/learning-prota',
    webPath: '/teacher/learning-resources/prota',
  },
  PROMES: {
    key: 'teacher-promes',
    route: '/teacher/learning-promes',
    webPath: '/teacher/learning-resources/promes',
  },
  MODUL_AJAR: {
    key: 'teacher-modules',
    route: '/teacher/learning-modules',
    webPath: '/teacher/learning-resources/modul-ajar',
  },
  MODULES: {
    key: 'teacher-modules',
    route: '/teacher/learning-modules',
    webPath: '/teacher/learning-resources/modul-ajar',
  },
  KKTP: {
    key: 'teacher-kktp',
    route: '/teacher/learning-kktp',
    webPath: '/teacher/learning-resources/kktp',
  },
  MATRIKS_SEBARAN: {
    key: 'teacher-matriks-sebaran',
    route: '/teacher/learning-matriks-sebaran',
    webPath: '/teacher/learning-resources/matriks-sebaran',
  },
};

function normalizeProgramCode(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function programCodeToSlug(raw?: string | null): string {
  return normalizeProgramCode(raw).toLowerCase().replace(/_/g, '-');
}

function normalizeTeachingResourceProgramCode(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function teachingResourceProgramCodeToSlug(raw?: string | null): string {
  return normalizeTeachingResourceProgramCode(raw).toLowerCase().replace(/_/g, '-');
}

function buildDynamicExamMenuItems(
  role: 'TEACHER' | 'STUDENT',
  programs: ExamProgramItem[],
): RoleMenuItem[] {
  const sorted = [...programs].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  return sorted.map((program) => {
    const code = normalizeProgramCode(program.code);
    const slug = programCodeToSlug(code);
    const route =
      role === 'TEACHER'
        ? `/teacher/exams?programCode=${encodeURIComponent(code)}`
        : `/exams?programCode=${encodeURIComponent(code)}`;
    return {
      key: `${role.toLowerCase()}-exam-${slug}`,
      label: String(program.label || code).trim() || code,
      route,
    };
  });
}

function buildDynamicHomeroomReportMenuItems(programs: ExamProgramItem[]): RoleMenuItem[] {
  const sorted = [...programs].sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  return sorted.map((program) => {
    const code = normalizeProgramCode(program.code);
    const slug = programCodeToSlug(code);
    return {
      key: `teacher-homeroom-report-${slug}`,
      label: String(program.label || code).trim() || code,
      route: `/teacher/homeroom-report?programCode=${encodeURIComponent(code)}`,
    };
  });
}

function buildDynamicTeachingResourceMenuItems(programs: TeachingResourceProgramItem[]): RoleMenuItem[] {
  const sorted = [...programs].sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || a.code.localeCompare(b.code));

  return sorted.map((program) => {
    const code = normalizeTeachingResourceProgramCode(program.code);
    const label = String(program.label || code).trim() || code;
    const slug = teachingResourceProgramCodeToSlug(code);
    const native = TEACHING_RESOURCE_NATIVE_ROUTES[code];

    if (native) {
      return {
        key: native.key,
        label,
        route: native.route,
        webPath: native.webPath,
      };
    }

    const webPath = `/teacher/learning-resources/${slug}`;
    const route = `/teacher/learning-program/${encodeURIComponent(code)}?label=${encodeURIComponent(label)}&code=${encodeURIComponent(code)}`;
    return {
      key: `teacher-learning-resource-${slug}`,
      label,
      route,
      webPath,
    };
  });
}

function replaceStaticMenusWithDynamic(
  items: RoleMenuItem[],
  staticKeys: Set<string>,
  dynamicItems: RoleMenuItem[],
): RoleMenuItem[] {
  const firstStaticIdx = items.findIndex((item) => staticKeys.has(item.key));
  if (firstStaticIdx < 0) return items;

  let lastStaticIdx = firstStaticIdx;
  for (let i = firstStaticIdx; i < items.length; i += 1) {
    if (staticKeys.has(items[i].key)) {
      lastStaticIdx = i;
    }
  }

  const before = items.slice(0, firstStaticIdx).filter((item) => !staticKeys.has(item.key));
  const after = items.slice(lastStaticIdx + 1).filter((item) => !staticKeys.has(item.key));
  return [...before, ...dynamicItems, ...after];
}

function applyExamProgramsToMenuGroups(
  groups: RoleMenuGroup[],
  role: string,
  programs: ExamProgramItem[],
  programsResolved: boolean,
): RoleMenuGroup[] {
  if (role !== 'TEACHER' && role !== 'STUDENT') return groups;
  if (!programsResolved) return groups;

  const roleTyped = role as 'TEACHER' | 'STUDENT';
  const staticKeys = roleTyped === 'TEACHER' ? TEACHER_EXAM_MENU_KEYS : STUDENT_EXAM_MENU_KEYS;
  const visiblePrograms = programs.filter((program) =>
    roleTyped === 'TEACHER' ? program.showOnTeacherMenu && program.isActive : program.showOnStudentMenu && program.isActive,
  );
  const dynamicExamItems = buildDynamicExamMenuItems(roleTyped, visiblePrograms);
  const dynamicHomeroomReportItems =
    roleTyped === 'TEACHER'
      ? buildDynamicHomeroomReportMenuItems(
          visiblePrograms.filter((program) => {
            const componentType = String(
              program.gradeComponentTypeCode || program.gradeComponentType || '',
            )
              .trim()
              .toUpperCase();
            return componentType === 'MIDTERM' || componentType === 'FINAL';
          }),
        )
      : [];

  return groups.map((group) => {
    if (group.key === 'exams') {
      return {
        ...group,
        items: replaceStaticMenusWithDynamic(group.items, staticKeys, dynamicExamItems),
      };
    }

    if (roleTyped === 'TEACHER' && group.key === 'homeroom') {
      return {
        ...group,
        items: replaceStaticMenusWithDynamic(
          group.items,
          TEACHER_HOMEROOM_REPORT_MENU_KEYS,
          dynamicHomeroomReportItems,
        ),
      };
    }
    return group;
  });
}

function applyTeachingResourceProgramsToMenuGroups(
  groups: RoleMenuGroup[],
  role: string,
  programs: TeachingResourceProgramItem[],
  programsResolved: boolean,
): RoleMenuGroup[] {
  if (role !== 'TEACHER') return groups;
  if (!programsResolved) return groups;

  const visiblePrograms = programs.filter((program) => program.isActive && program.showOnTeacherMenu);
  const dynamicItems = buildDynamicTeachingResourceMenuItems(visiblePrograms);

  return groups.map((group) => {
    if (group.key !== 'teaching-resources') return group;

    return {
      ...group,
      items: replaceStaticMenusWithDynamic(group.items, TEACHER_LEARNING_RESOURCE_MENU_KEYS, dynamicItems),
    };
  });
}

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
  const unreadNotificationsQuery = useUnreadNotificationsQuery(isAuthenticated);
  const unreadNotificationCount = unreadNotificationsQuery.data ?? 0;
  const profileQuery = useProfileQuery(isAuthenticated);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isLogoutConfirmVisible, setIsLogoutConfirmVisible] = useState(false);
  const [isInlineSearchVisible, setIsInlineSearchVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuSearch, setMenuSearch] = useState('');
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [openingMenuKey, setOpeningMenuKey] = useState<string | null>(null);
  const openingMenuResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuSearchInputRef = useRef<TextInput | null>(null);
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

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const profile = profileQuery.data?.profile ?? user ?? FALLBACK_PROFILE;
  const homeContentPadding = getStandardPagePadding(insets, { horizontal: 18, bottom: 148 });
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
  const teacherDefenseQuery = useQuery({
    queryKey: ['mobile-home-teacher-defense', profile.id],
    enabled: profile.role === 'TEACHER',
    staleTime: 1000 * 60 * 5,
    queryFn: async () => internshipDutyApi.listExaminerInternships(),
  });
  const studentClassId = profile.studentClass?.id ?? null;
  const studentScheduleQuery = useQuery({
    queryKey: ['mobile-home-student-schedule', profile.id, activeAcademicYearQuery.data?.id, studentClassId],
    enabled: profile.role === 'STUDENT' && Boolean(activeAcademicYearQuery.data?.id) && Boolean(studentClassId),
    queryFn: () =>
      scheduleApi.list({
        academicYearId: activeAcademicYearQuery.data!.id,
        classId: studentClassId!,
      }),
  });
  const studentExamsQuery = useStudentExamsQuery({
    enabled: isAuthenticated && profile.role === 'STUDENT',
    user: profile,
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-home-exam-programs', profile.role, activeAcademicYearQuery.data?.id],
    enabled:
      isAuthenticated &&
      (profile.role === 'TEACHER' || profile.role === 'STUDENT') &&
      Boolean(activeAcademicYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: activeAcademicYearQuery.data?.id,
        roleContext: profile.role === 'STUDENT' ? 'student' : 'teacher',
      }),
  });

  const teachingResourceProgramsQuery = useQuery({
    queryKey: ['mobile-home-teaching-resource-programs', profile.role, activeAcademicYearQuery.data?.id],
    enabled: isAuthenticated && profile.role === 'TEACHER' && Boolean(activeAcademicYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      teachingResourceProgramApi.getTeachingResourcePrograms({
        academicYearId: activeAcademicYearQuery.data?.id,
        roleContext: 'teacher',
      }),
  });

  const hasPendingDefense = profile.role === 'TEACHER' && (teacherDefenseQuery.data?.length || 0) > 0;
  const menuGroups = useMemo(
    () => {
      const baseGroups = getGroupedRoleMenu(profile, { hasPendingDefense })
        .map((group) => ({
          ...group,
          // Keep non-dashboard entries (e.g. Email) even when they are grouped under Dashboard.
          items: group.items.filter((item) => {
            const key = item.key.toLowerCase();
            const label = item.label.toLowerCase();
            return key !== 'dashboard' && !key.endsWith('-dashboard') && label !== 'dashboard';
          }),
        }))
        .filter((group) => group.items.length > 0);

      const groupsWithExamPrograms = applyExamProgramsToMenuGroups(
        baseGroups,
        profile.role,
        examProgramsQuery.data?.programs || [],
        examProgramsQuery.isSuccess,
      );

      const groupsWithTeachingResourcePrograms = applyTeachingResourceProgramsToMenuGroups(
        groupsWithExamPrograms,
        profile.role,
        teachingResourceProgramsQuery.data?.programs || [],
        teachingResourceProgramsQuery.isSuccess,
      );

      return groupsWithTeachingResourcePrograms.filter((group) => group.items.length > 0);
    },
    [
      profile,
      hasPendingDefense,
      examProgramsQuery.data?.programs,
      examProgramsQuery.isSuccess,
      teachingResourceProgramsQuery.data?.programs,
      teachingResourceProgramsQuery.isSuccess,
    ],
  );
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
      {
        label: 'Jatuh Tempo',
        value: `${summary.overdueCount || 0} Tagihan`,
        color: BRAND_COLORS.pink,
        icon: 'clock',
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
  const todayStudentSchedules = useMemo(() => {
    if (profile.role !== 'STUDENT') return [] as ScheduleEntry[];

    const now = new Date();
    const jsDay = now.getDay();
    const currentDay: DayOfWeek | null = jsDay >= 1 && jsDay <= 6 ? JS_DAY_TO_SCHEDULE_DAY[jsDay - 1] : null;
    if (!currentDay) return [] as ScheduleEntry[];

    return [...(studentScheduleQuery.data || [])]
      .filter((entry) => entry.dayOfWeek === currentDay)
      .sort((a, b) => {
        const aHour = typeof a.teachingHour === 'number' && a.teachingHour > 0 ? a.teachingHour : a.period;
        const bHour = typeof b.teachingHour === 'number' && b.teachingHour > 0 ? b.teachingHour : b.period;
        if (aHour === bHour) return a.period - b.period;
        return aHour - bHour;
      });
  }, [profile.role, studentScheduleQuery.data]);
  const todayStudentScheduleGroups = useMemo(() => {
    if (!todayStudentSchedules.length) return [] as StudentScheduleGroup[];

    const groups: StudentScheduleGroup[] = [];
    let currentGroupEntries: ScheduleEntry[] = [todayStudentSchedules[0]];
    let currentStart = getTeachingHourValue(todayStudentSchedules[0]);
    let currentEnd = getTeachingHourValue(todayStudentSchedules[0]);

    for (let index = 1; index < todayStudentSchedules.length; index += 1) {
      const entry = todayStudentSchedules[index];
      const prev = currentGroupEntries[currentGroupEntries.length - 1];
      const entryTeachingHour = getTeachingHourValue(entry);

      const isSameSubject = entry.teacherAssignment.subject.id === prev.teacherAssignment.subject.id;
      const isSameTeacher = entry.teacherAssignment.teacher.id === prev.teacherAssignment.teacher.id;
      const isSameRoom = (entry.room || '') === (prev.room || '');
      const isConsecutivePeriod = entryTeachingHour === currentEnd + 1;

      if (isSameSubject && isSameTeacher && isSameRoom && isConsecutivePeriod) {
        currentGroupEntries.push(entry);
        currentEnd = entryTeachingHour;
        continue;
      }

      const first = currentGroupEntries[0];
      groups.push({
        key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.teacher.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
        periodStart: currentStart,
        periodEnd: currentEnd,
        subjectName: first.teacherAssignment.subject.name,
        teacherName: first.teacherAssignment.teacher.name,
        roomLabel: first.room || '-',
        entries: currentGroupEntries,
      });

      currentGroupEntries = [entry];
      currentStart = entryTeachingHour;
      currentEnd = entryTeachingHour;
    }

    const first = currentGroupEntries[0];
    groups.push({
      key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.teacher.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
      periodStart: currentStart,
      periodEnd: currentEnd,
      subjectName: first.teacherAssignment.subject.name,
      teacherName: first.teacherAssignment.teacher.name,
      roomLabel: first.room || '-',
      entries: currentGroupEntries,
    });

    return groups;
  }, [todayStudentSchedules]);
  const upcomingStudentExams = useMemo(() => {
    if (profile.role !== 'STUDENT') return [];
    const exams = studentExamsQuery.data?.exams || [];

    return [...exams]
      .filter((item) => {
        const status = normalizeStudentExamStatus(item.status, Boolean(item.has_submitted));
        return status === 'UPCOMING' || status === 'OPEN';
      })
      .sort((a, b) => {
        const aTime = new Date(a.startTime).getTime();
        const bTime = new Date(b.startTime).getTime();
        if (Number.isNaN(aTime) && Number.isNaN(bTime)) return a.id - b.id;
        if (Number.isNaN(aTime)) return 1;
        if (Number.isNaN(bTime)) return -1;
        if (aTime === bTime) return a.id - b.id;
        return aTime - bTime;
      })
      .slice(0, 5);
  }, [profile.role, studentExamsQuery.data?.exams]);

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
  const activeAcademicSemesterLabel = useMemo(() => {
    const semesterFromActiveYear = toSemesterLabel(readSemesterValue(activeAcademicYearQuery.data));
    if (semesterFromActiveYear) return semesterFromActiveYear;

    const semesterFromTeacherAssignments = toSemesterLabel(
      readSemesterValue(teacherAssignmentsQuery.data?.activeYear),
    );
    if (semesterFromTeacherAssignments) return semesterFromTeacherAssignments;

    const semesterFromPrincipalOverview = toSemesterLabel(principalStatsQuery.data?.semester);
    if (semesterFromPrincipalOverview) return semesterFromPrincipalOverview;

    return defaultSemesterByDate() === 'EVEN' ? 'Genap' : 'Ganjil';
  }, [
    activeAcademicYearQuery.data,
    teacherAssignmentsQuery.data?.activeYear,
    principalStatsQuery.data?.semester,
  ]);
  const homeSubtitle = useMemo(() => {
    switch (profile.role) {
      case 'TEACHER':
        return 'Ringkasan penugasan mengajar dan akses cepat modul utama.';
      case 'ADMIN':
        return 'Pantau operasional akademik dan administrasi sekolah.';
      case 'PRINCIPAL':
        return 'Ringkasan akademik, keuangan, dan SDM pada periode aktif.';
      case 'STAFF':
        return 'Kelola layanan administrasi, pembayaran, dan data siswa.';
      case 'PARENT':
        return 'Pantau progres belajar, kehadiran, dan keuangan anak.';
      case 'STUDENT':
        return 'Pantau jadwal, materi, ujian, dan perkembangan belajar.';
      case 'EXAMINER':
        return 'Kelola skema UKK dan penilaian uji kompetensi.';
      case 'EXTRACURRICULAR_TUTOR':
        return 'Pantau ekstrakurikuler binaan dan anggota aktif.';
      case 'CALON_SISWA':
        return 'Akses informasi dan proses pendaftaran siswa baru.';
      default:
        return 'Pilih modul yang ingin Anda akses hari ini.';
    }
  }, [profile.role]);
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
        refetches.push(teacherDefenseQuery.refetch());
        refetches.push(teachingResourceProgramsQuery.refetch());
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
      if (profile.role === 'STUDENT') {
        refetches.push(activeAcademicYearQuery.refetch());
        refetches.push(studentScheduleQuery.refetch());
        refetches.push(studentExamsQuery.refetch());
      }
      if (profile.role === 'TEACHER') {
        refetches.push(examProgramsQuery.refetch());
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
                void applyAppUpdate().catch((error: unknown) => {
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
    setIsLogoutConfirmVisible(true);
  };

  const confirmLogout = () => {
    if (isLoggingOut) return;
    void (async () => {
      try {
        setIsLoggingOut(true);
        setIsLogoutConfirmVisible(false);
        await logout();
        router.replace('/welcome');
        notifySuccess('Logout berhasil');
        setIsLoggingOut(false);
      } catch (error: unknown) {
        setIsLoggingOut(false);
        notifyApiError(error, 'Gagal logout.');
      }
    })();
  };

  const handleNotificationPress = () => {
    router.push('/notifications');
  };

  const handleSearchBubblePress = () => {
    setIsInlineSearchVisible((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          menuSearchInputRef.current?.focus();
        }, 120);
      } else {
        menuSearchInputRef.current?.blur();
      }
      return next;
    });
  };

  const closeInlineSearch = () => {
    setIsInlineSearchVisible(false);
    menuSearchInputRef.current?.blur();
  };

  const footerBaseBottom = Platform.OS === 'ios' ? 22 : 14;
  const footerKeyboardOffset = keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom + 8) : 0;

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
              {activeAcademicYearLabel} ({activeAcademicSemesterLabel})
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
            fontSize: 20,
            fontWeight: '700',
          }}
        >
          Halo, {displayName}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, marginBottom: 12 }}>
          {homeSubtitle}
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
          <>
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Jadwal Pelajaran Hari Ini</Text>
              {studentScheduleQuery.isLoading ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat jadwal pelajaran hari ini...</Text>
              ) : null}
              {studentScheduleQuery.isError && !studentScheduleQuery.isLoading ? (
                <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                  Gagal memuat jadwal pelajaran. Tarik layar ke bawah untuk muat ulang.
                </Text>
              ) : null}
              {!studentScheduleQuery.isLoading && !studentScheduleQuery.isError ? (
                todayStudentScheduleGroups.length > 0 ? (
                  <View>
                    {todayStudentScheduleGroups.map((group) => (
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
                            minWidth: 84,
                            paddingHorizontal: 8,
                            height: 30,
                            borderRadius: 8,
                            backgroundColor: '#dbeafe',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 11 }}>
                            {group.periodStart === group.periodEnd
                              ? `Jam ke ${group.periodStart}`
                              : `Jam ke ${group.periodStart}-${group.periodEnd}`}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                            {group.subjectName}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {group.teacherName}
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
                      Tidak ada jadwal pelajaran untuk hari ini.
                    </Text>
                  </View>
                )
              ) : null}
            </View>

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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Jadwal Ujian Terdekat</Text>
              {studentExamsQuery.isLoading ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Memuat jadwal ujian terdekat...</Text>
              ) : null}
              {studentExamsQuery.isError && !studentExamsQuery.isLoading ? (
                <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                  Gagal memuat jadwal ujian. Tarik layar ke bawah untuk muat ulang.
                </Text>
              ) : null}
              {!studentExamsQuery.isLoading && !studentExamsQuery.isError ? (
                upcomingStudentExams.length > 0 ? (
                  <View>
                    {upcomingStudentExams.map((item) => {
                      const status = normalizeStudentExamStatus(item.status, Boolean(item.has_submitted));
                      const tone = getStudentExamStatusTone(status);
                      const examType = String(item.packet?.programCode || item.packet?.type || '-')
                        .trim()
                        .toUpperCase();
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            router.push('/exams');
                          }}
                          style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: '#d6e2f7',
                            backgroundColor: '#f8fbff',
                            paddingHorizontal: 10,
                            paddingVertical: 9,
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text
                              style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13, flex: 1, paddingRight: 8 }}
                              numberOfLines={1}
                            >
                              {item.packet?.title || '-'}
                            </Text>
                            <Text
                              style={{
                                color: tone.text,
                                backgroundColor: tone.bg,
                                borderColor: tone.border,
                                borderWidth: 1,
                                borderRadius: 999,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                fontSize: 10,
                                fontWeight: '700',
                              }}
                            >
                              {tone.label}
                            </Text>
                          </View>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {`${item.packet?.subject?.name || '-'} • ${examType}`}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 1 }}>
                            Mulai: {formatExamDateTime(item.startTime)}
                          </Text>
                          {item.isBlocked ? (
                            <Text style={{ color: '#991b1b', fontSize: 11, marginTop: 2 }}>
                              Diblokir: {item.blockReason || 'Akses ujian dibatasi wali kelas.'}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
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
                      Tidak ada jadwal ujian aktif saat ini.
                    </Text>
                  </View>
                )
              ) : null}
              {studentExamsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={studentExamsQuery.data.cachedAt} /> : null}
            </View>
          </>
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
        {menuSearch.trim() ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              backgroundColor: '#f8fbff',
              paddingVertical: 8,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{ color: BRAND_COLORS.textMuted, fontSize: 12, flex: 1 }}
              numberOfLines={1}
            >
              Filter pencarian: "{menuSearch}"
            </Text>
            <Pressable onPress={() => setMenuSearch('')}>
              <Text style={{ color: BRAND_COLORS.blue, fontSize: 12, fontWeight: '700', marginLeft: 10 }}>
                Hapus
              </Text>
            </Pressable>
          </View>
        ) : null}
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

      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: footerBaseBottom + footerKeyboardOffset,
        }}
      >
        {isInlineSearchVisible ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#d6e0f2',
              backgroundColor: BRAND_COLORS.white,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
            <TextInput
              ref={menuSearchInputRef}
              value={menuSearch}
              onChangeText={setMenuSearch}
              placeholder="Cari menu atau submenu"
              placeholderTextColor="#9aa6be"
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 8,
                color: BRAND_COLORS.textDark,
              }}
            />
            {menuSearch.trim() ? (
              <Pressable onPress={() => setMenuSearch('')} style={{ marginRight: 6 }}>
                <Feather name="x-circle" size={16} color={BRAND_COLORS.textMuted} />
              </Pressable>
            ) : null}
            <Pressable onPress={closeInlineSearch}>
              <Feather name="x" size={16} color={BRAND_COLORS.textMuted} />
            </Pressable>
          </View>
        ) : null}

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

          <Pressable onPress={handleNotificationPress} style={{ alignItems: 'center', width: 56 }}>
            <View style={{ position: 'relative' }}>
              <Feather name="bell" size={17} color={BRAND_COLORS.white} />
              {unreadNotificationCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -10,
                    minWidth: 17,
                    height: 17,
                    borderRadius: 999,
                    backgroundColor: '#ef4444',
                    borderWidth: 1,
                    borderColor: BRAND_COLORS.navy,
                    paddingHorizontal: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Notifikasi</Text>
          </Pressable>

          <Pressable onPress={handleLogout} disabled={isLoggingOut} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="log-out" size={17} color={BRAND_COLORS.white} />
            <Text style={{ color: BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>
              {isLoggingOut ? 'Proses' : 'Logout'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSearchBubblePress}
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
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: BRAND_COLORS.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="search" size={18} color={BRAND_COLORS.white} />
          </View>
        </Pressable>
      </View>

      <Modal
        visible={isLogoutConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (isLoggingOut) return;
          setIsLogoutConfirmVisible(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            justifyContent: 'center',
            paddingHorizontal: 22,
          }}
        >
          <View
            style={{
              backgroundColor: BRAND_COLORS.white,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: '#c7d7f7',
              paddingHorizontal: 16,
              paddingVertical: 16,
              shadowColor: '#0f172a',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.24,
              shadowRadius: 18,
              elevation: 14,
            }}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                backgroundColor: '#eff6ff',
                borderWidth: 1,
                borderColor: '#bfdbfe',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Feather name="log-out" size={18} color={BRAND_COLORS.blue} />
            </View>
            <Text style={{ color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700', marginBottom: 6 }}>
              Konfirmasi Logout
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 14, marginBottom: 14 }}>
              Anda akan keluar dari sesi saat ini. Lanjutkan logout?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={isLoggingOut}
                onPress={() => setIsLogoutConfirmVisible(false)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: BRAND_COLORS.white,
                  opacity: isLoggingOut ? 0.6 : 1,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable
                disabled={isLoggingOut}
                onPress={confirmLogout}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#dc2626',
                  borderRadius: 12,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: '#dc2626',
                  opacity: isLoggingOut ? 0.6 : 1,
                }}
              >
                <Text style={{ color: BRAND_COLORS.white, fontWeight: '700' }}>
                  {isLoggingOut ? 'Memproses...' : 'Logout'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
