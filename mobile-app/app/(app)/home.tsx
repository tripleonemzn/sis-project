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
import { adminApi, type AdminScheduleTimeConfigPayload } from '../../src/features/admin/adminApi';
import { principalApi } from '../../src/features/principal/principalApi';
import { staffApi } from '../../src/features/staff/staffApi';
import { staffAdministrationApi } from '../../src/features/staff/staffAdministrationApi';
import { staffFinanceApi } from '../../src/features/staff/staffFinanceApi';
import { permissionApi } from '../../src/features/permissions/permissionApi';
import { examApi, ExamProgramItem } from '../../src/features/exams/examApi';
import { useStudentExamsQuery } from '../../src/features/exams/useStudentExamsQuery';
import { resolveStudentExamRuntimeStatus, StudentExamRuntimeStatus } from '../../src/features/exams/status';
import {
  teachingResourceProgramApi,
  TeachingResourceProgramItem,
} from '../../src/features/learningResources/teachingResourceProgramApi';
import { studentInternshipApi } from '../../src/features/student/studentInternshipApi';
import { useParentFinanceOverviewQuery } from '../../src/features/parent/useParentFinanceOverviewQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { applyAppUpdate, checkAppUpdate } from '../../src/features/appUpdate/updateService';
import { BRAND_COLORS } from '../../src/config/brand';
import { ENV } from '../../src/config/env';
import { apiClient } from '../../src/lib/api/client';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../src/lib/ui/feedback';
import type { AuthUser } from '../../src/features/auth/types';
import { useUnreadNotificationsQuery } from '../../src/features/notifications/useUnreadNotificationsQuery';
import { useIsScreenActive } from '../../src/hooks/useIsScreenActive';
import {
  getStaffHomeSubtitle,
  getStaffPreferredMenuKeys,
  getStaffSectionTitle,
  resolveStaffDivision,
} from '../../src/features/staff/staffRole';
import { tutorApi } from '../../src/features/tutor/tutorApi';
import type { TutorAssignment } from '../../src/features/tutor/tutorApi';
import {
  canAccessTutorWorkspace,
  getExtracurricularTutorAssignments,
} from '../../src/features/tutor/tutorAccess';
import { osisApi } from '../../src/features/osis/osisApi';
import { useAppTheme } from '../../src/theme/AppThemeProvider';

type FeatherIconName = ComponentProps<typeof Feather>['name'];
type ManagedInventoryRoom = {
  id: number;
  name: string;
  managerUserId?: number | null;
};

type DashboardStatItem = {
  label: string;
  value: string;
  color: string;
  icon?: FeatherIconName;
  menuKey?: string;
  labelPosition?: 'top' | 'bottom';
};
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
type StaffHomeStats =
  | {
      kind: 'FINANCE';
      activeAcademicYearName: string | null;
      students: number;
      totalInvoices: number;
      totalOutstanding: number;
      totalPaid: number;
      followUpStudents: number;
      criticalCases: number;
      dueSoonCount: number;
    }
  | {
      kind: 'ADMINISTRATION';
      activeAcademicYearName: string | null;
      students: number;
      teachers: number;
      pendingPermissions: number;
      pendingStudentVerification: number;
      pendingTeacherVerification: number;
      studentCompletenessRate: number;
      teacherCompletenessRate: number;
    }
  | {
      kind: 'HEAD_TU';
      activeAcademicYearName: string | null;
      students: number;
      teachers: number;
      staffs: number;
      pendingPermissions: number;
      pendingBudgets: number;
      outstandingStudents: number;
      criticalCases: number;
    };

function formatCompactCurrency(value: number) {
  const rounded = Math.round(Number(value || 0));
  if (Math.abs(rounded) >= 1_000_000_000) {
    return `Rp ${(rounded / 1_000_000_000).toFixed(1).replace(/\.0$/, '')} M`;
  }
  if (Math.abs(rounded) >= 1_000_000) {
    return `Rp ${(rounded / 1_000_000).toFixed(1).replace(/\.0$/, '')} Jt`;
  }
  return `Rp ${rounded.toLocaleString('id-ID')}`;
}

const getTeachingHourValue = (entry: ScheduleEntry) =>
  typeof entry.teachingHour === 'number' ? entry.teachingHour : entry.period;

const isNonTeachingSchedulePeriod = (
  config: AdminScheduleTimeConfigPayload | null | undefined,
  day: DayOfWeek,
  period: number,
) => {
  const typeRaw = config?.periodTypes?.[day]?.[period];
  if (typeRaw) {
    const normalized = String(typeRaw).toUpperCase();
    if (normalized === 'TEACHING') return false;
    if (normalized === 'UPACARA' || normalized === 'ISTIRAHAT' || normalized === 'TADARUS' || normalized === 'OTHER') {
      return true;
    }
  }

  const noteRaw = config?.periodNotes?.[day]?.[period] ?? config?.periodNotes?.DEFAULT?.[period];
  if (!noteRaw) return false;
  const normalizedNote = String(noteRaw).toUpperCase();
  return normalizedNote.includes('UPACARA') || normalizedNote.includes('ISTIRAHAT') || normalizedNote.includes('TADARUS');
};

const getEffectiveTeachingHourValue = (
  entry: ScheduleEntry,
  config: AdminScheduleTimeConfigPayload | null | undefined,
) => {
  if (typeof entry.teachingHour === 'number') return entry.teachingHour;
  if (isNonTeachingSchedulePeriod(config, entry.dayOfWeek, entry.period)) return null;

  let teachingCounter = 0;
  for (let period = 1; period <= entry.period; period += 1) {
    if (!isNonTeachingSchedulePeriod(config, entry.dayOfWeek, period)) {
      teachingCounter += 1;
    }
  }

  return teachingCounter > 0 ? teachingCounter : null;
};

const getPeriodTimeValue = (
  config: AdminScheduleTimeConfigPayload | null | undefined,
  day: DayOfWeek,
  period: number,
) => config?.periodTimes?.[day]?.[period] ?? config?.periodTimes?.DEFAULT?.[period] ?? null;

const extractPeriodTimeBoundary = (rawValue?: string | null, side: 'start' | 'end' = 'start') => {
  if (!rawValue) return null;
  const parts = String(rawValue)
    .split('-')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.length) return rawValue.trim() || null;
  return side === 'start' ? parts[0] : parts[parts.length - 1];
};

const buildScheduleTimeRange = (
  config: AdminScheduleTimeConfigPayload | null | undefined,
  entries: ScheduleEntry[],
) => {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last) return null;

  const start = extractPeriodTimeBoundary(getPeriodTimeValue(config, first.dayOfWeek, first.period), 'start');
  const end = extractPeriodTimeBoundary(getPeriodTimeValue(config, last.dayOfWeek, last.period), 'end');

  if (start && end) return `${start} - ${end}`;
  return start || end || null;
};

type TeacherScheduleGroup = {
  key: string;
  periodStart: number;
  periodEnd: number;
  subjectName: string;
  subjectCode: string;
  className: string;
  roomLabel: string;
  timeRange: string | null;
  entries: ScheduleEntry[];
};

type StudentScheduleGroup = {
  key: string;
  periodStart: number;
  periodEnd: number;
  subjectName: string;
  subjectCode: string;
  teacherName: string;
  roomLabel: string;
  timeRange: string | null;
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

const DARK_ACCENT_COLOR_MAP: Record<string, string> = {
  [BRAND_COLORS.blue]: '#93c5fd',
  [BRAND_COLORS.teal]: '#5eead4',
  [BRAND_COLORS.gold]: '#fdba74',
  [BRAND_COLORS.pink]: '#f9a8d4',
  [BRAND_COLORS.sky]: '#7dd3fc',
  [BRAND_COLORS.navy]: '#cbd5e1',
  '#1d4ed8': '#93c5fd',
  '#0e7490': '#67e8f9',
  '#15803d': '#86efac',
  '#c2410c': '#fdba74',
  '#7e22ce': '#d8b4fe',
  '#b91c1c': '#fca5a5',
};

function resolveDashboardAccentColor(color: string, resolvedTheme: 'light' | 'dark') {
  if (resolvedTheme !== 'dark') return color;
  return DARK_ACCENT_COLOR_MAP[color] || '#cbd5e1';
}

function resolveDashboardBadgeIconColor(color: string, resolvedTheme: 'light' | 'dark') {
  if (resolvedTheme === 'dark') {
    return resolveDashboardAccentColor(color, resolvedTheme);
  }
  return BRAND_COLORS.white;
}

function resolveMenuTone(tone: MenuIconTone, resolvedTheme: 'light' | 'dark'): MenuIconTone {
  if (resolvedTheme !== 'dark') return tone;
  return {
    bg: 'rgba(30, 41, 59, 0.92)',
    border: 'rgba(148, 163, 184, 0.22)',
    fg: resolveDashboardAccentColor(tone.fg, resolvedTheme),
  };
}

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

function getStudentExamStatusTone(status: StudentExamRuntimeStatus) {
  if (status === 'OPEN') return { label: 'Berlangsung', bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (status === 'MAKEUP') return { label: 'Susulan', bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
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

function normalizeExamSubjectToken(value?: string | null) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericExamSubject(
  subject?: { name?: string | null; code?: string | null } | null,
): boolean {
  const normalizedName = normalizeExamSubjectToken(subject?.name);
  const normalizedCode = normalizeExamSubjectToken(subject?.code);
  if (!normalizedName && !normalizedCode) return true;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) return true;
  if (normalizedName === 'KONSENTRASI' || normalizedName === 'KEJURUAN') return true;
  if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
  return false;
}

function resolveExamSubjectName(item: {
  subject?: { name?: string | null; code?: string | null } | null;
  packet?: { title?: string | null; subject?: { name?: string | null; code?: string | null } | null } | null;
}) {
  const scheduleSubject = item.subject || null;
  const packetSubject = item.packet?.subject || null;
  const usePacket = Boolean(
    scheduleSubject &&
      packetSubject &&
      isGenericExamSubject(scheduleSubject) &&
      !isGenericExamSubject(packetSubject),
  );
  const picked = usePacket ? packetSubject : scheduleSubject || packetSubject;
  let fallbackName = '';
  const title = String(item.packet?.title || '').trim();
  if (title.includes('•')) {
    const parts = title
      .split('•')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (candidate && !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
        fallbackName = candidate;
      }
    }
  }
  const useFallbackName = Boolean(fallbackName) && isGenericExamSubject(picked);
  return String((useFallbackName ? fallbackName : picked?.name) || fallbackName || '-');
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
  if (menu.key.includes('vacanc')) return 'briefcase';
  if (menu.key.includes('application')) return 'clipboard';
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
  const onlyEmailMenus = group.items.every((item) => item.key.toLowerCase().includes('email') || item.key.toLowerCase().includes('mail'));
  if (onlyEmailMenus) return 'mail';
  if (key.includes('dashboard')) return 'home';
  if (key.includes('academic')) return 'book-open';
  if (key.includes('exams') || key.includes('cbt')) return 'file-text';
  if (key.includes('ppdb') || key.includes('bkk')) return 'briefcase';
  if (key.includes('finance') || key.includes('administration') || key.includes('payments')) return 'credit-card';
  if (key.includes('settings')) return 'settings';
  if (key.includes('users') || key.includes('students') || key.includes('teachers') || key.includes('children')) return 'users';
  if (key.includes('master-data')) return 'database';
  if (key.includes('training')) return 'layers';
  if (key.includes('homeroom')) return 'user-check';
  if (key.includes('internship') || key.includes('kakom')) return 'briefcase';
  if (key.includes('work-program')) return 'briefcase';
  if (key.includes('career') || key.includes('public')) return 'briefcase';
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
  ADMIN: ['admin-user-student', 'admin-candidate-admissions', 'admin-bkk-applications'],
  PRINCIPAL: ['principal-attendance', 'principal-finance-requests', 'principal-reports'],
  PARENT: ['child-progress', 'parent-finance', 'child-attendance'],
  EXAMINER: ['assessment', 'examiner-schemes'],
  EXTRACURRICULAR_TUTOR: ['tutor-members'],
  CALON_SISWA: ['candidate-dashboard', 'candidate-application', 'candidate-exams'],
  UMUM: ['public-vacancies', 'public-applications', 'public-exams'],
};

function getRolePrimaryActionKeys(
  user: AuthUser,
  options?: {
    hasExtracurricularAdvisorAssignments?: boolean;
    hasActiveOsisElection?: boolean;
  },
) {
  if (user.role === 'STAFF') {
    return getStaffPreferredMenuKeys(user);
  }
  if (user.role === 'TEACHER' && options?.hasExtracurricularAdvisorAssignments) {
    return ['teacher-extracurricular-members', 'teaching-schedule', 'teacher-extracurricular-work-program'];
  }
  if (user.role === 'EXTRACURRICULAR_TUTOR') {
    if (options?.hasExtracurricularAdvisorAssignments) {
      return ['tutor-members', 'tutor-work-program', 'tutor-inventory'];
    }
  }
  return ROLE_PRIMARY_ACTION_KEYS[user.role] || [];
}

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
  CP: { key: 'teacher-cp', route: '/teacher/learning-cp' },
  ATP: {
    key: 'teacher-atp',
    route: '/teacher/learning-atp',
  },
  PROTA: {
    key: 'teacher-prota',
    route: '/teacher/learning-prota',
  },
  PROMES: {
    key: 'teacher-promes',
    route: '/teacher/learning-promes',
  },
  MODUL_AJAR: {
    key: 'teacher-modules',
    route: '/teacher/learning-modules',
  },
  MODULES: {
    key: 'teacher-modules',
    route: '/teacher/learning-modules',
  },
  KKTP: {
    key: 'teacher-kktp',
    route: '/teacher/learning-kktp',
  },
  MATRIKS_SEBARAN: {
    key: 'teacher-matriks-sebaran',
    route: '/teacher/learning-matriks-sebaran',
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

function buildStudentExamRoute(raw?: string | null): string {
  const code = normalizeProgramCode(raw);
  return code ? `/exams?programCode=${encodeURIComponent(code)}` : '/exams';
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
  const { colors, mode } = useAppTheme();
  const isDarkModeActive = mode === 'dark';
  const isScreenActive = useIsScreenActive();
  const unreadNotificationsQuery = useUnreadNotificationsQuery(isAuthenticated, isScreenActive);
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
  const staffDivision = useMemo(
    () => (profile.role === 'STAFF' ? resolveStaffDivision(profile) : 'GENERAL'),
    [profile],
  );
  const footerBaseOffset = Platform.OS === 'ios' ? 18 : 12;
  const footerSystemInset = Platform.OS === 'android' ? Math.max(insets.bottom, 10) : insets.bottom;
  const footerBottomOffset = footerBaseOffset + footerSystemInset;
  const footerReservedSpace = footerBottomOffset + 100;
  const homeContentPadding = getStandardPagePadding(insets, { horizontal: 18, bottom: footerReservedSpace });
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user: profile });
  const activeAcademicYearQuery = useQuery({
    queryKey: ['mobile-home-active-academic-year', profile.id],
    enabled: isAuthenticated,
    staleTime: 1000 * 60,
    queryFn: async () => {
      try {
        return await academicYearApi.getActive({ force: true, allowStaleOnError: true });
      } catch {
        return null;
      }
    },
  });
  const assignedInventoryRoomsQuery = useQuery({
    queryKey: [
      'mobile-home-assigned-inventory-rooms',
      profile.id,
      profile.role,
      Array.isArray(profile.additionalDuties) ? profile.additionalDuties.join('|') : 'no-duties',
      Array.isArray(profile.ekskulTutorAssignments)
        ? profile.ekskulTutorAssignments
            .map((assignment) => `${assignment.id}:${assignment.isActive ? '1' : '0'}`)
            .join('|')
        : 'no-tutor-assignments',
    ],
    enabled: isAuthenticated && ['TEACHER', 'STAFF', 'PRINCIPAL'].includes(profile.role),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await apiClient.get<{ data?: ManagedInventoryRoom[] }>('/inventory/assigned-rooms');
      return Array.isArray(response.data?.data) ? response.data.data : [];
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
  const teacherScheduleTimeConfigQuery = useQuery({
    queryKey: ['mobile-home-teacher-schedule-time-config', teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: profile.role === 'TEACHER' && !!teacherAssignmentsQuery.data?.activeYear?.id,
    staleTime: 1000 * 60 * 5,
    queryFn: () => adminApi.getScheduleTimeConfig(teacherAssignmentsQuery.data!.activeYear.id),
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
  const studentScheduleTimeConfigQuery = useQuery({
    queryKey: ['mobile-home-student-schedule-time-config', activeAcademicYearQuery.data?.id],
    enabled: profile.role === 'STUDENT' && Boolean(activeAcademicYearQuery.data?.id),
    staleTime: 1000 * 60 * 5,
    queryFn: () => adminApi.getScheduleTimeConfig(activeAcademicYearQuery.data!.id),
  });
  const studentExamsQuery = useStudentExamsQuery({
    enabled: isAuthenticated && profile.role === 'STUDENT',
    user: profile,
  });
  const studentInternshipOverviewQuery = useQuery({
    queryKey: ['mobile-home-student-internship-overview', profile.id],
    enabled: isAuthenticated && profile.role === 'STUDENT',
    staleTime: 5 * 60 * 1000,
    queryFn: () => studentInternshipApi.getMyInternship(),
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

  const tutorAssignmentsQuery = useQuery({
    queryKey: ['mobile-home-tutor-assignments', profile.id, activeAcademicYearQuery.data?.id],
    enabled:
      isAuthenticated &&
      canAccessTutorWorkspace(profile) &&
      Boolean(activeAcademicYearQuery.data?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () => tutorApi.listAssignments(activeAcademicYearQuery.data?.id),
  });

  const mergedTutorAssignments = useMemo<TutorAssignment[]>(
    () => {
      const merged = new Map<number, TutorAssignment>();
      const fromProfile = Array.isArray(profile.ekskulTutorAssignments)
        ? (profile.ekskulTutorAssignments as TutorAssignment[])
        : [];
      const fromQuery = Array.isArray(tutorAssignmentsQuery.data) ? tutorAssignmentsQuery.data : [];

      fromProfile.forEach((assignment) => {
        if (!assignment || typeof assignment.id !== 'number') return;
        merged.set(assignment.id, assignment);
      });
      fromQuery.forEach((assignment) => {
        if (!assignment || typeof assignment.id !== 'number') return;
        merged.set(assignment.id, assignment);
      });

      return Array.from(merged.values());
    },
    [profile.ekskulTutorAssignments, tutorAssignmentsQuery.data],
  );

  const activeOsisElectionQuery = useQuery({
    queryKey: ['mobile-home-active-osis-election', profile.id, profile.role],
    enabled:
      isAuthenticated &&
      ['TEACHER', 'STUDENT', 'STAFF'].includes(profile.role),
    staleTime: 5 * 60 * 1000,
    queryFn: () => osisApi.getActiveElection(),
  });

  const hasPendingDefense = profile.role === 'TEACHER' && (teacherDefenseQuery.data?.length || 0) > 0;

  useEffect(() => {
    if (!isScreenActive || profile.role !== 'STUDENT') return;
    void studentExamsQuery.refetch();
  }, [isScreenActive, profile.role, studentExamsQuery.refetch]);

  const extracurricularTutorAssignments = useMemo(
    () => getExtracurricularTutorAssignments(mergedTutorAssignments),
    [mergedTutorAssignments],
  );
  const hasExtracurricularAdvisorAssignments = extracurricularTutorAssignments.length > 0;
  const hasActiveOsisElection = Boolean(activeOsisElectionQuery.data?.id);
  const pklEligibleGrades = useMemo(() => {
    const raw = String(activeAcademicYearQuery.data?.pklEligibleGrades || '').trim();
    if (!raw) return undefined;
    const grades = raw
      .split(',')
      .map((grade) => String(grade || '').trim().toUpperCase())
      .filter((grade) => grade === 'X' || grade === 'XI' || grade === 'XII');
    return grades.length > 0 ? grades : undefined;
  }, [activeAcademicYearQuery.data?.pklEligibleGrades]);

  const menuGroups = useMemo(
    () => {
      const baseGroups = getGroupedRoleMenu(profile, {
        hasPendingDefense,
        pklEligibleGrades,
        pklVisibilityOverride:
          profile.role === 'STUDENT'
            ? Boolean(studentInternshipOverviewQuery.data?.isEligible)
            : undefined,
        hasExtracurricularAdvisorAssignments,
        hasExtracurricularTutorAssignments: extracurricularTutorAssignments.length > 0,
        hasActiveOsisElection,
        tutorAssignments: mergedTutorAssignments,
        managedInventoryRooms: assignedInventoryRoomsQuery.data || [],
      })
        .map((group) => ({
          // Keep non-dashboard entries (e.g. Email) even when they are grouped under Dashboard.
          ...(() => {
            const items = group.items.filter((item) => {
              const key = item.key.toLowerCase();
              const label = item.label.toLowerCase();
              return key !== 'dashboard' && !key.endsWith('-dashboard') && label !== 'dashboard';
            });
            const useSingleItemLabel = group.label.toLowerCase() === 'dashboard' && items.length === 1;
            return {
              ...group,
              label: useSingleItemLabel ? items[0].label : group.label,
              items,
            };
          })(),
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
      pklEligibleGrades,
      hasExtracurricularAdvisorAssignments,
      extracurricularTutorAssignments.length,
      hasActiveOsisElection,
      mergedTutorAssignments,
      assignedInventoryRoomsQuery.data,
      studentInternshipOverviewQuery.data?.isEligible,
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
      const [usersResult, studentsResult, teachersResult, applicantUsersResult, bkkApplicationsResult] = await Promise.all([
        adminApi.listUsers(),
        adminApi.listUsers({ role: 'STUDENT' }),
        adminApi.listUsers({ role: 'TEACHER' }),
        adminApi.listUsers({ role: 'UMUM' }),
        adminApi.listBkkApplications({ page: 1, limit: 1 }),
      ]);

      const acceptedApplications =
        Number(bkkApplicationsResult.summary.hired || 0) +
        Math.max(
          Number(bkkApplicationsResult.summary.accepted || 0) - Number(bkkApplicationsResult.summary.hired || 0),
          0,
        );

      return {
        activeYearName: activeYear?.name || null,
        totalUsers: usersResult.length,
        students: studentsResult.length,
        teachers: teachersResult.length,
        totalApplicants: applicantUsersResult.length,
        verifiedApplicants: applicantUsersResult.filter((item) => item.verificationStatus === 'VERIFIED').length,
        pendingApplicants: applicantUsersResult.filter((item) => item.verificationStatus === 'PENDING').length,
        totalApplications: Number(bkkApplicationsResult.total || 0),
        shortlistedApplications: Number(bkkApplicationsResult.summary.shortlisted || 0),
        acceptedApplications,
      };
    },
  });

  const principalStatsQuery = useQuery({
    queryKey: ['mobile-home-principal-stats', profile.id],
    enabled: profile.role === 'PRINCIPAL',
    queryFn: async () => {
      const summary = await principalApi.getDashboardSummary();
      const totalClasses = (summary.studentByMajor || []).reduce(
        (sum, item) => sum + Number(item.totalClasses || 0),
        0,
      );
      const attendanceTotal =
        Number(summary.totals.totalPresentToday || 0) + Number(summary.totals.totalAbsentToday || 0);
      return {
        activeAcademicYearName: summary.activeAcademicYear?.name || null,
        totalStudents: Number(summary.totals.students || 0),
        totalTeachers: Number(summary.totals.teachers || 0),
        pendingBudgetRequests: Number(summary.totals.pendingBudgetRequests || 0),
        totalPendingBudgetAmount: Number(summary.totals.totalPendingBudgetAmount || 0),
        totalMajors: (summary.studentByMajor || []).length,
        totalClasses,
        attendancePercentage:
          attendanceTotal > 0
            ? Math.round((Number(summary.totals.totalPresentToday || 0) / attendanceTotal) * 100)
            : 0,
        presentToday: Number(summary.totals.totalPresentToday || 0),
        absentToday: Number(summary.totals.totalAbsentToday || 0),
      };
    },
  });

  const staffStatsQuery = useQuery({
    queryKey: ['mobile-home-staff-stats', profile.id, staffDivision, activeAcademicYearQuery.data?.id || 'none'],
    enabled: profile.role === 'STAFF',
    queryFn: async (): Promise<StaffHomeStats> => {
      const activeAcademicYearId = activeAcademicYearQuery.data?.id;
      const activeAcademicYearName = activeAcademicYearQuery.data?.name || null;

      if (staffDivision === 'ADMINISTRATION') {
        const summary = await staffAdministrationApi.getSummary(
          activeAcademicYearId ? { academicYearId: activeAcademicYearId } : undefined,
        );

        return {
          kind: 'ADMINISTRATION',
          activeAcademicYearName,
          students: Number(summary.overview.totalStudents || 0),
          teachers: Number(summary.overview.totalTeachers || 0),
          pendingPermissions: Number(summary.overview.pendingPermissions || 0),
          pendingStudentVerification: Number(summary.overview.pendingStudentVerification || 0),
          pendingTeacherVerification: Number(summary.overview.pendingTeacherVerification || 0),
          studentCompletenessRate: Math.round(Number(summary.overview.studentCompletenessRate || 0)),
          teacherCompletenessRate: Math.round(Number(summary.overview.teacherCompletenessRate || 0)),
        };
      }

      if (staffDivision === 'HEAD_TU') {
        const [students, teachers, staffs, permissions, budgets, financeSnapshot] = await Promise.all([
          staffApi.listStudents(),
          staffApi.listTeachers(),
          staffApi.listStaffs(),
          permissionApi.list({ limit: 200 }),
          staffApi.listBudgetRequests(activeAcademicYearId ? { academicYearId: activeAcademicYearId } : undefined),
          activeAcademicYearId
            ? staffFinanceApi.listReports({
                academicYearId: activeAcademicYearId,
              })
            : Promise.resolve(null),
        ]);

        return {
          kind: 'HEAD_TU',
          activeAcademicYearName,
          students: students.length,
          teachers: teachers.length,
          staffs: staffs.length,
          pendingPermissions: permissions.filter((item) => item.status === 'PENDING').length,
          pendingBudgets: budgets.filter((item) => item.status === 'PENDING').length,
          outstandingStudents: Number(financeSnapshot?.collectionOverview.studentsWithOutstanding || 0),
          criticalCases: Number(financeSnapshot?.collectionOverview.criticalCount || 0),
        };
      }

      const [students, financeSnapshot] = await Promise.all([
        staffApi.listStudents(),
        activeAcademicYearId
          ? staffFinanceApi.listReports({
              academicYearId: activeAcademicYearId,
            })
          : Promise.resolve(null),
      ]);

      return {
        kind: 'FINANCE',
        activeAcademicYearName,
        students: students.length,
        totalInvoices: Number(financeSnapshot?.summary.totalInvoices || 0),
        totalOutstanding: Number(financeSnapshot?.summary.totalOutstanding || 0),
        totalPaid: Number(financeSnapshot?.summary.totalPaid || 0),
        followUpStudents: Number(financeSnapshot?.collectionOverview.studentsWithOutstanding || 0),
        criticalCases: Number(financeSnapshot?.collectionOverview.criticalCount || 0),
        dueSoonCount: Number(financeSnapshot?.collectionOverview.dueSoonCount || 0),
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
  const menuItemByKey = useMemo(() => {
    return new Map(allMenuItems.map((item) => [item.key, item] as const));
  }, [allMenuItems]);

  const roleQuickMenus = useMemo(() => {
    const preferredKeys = getRolePrimaryActionKeys(profile, {
      hasExtracurricularAdvisorAssignments,
      hasActiveOsisElection,
    });
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
  }, [allMenuItems, hasActiveOsisElection, hasExtracurricularAdvisorAssignments, profile]);

  const teacherScheduleConfig = teacherScheduleTimeConfigQuery.data?.config ?? null;
  const teacherTeachingEntries = useMemo(
    () =>
      (teacherScheduleQuery.data || []).flatMap((entry) => {
        const teachingHour = getEffectiveTeachingHourValue(entry, teacherScheduleConfig);
        return typeof teachingHour === 'number' ? [{ entry, teachingHour }] : [];
      }),
    [teacherScheduleConfig, teacherScheduleQuery.data],
  );
  const teacherStats = useMemo(() => {
    const uniqueClasses = new Set(teacherTeachingEntries.map(({ entry }) => entry.teacherAssignment.class.id)).size;
    const uniqueSubjects = new Set(teacherTeachingEntries.map(({ entry }) => entry.teacherAssignment.subject.id)).size;

    return {
      uniqueClasses,
      uniqueSubjects,
      totalHours: teacherTeachingEntries.length,
    };
  }, [teacherTeachingEntries]);

  const teacherIconStats: DashboardIconStatItem[] = useMemo(
    () => [
      {
        label: 'Mata Pelajaran',
        value: String(teacherStats.uniqueSubjects),
        color: BRAND_COLORS.navy,
        icon: 'book-open',
        menuKey: 'teacher-classes',
      },
      {
        label: 'Kelas Ajar',
        value: String(teacherStats.uniqueClasses),
        color: BRAND_COLORS.teal,
        icon: 'users',
        menuKey: 'teacher-classes',
      },
      {
        label: 'Total Jam',
        value: String(teacherStats.totalHours),
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
      {
        label: 'Tahun Ajaran Aktif',
        value: stats.activeYearName || '-',
        color: BRAND_COLORS.teal,
        icon: 'calendar',
        menuKey: 'admin-academic-years',
      },
      {
        label: 'Total Pengguna',
        value: String(stats.totalUsers),
        color: BRAND_COLORS.blue,
        icon: 'users',
        menuKey: 'admin-user-verify',
      },
      {
        label: 'Siswa Aktif',
        value: String(stats.students),
        color: BRAND_COLORS.gold,
        icon: 'users',
        menuKey: 'admin-user-student',
      },
      {
        label: 'Guru & Staff',
        value: String(stats.teachers),
        color: BRAND_COLORS.pink,
        icon: 'user-check',
        menuKey: 'admin-user-teacher',
      },
      {
        label: 'Pelamar BKK',
        value: String(stats.totalApplicants),
        color: BRAND_COLORS.teal,
        icon: 'briefcase',
        menuKey: 'admin-bkk-users',
      },
      {
        label: 'Lamaran BKK',
        value: String(stats.totalApplications),
        color: BRAND_COLORS.sky,
        icon: 'clipboard',
        menuKey: 'admin-bkk-applications',
      },
    ];
  }, [adminStatsQuery.data]);

  const principalStatCards: DashboardStatItem[] = useMemo(() => {
    const stats = principalStatsQuery.data;
    if (!stats) return [];
    return [
      {
        label: 'Tahun Ajaran Aktif',
        value: stats.activeAcademicYearName || '-',
        color: BRAND_COLORS.teal,
        icon: 'calendar',
        menuKey: 'principal-dashboard',
      },
      {
        label: 'Siswa Aktif',
        value: String(stats.totalStudents),
        color: BRAND_COLORS.gold,
        icon: 'users',
        menuKey: 'principal-students',
      },
      {
        label: 'Guru & Staff',
        value: String(stats.totalTeachers),
        color: BRAND_COLORS.pink,
        icon: 'user-check',
        menuKey: 'principal-teachers',
      },
      {
        label: 'Pengajuan Pending',
        value: String(stats.pendingBudgetRequests),
        color: BRAND_COLORS.blue,
        icon: 'file-text',
        menuKey: 'principal-finance-requests',
      },
      {
        label: 'Kompetensi Keahlian',
        value: String(stats.totalMajors),
        color: BRAND_COLORS.teal,
        icon: 'grid',
        menuKey: 'principal-students',
      },
      {
        label: 'Kelas Aktif',
        value: String(stats.totalClasses),
        color: BRAND_COLORS.sky,
        icon: 'layers',
        menuKey: 'principal-students',
      },
      {
        label: 'Kehadiran Hari Ini',
        value: `${stats.attendancePercentage}%`,
        color: BRAND_COLORS.navy,
        icon: 'check-circle',
        menuKey: 'principal-attendance',
      },
    ];
  }, [principalStatsQuery.data]);

  const staffStatCards: DashboardStatItem[] = useMemo(() => {
    const stats = staffStatsQuery.data;
    if (!stats) return [];
    if (stats.kind === 'ADMINISTRATION') {
      return [
        { label: 'Data Siswa', value: String(stats.students), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'staff-students' },
        {
          label: 'Data Guru',
          value: String(stats.teachers),
          color: BRAND_COLORS.navy,
          icon: 'user-check',
          menuKey: 'staff-admin',
        },
        {
          label: 'Izin Pending',
          value: String(stats.pendingPermissions),
          color: BRAND_COLORS.gold,
          icon: 'clock',
          menuKey: 'staff-admin',
        },
        {
          label: 'Verifikasi Siswa',
          value: String(stats.pendingStudentVerification),
          color: BRAND_COLORS.teal,
          icon: 'shield',
          menuKey: 'staff-admin',
        },
        {
          label: 'Verifikasi Guru',
          value: String(stats.pendingTeacherVerification),
          color: BRAND_COLORS.pink,
          icon: 'user-check',
          menuKey: 'staff-admin',
        },
        {
          label: 'Kelengkapan',
          value: `${stats.studentCompletenessRate}%`,
          color: BRAND_COLORS.sky,
          icon: 'clipboard',
          menuKey: 'staff-admin',
        },
      ];
    }

    if (stats.kind === 'HEAD_TU') {
      return [
        {
          label: 'Data Siswa',
          value: String(stats.students),
          color: BRAND_COLORS.blue,
          icon: 'users',
          menuKey: 'staff-students',
        },
        {
          label: 'Guru',
          value: String(stats.teachers),
          color: BRAND_COLORS.navy,
          icon: 'user-check',
          menuKey: 'staff-admin',
        },
        {
          label: 'Staff TU',
          value: String(stats.staffs),
          color: BRAND_COLORS.sky,
          icon: 'briefcase',
          menuKey: 'staff-admin',
        },
        {
          label: 'Izin Pending',
          value: String(stats.pendingPermissions),
          color: BRAND_COLORS.gold,
          icon: 'clock',
          menuKey: 'staff-admin',
        },
        {
          label: 'Pengajuan',
          value: String(stats.pendingBudgets),
          color: BRAND_COLORS.teal,
          icon: 'file-text',
          menuKey: 'staff-admin',
        },
        {
          label: 'Kasus Kritis',
          value: String(stats.criticalCases),
          color: BRAND_COLORS.pink,
          icon: 'alert-triangle',
          menuKey: 'staff-admin',
        },
        {
          label: 'Siswa Follow Up',
          value: String(stats.outstandingStudents),
          color: BRAND_COLORS.sky,
          icon: 'clipboard',
          menuKey: 'staff-admin',
        },
      ];
    }

    return [
      { label: 'Data Siswa', value: String(stats.students), color: BRAND_COLORS.blue, icon: 'users', menuKey: 'staff-students' },
      { label: 'Total Tagihan', value: String(stats.totalInvoices), color: BRAND_COLORS.navy, icon: 'file-text', menuKey: 'staff-payments' },
      { label: 'Outstanding', value: formatCompactCurrency(stats.totalOutstanding), color: BRAND_COLORS.gold, icon: 'alert-circle', menuKey: 'staff-payments' },
      { label: 'Terbayar', value: formatCompactCurrency(stats.totalPaid), color: BRAND_COLORS.teal, icon: 'check-circle', menuKey: 'staff-payments' },
      { label: 'Follow Up', value: String(stats.followUpStudents), color: BRAND_COLORS.pink, icon: 'users', menuKey: 'staff-payments' },
      {
        label: 'Jatuh Tempo',
        value: String(stats.dueSoonCount),
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
      { label: 'Role', value: profile.role, color: BRAND_COLORS.blue, icon: 'shield', labelPosition: 'top' },
      {
        label: 'Kelas',
        value: profile.studentClass?.name || '-',
        color: BRAND_COLORS.navy,
        icon: 'layers',
        menuKey: 'student-schedule',
        labelPosition: 'top',
      },
      {
        label: 'Jurusan',
        value: profile.studentClass?.major?.code || profile.studentClass?.major?.name || '-',
        color: BRAND_COLORS.teal,
        icon: 'grid',
        menuKey: 'student-learning',
        labelPosition: 'top',
      },
      {
        label: 'Status',
        value: profile.studentStatus || '-',
        color: BRAND_COLORS.gold,
        icon: 'activity',
        menuKey: 'student-grade-history',
        labelPosition: 'top',
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
    const studentScheduleConfig = studentScheduleTimeConfigQuery.data?.config ?? null;
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
        subjectCode: first.teacherAssignment.subject.code,
        teacherName: first.teacherAssignment.teacher.name,
        roomLabel: first.room || '-',
        timeRange: buildScheduleTimeRange(studentScheduleConfig, currentGroupEntries),
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
      subjectCode: first.teacherAssignment.subject.code,
      teacherName: first.teacherAssignment.teacher.name,
      roomLabel: first.room || '-',
      timeRange: buildScheduleTimeRange(studentScheduleConfig, currentGroupEntries),
      entries: currentGroupEntries,
    });

    return groups;
  }, [studentScheduleTimeConfigQuery.data?.config, todayStudentSchedules]);
  const upcomingStudentExams = useMemo(() => {
    if (profile.role !== 'STUDENT') return [];
    const exams = studentExamsQuery.data?.exams || [];

    return [...exams]
      .filter((item) => {
        const status = resolveStudentExamRuntimeStatus(item);
        return status === 'UPCOMING' || status === 'OPEN' || status === 'MAKEUP';
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
      principalStatsQuery.data?.activeAcademicYearName ||
      '-'
    );
  }, [
    activeAcademicYearQuery.data?.name,
    teacherAssignmentsQuery.data?.activeYear?.name,
    adminStatsQuery.data?.activeYearName,
    principalStatsQuery.data?.activeAcademicYearName,
  ]);
  const activeAcademicSemesterLabel = useMemo(() => {
    const semesterFromActiveYear = toSemesterLabel(readSemesterValue(activeAcademicYearQuery.data));
    if (semesterFromActiveYear) return semesterFromActiveYear;

    const semesterFromTeacherAssignments = toSemesterLabel(
      readSemesterValue(teacherAssignmentsQuery.data?.activeYear),
    );
    if (semesterFromTeacherAssignments) return semesterFromTeacherAssignments;

    return defaultSemesterByDate() === 'EVEN' ? 'Genap' : 'Ganjil';
  }, [
    activeAcademicYearQuery.data,
    teacherAssignmentsQuery.data?.activeYear,
  ]);
  const homeSubtitle = useMemo(() => {
    switch (profile.role) {
      case 'TEACHER':
        return hasExtracurricularAdvisorAssignments
          ? 'Ringkasan penugasan mengajar, pembina ekskul, dan akses cepat modul utama.'
          : 'Ringkasan penugasan mengajar dan akses cepat modul utama.';
      case 'ADMIN':
        return 'Pantau operasional akademik dan administrasi sekolah.';
      case 'PRINCIPAL':
        return 'Ringkasan akademik, keuangan, dan SDM pada periode aktif.';
      case 'STAFF':
        return getStaffHomeSubtitle(profile);
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
  }, [hasExtracurricularAdvisorAssignments, profile]);
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

    return [...teacherTeachingEntries]
      .filter(({ entry }) => entry.dayOfWeek === currentDay)
      .sort((a, b) => a.teachingHour - b.teachingHour);
  }, [profile.role, teacherTeachingEntries]);
  const todayTeacherScheduleGroups = useMemo(() => {
    if (!todayTeacherSchedules.length) return [] as TeacherScheduleGroup[];

    const groups: TeacherScheduleGroup[] = [];
    let currentGroupEntries: ScheduleEntry[] = [todayTeacherSchedules[0].entry];
    let currentStart = todayTeacherSchedules[0].teachingHour;
    let currentEnd = todayTeacherSchedules[0].teachingHour;

    for (let index = 1; index < todayTeacherSchedules.length; index += 1) {
      const entry = todayTeacherSchedules[index];
      const prev = currentGroupEntries[currentGroupEntries.length - 1];
      const entryTeachingHour = entry.teachingHour;

      const isSameSubject = entry.entry.teacherAssignment.subject.id === prev.teacherAssignment.subject.id;
      const isSameClass = entry.entry.teacherAssignment.class.id === prev.teacherAssignment.class.id;
      const isSameRoom = (entry.entry.room || '') === (prev.room || '');
      const isConsecutivePeriod = entryTeachingHour === currentEnd + 1;

      if (isSameSubject && isSameClass && isSameRoom && isConsecutivePeriod) {
        currentGroupEntries.push(entry.entry);
        currentEnd = entryTeachingHour;
        continue;
      }

      const first = currentGroupEntries[0];
      groups.push({
        key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.class.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
        periodStart: currentStart,
        periodEnd: currentEnd,
        subjectName: first.teacherAssignment.subject.name,
        subjectCode: first.teacherAssignment.subject.code,
        className: first.teacherAssignment.class.name,
        roomLabel: first.room || '-',
        timeRange: buildScheduleTimeRange(teacherScheduleConfig, currentGroupEntries),
        entries: currentGroupEntries,
      });

      currentGroupEntries = [entry.entry];
      currentStart = entryTeachingHour;
      currentEnd = entryTeachingHour;
    }

    const first = currentGroupEntries[0];
    groups.push({
      key: `${first.teacherAssignment.subject.id}-${first.teacherAssignment.class.id}-${first.room || '-'}-${currentStart}-${currentEnd}`,
      periodStart: currentStart,
      periodEnd: currentEnd,
      subjectName: first.teacherAssignment.subject.name,
      subjectCode: first.teacherAssignment.subject.code,
      className: first.teacherAssignment.class.name,
      roomLabel: first.room || '-',
      timeRange: buildScheduleTimeRange(teacherScheduleConfig, currentGroupEntries),
      entries: currentGroupEntries,
    });

    return groups;
  }, [teacherScheduleConfig, todayTeacherSchedules]);
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

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    const startedAt = Date.now();
    try {
      const refetches: Array<Promise<unknown>> = [profileQuery.refetch()];
      if (['TEACHER', 'STAFF', 'PRINCIPAL'].includes(profile.role)) {
        refetches.push(assignedInventoryRoomsQuery.refetch());
      }
      if (profile.role === 'TEACHER') {
        refetches.push(teacherAssignmentsQuery.refetch());
        refetches.push(teacherScheduleQuery.refetch());
        refetches.push(teacherScheduleTimeConfigQuery.refetch());
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
        refetches.push(studentScheduleTimeConfigQuery.refetch());
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
          'SIS KGB2 : Update Tersedia',
          `Versi terbaru SIS KGB2 tersedia di channel ${updateResult.channel}. Silakan perbarui untuk menikmati fitur terbaru.`,
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
          const tone = resolveMenuTone(getMenuIconTone(item.label), isDarkModeActive ? 'dark' : 'light');
          const labelPosition = item.labelPosition || 'bottom';
          const valueColor = resolveDashboardAccentColor(item.color, isDarkModeActive ? 'dark' : 'light');

          return (
            <View key={item.label} style={{ width: itemWidth, paddingHorizontal: 4, marginBottom: 10 }}>
              <Pressable
                disabled={!linkedMenu || isMenuTransitioning}
                onPress={() => {
                  if (!linkedMenu) return;
                  void handleMenuPress(linkedMenu);
                }}
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
                {labelPosition === 'top' ? (
                  <>
                    <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 6 }} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <Text style={{ color: valueColor, fontWeight: '700', fontSize: item.value.length > 12 ? 12 : 15, marginTop: 2 }}>
                      {item.value}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: valueColor, fontWeight: '700', fontSize: item.value.length > 12 ? 12 : 15, marginTop: 6 }}>
                      {item.value}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center' }} numberOfLines={2}>
                      {isOpeningThisMenu ? 'Membuka...' : item.label}
                    </Text>
                  </>
                )}
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
        const iconColor = resolveDashboardBadgeIconColor(item.color, isDarkModeActive ? 'dark' : 'light');
        const metricColor = resolveDashboardAccentColor(item.color, isDarkModeActive ? 'dark' : 'light');
        return (
          <View
            key={item.label}
            style={{ width: items.length <= 3 ? `${100 / items.length}%` : '25%', paddingHorizontal: 4, marginBottom: 8 }}
          >
            <Pressable
              disabled={!linkedMenu || isMenuTransitioning}
              onPress={() => {
                if (!linkedMenu) return;
                void handleMenuPress(linkedMenu);
              }}
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
                  backgroundColor: isDarkModeActive ? 'rgba(30, 41, 59, 0.92)' : item.color,
                  borderWidth: isDarkModeActive ? 1 : 0,
                  borderColor: isDarkModeActive ? 'rgba(148, 163, 184, 0.22)' : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isOpeningThisMenu ? (
                  <ActivityIndicator size="small" color={iconColor} />
                ) : (
                  <Feather name={item.icon} size={18} color={iconColor} />
                )}
              </View>
              <Text style={{ color: metricColor, fontWeight: '700', fontSize: 17, marginTop: 6 }}>{item.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center' }} numberOfLines={2}>
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

  const footerKeyboardOffset = keyboardHeight > 0 ? Math.max(0, keyboardHeight - insets.bottom + 8) : 0;

  if (isLoading) return <AppLoadingScreen message="Memuat dashboard..." />;
  if (!isAuthenticated || !user) return <Redirect href="/welcome" />;

  const teachingScheduleMenu = menuItemByKey.get('teaching-schedule');
  const studentScheduleMenu = menuItemByKey.get('student-schedule');

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          position: 'absolute',
          right: -55,
          top: -40,
          width: 185,
          height: 185,
          borderRadius: 999,
          backgroundColor: isDarkModeActive ? 'rgba(96, 165, 250, 0.16)' : BRAND_COLORS.sky,
          opacity: isDarkModeActive ? 0.2 : 0.24,
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
          backgroundColor: isDarkModeActive ? 'rgba(244, 114, 182, 0.12)' : BRAND_COLORS.pink,
          opacity: isDarkModeActive ? 0.18 : 0.12,
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
          backgroundColor: isDarkModeActive ? 'rgba(45, 212, 191, 0.14)' : BRAND_COLORS.teal,
          opacity: isDarkModeActive ? 0.16 : 0.18,
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
              backgroundColor={isDarkModeActive ? colors.surfaceMuted : BRAND_COLORS.navy}
              textColor={isDarkModeActive ? colors.text : BRAND_COLORS.white}
              borderColor={colors.border}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>Tahun Ajaran Aktif</Text>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 14 }}>
              {activeAcademicYearLabel} ({activeAcademicSemesterLabel})
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {todayLabel}
            </Text>
          </View>
        </View>

        <Text
          style={{
            marginTop: 12,
            color: colors.text,
            fontSize: 20,
            fontWeight: '700',
          }}
        >
          Halo, {displayName}
        </Text>
        <Text style={{ color: colors.textMuted, marginTop: 2, marginBottom: 12 }}>
          {homeSubtitle}
        </Text>

        {profile.role === 'TEACHER' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Statistik Mengajar</Text>
            {teacherAssignmentsQuery.isLoading || teacherScheduleQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat statistik mengajar...</Text>
            ) : null}
            {(teacherAssignmentsQuery.isError || teacherScheduleQuery.isError) &&
            !(teacherAssignmentsQuery.isLoading || teacherScheduleQuery.isLoading) ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
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
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Statistik Admin</Text>
            {adminStatsQuery.data?.activeYearName ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                Tahun ajaran aktif: {adminStatsQuery.data.activeYearName}
              </Text>
            ) : null}
            {adminStatsQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat statistik admin...</Text>
            ) : null}
            {adminStatsQuery.isError && !adminStatsQuery.isLoading ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
                Gagal memuat statistik admin. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!adminStatsQuery.isLoading && !adminStatsQuery.isError ? renderStatGrid(adminStatCards) : null}
          </View>
        ) : null}

        {profile.role === 'PRINCIPAL' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Dashboard Kepala Sekolah</Text>
            {principalStatsQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat ringkasan kepala sekolah...</Text>
            ) : null}
            {principalStatsQuery.isError && !principalStatsQuery.isLoading ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
                Gagal memuat ringkasan kepala sekolah. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!principalStatsQuery.isLoading && !principalStatsQuery.isError ? (
              <>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Tahun Ajaran Aktif: {principalStatsQuery.data?.activeAcademicYearName || '-'}
                </Text>
                {renderStatGrid(principalStatCards)}
              </>
            ) : null}
          </View>
        ) : null}

        {profile.role === 'STAFF' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>
              {getStaffSectionTitle(profile)}
            </Text>
            {staffStatsQuery.data?.activeAcademicYearName ? (
              <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 8 }}>
                Tahun ajaran aktif: {staffStatsQuery.data.activeAcademicYearName}
              </Text>
            ) : null}
            {staffStatsQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat statistik staff...</Text>
            ) : null}
            {staffStatsQuery.isError && !staffStatsQuery.isLoading ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
                Gagal memuat statistik staff. Tarik layar ke bawah untuk muat ulang.
              </Text>
            ) : null}
            {!staffStatsQuery.isLoading && !staffStatsQuery.isError ? renderStatGrid(staffStatCards) : null}
          </View>
        ) : null}

        {profile.role === 'PARENT' ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Ringkasan Keuangan Anak</Text>
            {parentOverviewQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat ringkasan keuangan...</Text>
            ) : null}
            {parentOverviewQuery.isError && !parentOverviewQuery.isLoading ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
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
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Info Siswa</Text>
              {renderStatGrid(studentStatCards)}
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Jadwal Pelajaran Hari Ini</Text>
              {studentScheduleQuery.isLoading ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat jadwal pelajaran hari ini...</Text>
              ) : null}
              {studentScheduleQuery.isError && !studentScheduleQuery.isLoading ? (
                <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
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
                          borderColor: colors.border,
                          backgroundColor: isDarkModeActive ? colors.surfaceMuted : '#fbfdff',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 12,
                            backgroundColor: isDarkModeActive ? 'rgba(96, 165, 250, 0.18)' : '#eff6ff',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <Text style={{ color: isDarkModeActive ? '#bfdbfe' : '#2563eb', fontWeight: '600', fontSize: 10 }}>
                            Jam ke
                          </Text>
                          <Text style={{ color: isDarkModeActive ? '#dbeafe' : '#1d4ed8', fontWeight: '800', fontSize: 18, marginTop: 2 }}>
                            {group.periodStart === group.periodEnd ? `${group.periodStart}` : `${group.periodStart}-${group.periodEnd}`}
                          </Text>
                          {group.entries.length > 1 ? (
                            <Text style={{ color: isDarkModeActive ? '#93c5fd' : '#3b82f6', fontWeight: '700', fontSize: 10, marginTop: 1 }}>
                              {group.entries.length} JP
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                            {group.subjectCode ? `${group.subjectCode} • ${group.subjectName}` : group.subjectName}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            Guru {group.teacherName}
                            {group.roomLabel !== '-' ? ` • Ruang ${group.roomLabel}` : ''}
                          </Text>
                        </View>
                        {group.timeRange ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              borderRadius: 999,
                              backgroundColor: isDarkModeActive ? 'rgba(96, 165, 250, 0.18)' : '#dbeafe',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              marginLeft: 8,
                            }}
                          >
                            <Feather name="clock" size={12} color={isDarkModeActive ? '#bfdbfe' : '#1d4ed8'} />
                            <Text style={{ color: isDarkModeActive ? '#bfdbfe' : '#1d4ed8', fontWeight: '700', fontSize: 11 }}>
                              {group.timeRange}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                    {studentScheduleMenu ? (
                      <Pressable
                        disabled={isMenuTransitioning}
                        onPress={() => {
                          void handleMenuPress(studentScheduleMenu);
                        }}
                        style={({ pressed }) => ({
                          marginTop: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          paddingVertical: 10,
                          alignItems: 'center',
                          opacity: pressed || openingMenuKey === studentScheduleMenu.key ? 0.82 : 1,
                        })}
                      >
                        <Text style={{ color: colors.text, fontWeight: '700' }}>
                          {openingMenuKey === studentScheduleMenu.key ? 'Membuka modul...' : 'Lihat Jadwal Lengkap'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: colors.borderSoft,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
                      Tidak ada jadwal pelajaran untuk hari ini.
                    </Text>
                  </View>
                )
              ) : null}
            </View>

            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Jadwal Ujian Terdekat</Text>
              {studentExamsQuery.isLoading ? (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat jadwal ujian terdekat...</Text>
              ) : null}
              {studentExamsQuery.isError && !studentExamsQuery.isLoading ? (
                <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
                  Gagal memuat jadwal ujian. Tarik layar ke bawah untuk muat ulang.
                </Text>
              ) : null}
              {!studentExamsQuery.isLoading && !studentExamsQuery.isError ? (
                upcomingStudentExams.length > 0 ? (
                  <View>
                    {upcomingStudentExams.map((item) => {
                      const status = resolveStudentExamRuntimeStatus(item);
                      const tone = getStudentExamStatusTone(status);
                      const examType = String(item.packet?.programCode || item.packet?.type || '-')
                        .trim()
                        .toUpperCase();
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => {
                            router.push(buildStudentExamRoute(item.packet?.programCode || item.packet?.type));
                          }}
                          style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: isDarkModeActive ? colors.surfaceMuted : '#f8fbff',
                            paddingHorizontal: 10,
                            paddingVertical: 9,
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text
                              style={{ color: colors.text, fontWeight: '700', fontSize: 13, flex: 1, paddingRight: 8 }}
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
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                            {`${resolveExamSubjectName(item)} • ${examType}`}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
                            Mulai: {formatExamDateTime(item.startTime)}
                          </Text>
                          {item.isBlocked ? (
                            <Text style={{ color: isDarkModeActive ? '#fecaca' : '#991b1b', fontSize: 11, marginTop: 2 }}>
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
                      borderColor: colors.borderSoft,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
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
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>Jadwal Hari Ini</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{todayLabel}</Text>
            </View>
            {teacherScheduleQuery.isLoading ? (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Memuat jadwal mengajar hari ini...</Text>
            ) : null}
            {teacherScheduleQuery.isError && !teacherScheduleQuery.isLoading ? (
              <Text style={{ color: isDarkModeActive ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
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
                          borderColor: colors.border,
                          backgroundColor: isDarkModeActive ? colors.surfaceMuted : '#fbfdff',
                          paddingHorizontal: 12,
                          paddingVertical: 10,
                          marginBottom: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                        }}
                      >
                        <View
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: 12,
                            backgroundColor: isDarkModeActive ? 'rgba(96, 165, 250, 0.18)' : '#eff6ff',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 10,
                          }}
                        >
                          <Text style={{ color: isDarkModeActive ? '#bfdbfe' : '#2563eb', fontWeight: '600', fontSize: 10 }}>Jam ke</Text>
                          <Text style={{ color: isDarkModeActive ? '#dbeafe' : '#1d4ed8', fontWeight: '800', fontSize: 18, marginTop: 2 }}>
                            {group.periodStart === group.periodEnd
                              ? `${group.periodStart}`
                              : `${group.periodStart}-${group.periodEnd}`}
                          </Text>
                          {group.entries.length > 1 ? (
                            <Text style={{ color: isDarkModeActive ? '#93c5fd' : '#3b82f6', fontWeight: '700', fontSize: 10, marginTop: 1 }}>
                              {group.entries.length} JP
                            </Text>
                          ) : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                            {group.subjectCode ? `${group.subjectCode} • ${group.subjectName}` : group.subjectName}
                          </Text>
                          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
                            Kelas {group.className}
                            {group.roomLabel !== '-' ? ` • Ruang ${group.roomLabel}` : ''}
                          </Text>
                        </View>
                        {group.timeRange ? (
                          <View
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              borderRadius: 999,
                              backgroundColor: isDarkModeActive ? 'rgba(96, 165, 250, 0.18)' : '#dbeafe',
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              marginLeft: 8,
                            }}
                          >
                            <Feather name="clock" size={12} color={isDarkModeActive ? '#bfdbfe' : '#1d4ed8'} />
                            <Text style={{ color: isDarkModeActive ? '#bfdbfe' : '#1d4ed8', fontWeight: '700', fontSize: 11 }}>{group.timeRange}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <View
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: colors.borderSoft,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: colors.textMuted, textAlign: 'center' }}>
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
                    style={({ pressed }) => ({
                      marginTop: 8,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: isDarkModeActive ? colors.surfaceMuted : '#f8fbff',
                      paddingVertical: 10,
                      alignItems: 'center',
                      opacity: pressed || openingMenuKey === teachingScheduleMenu.key ? 0.82 : 1,
                    })}
                  >
                    <Text style={{ color: isDarkModeActive ? '#bfdbfe' : BRAND_COLORS.navy, fontWeight: '700' }}>
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
              backgroundColor: colors.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 8 }}>Aksi Cepat</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {roleQuickMenus.map((menu) => {
                const icon = getMenuIcon(menu);
                const tone = resolveMenuTone(getMenuIconTone(menu.key), isDarkModeActive ? 'dark' : 'light');
                const isOpeningThisMenu = openingMenuKey === menu.key;
                return (
                  <View key={menu.key} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 10 }}>
                    <Pressable
                      disabled={isMenuTransitioning}
                      onPress={() => {
                        void handleMenuPress(menu);
                      }}
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
                        style={{ color: colors.text, fontWeight: '700', fontSize: 11, marginTop: 5, textAlign: 'center' }}
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
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingVertical: 8,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 8 }}>
              Membuka modul...
            </Text>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Menu Berdasarkan Kategori</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{profile.role}</Text>
        </View>
        {menuSearch.trim() ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: isDarkModeActive ? colors.surfaceMuted : '#f8fbff',
              paddingVertical: 8,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}
              numberOfLines={1}
            >
              Filter pencarian: "{menuSearch}"
            </Text>
            <Pressable onPress={() => setMenuSearch('')}>
              <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700', marginLeft: 10 }}>
                Hapus
              </Text>
            </Pressable>
          </View>
        ) : null}
        {filteredGroups.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              marginBottom: 12,
            }}
          >
            <Text style={{ color: colors.text, textAlign: 'center', fontWeight: '600' }}>
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
                backgroundColor: colors.surface,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
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
                  borderBottomColor: colors.borderSoft,
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
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{group.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                    {group.items.length} submenu
                  </Text>
                </View>

                <View style={{ paddingHorizontal: 12 }}>
                  <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={18} color={colors.textMuted} />
                </View>
              </Pressable>

              {isOpen ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                    {group.items.map((menu) => {
                      const tone = resolveMenuTone(getMenuIconTone(menu.key), isDarkModeActive ? 'dark' : 'light');
                      const isOpeningThisMenu = openingMenuKey === menu.key;
                      const menuIcon = getMenuIcon(menu);
                      return (
                        <View key={menu.key} style={{ width: submenuWidth, paddingHorizontal: 4, marginBottom: 10 }}>
                          <Pressable
                            disabled={isMenuTransitioning}
                            onPress={() => {
                              void handleMenuPress(menu);
                            }}
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
                                color: colors.text,
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
          bottom: footerBottomOffset + footerKeyboardOffset,
        }}
      >
        {isInlineSearchVisible ? (
          <View
            style={{
              marginBottom: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              paddingHorizontal: 10,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Feather name="search" size={16} color={colors.textMuted} />
            <TextInput
              ref={menuSearchInputRef}
              value={menuSearch}
              onChangeText={setMenuSearch}
              placeholder="Cari menu atau submenu"
              placeholderTextColor={colors.textSoft}
              style={{
                flex: 1,
                paddingVertical: 10,
                paddingHorizontal: 8,
                color: colors.text,
              }}
            />
            {menuSearch.trim() ? (
              <Pressable onPress={() => setMenuSearch('')} style={{ marginRight: 6 }}>
                <Feather name="x-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
            <Pressable onPress={closeInlineSearch}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : null}

        <View
          style={{
            backgroundColor: isDarkModeActive ? colors.surface : BRAND_COLORS.navy,
            borderRadius: 24,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            shadowColor: '#0b1b42',
            shadowOffset: { width: 0, height: 7 },
            shadowOpacity: isDarkModeActive ? 0.32 : 0.2,
            shadowRadius: 10,
            elevation: 10,
            borderWidth: isDarkModeActive ? 1 : 0,
            borderColor: isDarkModeActive ? colors.border : 'transparent',
          }}
        >
          <Pressable onPress={() => router.replace('/home')} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="home" size={17} color={BRAND_COLORS.gold} />
            <Text style={{ color: isDarkModeActive ? colors.text : BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Home</Text>
          </Pressable>

          <Pressable onPress={() => router.push('/profile')} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="user" size={17} color={isDarkModeActive ? colors.text : BRAND_COLORS.white} />
            <Text style={{ color: isDarkModeActive ? colors.text : BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Profil</Text>
          </Pressable>

          <View style={{ width: 58 }} />

          <Pressable onPress={handleNotificationPress} style={{ alignItems: 'center', width: 56 }}>
            <View style={{ position: 'relative' }}>
              <Feather name="bell" size={17} color={isDarkModeActive ? colors.text : BRAND_COLORS.white} />
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
                    borderColor: isDarkModeActive ? colors.surface : BRAND_COLORS.navy,
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
            <Text style={{ color: isDarkModeActive ? colors.text : BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>Notifikasi</Text>
          </Pressable>

          <Pressable onPress={handleLogout} disabled={isLoggingOut} style={{ alignItems: 'center', width: 56 }}>
            <Feather name="log-out" size={17} color={isDarkModeActive ? colors.text : BRAND_COLORS.white} />
            <Text style={{ color: isDarkModeActive ? colors.text : BRAND_COLORS.white, fontSize: 11, marginTop: 2 }}>
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
            backgroundColor: colors.surface,
            borderWidth: 5,
            borderColor: isDarkModeActive ? colors.background : '#e9eefb',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 999,
              backgroundColor: isDarkModeActive ? colors.surfaceMuted : BRAND_COLORS.navy,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="search" size={18} color={isDarkModeActive ? colors.text : BRAND_COLORS.white} />
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
              backgroundColor: colors.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: colors.border,
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
                backgroundColor: isDarkModeActive ? colors.primarySoft : '#eff6ff',
                borderWidth: 1,
                borderColor: isDarkModeActive ? colors.border : '#bfdbfe',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 10,
              }}
            >
              <Feather name="log-out" size={18} color={colors.primary} />
            </View>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 6 }}>
              Konfirmasi Logout
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 14 }}>
              Anda akan keluar dari sesi saat ini. Lanjutkan logout?
            </Text>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                disabled={isLoggingOut}
                onPress={() => setIsLogoutConfirmVisible(false)}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderRadius: 12,
                  paddingVertical: 11,
                  alignItems: 'center',
                  backgroundColor: colors.surface,
                  opacity: isLoggingOut ? 0.6 : 1,
                }}
              >
                <Text style={{ color: colors.textMuted, fontWeight: '700' }}>Batal</Text>
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
