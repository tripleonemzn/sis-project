import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileTabChip } from '../../../src/components/MobileTabChip';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  adminApi,
  type AdminAcademicFeatureFlags,
  type AdminAcademicYearRolloverApplyResult,
  type AdminAcademicYearRolloverComponentSelection,
  type AdminAcademicPromotionRollbackResult,
  type AdminAcademicPromotionWorkspaceClass,
  type AdminExamQuestionType,
  type AdminExamType,
  type AdminScheduleDayOfWeek,
  type AdminSchedulePeriodType,
  type AdminScheduleTimeConfigPayload,
} from '../../../src/features/admin/adminApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifyInfo, notifySuccess } from '../../../src/lib/ui/feedback';

type AcademicSection =
  | 'overview'
  | 'academic-years'
  | 'promotion'
  | 'academic-calendar'
  | 'teacher-assignments'
  | 'schedule'
  | 'teaching-load'
  | 'kkm'
  | 'attendance-recap'
  | 'report-cards'
  | 'question-bank'
  | 'exam-sessions';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const ACADEMIC_SECTIONS: Array<{
  key: AcademicSection;
  label: string;
  description: string;
  icon: FeatherIconName;
}> = [
  {
    key: 'overview',
    label: 'Ringkasan',
    description: 'Ringkasan data akademik untuk monitoring cepat.',
    icon: 'grid',
  },
  {
    key: 'academic-years',
    label: 'Tahun Ajaran',
    description: 'Kelola dan aktifkan tahun ajaran.',
    icon: 'calendar',
  },
  {
    key: 'promotion',
    label: 'Promotion',
    description: 'Preview, mapping, dan commit kenaikan kelas/alumni.',
    icon: 'shuffle',
  },
  {
    key: 'academic-calendar',
    label: 'Kalender',
    description: 'Pantau rentang semester akademik.',
    icon: 'calendar',
  },
  {
    key: 'teacher-assignments',
    label: 'Assignment',
    description: 'Pantau assignment guru-mapel-kelas aktif.',
    icon: 'users',
  },
  {
    key: 'schedule',
    label: 'Jadwal',
    description: 'Kelola input jadwal per jam per kelas + konfigurasi waktu.',
    icon: 'clock',
  },
  {
    key: 'teaching-load',
    label: 'Jam Mengajar',
    description: 'Rekap beban jam mengajar per guru.',
    icon: 'bar-chart-2',
  },
  {
    key: 'kkm',
    label: 'Data KKM',
    description: 'Monitoring cakupan KKM per mata pelajaran.',
    icon: 'target',
  },
  {
    key: 'attendance-recap',
    label: 'Absensi',
    description: 'Ringkasan keterlambatan siswa per kelas.',
    icon: 'check-square',
  },
  {
    key: 'report-cards',
    label: 'Rapor',
    description: 'Ringkasan data rapor kelas aktif.',
    icon: 'file-text',
  },
  {
    key: 'question-bank',
    label: 'Bank Soal',
    description: 'Filter dan review bank soal ujian per tahun/mapel/tipe.',
    icon: 'help-circle',
  },
  {
    key: 'exam-sessions',
    label: 'Sesi Ujian',
    description: 'Kelola sesi ujian: create, aktif/nonaktif, dan hapus.',
    icon: 'clipboard',
  },
];

const ACADEMIC_SECTION_BY_KEY = new Map(ACADEMIC_SECTIONS.map((item) => [item.key, item] as const));
const getSingleParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function hasAnyDuty(userDuties: string[] | undefined, expected: string[]) {
  const owned = new Set((userDuties || []).map((item) => String(item || '').trim().toUpperCase()));
  return expected.some((item) => owned.has(String(item || '').trim().toUpperCase()));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getPromotionResolvedTargetClassId(
  row: AdminAcademicPromotionWorkspaceClass,
  drafts: Record<number, number | null>,
) {
  if (Object.prototype.hasOwnProperty.call(drafts, row.sourceClassId)) {
    return drafts[row.sourceClassId] ?? null;
  }
  return row.targetClassId ?? null;
}

function getRolloverPreviewItemLabel(item: unknown) {
  if (!item || typeof item !== 'object') return '-';
  const row = item as Record<string, unknown>;

  if ('sourceClassName' in row && 'targetClassName' in row && 'action' in row) {
    const sourceHomeroomTeacher =
      typeof row.sourceHomeroomTeacher === 'object' && row.sourceHomeroomTeacher !== null
        ? (row.sourceHomeroomTeacher as { name?: string })
        : null;
    const targetHomeroomTeacher =
      typeof row.targetHomeroomTeacher === 'object' && row.targetHomeroomTeacher !== null
        ? (row.targetHomeroomTeacher as { name?: string })
        : null;
    const homeroomAction = String(row.homeroomAction || '');
    const homeroomLabel =
      homeroomAction === 'CARRY_FORWARD_ON_CREATE'
        ? `Wali ikut: ${String(sourceHomeroomTeacher?.name || '-')}`
        : homeroomAction === 'FILL_EXISTING_EMPTY'
          ? `Isi wali target: ${String(sourceHomeroomTeacher?.name || '-')}`
          : homeroomAction === 'KEEP_EXISTING'
            ? `Wali target tetap: ${String(targetHomeroomTeacher?.name || '-')}`
            : 'Source tanpa wali kelas';
    return `${String(row.sourceClassName || '-')} -> ${String(row.targetClassName || '-')} • ${homeroomLabel} (${String(
      row.action || '-',
    )})`;
  }
  if ('sourceAssignmentId' in row && 'subject' in row && 'sourceClassName' in row && 'action' in row) {
    const subject = row.subject as { code?: string; name?: string } | undefined;
    return `${String(row.sourceClassName || '-')} • ${String(subject?.code || subject?.name || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceEventId' in row && 'title' in row && 'action' in row) {
    return `${String(row.title || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceSubjectKkmId' in row && 'subject' in row && 'classLevel' in row && 'sourceKkm' in row && 'action' in row) {
    const subject = row.subject as { code?: string; name?: string } | undefined;
    return `${String(subject?.code || subject?.name || '-')} ${String(row.classLevel || '-')} • ${String(row.sourceKkm || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceComponentId' in row && 'code' in row && 'label' in row && 'action' in row) {
    return `${String(row.code || '-')} • ${String(row.label || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceProgramId' in row && 'code' in row && 'displayLabel' in row && 'action' in row) {
    return `${String(row.code || '-')} • ${String(row.displayLabel || '-')} (${String(row.action || '-')})`;
  }
  if ('sourceSessionId' in row && 'programCode' in row && 'label' in row && 'action' in row) {
    return `${String(row.programCode || '-')} • ${String(row.label || '-')} (${String(row.action || '-')})`;
  }

  return '-';
}

type AcademicEventType =
  | 'LIBUR_NASIONAL'
  | 'LIBUR_SEKOLAH'
  | 'UJIAN_PTS'
  | 'UJIAN_PAS'
  | 'UJIAN_PAT'
  | 'MPLS'
  | 'RAPOR'
  | 'KEGIATAN_SEKOLAH'
  | 'LAINNYA';

const ACADEMIC_EVENT_TYPE_OPTIONS: Array<{ value: AcademicEventType; label: string }> = [
  { value: 'LIBUR_NASIONAL', label: 'Libur Nasional' },
  { value: 'LIBUR_SEKOLAH', label: 'Libur Sekolah' },
  { value: 'UJIAN_PTS', label: 'SBTS' },
  { value: 'UJIAN_PAS', label: 'SAS' },
  { value: 'UJIAN_PAT', label: 'SAT' },
  { value: 'MPLS', label: 'MPLS' },
  { value: 'RAPOR', label: 'Rapor' },
  { value: 'KEGIATAN_SEKOLAH', label: 'Kegiatan Sekolah' },
  { value: 'LAINNYA', label: 'Lainnya' },
];

const getAcademicEventTypeLabel = (value: AcademicEventType) =>
  ACADEMIC_EVENT_TYPE_OPTIONS.find((item) => item.value === value)?.label || value;

const EXAM_QUESTION_TYPE_OPTIONS: Array<{ value: '' | AdminExamQuestionType; label: string }> = [
  { value: '', label: 'Semua Tipe' },
  { value: 'MULTIPLE_CHOICE', label: 'Pilihan Ganda' },
  { value: 'COMPLEX_MULTIPLE_CHOICE', label: 'PG Kompleks' },
  { value: 'TRUE_FALSE', label: 'Benar/Salah' },
  { value: 'ESSAY', label: 'Essay' },
  { value: 'MATCHING', label: 'Menjodohkan' },
];

const EXAM_TYPE_OPTIONS: Array<{ value: 'ALL' | AdminExamType; label: string }> = [
  { value: 'ALL', label: 'Semua Tipe Ujian' },
  { value: 'FORMATIF', label: 'Formatif' },
  { value: 'SBTS', label: 'SBTS' },
  { value: 'SAS', label: 'SAS' },
  { value: 'SAT', label: 'SAT' },
  { value: 'US_PRACTICE', label: 'US Practice' },
  { value: 'US_THEORY', label: 'US Theory' },
];

const getExamTypeLabel = (value?: string | null) =>
  EXAM_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '-';

const stripHtml = (value?: string | null) => {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

type ScheduleDay = AdminScheduleDayOfWeek;
type SchedulePeriodType = AdminSchedulePeriodType;

const SCHEDULE_DAY_LABELS: Record<ScheduleDay, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
};

const SCHEDULE_DAY_ORDER: ScheduleDay[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const SCHEDULE_ALL_DAYS: ScheduleDay[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const SCHEDULE_BASE_TIMES_BY_DAY: Record<ScheduleDay, Record<number, string>> = {
  MONDAY: {
    1: '06.40 - 07.30',
    2: '07.30 - 08.00',
    3: '08.00 - 08.30',
    4: '08.30 - 09.00',
    5: '09.00 - 09.30',
    6: '09.30 - 10.00',
    7: '10.00 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 13.00',
    12: '13.00 - 13.30',
    13: '13.30 - 14.00',
  },
  TUESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.15',
    8: '10.15 - 10.45',
    9: '10.45 - 11.15',
    10: '11.15 - 11.45',
    11: '11.45 - 12.30',
    12: '12.30 - 13.00',
    13: '13.00 - 13.30',
  },
  WEDNESDAY: {
    1: '06.30 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  THURSDAY: {
    1: '06.50 - 07.15',
    2: '07.15 - 07.45',
    3: '07.45 - 08.15',
    4: '08.15 - 08.45',
    5: '08.45 - 09.15',
    6: '09.15 - 09.45',
    7: '09.45 - 10.30',
    8: '10.30 - 11.00',
    9: '11.00 - 11.30',
    10: '11.30 - 12.00',
    11: '12.00 - 12.30',
    12: '12.30 - 13.00',
  },
  FRIDAY: {
    1: '06.45 - 07.00',
    2: '07.00 - 07.30',
    3: '07.30 - 08.00',
    4: '08.00 - 08.30',
    5: '08.30 - 09.00',
    6: '09.00 - 09.30',
    7: '09.30 - 10.00',
    8: '10.00 - 10.30',
    9: '10.30 - 11.00',
    10: '11.00 - 11.30',
  },
  SATURDAY: {},
};

const SCHEDULE_DEFAULT_NOTES_BY_DAY: Record<ScheduleDay, Record<number, string>> = {
  MONDAY: {
    1: 'UPACARA',
    5: 'ISTIRAHAT',
    11: 'ISTIRAHAT',
  },
  TUESDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
    11: 'ISTIRAHAT',
  },
  WEDNESDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
  },
  THURSDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    7: 'ISTIRAHAT',
  },
  FRIDAY: {
    1: 'TADARUS / SHOLAT DHUHA',
    6: 'ISTIRAHAT',
  },
  SATURDAY: {},
};

const clonePeriodStringMap = (source: Record<string, Record<number, string>>) => {
  const next: Record<string, Record<number, string>> = {};
  Object.keys(source).forEach((dayKey) => {
    const daySource = source[dayKey] || {};
    const dayTarget: Record<number, string> = {};
    Object.keys(daySource).forEach((periodKey) => {
      const period = Number(periodKey);
      if (!Number.isFinite(period) || period <= 0) return;
      dayTarget[period] = String(daySource[period] ?? '');
    });
    next[dayKey] = dayTarget;
  });
  return next;
};

const clonePeriodTypeMap = (source: Record<string, Record<number, SchedulePeriodType>>) => {
  const next: Record<string, Record<number, SchedulePeriodType>> = {};
  Object.keys(source).forEach((dayKey) => {
    const daySource = source[dayKey] || {};
    const dayTarget: Record<number, SchedulePeriodType> = {};
    Object.keys(daySource).forEach((periodKey) => {
      const period = Number(periodKey);
      if (!Number.isFinite(period) || period <= 0) return;
      dayTarget[period] = daySource[period];
    });
    next[dayKey] = dayTarget;
  });
  return next;
};

const inferPeriodTypeFromNote = (note?: string | null): SchedulePeriodType => {
  if (!note) return 'TEACHING';
  const text = String(note).toUpperCase();
  if (text.includes('UPACARA')) return 'UPACARA';
  if (text.includes('ISTIRAHAT')) return 'ISTIRAHAT';
  if (text.includes('TADARUS')) return 'TADARUS';
  return 'OTHER';
};

const buildScheduleDefaultPeriodTimes = () => clonePeriodStringMap(SCHEDULE_BASE_TIMES_BY_DAY);

const buildScheduleDefaultPeriodNotes = () => clonePeriodStringMap(SCHEDULE_DEFAULT_NOTES_BY_DAY);

const buildScheduleDefaultPeriodTypes = ({
  periodTimes,
  periodNotes,
}: {
  periodTimes: Record<string, Record<number, string>>;
  periodNotes: Record<string, Record<number, string>>;
}) => {
  const next: Record<string, Record<number, SchedulePeriodType>> = {};
  Object.keys(periodTimes).forEach((dayKey) => {
    const dayTimes = periodTimes[dayKey] || {};
    const dayNotes = periodNotes[dayKey] || {};
    const dayTypes: Record<number, SchedulePeriodType> = {};
    Object.keys(dayTimes).forEach((periodKey) => {
      const period = Number(periodKey);
      if (!Number.isFinite(period) || period <= 0) return;
      dayTypes[period] = inferPeriodTypeFromNote(dayNotes[period]);
    });
    next[dayKey] = dayTypes;
  });
  return next;
};

function StatCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 14,
        padding: 12,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700', marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: BRAND_COLORS.white,
        borderWidth: 1,
        borderColor: '#d6e0f2',
        borderRadius: 16,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: 8 }}>{subtitle}</Text>
      {children}
    </View>
  );
}

function SectionChip({
  active,
  label,
  icon,
  onPress,
}: {
  active: boolean;
  label: string;
  icon: FeatherIconName;
  onPress: () => void;
}) {
  const iconColor = active ? BRAND_COLORS.blue : BRAND_COLORS.textMuted;
  return (
    <MobileTabChip
      active={active}
      label={label}
      onPress={onPress}
      compact
      icon={<Feather name={icon} size={13} color={iconColor} />}
    />
  );
}

function SelectChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d6e0f2',
        backgroundColor: active ? '#eaf1ff' : '#fff',
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '700', color: active ? BRAND_COLORS.blue : BRAND_COLORS.textMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminAcademicScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const isAdmin = user?.role === 'ADMIN';
  const isCurriculumTeacher =
    user?.role === 'TEACHER' &&
    hasAnyDuty(user?.additionalDuties, ['WAKASEK_KURIKULUM', 'SEKRETARIS_KURIKULUM']);
  const isStudentAffairsTeacher =
    user?.role === 'TEACHER' &&
    hasAnyDuty(user?.additionalDuties, ['WAKASEK_KESISWAAN', 'SEKRETARIS_KESISWAAN']);
  const canAccess = isAdmin || isCurriculumTeacher || isStudentAffairsTeacher;

  const allowedSections = useMemo<AcademicSection[]>(() => {
    if (isAdmin) return ACADEMIC_SECTIONS.map((item) => item.key);
    const next = new Set<AcademicSection>(['overview']);
    if (isCurriculumTeacher) {
      next.add('teacher-assignments');
      next.add('schedule');
      next.add('teaching-load');
      next.add('kkm');
      next.add('question-bank');
      next.add('exam-sessions');
    }
    if (isStudentAffairsTeacher) {
      next.add('attendance-recap');
    }
    return Array.from(next);
  }, [isAdmin, isCurriculumTeacher, isStudentAffairsTeacher]);
  const allowedSectionSet = useMemo(() => new Set(allowedSections), [allowedSections]);

  const sectionParam = String(getSingleParam(params.section) || '').trim().toLowerCase();
  const requestedSection: AcademicSection = ACADEMIC_SECTION_BY_KEY.has(sectionParam as AcademicSection)
    ? (sectionParam as AcademicSection)
    : 'overview';
  const defaultSection: AcademicSection = allowedSectionSet.has('overview')
    ? 'overview'
    : allowedSections[0] || 'overview';
  const activeSection: AcademicSection = allowedSectionSet.has(requestedSection)
    ? requestedSection
    : defaultSection;
  const sectionMeta = ACADEMIC_SECTION_BY_KEY.get(activeSection) || ACADEMIC_SECTIONS[0];
  const [assignmentTeacherId, setAssignmentTeacherId] = useState('');
  const [assignmentSubjectId, setAssignmentSubjectId] = useState('');
  const [assignmentSelectedClassIds, setAssignmentSelectedClassIds] = useState<number[]>([]);
  const [assignmentTeacherSearch, setAssignmentTeacherSearch] = useState('');
  const [assignmentSubjectSearch, setAssignmentSubjectSearch] = useState('');
  const [assignmentClassSearch, setAssignmentClassSearch] = useState('');
  const [editingAcademicYearId, setEditingAcademicYearId] = useState<number | null>(null);
  const [academicYearForm, setAcademicYearForm] = useState({
    name: '',
    semester1Start: '',
    semester1End: '',
    semester2Start: '',
    semester2End: '',
  });
  const [promotionSourceAcademicYearId, setPromotionSourceAcademicYearId] = useState('');
  const [promotionTargetAcademicYearId, setPromotionTargetAcademicYearId] = useState('');
  const [activateTargetYearAfterCommit, setActivateTargetYearAfterCommit] = useState(true);
  const [promotionMappingDrafts, setPromotionMappingDrafts] = useState<Record<number, number | null>>({});
  const [rolloverSelectedComponents, setRolloverSelectedComponents] =
    useState<AdminAcademicYearRolloverComponentSelection>({
      classPreparation: true,
      teacherAssignments: true,
      scheduleTimeConfig: true,
      academicEvents: true,
      reportDates: true,
      subjectKkms: true,
      examGradeComponents: true,
      examProgramConfigs: true,
      examProgramSessions: true,
    });
  const [calendarAcademicYearId, setCalendarAcademicYearId] = useState('');
  const [calendarSemesterFilter, setCalendarSemesterFilter] = useState<'ALL' | 'ODD' | 'EVEN'>('ALL');
  const [calendarTypeFilter, setCalendarTypeFilter] = useState<'ALL' | AcademicEventType>('ALL');
  const [editingAcademicEventId, setEditingAcademicEventId] = useState<number | null>(null);
  const [academicEventForm, setAcademicEventForm] = useState({
    title: '',
    type: 'LIBUR_NASIONAL' as AcademicEventType,
    startDate: '',
    endDate: '',
    semester: '' as '' | 'ODD' | 'EVEN',
    isHoliday: false,
    description: '',
  });
  const [operationalAcademicYearId, setOperationalAcademicYearId] = useState('');
  const [kkmSearch, setKkmSearch] = useState('');
  const [kkmLevelFilter, setKkmLevelFilter] = useState<'ALL' | 'X' | 'XI' | 'XII'>('ALL');
  const [attendanceClassId, setAttendanceClassId] = useState('');
  const [attendanceClassSearch, setAttendanceClassSearch] = useState('');
  const [attendanceSemesterFilter, setAttendanceSemesterFilter] = useState<'ALL' | 'ODD' | 'EVEN'>('ALL');
  const [reportClassId, setReportClassId] = useState('');
  const [reportClassSearch, setReportClassSearch] = useState('');
  const [reportSubjectSearch, setReportSubjectSearch] = useState('');
  const [reportViewMode, setReportViewMode] = useState<'REPORT' | 'RANKING'>('REPORT');
  const [reportSemesterFilter, setReportSemesterFilter] = useState<'' | 'ODD' | 'EVEN'>('');
  const [scheduleAcademicYearId, setScheduleAcademicYearId] = useState('');
  const [scheduleClassId, setScheduleClassId] = useState('');
  const [scheduleClassSearch, setScheduleClassSearch] = useState('');
  const [scheduleAssignmentSearch, setScheduleAssignmentSearch] = useState('');
  const [scheduleFormDay, setScheduleFormDay] = useState<ScheduleDay>('MONDAY');
  const [scheduleFormStartTeachingHour, setScheduleFormStartTeachingHour] = useState('1');
  const [scheduleFormEndTeachingHour, setScheduleFormEndTeachingHour] = useState('');
  const [scheduleFormAssignmentId, setScheduleFormAssignmentId] = useState('');
  const [scheduleFormRoom, setScheduleFormRoom] = useState('');
  const [scheduleTimeEditorOpen, setScheduleTimeEditorOpen] = useState(false);
  const [scheduleEditingDay, setScheduleEditingDay] = useState<ScheduleDay>('MONDAY');
  const [schedulePeriodTimes, setSchedulePeriodTimes] = useState<Record<string, Record<number, string>>>(() =>
    buildScheduleDefaultPeriodTimes(),
  );
  const [schedulePeriodNotes, setSchedulePeriodNotes] = useState<Record<string, Record<number, string>>>(() =>
    buildScheduleDefaultPeriodNotes(),
  );
  const [schedulePeriodTypes, setSchedulePeriodTypes] = useState<Record<string, Record<number, SchedulePeriodType>>>(() =>
    buildScheduleDefaultPeriodTypes({
      periodTimes: buildScheduleDefaultPeriodTimes(),
      periodNotes: buildScheduleDefaultPeriodNotes(),
    }),
  );
  const [teachingLoadAcademicYearId, setTeachingLoadAcademicYearId] = useState('');
  const [teachingLoadTeacherId, setTeachingLoadTeacherId] = useState('');
  const [teachingLoadTeacherSearch, setTeachingLoadTeacherSearch] = useState('');
  const [questionBankAcademicYearId, setQuestionBankAcademicYearId] = useState('');
  const [questionBankSubjectId, setQuestionBankSubjectId] = useState('');
  const [questionBankSubjectSearch, setQuestionBankSubjectSearch] = useState('');
  const [questionBankTypeFilter, setQuestionBankTypeFilter] = useState<'' | AdminExamQuestionType>('');
  const [questionBankSemesterFilter, setQuestionBankSemesterFilter] = useState<'' | 'ODD' | 'EVEN'>('');
  const [questionBankSearchDraft, setQuestionBankSearchDraft] = useState('');
  const [questionBankSearch, setQuestionBankSearch] = useState('');
  const [questionBankPage, setQuestionBankPage] = useState(1);
  const [examSessionAcademicYearId, setExamSessionAcademicYearId] = useState('');
  const [examSessionTypeFilter, setExamSessionTypeFilter] = useState<'ALL' | AdminExamType>('ALL');
  const [examSessionSearch, setExamSessionSearch] = useState('');
  const [examSessionPacketId, setExamSessionPacketId] = useState('');
  const [examSessionClassSearch, setExamSessionClassSearch] = useState('');
  const [examSessionSelectedClassIds, setExamSessionSelectedClassIds] = useState<number[]>([]);
  const [examSessionDate, setExamSessionDate] = useState('');
  const [examSessionStartTime, setExamSessionStartTime] = useState('');
  const [examSessionEndTime, setExamSessionEndTime] = useState('');
  const [examSessionRoom, setExamSessionRoom] = useState('');
  const [examSessionProctorId, setExamSessionProctorId] = useState('');

  const openSection = (section: AcademicSection) => {
    const target = section === 'overview' ? '/admin/academic' : `/admin/academic?section=${section}`;
    router.replace(target as never);
  };

  const academicQuery = useQuery({
    queryKey: ['mobile-admin-academic-overview', activeSection],
    queryFn: async () => {
      const [activeYear, years, subjects, teachers] = await Promise.all([
        adminApi.getActiveAcademicYear().catch(() => null),
        adminApi.listAcademicYears({ page: 1, limit: 100 }),
        adminApi.listSubjects({ page: 1, limit: 120 }),
        adminApi.listUsers({ role: 'TEACHER' }).catch(() => []),
      ]);

      const classes = await adminApi.listClasses({
        page: 1,
        limit: 120,
        academicYearId: activeYear?.id,
      });

      const assignments = activeYear
        ? await adminApi.listTeacherAssignments({
            academicYearId: activeYear.id,
            page: 1,
            limit: 120,
          })
        : { items: [], pagination: { page: 1, limit: 120, total: 0, totalPages: 1 } };

      return {
        activeYear,
        years,
        subjects,
        teachers,
        classes,
        assignments,
      };
    },
  });

  const academicFeatureFlagsQuery = useQuery({
    queryKey: ['mobile-admin-academic-feature-flags'],
    queryFn: () => adminApi.getAcademicFeatureFlags(),
  });

  useEffect(() => {
    const years = academicQuery.data?.years.items || [];
    if (years.length === 0) return;

    const activeYear = academicQuery.data?.activeYear || years[0];
    if (!promotionSourceAcademicYearId) {
      setPromotionSourceAcademicYearId(String(activeYear.id));
    }
    if (!promotionTargetAcademicYearId) {
      const fallbackTarget = years.find((item) => item.id !== activeYear.id) || years[0];
      if (fallbackTarget) {
        setPromotionTargetAcademicYearId(String(fallbackTarget.id));
      }
    }
  }, [
    academicQuery.data?.activeYear,
    academicQuery.data?.years.items,
    promotionSourceAcademicYearId,
    promotionTargetAcademicYearId,
  ]);

  const effectivePromotionSourceAcademicYearId = useMemo(() => {
    const selected = Number(promotionSourceAcademicYearId);
    return Number.isFinite(selected) && selected > 0 ? selected : null;
  }, [promotionSourceAcademicYearId]);

  const effectivePromotionTargetAcademicYearId = useMemo(() => {
    const selected = Number(promotionTargetAcademicYearId);
    return Number.isFinite(selected) && selected > 0 ? selected : null;
  }, [promotionTargetAcademicYearId]);

  const promotionSelectionValid =
    !!effectivePromotionSourceAcademicYearId &&
    !!effectivePromotionTargetAcademicYearId &&
    effectivePromotionSourceAcademicYearId !== effectivePromotionTargetAcademicYearId;

  const academicFeatureFlags: AdminAcademicFeatureFlags | undefined = academicFeatureFlagsQuery.data;
  const isPromotionFeatureEnabled = academicFeatureFlags?.academicPromotionV2Enabled === true;
  const isRolloverFeatureEnabled = academicFeatureFlags?.academicYearRolloverEnabled === true;

  const promotionWorkspaceQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-promotion-workspace',
      effectivePromotionSourceAcademicYearId,
      effectivePromotionTargetAcademicYearId,
    ],
    enabled: promotionSelectionValid && isPromotionFeatureEnabled,
    queryFn: async () =>
      adminApi.getAcademicPromotionWorkspace(
        effectivePromotionSourceAcademicYearId as number,
        effectivePromotionTargetAcademicYearId as number,
      ),
  });
  const rolloverWorkspaceQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-rollover-workspace',
      effectivePromotionSourceAcademicYearId,
      effectivePromotionTargetAcademicYearId,
    ],
    enabled: promotionSelectionValid && isRolloverFeatureEnabled,
    queryFn: async () =>
      adminApi.getAcademicYearRolloverWorkspace(
        effectivePromotionSourceAcademicYearId as number,
        effectivePromotionTargetAcademicYearId as number,
      ),
  });
  const rolloverWorkspace = rolloverWorkspaceQuery.data;
  const rolloverComponentEntries = rolloverWorkspace
    ? ([
        ['classPreparation', rolloverWorkspace.components.classPreparation],
        ['teacherAssignments', rolloverWorkspace.components.teacherAssignments],
        ['scheduleTimeConfig', rolloverWorkspace.components.scheduleTimeConfig],
        ['academicEvents', rolloverWorkspace.components.academicEvents],
        ['reportDates', rolloverWorkspace.components.reportDates],
        ['subjectKkms', rolloverWorkspace.components.subjectKkms],
        ['examGradeComponents', rolloverWorkspace.components.examGradeComponents],
        ['examProgramConfigs', rolloverWorkspace.components.examProgramConfigs],
        ['examProgramSessions', rolloverWorkspace.components.examProgramSessions],
      ] as const)
    : [];
  const rolloverStatCards = rolloverWorkspace
    ? [
        {
          key: 'stat-classPreparation',
          title: 'Kelas Target',
          value: String(rolloverWorkspace.components.classPreparation.summary.createCount || 0),
          subtitle: 'XI/XII yang perlu dibuat',
        },
        {
          key: 'stat-teacherAssignments',
          title: 'Assignment Baru',
          value: String(rolloverWorkspace.components.teacherAssignments.summary.createCount || 0),
          subtitle: 'Guru-mapel target',
        },
        {
          key: 'stat-reportDates',
          title: 'Tanggal Rapor',
          value: String(rolloverWorkspace.components.reportDates.summary.createCount || 0),
          subtitle: 'Tanggal rapor tahunan',
        },
        {
          key: 'stat-subjectKkms',
          title: 'KKM Tahunan',
          value: String(rolloverWorkspace.components.subjectKkms.summary.createCount || 0),
          subtitle: 'KKM year-scoped baru',
        },
        {
          key: 'stat-examGradeComponents',
          title: 'Komponen Nilai',
          value: String(rolloverWorkspace.components.examGradeComponents.summary.createCount || 0),
          subtitle: 'Komponen ujian baru',
        },
        {
          key: 'stat-examProgramConfigs',
          title: 'Program Ujian',
          value: String(rolloverWorkspace.components.examProgramConfigs.summary.createCount || 0),
          subtitle: 'Program target baru',
        },
        {
          key: 'stat-examProgramSessions',
          title: 'Sesi Program',
          value: String(rolloverWorkspace.components.examProgramSessions.summary.createCount || 0),
          subtitle: 'Sesi ujian baru',
        },
        {
          key: 'stat-scheduleTimeConfig',
          title: 'Jam Jadwal',
          value: String(rolloverWorkspace.components.scheduleTimeConfig.summary.createCount || 0),
          subtitle: 'Buat jika target kosong',
        },
        {
          key: 'stat-academicEvents',
          title: 'Kalender',
          value: String(rolloverWorkspace.components.academicEvents.summary.createCount || 0),
          subtitle: 'Event yang bisa di-clone',
        },
      ]
    : [];

  useEffect(() => {
    if (!promotionWorkspaceQuery.data) return;
    const nextDrafts: Record<number, number | null> = {};
    promotionWorkspaceQuery.data.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] = item.targetClassId ?? null;
    });
    setPromotionMappingDrafts(nextDrafts);
  }, [promotionWorkspaceQuery.data]);

  const effectiveCalendarAcademicYearId = useMemo(() => {
    const selected = Number(calendarAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  }, [calendarAcademicYearId, academicQuery.data?.activeYear?.id, academicQuery.data?.years.items]);

  const academicEventsQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-events',
      effectiveCalendarAcademicYearId,
      calendarSemesterFilter,
      calendarTypeFilter,
    ],
    enabled: !!effectiveCalendarAcademicYearId,
    queryFn: async () =>
      adminApi.listAcademicEvents({
        academicYearId: effectiveCalendarAcademicYearId as number,
        semester: calendarSemesterFilter === 'ALL' ? undefined : calendarSemesterFilter,
        type: calendarTypeFilter === 'ALL' ? undefined : calendarTypeFilter,
      }),
  });

  const effectiveOperationalAcademicYearId = (() => {
    const selected = Number(operationalAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  })();

  const operationalClassesQuery = useQuery({
    queryKey: ['mobile-admin-academic-operational-classes', effectiveOperationalAcademicYearId],
    enabled: !!effectiveOperationalAcademicYearId,
    queryFn: async () =>
      adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: effectiveOperationalAcademicYearId as number,
      }),
  });

  const lateSummaryByClassQuery = useQuery({
    queryKey: ['mobile-admin-academic-late-summary', attendanceClassId, effectiveOperationalAcademicYearId],
    enabled: !!attendanceClassId && !!effectiveOperationalAcademicYearId,
    queryFn: async () =>
      adminApi.getLateSummaryByClass({
        classId: Number(attendanceClassId),
        academicYearId: effectiveOperationalAcademicYearId || undefined,
      }),
  });

  const dailyAttendanceRecapQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-daily-attendance-recap',
      attendanceClassId,
      effectiveOperationalAcademicYearId,
      attendanceSemesterFilter,
    ],
    enabled: !!attendanceClassId && !!effectiveOperationalAcademicYearId,
    queryFn: async () =>
      adminApi.getDailyAttendanceRecap({
        classId: Number(attendanceClassId),
        academicYearId: effectiveOperationalAcademicYearId || undefined,
        semester: attendanceSemesterFilter,
      }),
  });

  const classReportSummaryQuery = useQuery({
    queryKey: ['mobile-admin-academic-class-report', reportClassId, effectiveOperationalAcademicYearId],
    enabled: !!reportClassId && !!effectiveOperationalAcademicYearId,
    queryFn: async () =>
      adminApi.getClassReportSummary({
        classId: Number(reportClassId),
        academicYearId: effectiveOperationalAcademicYearId || undefined,
      }),
  });

  const classRankingQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-class-rankings',
      reportClassId,
      effectiveOperationalAcademicYearId,
      reportSemesterFilter,
    ],
    enabled: !!reportClassId && !!effectiveOperationalAcademicYearId && !!reportSemesterFilter,
    queryFn: async () =>
      adminApi.getClassRankings({
        classId: Number(reportClassId),
        academicYearId: effectiveOperationalAcademicYearId || undefined,
        semester: reportSemesterFilter as 'ODD' | 'EVEN',
      }),
  });

  const effectiveQuestionBankAcademicYearId = useMemo(() => {
    const selected = Number(questionBankAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  }, [questionBankAcademicYearId, academicQuery.data?.activeYear?.id, academicQuery.data?.years.items]);

  const questionBankQuery = useQuery({
    queryKey: [
      'mobile-admin-academic-question-bank',
      effectiveQuestionBankAcademicYearId,
      questionBankSubjectId,
      questionBankTypeFilter,
      questionBankSemesterFilter,
      questionBankSearch,
      questionBankPage,
    ],
    enabled: !!effectiveQuestionBankAcademicYearId,
    queryFn: async () =>
      adminApi.listExamQuestions({
        page: questionBankPage,
        limit: 20,
        academicYearId: effectiveQuestionBankAcademicYearId as number,
        subjectId: questionBankSubjectId ? Number(questionBankSubjectId) : undefined,
        type: questionBankTypeFilter || undefined,
        semester: questionBankSemesterFilter || undefined,
        search: questionBankSearch.trim() || undefined,
      }),
  });

  useEffect(() => {
    if (questionBankPage === 1) return;
    const timerId = setTimeout(() => {
      setQuestionBankPage(1);
    }, 0);
    return () => {
      clearTimeout(timerId);
    };
  }, [
    effectiveQuestionBankAcademicYearId,
    questionBankSubjectId,
    questionBankTypeFilter,
    questionBankSemesterFilter,
    questionBankSearch,
    questionBankPage,
  ]);

  const effectiveExamSessionAcademicYearId = (() => {
    const selected = Number(examSessionAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  })();

  const examSessionClassesQuery = useQuery({
    queryKey: ['mobile-admin-exam-session-classes', effectiveExamSessionAcademicYearId],
    enabled: !!effectiveExamSessionAcademicYearId,
    queryFn: async () =>
      adminApi.listClasses({
        page: 1,
        limit: 400,
        academicYearId: effectiveExamSessionAcademicYearId as number,
      }),
  });

  const examSessionPacketsQuery = useQuery({
    queryKey: ['mobile-admin-exam-session-packets', effectiveExamSessionAcademicYearId],
    enabled: !!effectiveExamSessionAcademicYearId,
    queryFn: async () =>
      adminApi.listExamPackets({
        academicYearId: effectiveExamSessionAcademicYearId as number,
      }),
  });

  const examSessionSchedulesQuery = useQuery({
    queryKey: ['mobile-admin-exam-session-list', effectiveExamSessionAcademicYearId],
    enabled: !!effectiveExamSessionAcademicYearId,
    queryFn: async () =>
      adminApi.listExamSchedules({
        academicYearId: effectiveExamSessionAcademicYearId as number,
      }),
  });

  const examSessionClasses = useMemo(() => examSessionClassesQuery.data?.items || [], [examSessionClassesQuery.data?.items]);
  const filteredExamSessionClassOptions = useMemo(() => {
    const q = examSessionClassSearch.trim().toLowerCase();
    if (!q) return examSessionClasses.slice(0, 200);
    return examSessionClasses
      .filter((item) => `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''}`.toLowerCase().includes(q))
      .slice(0, 240);
  }, [examSessionClassSearch, examSessionClasses]);

  const examSessionPackets = useMemo(() => examSessionPacketsQuery.data || [], [examSessionPacketsQuery.data]);
  const filteredExamSessionPacketOptions = useMemo(() => {
    let packets = [...examSessionPackets];
    if (examSessionTypeFilter !== 'ALL') {
      packets = packets.filter((item) => item.type === examSessionTypeFilter);
    }
    return packets
      .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'id'))
      .slice(0, 240);
  }, [examSessionPackets, examSessionTypeFilter]);

  const filteredExamSessions = useMemo(() => {
    let items = [...(examSessionSchedulesQuery.data || [])];
    if (effectiveExamSessionAcademicYearId) {
      items = items.filter((item) => {
        const ayId = item.academicYear?.id;
        if (typeof ayId === 'number') return ayId === effectiveExamSessionAcademicYearId;
        return true;
      });
    }
    if (examSessionTypeFilter !== 'ALL') {
      items = items.filter((item) => item.packet?.type === examSessionTypeFilter);
    }
    const q = examSessionSearch.trim().toLowerCase();
    if (q) {
      items = items.filter((item) =>
        `${item.packet?.title || ''} ${item.class?.name || ''} ${item.packet?.subject?.name || ''} ${item.packet?.subject?.code || ''}`
          .toLowerCase()
          .includes(q),
      );
    }
    return items.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [
    examSessionSchedulesQuery.data,
    effectiveExamSessionAcademicYearId,
    examSessionTypeFilter,
    examSessionSearch,
  ]);

  useEffect(() => {
    if (!examSessionPacketId) return;
    const exists = examSessionPackets.some((item) => item.id === Number(examSessionPacketId));
    if (!exists) {
      const timerId = setTimeout(() => setExamSessionPacketId(''), 0);
      return () => clearTimeout(timerId);
    }
  }, [examSessionPacketId, examSessionPackets]);

  useEffect(() => {
    if (!examSessionSelectedClassIds.length) return;
    const validSet = new Set(examSessionClasses.map((item) => item.id));
    const next = examSessionSelectedClassIds.filter((id) => validSet.has(id));
    if (next.length !== examSessionSelectedClassIds.length) {
      const timerId = setTimeout(() => setExamSessionSelectedClassIds(next), 0);
      return () => clearTimeout(timerId);
    }
  }, [examSessionClasses, examSessionSelectedClassIds]);

  const effectiveScheduleAcademicYearId = (() => {
    const selected = Number(scheduleAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  })();

  const scheduleClassesQuery = useQuery({
    queryKey: ['mobile-admin-schedule-classes', effectiveScheduleAcademicYearId],
    enabled: !!effectiveScheduleAcademicYearId,
    queryFn: async () =>
      adminApi.listClasses({
        page: 1,
        limit: 400,
        academicYearId: effectiveScheduleAcademicYearId as number,
      }),
  });

  const scheduleAssignmentsQuery = useQuery({
    queryKey: ['mobile-admin-schedule-assignments', effectiveScheduleAcademicYearId],
    enabled: !!effectiveScheduleAcademicYearId,
    queryFn: async () =>
      adminApi.listTeacherAssignments({
        academicYearId: effectiveScheduleAcademicYearId as number,
        page: 1,
        limit: 1000,
      }),
  });

  const scheduleClasses = useMemo(() => scheduleClassesQuery.data?.items || [], [scheduleClassesQuery.data?.items]);
  const filteredScheduleClassOptions = useMemo(() => {
    const q = scheduleClassSearch.trim().toLowerCase();
    if (!q) return scheduleClasses.slice(0, 120);
    return scheduleClasses
      .filter((item) => `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [scheduleClassSearch, scheduleClasses]);

  const effectiveScheduleClassId = useMemo(() => {
    const selected = Number(scheduleClassId);
    if (!Number.isFinite(selected) || selected <= 0) return null;
    const exists = scheduleClasses.some((item) => item.id === selected);
    return exists ? selected : null;
  }, [scheduleClassId, scheduleClasses]);

  const scheduleEntriesQuery = useQuery({
    queryKey: ['mobile-admin-schedule-entries', effectiveScheduleAcademicYearId, effectiveScheduleClassId],
    enabled: !!effectiveScheduleAcademicYearId && !!effectiveScheduleClassId,
    queryFn: async () =>
      adminApi.listSchedules({
        academicYearId: effectiveScheduleAcademicYearId as number,
        classId: effectiveScheduleClassId as number,
      }),
  });

  const scheduleConfigQuery = useQuery({
    queryKey: ['mobile-admin-schedule-time-config', effectiveScheduleAcademicYearId],
    enabled: !!effectiveScheduleAcademicYearId,
    queryFn: async () => adminApi.getScheduleTimeConfig(effectiveScheduleAcademicYearId as number),
  });

  const scheduleEntries = useMemo(() => scheduleEntriesQuery.data || [], [scheduleEntriesQuery.data]);
  const scheduleAssignments = useMemo(
    () => scheduleAssignmentsQuery.data?.items || [],
    [scheduleAssignmentsQuery.data?.items],
  );
  const scheduleClassAssignments = useMemo(
    () => scheduleAssignments.filter((item) => item.class?.id === effectiveScheduleClassId),
    [scheduleAssignments, effectiveScheduleClassId],
  );
  const filteredScheduleClassAssignments = useMemo(() => {
    const q = scheduleAssignmentSearch.trim().toLowerCase();
    if (!q) return scheduleClassAssignments;
    return scheduleClassAssignments.filter((item) =>
      `${item.subject?.code || ''} ${item.subject?.name || ''} ${item.teacher?.name || ''}`.toLowerCase().includes(q),
    );
  }, [scheduleAssignmentSearch, scheduleClassAssignments]);

  useEffect(() => {
    if (!effectiveScheduleClassId && scheduleClassId) {
      const timerId = setTimeout(() => setScheduleClassId(''), 0);
      return () => clearTimeout(timerId);
    }
  }, [effectiveScheduleClassId, scheduleClassId]);

  useEffect(() => {
    if (!scheduleFormAssignmentId) return;
    const exists = scheduleClassAssignments.some((item) => item.id === Number(scheduleFormAssignmentId));
    if (!exists) {
      const timerId = setTimeout(() => setScheduleFormAssignmentId(''), 0);
      return () => clearTimeout(timerId);
    }
  }, [scheduleClassAssignments, scheduleFormAssignmentId]);

  useEffect(() => {
    if (!effectiveScheduleAcademicYearId) return;
    if (!scheduleConfigQuery.isFetched) return;

    const config = scheduleConfigQuery.data?.config;
    if (!config) {
      const defaultTimes = buildScheduleDefaultPeriodTimes();
      const defaultNotes = buildScheduleDefaultPeriodNotes();
      const timerId = setTimeout(() => {
        setSchedulePeriodTimes(defaultTimes);
        setSchedulePeriodNotes(defaultNotes);
        setSchedulePeriodTypes(buildScheduleDefaultPeriodTypes({ periodTimes: defaultTimes, periodNotes: defaultNotes }));
      }, 0);
      return () => clearTimeout(timerId);
    }

    const nextTimes = clonePeriodStringMap(config.periodTimes || {});
    const nextNotes = clonePeriodStringMap(config.periodNotes || {});
    const nextTypes = config.periodTypes
      ? clonePeriodTypeMap(config.periodTypes as Record<string, Record<number, SchedulePeriodType>>)
      : buildScheduleDefaultPeriodTypes({ periodTimes: nextTimes, periodNotes: nextNotes });

    const finalTimes = Object.keys(nextTimes).length ? nextTimes : buildScheduleDefaultPeriodTimes();
    const finalNotes = Object.keys(nextNotes).length ? nextNotes : buildScheduleDefaultPeriodNotes();
    const finalTypes = Object.keys(nextTypes).length
      ? nextTypes
      : buildScheduleDefaultPeriodTypes({
          periodTimes: finalTimes,
          periodNotes: finalNotes,
        });

    const timerId = setTimeout(() => {
      setSchedulePeriodTimes(finalTimes);
      setSchedulePeriodNotes(finalNotes);
      setSchedulePeriodTypes(finalTypes);
    }, 0);
    return () => clearTimeout(timerId);
  }, [effectiveScheduleAcademicYearId, scheduleConfigQuery.data, scheduleConfigQuery.isFetched]);

  const scheduleDays = useMemo(() => {
    const fromConfig = Object.keys(schedulePeriodTimes) as ScheduleDay[];
    const fromEntries = Array.from(new Set(scheduleEntries.map((entry) => entry.dayOfWeek))) as ScheduleDay[];
    const daySet = new Set<ScheduleDay>();
    SCHEDULE_ALL_DAYS.forEach((day) => {
      if (fromConfig.includes(day) || fromEntries.includes(day)) {
        daySet.add(day);
      }
    });
    const ordered = SCHEDULE_ALL_DAYS.filter((day) => daySet.has(day));
    return ordered.length ? ordered : SCHEDULE_DAY_ORDER;
  }, [scheduleEntries, schedulePeriodTimes]);

  useEffect(() => {
    if (!scheduleDays.includes(scheduleEditingDay)) {
      const timerId = setTimeout(() => setScheduleEditingDay(scheduleDays[0] || 'MONDAY'), 0);
      return () => clearTimeout(timerId);
    }
  }, [scheduleDays, scheduleEditingDay]);

  const scheduleMaxPeriod = useMemo(() => {
    const maxFromConfig = Object.keys(schedulePeriodTimes).reduce((max, dayKey) => {
      const periods = Object.keys(schedulePeriodTimes[dayKey] || {}).map(Number);
      if (!periods.length) return max;
      const dayMax = Math.max(...periods);
      return dayMax > max ? dayMax : max;
    }, 0);
    const maxFromEntries = scheduleEntries.reduce(
      (max, entry) => (entry.period > max ? entry.period : max),
      0,
    );
    return Math.max(1, maxFromConfig, maxFromEntries);
  }, [scheduleEntries, schedulePeriodTimes]);

  const isScheduleNonTeachingPeriod = (day: ScheduleDay, period: number) => {
    const explicitType = String(schedulePeriodTypes[day]?.[period] || '').toUpperCase();
    if (explicitType === 'TEACHING') return false;
    if (explicitType === 'UPACARA' || explicitType === 'ISTIRAHAT' || explicitType === 'TADARUS' || explicitType === 'OTHER') {
      return true;
    }
    return inferPeriodTypeFromNote(schedulePeriodNotes[day]?.[period]) !== 'TEACHING';
  };

  const getScheduleTeachingHour = (day: ScheduleDay, period: number) => {
    if (isScheduleNonTeachingPeriod(day, period)) return null;
    let counter = 0;
    for (let p = 1; p <= period; p += 1) {
      if (!isScheduleNonTeachingPeriod(day, p)) counter += 1;
    }
    return counter || null;
  };

  const getSchedulePeriodFromTeachingHour = (day: ScheduleDay, teachingHour: number) => {
    if (teachingHour <= 0) return null;
    let counter = 0;
    for (let period = 1; period <= scheduleMaxPeriod + 10; period += 1) {
      if (!isScheduleNonTeachingPeriod(day, period)) {
        counter += 1;
      }
      if (counter === teachingHour) {
        return period;
      }
    }
    return null;
  };

  const scheduleEntryMap = useMemo(() => {
    const map = new Map<string, (typeof scheduleEntries)[number]>();
    scheduleEntries.forEach((entry) => {
      const key = `${entry.dayOfWeek}-${entry.period}`;
      if (!map.has(key)) {
        map.set(key, entry);
      }
    });
    return map;
  }, [scheduleEntries]);

  const saveScheduleConfigMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveScheduleAcademicYearId) throw new Error('Tahun ajaran jadwal belum dipilih.');
      const payload: AdminScheduleTimeConfigPayload = {
        periodTimes: schedulePeriodTimes,
        periodNotes: schedulePeriodNotes,
        periodTypes: schedulePeriodTypes,
      };
      return adminApi.saveScheduleTimeConfig({
        academicYearId: effectiveScheduleAcademicYearId,
        config: payload,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-schedule-time-config'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-schedule-entries'] });
      notifySuccess('Konfigurasi waktu jadwal berhasil disimpan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan konfigurasi waktu jadwal.');
    },
  });

  const createScheduleEntryMutation = useMutation({
    mutationFn: async (payload: {
      academicYearId: number;
      classId: number;
      teacherAssignmentId: number;
      dayOfWeek: ScheduleDay;
      period: number;
      room?: string | null;
    }) => adminApi.createScheduleEntry(payload),
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menambah entri jadwal.');
    },
  });

  const deleteScheduleEntryMutation = useMutation({
    mutationFn: async (entryId: number) => adminApi.deleteScheduleEntry(entryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-schedule-entries'] });
      notifySuccess('Entri jadwal berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus entri jadwal.');
    },
  });

  const createExamSessionMutation = useMutation({
    mutationFn: async (payload: {
      packetId: number;
      classIds: number[];
      startTime: string;
      endTime: string;
      proctorId?: number;
      room?: string | null;
    }) => adminApi.createExamSchedule(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-exam-session-list'] });
      notifySuccess('Sesi ujian berhasil dibuat.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal membuat sesi ujian.');
    },
  });

  const deleteExamSessionMutation = useMutation({
    mutationFn: async (scheduleId: number) => adminApi.deleteExamSchedule(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-exam-session-list'] });
      notifySuccess('Sesi ujian berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus sesi ujian.');
    },
  });

  const updateExamSessionMutation = useMutation({
    mutationFn: async (payload: { id: number; isActive: boolean }) =>
      adminApi.updateExamSchedule(payload.id, { isActive: payload.isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-exam-session-list'] });
      notifySuccess('Status sesi ujian berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui status sesi ujian.');
    },
  });

  const effectiveTeachingLoadAcademicYearId = (() => {
    const selected = Number(teachingLoadAcademicYearId);
    if (Number.isFinite(selected) && selected > 0) {
      return selected;
    }
    if (academicQuery.data?.activeYear?.id) {
      return academicQuery.data.activeYear.id;
    }
    return academicQuery.data?.years.items?.[0]?.id || null;
  })();

  const teachingLoadAssignmentsQuery = useQuery({
    queryKey: ['mobile-admin-teaching-load-assignments', effectiveTeachingLoadAcademicYearId],
    enabled: !!effectiveTeachingLoadAcademicYearId,
    queryFn: async () =>
      adminApi.listTeacherAssignments({
        academicYearId: effectiveTeachingLoadAcademicYearId as number,
        page: 1,
        limit: 1200,
      }),
  });

  const teachingLoadTeacherOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string; username: string }>();
    (teachingLoadAssignmentsQuery.data?.items || []).forEach((item) => {
      const teacherId = item.teacher?.id;
      if (!teacherId || map.has(teacherId)) return;
      map.set(teacherId, {
        id: teacherId,
        name: item.teacher?.name || '-',
        username: item.teacher?.username || '-',
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  }, [teachingLoadAssignmentsQuery.data?.items]);

  const filteredTeachingLoadTeacherOptions = useMemo(() => {
    const q = teachingLoadTeacherSearch.trim().toLowerCase();
    if (!q) return teachingLoadTeacherOptions.slice(0, 200);
    return teachingLoadTeacherOptions
      .filter((item) => `${item.name} ${item.username}`.toLowerCase().includes(q))
      .slice(0, 200);
  }, [teachingLoadTeacherOptions, teachingLoadTeacherSearch]);

  const effectiveTeachingLoadTeacherId = useMemo(() => {
    const selected = Number(teachingLoadTeacherId);
    if (!Number.isFinite(selected) || selected <= 0) return null;
    return teachingLoadTeacherOptions.some((item) => item.id === selected) ? selected : null;
  }, [teachingLoadTeacherId, teachingLoadTeacherOptions]);

  useEffect(() => {
    if (teachingLoadTeacherId && !effectiveTeachingLoadTeacherId) {
      const timerId = setTimeout(() => setTeachingLoadTeacherId(''), 0);
      return () => clearTimeout(timerId);
    }
  }, [effectiveTeachingLoadTeacherId, teachingLoadTeacherId]);

  const teachingLoadSummaryQuery = useQuery({
    queryKey: [
      'mobile-admin-teaching-load-summary',
      effectiveTeachingLoadAcademicYearId,
      effectiveTeachingLoadTeacherId,
    ],
    enabled: !!effectiveTeachingLoadAcademicYearId,
    queryFn: async () =>
      adminApi.getTeachingLoadSummary({
        academicYearId: effectiveTeachingLoadAcademicYearId as number,
        teacherId: effectiveTeachingLoadTeacherId || undefined,
      }),
  });

  const teachingLoadSummary = useMemo(() => teachingLoadSummaryQuery.data || [], [teachingLoadSummaryQuery.data]);
  const teachingLoadTotals = useMemo(() => {
    const totalTeachers = teachingLoadSummary.length;
    const totalSessions = teachingLoadSummary.reduce(
      (sum, item) => sum + Number(item.totalSessions || 0),
      0,
    );
    const totalHours = teachingLoadSummary.reduce((sum, item) => sum + Number(item.totalHours || 0), 0);
    const averageHours = totalTeachers > 0 ? totalHours / totalTeachers : 0;
    return { totalTeachers, totalSessions, totalHours, averageHours };
  }, [teachingLoadSummary]);

  const activateYearMutation = useMutation({
    mutationFn: async (yearId: number) => adminApi.activateAcademicYear(yearId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Tahun ajaran berhasil diaktifkan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengaktifkan tahun ajaran.');
    },
  });

  const savePromotionMappingsMutation = useMutation({
    mutationFn: async () => {
      if (!promotionWorkspaceQuery.data || !effectivePromotionSourceAcademicYearId || !effectivePromotionTargetAcademicYearId) {
        throw new Error('Workspace promotion belum tersedia.');
      }
      return adminApi.saveAcademicPromotionMappings(effectivePromotionSourceAcademicYearId, {
        targetAcademicYearId: effectivePromotionTargetAcademicYearId,
        mappings: promotionWorkspaceQuery.data.classes.map((item) => ({
          sourceClassId: item.sourceClassId,
          targetClassId:
            item.action === 'GRADUATE'
              ? null
              : getPromotionResolvedTargetClassId(item, promotionMappingDrafts),
        })),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Mapping promotion berhasil disimpan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan mapping promotion.');
    },
  });

  const commitPromotionMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePromotionSourceAcademicYearId || !effectivePromotionTargetAcademicYearId) {
        throw new Error('Tahun sumber/target promotion belum valid.');
      }
      return adminApi.commitAcademicPromotion(effectivePromotionSourceAcademicYearId, {
        targetAcademicYearId: effectivePromotionTargetAcademicYearId,
        activateTargetYear: activateTargetYearAfterCommit,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Promotion berhasil di-commit.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal commit promotion.');
    },
  });

  const rollbackPromotionMutation = useMutation({
    mutationFn: async (runId: number) => {
      if (!effectivePromotionSourceAcademicYearId) {
        throw new Error('Tahun sumber promotion belum valid.');
      }
      return adminApi.rollbackAcademicPromotionRun(effectivePromotionSourceAcademicYearId, runId);
    },
    onSuccess: async (result: AdminAcademicPromotionRollbackResult | undefined) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess(`Run #${result?.run.id || '-'} berhasil di-rollback.`);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal rollback promotion.');
    },
  });

  const createAcademicYearMutation = useMutation({
    mutationFn: async () =>
      // PKL eligible grades are managed in Humas settings, not in admin academic-year form.
      adminApi.createAcademicYear({
        name: academicYearForm.name.trim(),
        semester1Start: academicYearForm.semester1Start,
        semester1End: academicYearForm.semester1End,
        semester2Start: academicYearForm.semester2Start,
        semester2End: academicYearForm.semester2End,
      }),
    onSuccess: async () => {
      resetAcademicYearForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Tahun ajaran berhasil dibuat.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal membuat tahun ajaran.');
    },
  });

  const createRolloverTargetMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePromotionSourceAcademicYearId) {
        throw new Error('Tahun sumber rollover belum valid.');
      }
      return adminApi.createAcademicYearRolloverTarget(effectivePromotionSourceAcademicYearId);
    },
    onSuccess: async (result) => {
      if (result?.targetAcademicYear?.id) {
        setPromotionTargetAcademicYearId(String(result.targetAcademicYear.id));
      }
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-rollover-workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess(
        result?.created
          ? `Draft ${result.targetAcademicYear.name} berhasil dibuat.`
          : `Draft ${result?.targetAcademicYear?.name || 'target year'} sudah tersedia.`,
      );
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyiapkan draft tahun ajaran target.');
    },
  });

  const applyRolloverMutation = useMutation({
    mutationFn: async () => {
      if (!effectivePromotionSourceAcademicYearId || !effectivePromotionTargetAcademicYearId) {
        throw new Error('Tahun sumber/target rollover belum valid.');
      }
      return adminApi.applyAcademicYearRollover(effectivePromotionSourceAcademicYearId, {
        targetAcademicYearId: effectivePromotionTargetAcademicYearId,
        components: rolloverSelectedComponents,
      });
    },
    onSuccess: async (result: AdminAcademicYearRolloverApplyResult | undefined) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-rollover-workspace'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess(
        `Setup tahunan diterapkan. Kelas ${result?.applied.classPreparation.created || 0}, wali ikut ${result?.applied.classPreparation.homeroomCarriedOnCreate || 0}, isi target kosong ${result?.applied.classPreparation.homeroomFilledExisting || 0}, assignment ${result?.applied.teacherAssignments.created || 0}, tanggal rapor ${result?.applied.reportDates.created || 0}, KKM ${result?.applied.subjectKkms.created || 0}, program ujian ${result?.applied.examProgramConfigs.created || 0}.`,
      );
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menerapkan setup tahun ajaran.');
    },
  });

  const updateAcademicYearMutation = useMutation({
    mutationFn: async () => {
      if (!editingAcademicYearId) throw new Error('ID tahun ajaran tidak valid.');
      // Keep update payload focused on academic year timeline fields only.
      return adminApi.updateAcademicYear(editingAcademicYearId, {
        name: academicYearForm.name.trim(),
        semester1Start: academicYearForm.semester1Start,
        semester1End: academicYearForm.semester1End,
        semester2Start: academicYearForm.semester2Start,
        semester2End: academicYearForm.semester2End,
      });
    },
    onSuccess: async () => {
      resetAcademicYearForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Tahun ajaran berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui tahun ajaran.');
    },
  });

  const deleteAcademicYearMutation = useMutation({
    mutationFn: async (yearId: number) => adminApi.deleteAcademicYear(yearId),
    onSuccess: async () => {
      resetAcademicYearForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-promotion-workspace'] });
      notifySuccess('Tahun ajaran berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus tahun ajaran.');
    },
  });

  const createAcademicEventMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveCalendarAcademicYearId) throw new Error('Tahun ajaran kalender belum dipilih.');
      return adminApi.createAcademicEvent({
        academicYearId: effectiveCalendarAcademicYearId,
        title: academicEventForm.title.trim(),
        type: academicEventForm.type,
        startDate: academicEventForm.startDate,
        endDate: academicEventForm.endDate,
        semester: academicEventForm.semester || null,
        isHoliday: academicEventForm.isHoliday,
        description: academicEventForm.description.trim() || null,
      });
    },
    onSuccess: async () => {
      resetAcademicEventForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-events'] });
      notifySuccess('Event kalender akademik berhasil dibuat.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal membuat event kalender akademik.');
    },
  });

  const updateAcademicEventMutation = useMutation({
    mutationFn: async () => {
      if (!editingAcademicEventId) throw new Error('Event kalender akademik tidak valid.');
      return adminApi.updateAcademicEvent(editingAcademicEventId, {
        title: academicEventForm.title.trim(),
        type: academicEventForm.type,
        startDate: academicEventForm.startDate,
        endDate: academicEventForm.endDate,
        semester: academicEventForm.semester || null,
        isHoliday: academicEventForm.isHoliday,
        description: academicEventForm.description.trim() || null,
      });
    },
    onSuccess: async () => {
      resetAcademicEventForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-events'] });
      notifySuccess('Event kalender akademik berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal memperbarui event kalender akademik.');
    },
  });

  const deleteAcademicEventMutation = useMutation({
    mutationFn: async (eventId: number) => adminApi.deleteAcademicEvent(eventId),
    onSuccess: async () => {
      resetAcademicEventForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-events'] });
      notifySuccess('Event kalender akademik berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus event kalender akademik.');
    },
  });

  const upsertAssignmentMutation = useMutation({
    mutationFn: async () => {
      const academicYearId = academicQuery.data?.activeYear?.id;
      if (!academicYearId) throw new Error('Tahun ajaran aktif tidak tersedia.');
      if (!assignmentTeacherId) throw new Error('Pilih guru terlebih dahulu.');
      if (!assignmentSubjectId) throw new Error('Pilih mata pelajaran terlebih dahulu.');
      if (!assignmentSelectedClassIds.length) throw new Error('Pilih minimal satu kelas.');

      return adminApi.upsertTeacherAssignments({
        academicYearId,
        teacherId: Number(assignmentTeacherId),
        subjectId: Number(assignmentSubjectId),
        classIds: assignmentSelectedClassIds,
      });
    },
    onSuccess: async () => {
      resetAssignmentForm();
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      notifySuccess('Assignment guru berhasil disimpan.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan assignment guru.');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: async (assignmentId: number) => adminApi.deleteTeacherAssignment(assignmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-academic-overview'] });
      notifySuccess('Assignment guru berhasil dihapus.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menghapus assignment guru.');
    },
  });

  const handleActivateYear = (yearId: number, name: string) => {
    Alert.alert(
      'Konfirmasi',
      `Aktifkan tahun ajaran "${name}"?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Aktifkan',
          style: 'default',
          onPress: () => {
            activateYearMutation.mutate(yearId);
          },
        },
      ],
    );
  };

  const resetAcademicYearForm = () => {
    setEditingAcademicYearId(null);
    setAcademicYearForm({
      name: '',
      semester1Start: '',
      semester1End: '',
      semester2Start: '',
      semester2End: '',
    });
  };

  const handleEditAcademicYear = (year: {
    id: number;
    name: string;
    semester1Start: string;
    semester1End: string;
    semester2Start: string;
    semester2End: string;
  }) => {
    setEditingAcademicYearId(year.id);
    setAcademicYearForm({
      name: year.name,
      semester1Start: toDateInput(year.semester1Start),
      semester1End: toDateInput(year.semester1End),
      semester2Start: toDateInput(year.semester2Start),
      semester2End: toDateInput(year.semester2End),
    });
    openSection('academic-years');
  };

  const handleDeleteAcademicYear = (year: { id: number; name: string }) => {
    Alert.alert('Hapus Tahun Ajaran', `Hapus tahun ajaran "${year.name}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteAcademicYearMutation.mutate(year.id);
        },
      },
    ]);
  };

  const handleSubmitAcademicYear = () => {
    const payload = {
      name: academicYearForm.name.trim(),
      semester1Start: academicYearForm.semester1Start.trim(),
      semester1End: academicYearForm.semester1End.trim(),
      semester2Start: academicYearForm.semester2Start.trim(),
      semester2End: academicYearForm.semester2End.trim(),
    };

    if (!payload.name) {
      notifyInfo('Nama tahun ajaran wajib diisi.');
      return;
    }
    if (!payload.semester1Start || !payload.semester1End || !payload.semester2Start || !payload.semester2End) {
      notifyInfo('Semua tanggal semester wajib diisi (format YYYY-MM-DD).');
      return;
    }

    if (editingAcademicYearId) {
      updateAcademicYearMutation.mutate();
      return;
    }
    createAcademicYearMutation.mutate();
  };

  const resetPromotionDraftsToSuggested = () => {
    if (!promotionWorkspaceQuery.data) return;
    const nextDrafts: Record<number, number | null> = {};
    promotionWorkspaceQuery.data.classes.forEach((item) => {
      nextDrafts[item.sourceClassId] = item.action === 'GRADUATE' ? null : item.suggestedTargetClassId ?? null;
    });
    setPromotionMappingDrafts(nextDrafts);
  };

  const toggleRolloverComponent = (key: keyof AdminAcademicYearRolloverComponentSelection) => {
    setRolloverSelectedComponents((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const handleCreateRolloverTarget = () => {
    if (!effectivePromotionSourceAcademicYearId) {
      notifyInfo('Pilih tahun sumber terlebih dahulu.');
      return;
    }
    createRolloverTargetMutation.mutate();
  };

  const handleApplyRollover = () => {
    if (!rolloverWorkspaceQuery.data) {
      notifyInfo('Workspace rollover belum tersedia.');
      return;
    }
    if (!rolloverWorkspaceQuery.data.validation.readyToApply) {
      notifyInfo('Masih ada issue pada workspace rollover.');
      return;
    }
    if (!Object.values(rolloverSelectedComponents).some(Boolean)) {
      notifyInfo('Pilih minimal satu komponen untuk di-clone.');
      return;
    }
    Alert.alert(
      'Apply Setup Tahunan',
      'Wizard akan membuat data target yang belum ada tanpa menimpa data target yang sudah disusun manual. Lanjutkan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Apply',
          style: 'default',
          onPress: () => {
            applyRolloverMutation.mutate();
          },
        },
      ],
    );
  };

  const handleCommitPromotion = () => {
    if (!promotionWorkspaceQuery.data) {
      notifyInfo('Workspace promotion belum tersedia.');
      return;
    }
    if (!promotionWorkspaceQuery.data.validation.readyToCommit) {
      notifyInfo('Masih ada issue blocking. Selesaikan dulu sebelum commit.');
      return;
    }
    Alert.alert(
      'Commit Promotion',
      'Perubahan siswa akan ditulis ke data aktif. Lanjutkan commit promotion?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Commit',
          style: 'default',
          onPress: () => {
            commitPromotionMutation.mutate();
          },
        },
      ],
    );
  };

  const handleRollbackPromotionRun = (runId: number, blockedReason?: string | null) => {
    if (blockedReason) {
      notifyInfo(blockedReason);
      return;
    }
    Alert.alert(
      'Rollback Promotion',
      `Rollback run #${runId}? Snapshot siswa akan dikembalikan ke state sebelum run ini.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Rollback',
          style: 'destructive',
          onPress: () => {
            rollbackPromotionMutation.mutate(runId);
          },
        },
      ],
    );
  };

  const resetAcademicEventForm = () => {
    setEditingAcademicEventId(null);
    setAcademicEventForm({
      title: '',
      type: 'LIBUR_NASIONAL',
      startDate: '',
      endDate: '',
      semester: '',
      isHoliday: false,
      description: '',
    });
  };

  const handleEditAcademicEvent = (item: {
    id: number;
    title: string;
    type: AcademicEventType;
    startDate: string;
    endDate: string;
    semester?: 'ODD' | 'EVEN' | null;
    isHoliday: boolean;
    description?: string | null;
  }) => {
    setEditingAcademicEventId(item.id);
    setAcademicEventForm({
      title: item.title || '',
      type: item.type,
      startDate: toDateInput(item.startDate),
      endDate: toDateInput(item.endDate),
      semester: item.semester || '',
      isHoliday: Boolean(item.isHoliday),
      description: item.description || '',
    });
    openSection('academic-calendar');
  };

  const handleDeleteAcademicEvent = (item: { id: number; title: string }) => {
    Alert.alert('Hapus Event Kalender', `Hapus event "${item.title}"?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteAcademicEventMutation.mutate(item.id);
        },
      },
    ]);
  };

  const handleSubmitAcademicEvent = () => {
    const payload = {
      title: academicEventForm.title.trim(),
      startDate: academicEventForm.startDate.trim(),
      endDate: academicEventForm.endDate.trim(),
    };

    if (!effectiveCalendarAcademicYearId) {
      notifyInfo('Pilih tahun ajaran untuk kalender akademik.');
      return;
    }
    if (!payload.title) {
      notifyInfo('Judul event kalender wajib diisi.');
      return;
    }
    if (!payload.startDate || !payload.endDate) {
      notifyInfo('Tanggal mulai dan selesai wajib diisi (YYYY-MM-DD).');
      return;
    }

    if (editingAcademicEventId) {
      updateAcademicEventMutation.mutate();
      return;
    }
    createAcademicEventMutation.mutate();
  };

  const operationalClasses = useMemo(() => operationalClassesQuery.data?.items || [], [operationalClassesQuery.data?.items]);
  const filteredAttendanceClassOptions = useMemo(() => {
    const q = attendanceClassSearch.trim().toLowerCase();
    if (!q) return operationalClasses.slice(0, 80);
    return operationalClasses
      .filter((item) => `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [attendanceClassSearch, operationalClasses]);
  const filteredReportClassOptions = useMemo(() => {
    const q = reportClassSearch.trim().toLowerCase();
    if (!q) return operationalClasses.slice(0, 80);
    return operationalClasses
      .filter((item) => `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''}`.toLowerCase().includes(q))
      .slice(0, 120);
  }, [reportClassSearch, operationalClasses]);
  const selectedAttendanceClass =
    operationalClasses.find((item) => String(item.id) === attendanceClassId) || null;
  const selectedReportClass =
    operationalClasses.find((item) => String(item.id) === reportClassId) || null;
  const attendanceDailyRecap = useMemo(() => dailyAttendanceRecapQuery.data?.recap || [], [dailyAttendanceRecapQuery.data?.recap]);
  const attendanceDailyTotals = useMemo(() => {
    if (!attendanceDailyRecap.length) {
      return null;
    }
    const aggregate = attendanceDailyRecap.reduce(
      (acc, item) => {
        acc.present += Number(item.present || 0);
        acc.late += Number(item.late || 0);
        acc.sick += Number(item.sick || 0);
        acc.permission += Number(item.permission || 0);
        acc.absent += Number(item.absent || 0);
        acc.total += Number(item.total || 0);
        acc.percentageSum += Number(item.percentage || 0);
        return acc;
      },
      {
        present: 0,
        late: 0,
        sick: 0,
        permission: 0,
        absent: 0,
        total: 0,
        percentageSum: 0,
      },
    );
    return {
      ...aggregate,
      averagePercentage: aggregate.percentageSum / attendanceDailyRecap.length,
    };
  }, [attendanceDailyRecap]);

  const filteredKkmSubjects = useMemo(() => {
    let items = [...(academicQuery.data?.subjects.items || [])];
    const q = kkmSearch.trim().toLowerCase();
    if (q) {
      items = items.filter((item) =>
        `${item.code} ${item.name} ${item.category?.name || ''}`.toLowerCase().includes(q),
      );
    }

    if (kkmLevelFilter !== 'ALL') {
      items = items.filter((item) =>
        (item.kkms || []).some((kkm) => kkm.classLevel === kkmLevelFilter && typeof kkm.kkm === 'number'),
      );
    }
    return items;
  }, [academicQuery.data?.subjects.items, kkmLevelFilter, kkmSearch]);
  const averageKkmByLevel = useMemo(() => {
    const bucket: Record<'X' | 'XI' | 'XII', { sum: number; count: number }> = {
      X: { sum: 0, count: 0 },
      XI: { sum: 0, count: 0 },
      XII: { sum: 0, count: 0 },
    };
    filteredKkmSubjects.forEach((subject) => {
      (subject.kkms || []).forEach((item) => {
        if (item.classLevel === 'X' || item.classLevel === 'XI' || item.classLevel === 'XII') {
          bucket[item.classLevel].sum += Number(item.kkm || 0);
          bucket[item.classLevel].count += 1;
        }
      });
    });
    return {
      X: bucket.X.count ? Math.round((bucket.X.sum / bucket.X.count) * 10) / 10 : null,
      XI: bucket.XI.count ? Math.round((bucket.XI.sum / bucket.XI.count) * 10) / 10 : null,
      XII: bucket.XII.count ? Math.round((bucket.XII.sum / bucket.XII.count) * 10) / 10 : null,
    };
  }, [filteredKkmSubjects]);

  const filteredReportSubjects = useMemo(() => {
    const q = reportSubjectSearch.trim().toLowerCase();
    const subjects = classReportSummaryQuery.data?.subjects || [];
    if (!q) return subjects;
    return subjects.filter((item) =>
      `${item.subject?.code || ''} ${item.subject?.name || ''}`.toLowerCase().includes(q),
    );
  }, [classReportSummaryQuery.data?.subjects, reportSubjectSearch]);
  const classRankingRows = useMemo(
    () =>
      [...(classRankingQuery.data?.rankings || [])].sort(
        (a, b) => Number(a.rank || Number.MAX_SAFE_INTEGER) - Number(b.rank || Number.MAX_SAFE_INTEGER),
      ),
    [classRankingQuery.data?.rankings],
  );
  const classRankingStats = useMemo(() => {
    if (!classRankingRows.length) {
      return {
        totalStudents: 0,
        averageScore: null as number | null,
        topStudent: null as (typeof classRankingRows)[number] | null,
      };
    }
    const scores = classRankingRows
      .map((item) => Number(item.averageScore))
      .filter((value) => Number.isFinite(value));
    const averageScore = scores.length
      ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10
      : null;
    return {
      totalStudents: classRankingRows.length,
      averageScore,
      topStudent: classRankingRows[0] || null,
    };
  }, [classRankingRows]);
  const sortedAcademicEvents = useMemo(
    () =>
      [...(academicEventsQuery.data || [])].sort(
        (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
      ),
    [academicEventsQuery.data],
  );
  const questionBankItems = questionBankQuery.data?.items || [];
  const questionBankPagination = questionBankQuery.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };
  const questionBankTotalPages = Math.max(1, Number(questionBankPagination.totalPages || 1));
  const questionBankCurrentPage = Math.min(Math.max(1, questionBankPage), questionBankTotalPages);
  const selectedQuestionBankSubject =
    (academicQuery.data?.subjects.items || []).find((item) => item.id === Number(questionBankSubjectId)) || null;
  const filteredQuestionBankSubjectOptions = useMemo(() => {
    const subjects = academicQuery.data?.subjects.items || [];
    const q = questionBankSubjectSearch.trim().toLowerCase();
    if (!q) return subjects.slice(0, 120);
    return subjects
      .filter((item) => `${item.code} ${item.name} ${item.category?.name || ''}`.toLowerCase().includes(q))
      .slice(0, 160);
  }, [academicQuery.data?.subjects.items, questionBankSubjectSearch]);

  useEffect(() => {
    if (questionBankPage > questionBankTotalPages) {
      const timerId = setTimeout(() => setQuestionBankPage(questionBankTotalPages), 0);
      return () => clearTimeout(timerId);
    }
  }, [questionBankPage, questionBankTotalPages]);

  const examSessionStats = useMemo(() => {
    const total = filteredExamSessions.length;
    const active = filteredExamSessions.filter((item) => item.isActive).length;
    const withPacket = filteredExamSessions.filter((item) => item.packet).length;
    return {
      total,
      active,
      inactive: Math.max(0, total - active),
      withPacket,
    };
  }, [filteredExamSessions]);
  const selectedExamSessionPacket =
    examSessionPackets.find((item) => item.id === Number(examSessionPacketId)) || null;
  const selectedExamSessionClasses = examSessionClasses.filter((item) =>
    examSessionSelectedClassIds.includes(item.id),
  );
  const isSubmittingAcademicYear =
    createAcademicYearMutation.isPending || updateAcademicYearMutation.isPending;
  const isSubmittingAcademicEvent =
    createAcademicEventMutation.isPending || updateAcademicEventMutation.isPending;
  const shouldShow = (section: AcademicSection) =>
    allowedSectionSet.has(section) && (activeSection === 'overview' || activeSection === section);
  const teacherUsers = useMemo(
    () => (academicQuery.data?.teachers || []).filter((item) => item.role === 'TEACHER'),
    [academicQuery.data?.teachers],
  );
  const filteredTeacherOptions = useMemo(() => {
    const q = assignmentTeacherSearch.trim().toLowerCase();
    if (!q) return teacherUsers.slice(0, 30);
    return teacherUsers.filter((item) => `${item.name} ${item.username}`.toLowerCase().includes(q)).slice(0, 40);
  }, [teacherUsers, assignmentTeacherSearch]);
  const filteredSubjectOptions = useMemo(() => {
    const q = assignmentSubjectSearch.trim().toLowerCase();
    const subjects = academicQuery.data?.subjects.items || [];
    if (!q) return subjects.slice(0, 40);
    return subjects
      .filter((item) => `${item.name} ${item.code} ${item.category?.name || ''}`.toLowerCase().includes(q))
      .slice(0, 50);
  }, [academicQuery.data?.subjects.items, assignmentSubjectSearch]);
  const filteredClassOptions = useMemo(() => {
    const q = assignmentClassSearch.trim().toLowerCase();
    const classes = academicQuery.data?.classes.items || [];
    if (!q) return classes.slice(0, 60);
    return classes
      .filter((item) => `${item.name} ${item.level} ${item.major?.name || ''} ${item.major?.code || ''}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [academicQuery.data?.classes.items, assignmentClassSearch]);
  const selectedAssignmentTeacher = teacherUsers.find((item) => String(item.id) === assignmentTeacherId) || null;
  const selectedAssignmentSubject =
    (academicQuery.data?.subjects.items || []).find((item) => String(item.id) === assignmentSubjectId) || null;
  const assignmentGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        teacherId: number;
        subjectId: number;
        teacherName: string;
        subjectCode: string;
        subjectName: string;
        classIds: number[];
        classNames: string[];
        rawAssignmentIds: number[];
      }
    >();

    (academicQuery.data?.assignments.items || []).forEach((item) => {
      const teacherId = item.teacher?.id;
      const subjectId = item.subject?.id;
      const classId = item.class?.id;
      if (!teacherId || !subjectId || !classId) return;
      const key = `${teacherId}-${subjectId}`;
      const group = map.get(key) || {
        teacherId,
        subjectId,
        teacherName: item.teacher?.name || '-',
        subjectCode: item.subject?.code || '-',
        subjectName: item.subject?.name || '-',
        classIds: [],
        classNames: [],
        rawAssignmentIds: [],
      };
      if (!group.classIds.includes(classId)) group.classIds.push(classId);
      if (!group.classNames.includes(item.class?.name || '-')) group.classNames.push(item.class?.name || '-');
      group.rawAssignmentIds.push(item.id);
      map.set(key, group);
    });

    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [academicQuery.data?.assignments.items]);

  const toggleAssignmentClass = (classId: number) => {
    setAssignmentSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((item) => item !== classId) : [...prev, classId],
    );
  };

  const loadGroupToForm = (group: (typeof assignmentGroups)[number]) => {
    setAssignmentTeacherId(String(group.teacherId));
    setAssignmentSubjectId(String(group.subjectId));
    setAssignmentSelectedClassIds(group.classIds);
    setAssignmentTeacherSearch('');
    setAssignmentSubjectSearch('');
    setAssignmentClassSearch('');
  };

  const resetAssignmentForm = () => {
    setAssignmentTeacherId('');
    setAssignmentSubjectId('');
    setAssignmentSelectedClassIds([]);
    setAssignmentTeacherSearch('');
    setAssignmentSubjectSearch('');
    setAssignmentClassSearch('');
  };

  const handleSubmitAssignment = () => {
    upsertAssignmentMutation.mutate();
  };

  const handleDeleteAssignment = (assignmentId: number, label: string) => {
    Alert.alert('Hapus Assignment', `Hapus assignment ${label}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteAssignmentMutation.mutate(assignmentId);
        },
      },
    ]);
  };

  const applyQuestionBankSearch = () => {
    setQuestionBankSearch(questionBankSearchDraft.trim());
    setQuestionBankPage(1);
  };

  const goToQuestionBankPage = (nextPage: number) => {
    const bounded = Math.max(1, Math.min(questionBankTotalPages, nextPage));
    setQuestionBankPage(bounded);
  };

  const toggleExamSessionClass = (classId: number) => {
    setExamSessionSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId],
    );
  };

  const toggleAllExamSessionClasses = (checked: boolean) => {
    if (checked) {
      setExamSessionSelectedClassIds(examSessionClasses.map((item) => item.id));
      return;
    }
    setExamSessionSelectedClassIds([]);
  };

  const resetExamSessionForm = () => {
    setExamSessionPacketId('');
    setExamSessionSelectedClassIds([]);
    setExamSessionDate('');
    setExamSessionStartTime('');
    setExamSessionEndTime('');
    setExamSessionRoom('');
    setExamSessionProctorId('');
    setExamSessionClassSearch('');
  };

  const buildIsoDateTime = (dateInput: string, timeInput: string) => {
    const raw = `${dateInput}T${timeInput}:00`;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
  };

  const submitExamSessionForm = async () => {
    if (!examSessionPacketId) {
      notifyInfo('Pilih paket ujian terlebih dahulu.');
      return;
    }
    if (!examSessionSelectedClassIds.length) {
      notifyInfo('Pilih minimal satu kelas.');
      return;
    }
    if (!examSessionDate || !examSessionStartTime || !examSessionEndTime) {
      notifyInfo('Tanggal, jam mulai, dan jam selesai wajib diisi.');
      return;
    }

    const startIso = buildIsoDateTime(examSessionDate, examSessionStartTime);
    const endIso = buildIsoDateTime(examSessionDate, examSessionEndTime);
    if (!startIso || !endIso) {
      notifyInfo('Format tanggal/jam tidak valid.');
      return;
    }
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      notifyInfo('Jam selesai harus lebih besar dari jam mulai.');
      return;
    }

    try {
      await createExamSessionMutation.mutateAsync({
        packetId: Number(examSessionPacketId),
        classIds: examSessionSelectedClassIds,
        startTime: startIso,
        endTime: endIso,
        proctorId: examSessionProctorId ? Number(examSessionProctorId) : undefined,
        room: examSessionRoom.trim() || undefined,
      });
      resetExamSessionForm();
    } catch {
      // error toast handled in mutation
    }
  };

  const confirmDeleteExamSession = (scheduleId: number, label: string) => {
    Alert.alert('Hapus Sesi Ujian', `Hapus sesi ${label}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteExamSessionMutation.mutate(scheduleId);
        },
      },
    ]);
  };

  const confirmToggleExamSessionActive = (scheduleId: number, nextActive: boolean) => {
    Alert.alert(
      'Ubah Status Sesi',
      `${nextActive ? 'Aktifkan' : 'Nonaktifkan'} sesi ujian ini?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: nextActive ? 'Aktifkan' : 'Nonaktifkan',
          style: 'default',
          onPress: () => {
            updateExamSessionMutation.mutate({ id: scheduleId, isActive: nextActive });
          },
        },
      ],
    );
  };

  const scheduleClassCount = useMemo(
    () =>
      new Set(
        scheduleAssignments
          .map((item) => item.class?.id)
          .filter((item): item is number => typeof item === 'number' && item > 0),
      ).size,
    [scheduleAssignments],
  );
  const scheduleTotalSlotCount = scheduleAssignments.reduce(
    (total, item) => total + Number(item._count?.scheduleEntries || 0),
    0,
  );

  const addScheduleDayToEditor = () => {
    const remainingDay = SCHEDULE_ALL_DAYS.find((day) => !scheduleDays.includes(day));
    if (!remainingDay) {
      notifyInfo('Semua hari sudah ditambahkan pada konfigurasi.');
      return;
    }
    setSchedulePeriodTimes((prev) => ({
      ...prev,
      [remainingDay]: { ...(SCHEDULE_BASE_TIMES_BY_DAY[remainingDay] || {}) },
    }));
    setSchedulePeriodNotes((prev) => ({
      ...prev,
      [remainingDay]: { ...(SCHEDULE_DEFAULT_NOTES_BY_DAY[remainingDay] || {}) },
    }));
    const defaultTimes = SCHEDULE_BASE_TIMES_BY_DAY[remainingDay] || {};
    const defaultNotes = SCHEDULE_DEFAULT_NOTES_BY_DAY[remainingDay] || {};
    const defaultTypes: Record<number, SchedulePeriodType> = {};
    Object.keys(defaultTimes).forEach((periodKey) => {
      const period = Number(periodKey);
      if (!Number.isFinite(period) || period <= 0) return;
      defaultTypes[period] = inferPeriodTypeFromNote(defaultNotes[period]);
    });
    setSchedulePeriodTypes((prev) => ({
      ...prev,
      [remainingDay]: defaultTypes,
    }));
    setScheduleEditingDay(remainingDay);
  };

  const resetScheduleCurrentDay = () => {
    const day = scheduleEditingDay;
    setSchedulePeriodTimes((prev) => ({
      ...prev,
      [day]: { ...(SCHEDULE_BASE_TIMES_BY_DAY[day] || {}) },
    }));
    setSchedulePeriodNotes((prev) => ({
      ...prev,
      [day]: { ...(SCHEDULE_DEFAULT_NOTES_BY_DAY[day] || {}) },
    }));
    const defaultTimes = SCHEDULE_BASE_TIMES_BY_DAY[day] || {};
    const defaultNotes = SCHEDULE_DEFAULT_NOTES_BY_DAY[day] || {};
    const defaultTypes: Record<number, SchedulePeriodType> = {};
    Object.keys(defaultTimes).forEach((periodKey) => {
      const period = Number(periodKey);
      if (!Number.isFinite(period) || period <= 0) return;
      defaultTypes[period] = inferPeriodTypeFromNote(defaultNotes[period]);
    });
    setSchedulePeriodTypes((prev) => ({
      ...prev,
      [day]: defaultTypes,
    }));
  };

  const resetScheduleAllDays = () => {
    Alert.alert('Reset Konfigurasi Waktu', 'Reset seluruh konfigurasi jam ke default?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () => {
          const defaultTimes = buildScheduleDefaultPeriodTimes();
          const defaultNotes = buildScheduleDefaultPeriodNotes();
          setSchedulePeriodTimes(defaultTimes);
          setSchedulePeriodNotes(defaultNotes);
          setSchedulePeriodTypes(buildScheduleDefaultPeriodTypes({ periodTimes: defaultTimes, periodNotes: defaultNotes }));
        },
      },
    ]);
  };

  const addSchedulePeriodSlot = () => {
    const currentPeriods = Object.keys(schedulePeriodTimes[scheduleEditingDay] || {})
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => a - b);
    const nextPeriod = (currentPeriods[currentPeriods.length - 1] || 0) + 1;
    setSchedulePeriodTimes((prev) => ({
      ...prev,
      [scheduleEditingDay]: {
        ...(prev[scheduleEditingDay] || {}),
        [nextPeriod]: '',
      },
    }));
    setSchedulePeriodNotes((prev) => ({
      ...prev,
      [scheduleEditingDay]: {
        ...(prev[scheduleEditingDay] || {}),
        [nextPeriod]: '',
      },
    }));
    setSchedulePeriodTypes((prev) => ({
      ...prev,
      [scheduleEditingDay]: {
        ...(prev[scheduleEditingDay] || {}),
        [nextPeriod]: 'TEACHING',
      },
    }));
  };

  const removeSchedulePeriodSlot = (day: ScheduleDay, period: number) => {
    setSchedulePeriodTimes((prev) => {
      const nextDay = { ...(prev[day] || {}) };
      delete nextDay[period];
      return { ...prev, [day]: nextDay };
    });
    setSchedulePeriodNotes((prev) => {
      const nextDay = { ...(prev[day] || {}) };
      delete nextDay[period];
      return { ...prev, [day]: nextDay };
    });
    setSchedulePeriodTypes((prev) => {
      const nextDay = { ...(prev[day] || {}) };
      delete nextDay[period];
      return { ...prev, [day]: nextDay };
    });
  };

  const submitScheduleEntries = async () => {
    if (!effectiveScheduleAcademicYearId) {
      notifyInfo('Pilih tahun ajaran terlebih dahulu.');
      return;
    }
    if (!effectiveScheduleClassId) {
      notifyInfo('Pilih kelas terlebih dahulu.');
      return;
    }
    if (!scheduleFormAssignmentId) {
      notifyInfo('Pilih assignment mapel dan guru terlebih dahulu.');
      return;
    }

    const startTeachingHour = Number(scheduleFormStartTeachingHour);
    const endTeachingHour = scheduleFormEndTeachingHour ? Number(scheduleFormEndTeachingHour) : startTeachingHour;
    if (!Number.isFinite(startTeachingHour) || startTeachingHour < 1) {
      notifyInfo('Jam mulai harus angka >= 1.');
      return;
    }
    if (!Number.isFinite(endTeachingHour) || endTeachingHour < startTeachingHour) {
      notifyInfo('Jam akhir tidak valid.');
      return;
    }

    const periodsToCreate: number[] = [];
    for (let hour = startTeachingHour; hour <= endTeachingHour; hour += 1) {
      const period = getSchedulePeriodFromTeachingHour(scheduleFormDay, hour);
      if (!period) continue;
      const key = `${scheduleFormDay}-${period}`;
      if (!scheduleEntryMap.has(key)) {
        periodsToCreate.push(period);
      }
    }

    if (!periodsToCreate.length) {
      notifyInfo('Tidak ada slot kosong pada rentang jam tersebut.');
      return;
    }

    try {
      for (const period of periodsToCreate) {
        await createScheduleEntryMutation.mutateAsync({
          academicYearId: effectiveScheduleAcademicYearId,
          classId: effectiveScheduleClassId,
          teacherAssignmentId: Number(scheduleFormAssignmentId),
          dayOfWeek: scheduleFormDay,
          period,
          room: scheduleFormRoom.trim() ? scheduleFormRoom.trim() : null,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['mobile-admin-schedule-entries'] });
      notifySuccess(`Berhasil menambahkan ${periodsToCreate.length} slot jadwal.`);
      setScheduleFormAssignmentId('');
      setScheduleFormStartTeachingHour('1');
      setScheduleFormEndTeachingHour('');
      setScheduleFormRoom('');
    } catch {
      // Error toast handled in mutation onError
    }
  };

  const confirmDeleteScheduleEntry = (entryId: number, label: string) => {
    Alert.alert('Hapus Entri Jadwal', `Hapus slot ${label}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          deleteScheduleEntryMutation.mutate(entryId);
        },
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul admin..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (!canAccess) return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#e9eefb' }}
      contentContainerStyle={{
        ...pageContentPadding,
        paddingHorizontal: 16,
        paddingBottom: 24,
      }}
      refreshControl={
        <RefreshControl
          refreshing={academicQuery.isFetching && !academicQuery.isLoading}
          onRefresh={() => academicQuery.refetch()}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: BRAND_COLORS.white,
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>Akademik</Text>
      </View>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{sectionMeta.description}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
          {ACADEMIC_SECTIONS.map((item) => (
            allowedSectionSet.has(item.key) ? (
              <SectionChip
                key={item.key}
                label={item.label}
                icon={item.icon}
                active={activeSection === item.key}
                onPress={() => openSection(item.key)}
              />
            ) : null
          ))}
        </View>
      </ScrollView>

      {academicQuery.isLoading ? <QueryStateView type="loading" message="Memuat data akademik..." /> : null}
      {academicQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat ringkasan akademik." onRetry={() => academicQuery.refetch()} />
      ) : null}

      {!academicQuery.isLoading && !academicQuery.isError ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
            <StatCard
              title="Total Kelas Aktif"
              value={String(academicQuery.data?.classes.pagination.total || 0)}
              subtitle="Berdasarkan tahun ajaran aktif"
            />
            <StatCard
              title="Total Assignment"
              value={String(academicQuery.data?.assignments.pagination.total || 0)}
              subtitle="Penugasan guru aktif"
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <StatCard
              title="Total Mata Pelajaran"
              value={String(academicQuery.data?.subjects.pagination.total || 0)}
              subtitle="Seluruh mapel tersimpan"
            />
            <StatCard
              title="Total Tahun Ajaran"
              value={String(academicQuery.data?.years.pagination.total || 0)}
              subtitle="Riwayat tahun akademik"
            />
          </View>

          {shouldShow('academic-years') || shouldShow('academic-calendar') ? (
            <SectionCard
              title="Riwayat Tahun Ajaran"
              subtitle="Aktifkan tahun ajaran dari daftar berikut saat diperlukan"
            >
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                  backgroundColor: '#f8fbff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  {editingAcademicYearId ? `Edit Tahun Ajaran #${editingAcademicYearId}` : 'Tambah Tahun Ajaran'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Nama Tahun Ajaran</Text>
                <TextInput
                  value={academicYearForm.name}
                  onChangeText={(value) => setAcademicYearForm((prev) => ({ ...prev, name: value }))}
                  placeholder="Contoh: 2026/2027"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Semester 1 Mulai (YYYY-MM-DD)</Text>
                <TextInput
                  value={academicYearForm.semester1Start}
                  onChangeText={(value) => setAcademicYearForm((prev) => ({ ...prev, semester1Start: value }))}
                  placeholder="2026-07-15"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Semester 1 Selesai (YYYY-MM-DD)</Text>
                <TextInput
                  value={academicYearForm.semester1End}
                  onChangeText={(value) => setAcademicYearForm((prev) => ({ ...prev, semester1End: value }))}
                  placeholder="2026-12-20"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Semester 2 Mulai (YYYY-MM-DD)</Text>
                <TextInput
                  value={academicYearForm.semester2Start}
                  onChangeText={(value) => setAcademicYearForm((prev) => ({ ...prev, semester2Start: value }))}
                  placeholder="2027-01-10"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Semester 2 Selesai (YYYY-MM-DD)</Text>
                <TextInput
                  value={academicYearForm.semester2End}
                  onChangeText={(value) => setAcademicYearForm((prev) => ({ ...prev, semester2End: value }))}
                  placeholder="2027-06-20"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={handleSubmitAcademicYear}
                    disabled={isSubmittingAcademicYear}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      opacity: isSubmittingAcademicYear ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {isSubmittingAcademicYear ? 'Memproses...' : editingAcademicYearId ? 'Simpan Perubahan' : 'Buat Tahun Ajaran'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={resetAcademicYearForm}
                    disabled={isSubmittingAcademicYear}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                      opacity: isSubmittingAcademicYear ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>
                      {editingAcademicYearId ? 'Batal Edit' : 'Reset'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {(academicQuery.data?.years.items || []).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Semester 1: {formatDate(item.semester1Start)} - {formatDate(item.semester1End)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Semester 2: {formatDate(item.semester2Start)} - {formatDate(item.semester2End)}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Status: {item.isActive ? 'Aktif' : 'Nonaktif'}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {!item.isActive ? (
                      <Pressable
                        onPress={() => handleActivateYear(item.id, item.name)}
                        disabled={activateYearMutation.isPending}
                        style={{
                          backgroundColor: BRAND_COLORS.blue,
                          borderRadius: 10,
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          opacity: activateYearMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                          {activateYearMutation.isPending ? 'Memproses...' : 'Aktifkan'}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => handleEditAcademicYear(item)}
                      disabled={isSubmittingAcademicYear || deleteAcademicYearMutation.isPending}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#fff',
                        borderRadius: 10,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        opacity: isSubmittingAcademicYear || deleteAcademicYearMutation.isPending ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handleDeleteAcademicYear(item)}
                      disabled={isSubmittingAcademicYear || deleteAcademicYearMutation.isPending}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 10,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        opacity: isSubmittingAcademicYear || deleteAcademicYearMutation.isPending ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>
                        {deleteAcademicYearMutation.isPending ? 'Memproses...' : 'Hapus'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {(academicQuery.data?.years.items || []).length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Belum ada data tahun ajaran.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('academic-years') ? (
            <SectionCard
              title="Year Setup Clone Wizard"
              subtitle="Buat draft target year lalu clone komponen tahunan secara additive sebelum promotion."
            >
              {academicFeatureFlagsQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat feature flag rollover..." />
              ) : academicFeatureFlagsQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat feature flag rollover."
                  onRetry={() => academicFeatureFlagsQuery.refetch()}
                />
              ) : !isRolloverFeatureEnabled ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    backgroundColor: '#fffbeb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Rollover dimatikan</Text>
                  <Text style={{ color: '#92400e', fontSize: 12 }}>
                    Nyalakan env ACADEMIC_YEAR_ROLLOVER_ENABLED=true di server saat siap uji.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Sumber</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {(academicQuery.data?.years.items || []).map((item) => (
                        <SelectChip
                          key={`rollover-source-${item.id}`}
                          active={promotionSourceAcademicYearId === String(item.id)}
                          label={`${item.name}${item.isActive ? ' (Aktif)' : ''}`}
                          onPress={() => setPromotionSourceAcademicYearId(String(item.id))}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Target</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {(academicQuery.data?.years.items || []).map((item) => (
                        <SelectChip
                          key={`rollover-target-${item.id}`}
                          active={promotionTargetAcademicYearId === String(item.id)}
                          label={`${item.name}${item.isActive ? ' (Aktif)' : ''}`}
                          onPress={() => setPromotionTargetAcademicYearId(String(item.id))}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  <Pressable
                    onPress={handleCreateRolloverTarget}
                    disabled={!effectivePromotionSourceAcademicYearId || createRolloverTargetMutation.isPending}
                    style={{
                      backgroundColor: '#059669',
                      borderRadius: 12,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      alignItems: 'center',
                      marginBottom: 12,
                      opacity:
                        !effectivePromotionSourceAcademicYearId || createRolloverTargetMutation.isPending ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {createRolloverTargetMutation.isPending ? 'Menyiapkan...' : 'Buat Draft Tahun Berikutnya'}
                    </Text>
                  </Pressable>

                  {!promotionSourceAcademicYearId ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                      Pilih tahun sumber untuk mulai wizard rollover.
                    </Text>
                  ) : !promotionTargetAcademicYearId ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                      Pilih target year atau buat draft tahun berikutnya terlebih dahulu.
                    </Text>
                  ) : !promotionSelectionValid ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fcd34d',
                        backgroundColor: '#fffbeb',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tahun tidak valid</Text>
                      <Text style={{ color: '#92400e', fontSize: 12 }}>
                        Tahun sumber dan target harus berbeda.
                      </Text>
                    </View>
                  ) : rolloverWorkspaceQuery.isLoading ? (
                    <QueryStateView type="loading" message="Memuat workspace rollover..." />
                  ) : rolloverWorkspaceQuery.isError || !rolloverWorkspace ? (
                    <QueryStateView
                      type="error"
                      message="Gagal memuat workspace rollover."
                      onRetry={() => rolloverWorkspaceQuery.refetch()}
                    />
                  ) : (
                    <>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          justifyContent: 'space-between',
                          marginBottom: 2,
                        }}
                      >
                        {rolloverStatCards.map((item) => (
                          <View key={item.key} style={{ width: '48%', marginBottom: 10 }}>
                            <StatCard title={item.title} value={item.value} subtitle={item.subtitle} />
                          </View>
                        ))}
                      </View>

                      {rolloverWorkspace.validation.errors.length > 0 ? (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            backgroundColor: '#fff1f2',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontWeight: '700', marginBottom: 6 }}>Blocking Issues</Text>
                          {rolloverWorkspace.validation.errors.map((item) => (
                            <Text key={`rollover-global-error-${item}`} style={{ color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>
                              • {item}
                            </Text>
                          ))}
                        </View>
                      ) : null}

                      {rolloverWorkspace.validation.warnings.length > 0 ? (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#fcd34d',
                            backgroundColor: '#fffbeb',
                            borderRadius: 12,
                            padding: 12,
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 6 }}>Catatan Wizard</Text>
                          {rolloverWorkspace.validation.warnings.map((item) => (
                            <Text key={`rollover-global-warning-${item}`} style={{ color: '#92400e', fontSize: 12, marginBottom: 4 }}>
                              • {item}
                            </Text>
                          ))}
                        </View>
                      ) : null}

                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Pilih Komponen Clone</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                        <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                          {rolloverComponentEntries.map(([key, component]) => (
                            <SelectChip
                              key={`rollover-chip-${key}`}
                              active={rolloverSelectedComponents[key]}
                              label={component.label}
                              onPress={() => toggleRolloverComponent(key)}
                            />
                          ))}
                        </View>
                      </ScrollView>

                      {rolloverComponentEntries.map(([key, component]) => (
                        <View
                          key={key}
                          style={{
                            borderWidth: 1,
                            borderColor: '#dbe5f4',
                            borderRadius: 12,
                            padding: 12,
                            backgroundColor: '#f8fbff',
                            marginBottom: 10,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
                            {component.label}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                            {component.description}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Sumber: {component.summary.sourceItems} | Create:{' '}
                            {'createCount' in component.summary ? component.summary.createCount : 0} | Skip existing:{' '}
                            {'existingCount' in component.summary ? component.summary.existingCount : 0}
                          </Text>
                          {'globalFallbackCount' in component.summary && component.summary.globalFallbackCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Fallback global: {component.summary.globalFallbackCount}
                            </Text>
                          ) : null}
                          {'missingGradeComponentCount' in component.summary && component.summary.missingGradeComponentCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Dependency komponen nilai: {component.summary.missingGradeComponentCount}
                            </Text>
                          ) : null}
                          {'skipNoTargetProgramCount' in component.summary && component.summary.skipNoTargetProgramCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Menunggu program target: {component.summary.skipNoTargetProgramCount}
                            </Text>
                          ) : null}
                          {'skipNoTargetClassCount' in component.summary && component.summary.skipNoTargetClassCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Menunggu kelas target: {component.summary.skipNoTargetClassCount}
                            </Text>
                          ) : null}
                          {'skipNoSourceCount' in component.summary && component.summary.skipNoSourceCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Tidak ada source: {component.summary.skipNoSourceCount}
                            </Text>
                          ) : null}
                          {'skipOutsideTargetRangeCount' in component.summary && component.summary.skipOutsideTargetRangeCount > 0 ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 8 }}>
                              Di luar rentang target: {component.summary.skipOutsideTargetRangeCount}
                            </Text>
                          ) : null}
                          {'homeroomCarryCount' in component.summary ? (
                            <View style={{ marginTop: 8 }}>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                                Wali ikut pada kelas baru: {component.summary.homeroomCarryCount}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                                Isi target kosong dari source: {component.summary.homeroomExistingFillCount}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                                Target sudah punya wali: {component.summary.homeroomKeepExistingCount}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                                Source tanpa wali: {component.summary.homeroomMissingSourceCount}
                              </Text>
                            </View>
                          ) : null}
                          {component.errors.length > 0 ? (
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor: '#fecaca',
                                backgroundColor: '#fff1f2',
                                borderRadius: 10,
                                padding: 10,
                                marginTop: 8,
                              }}
                            >
                              {component.errors.slice(0, 3).map((item) => (
                                <Text key={`${key}-error-${item}`} style={{ color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>
                                  • {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                          {component.warnings.length > 0 ? (
                            <View
                              style={{
                                borderWidth: 1,
                                borderColor: '#fcd34d',
                                backgroundColor: '#fffbeb',
                                borderRadius: 10,
                                padding: 10,
                                marginTop: 8,
                              }}
                            >
                              {component.warnings.slice(0, 2).map((item) => (
                                <Text key={`${key}-warning-${item}`} style={{ color: '#92400e', fontSize: 12, marginBottom: 4 }}>
                                  • {item}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                          {'items' in component && component.items.length > 0 ? (
                            <View style={{ marginTop: 8 }}>
                              {component.items.slice(0, 6).map((item, index) => (
                                <Text
                                  key={`${key}-${index}`}
                                  style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}
                                >
                                  • {getRolloverPreviewItemLabel(item)}
                                </Text>
                              ))}
                              {component.items.length > 6 ? (
                                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                                  + {component.items.length - 6} item lainnya
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                        </View>
                      ))}

                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbe5f4',
                          borderRadius: 12,
                          padding: 12,
                          backgroundColor: '#fff',
                          marginBottom: 12,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                          Tahun target: {rolloverWorkspace.targetAcademicYear.name}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Operasional</Text>
                        {rolloverWorkspace.notes.map((item) => (
                          <Text key={`rollover-note-${item}`} style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
                            • {item}
                          </Text>
                        ))}
                      </View>

                      <Pressable
                        onPress={handleApplyRollover}
                        disabled={applyRolloverMutation.isPending}
                        style={{
                          backgroundColor: '#0f172a',
                          borderRadius: 12,
                          paddingVertical: 10,
                          alignItems: 'center',
                          opacity: applyRolloverMutation.isPending ? 0.65 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>
                          {applyRolloverMutation.isPending ? 'Menerapkan...' : 'Apply Setup Tahunan'}
                        </Text>
                      </Pressable>
                    </>
                  )}
                </>
              )}
            </SectionCard>
          ) : null}

          {shouldShow('promotion') ? (
            <SectionCard
              title="Promotion Center"
              subtitle="Preview, mapping, dan commit kenaikan kelas/alumni dengan kontrak yang sama seperti web."
            >
              {academicFeatureFlagsQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat feature flag promotion..." />
              ) : academicFeatureFlagsQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat feature flag promotion."
                  onRetry={() => academicFeatureFlagsQuery.refetch()}
                />
              ) : !isPromotionFeatureEnabled ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    backgroundColor: '#fffbeb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Promotion dimatikan</Text>
                  <Text style={{ color: '#92400e', fontSize: 12 }}>
                    Nyalakan env ACADEMIC_PROMOTION_V2_ENABLED=true di server saat siap uji.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Sumber</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {(academicQuery.data?.years.items || []).map((item) => (
                        <SelectChip
                          key={`promotion-source-${item.id}`}
                          active={promotionSourceAcademicYearId === String(item.id)}
                          label={`${item.name}${item.isActive ? ' (Aktif)' : ''}`}
                          onPress={() => setPromotionSourceAcademicYearId(String(item.id))}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Target</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {(academicQuery.data?.years.items || []).map((item) => (
                        <SelectChip
                          key={`promotion-target-${item.id}`}
                          active={promotionTargetAcademicYearId === String(item.id)}
                          label={`${item.name}${item.isActive ? ' (Aktif)' : ''}`}
                          onPress={() => setPromotionTargetAcademicYearId(String(item.id))}
                        />
                      ))}
                    </View>
                  </ScrollView>

                  <Pressable
                    onPress={() => setActivateTargetYearAfterCommit((current) => !current)}
                    style={{
                      borderWidth: 1,
                      borderColor: activateTargetYearAfterCommit ? BRAND_COLORS.blue : '#cbd5e1',
                      backgroundColor: activateTargetYearAfterCommit ? '#eaf1ff' : '#fff',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: activateTargetYearAfterCommit ? BRAND_COLORS.blue : BRAND_COLORS.textMuted,
                        fontWeight: '700',
                        fontSize: 12,
                      }}
                    >
                      {activateTargetYearAfterCommit ? 'Aktifkan tahun target setelah commit: ON' : 'Aktifkan tahun target setelah commit: OFF'}
                    </Text>
                  </Pressable>

                  {!promotionSourceAcademicYearId || !promotionTargetAcademicYearId ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Pilih tahun sumber dan target untuk memuat workspace promotion.
                </Text>
                  ) : !promotionSelectionValid ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    backgroundColor: '#fffbeb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tahun tidak valid</Text>
                  <Text style={{ color: '#92400e', fontSize: 12 }}>
                    Tahun sumber dan target harus berbeda.
                  </Text>
                </View>
                  ) : promotionWorkspaceQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat workspace promotion..." />
                  ) : promotionWorkspaceQuery.isError || !promotionWorkspaceQuery.data ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat workspace promotion."
                  onRetry={() => promotionWorkspaceQuery.refetch()}
                />
                  ) : (
                <>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    <StatCard
                      title="Total Siswa Aktif"
                      value={String(promotionWorkspaceQuery.data.summary.totalStudents || 0)}
                      subtitle="Seluruh siswa yang diproses"
                    />
                    <StatCard
                      title="Naik Kelas"
                      value={String(promotionWorkspaceQuery.data.summary.promotedStudents || 0)}
                      subtitle="Siswa X dan XI"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                    <StatCard
                      title="Menjadi Alumni"
                      value={String(promotionWorkspaceQuery.data.summary.graduatedStudents || 0)}
                      subtitle="Siswa XII aktif"
                    />
                    <StatCard
                      title="Mapping Siap"
                      value={`${promotionWorkspaceQuery.data.summary.configuredPromoteClasses || 0}/${promotionWorkspaceQuery.data.summary.promotableClasses || 0}`}
                      subtitle="Kelas promotion terpasang"
                    />
                  </View>

                  {promotionWorkspaceQuery.data.validation.errors.length > 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        backgroundColor: '#fff1f2',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', marginBottom: 6 }}>Blocking Issues</Text>
                      {promotionWorkspaceQuery.data.validation.errors.map((item) => (
                        <Text key={`promotion-global-error-${item}`} style={{ color: '#b91c1c', fontSize: 12, marginBottom: 4 }}>
                          • {item}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  {promotionWorkspaceQuery.data.validation.warnings.length > 0 ? (
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#fcd34d',
                        backgroundColor: '#fffbeb',
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 10,
                      }}
                    >
                      <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 6 }}>Peringatan</Text>
                      {promotionWorkspaceQuery.data.validation.warnings.map((item) => (
                        <Text key={`promotion-global-warning-${item}`} style={{ color: '#92400e', fontSize: 12, marginBottom: 4 }}>
                          • {item}
                        </Text>
                      ))}
                    </View>
                  ) : null}

                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <Pressable
                      onPress={resetPromotionDraftsToSuggested}
                      style={{
                        flex: 1,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Gunakan Saran</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => savePromotionMappingsMutation.mutate()}
                      disabled={savePromotionMappingsMutation.isPending}
                      style={{
                        flex: 1,
                        backgroundColor: '#0f172a',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        opacity: savePromotionMappingsMutation.isPending ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {savePromotionMappingsMutation.isPending ? 'Menyimpan...' : 'Simpan Mapping'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleCommitPromotion}
                      disabled={commitPromotionMutation.isPending}
                      style={{
                        flex: 1,
                        backgroundColor: BRAND_COLORS.blue,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        opacity: commitPromotionMutation.isPending ? 0.65 : 1,
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {commitPromotionMutation.isPending ? 'Commit...' : 'Commit Promotion'}
                      </Text>
                    </Pressable>
                  </View>

                  {promotionWorkspaceQuery.data.classes.map((item) => {
                    const selectedTargetClassId = getPromotionResolvedTargetClassId(item, promotionMappingDrafts);
                    const suggestedTargetLabel =
                      item.targetOptions.find((option) => option.id === item.suggestedTargetClassId)?.name || '-';

                    return (
                      <View
                        key={`promotion-class-${item.sourceClassId}`}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: '#eef3ff',
                          paddingVertical: 10,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.sourceClassName}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          {item.major.code} • {item.studentCount} siswa aktif • {item.action === 'GRADUATE' ? 'Alumni' : `Naik ke ${item.expectedTargetLevel}`}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                          Source: {item.mappingSource === 'SAVED' ? 'mapping tersimpan' : item.mappingSource === 'SUGGESTED' ? 'saran otomatis' : item.mappingSource === 'GRADUATE' ? 'alumni' : 'belum dipilih'}
                        </Text>

                        {item.action === 'GRADUATE' ? (
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: '#d6e0f2',
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              backgroundColor: '#f8fbff',
                              marginBottom: 8,
                            }}
                          >
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                              Siswa kelas XII aktif akan diubah menjadi alumni.
                            </Text>
                          </View>
                        ) : (
                          <>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
                              Pilih Kelas Target
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                              <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                                <SelectChip
                                  active={!selectedTargetClassId}
                                  label="Kosongkan"
                                  onPress={() =>
                                    setPromotionMappingDrafts((current) => ({
                                      ...current,
                                      [item.sourceClassId]: null,
                                    }))
                                  }
                                />
                                {item.targetOptions.map((option) => (
                                  <SelectChip
                                    key={`promotion-option-${item.sourceClassId}-${option.id}`}
                                    active={selectedTargetClassId === option.id}
                                    label={`${option.name} (${option.currentStudentCount})`}
                                    onPress={() =>
                                      setPromotionMappingDrafts((current) => ({
                                        ...current,
                                        [item.sourceClassId]: option.id,
                                      }))
                                    }
                                  />
                                ))}
                              </View>
                            </ScrollView>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                              Saran: {suggestedTargetLabel}
                            </Text>
                          </>
                        )}

                        {item.validation.errors.map((entry) => (
                          <View
                            key={`promotion-class-error-${item.sourceClassId}-${entry}`}
                            style={{
                              borderWidth: 1,
                              borderColor: '#fecaca',
                              backgroundColor: '#fff1f2',
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              marginBottom: 6,
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontSize: 12 }}>{entry}</Text>
                          </View>
                        ))}
                        {item.validation.warnings.map((entry) => (
                          <View
                            key={`promotion-class-warning-${item.sourceClassId}-${entry}`}
                            style={{
                              borderWidth: 1,
                              borderColor: '#fcd34d',
                              backgroundColor: '#fffbeb',
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              marginBottom: 6,
                            }}
                          >
                            <Text style={{ color: '#92400e', fontSize: 12 }}>{entry}</Text>
                          </View>
                        ))}
                        {item.validation.errors.length === 0 && item.validation.warnings.length === 0 ? (
                          <Text style={{ color: '#15803d', fontSize: 12, fontWeight: '700' }}>Siap</Text>
                        ) : null}
                      </View>
                    );
                  })}

                  <View style={{ marginTop: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Riwayat Run</Text>
                    {(promotionWorkspaceQuery.data.recentRuns || []).length === 0 ? (
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Belum ada run promotion untuk kombinasi source-target ini.
                      </Text>
                    ) : (
                      promotionWorkspaceQuery.data.recentRuns.map((run) => (
                        <View
                          key={`promotion-run-${run.id}`}
                          style={{
                            borderWidth: 1,
                            borderColor: '#d6e0f2',
                            borderRadius: 12,
                            padding: 10,
                            backgroundColor: '#f8fbff',
                          marginBottom: 8,
                        }}
                      >
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                              Run #{run.id} • {run.promotedStudents} naik • {run.graduatedStudents} alumni
                            </Text>
                            <View
                              style={{
                                borderRadius: 999,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                                backgroundColor:
                                  run.status === 'ROLLED_BACK'
                                    ? '#fef3c7'
                                    : run.status === 'COMMITTED'
                                      ? '#dcfce7'
                                      : '#e2e8f0',
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 11,
                                  fontWeight: '700',
                                  color:
                                    run.status === 'ROLLED_BACK'
                                      ? '#92400e'
                                      : run.status === 'COMMITTED'
                                        ? '#15803d'
                                        : '#475569',
                                }}
                              >
                                {run.status}
                              </Text>
                            </View>
                          </View>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            Commit: {formatDateTime(run.committedAt || run.createdAt)}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                            {run.createdBy ? `Oleh ${run.createdBy.name}` : 'Oleh sistem'}
                          </Text>
                          {run.rolledBackAt ? (
                            <Text style={{ color: '#92400e', fontSize: 12, marginTop: 2 }}>
                              Rollback: {formatDateTime(run.rolledBackAt)}
                              {run.rolledBackBy?.name ? ` oleh ${run.rolledBackBy.name}` : ''}
                            </Text>
                          ) : null}
                          <Pressable
                            onPress={() => handleRollbackPromotionRun(run.id, run.canRollback ? null : run.rollbackBlockedReason)}
                            disabled={!run.canRollback || rollbackPromotionMutation.isPending}
                            style={{
                              marginTop: 8,
                              borderWidth: 1,
                              borderColor: '#fcd34d',
                              borderRadius: 10,
                              paddingVertical: 8,
                              alignItems: 'center',
                              backgroundColor: '#fff',
                              opacity: !run.canRollback || rollbackPromotionMutation.isPending ? 0.6 : 1,
                            }}
                          >
                            <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 12 }}>
                              {rollbackPromotionMutation.isPending ? 'Rollback...' : 'Rollback Run'}
                            </Text>
                          </Pressable>
                          {!run.canRollback && run.rollbackBlockedReason ? (
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 6 }}>
                              {run.rollbackBlockedReason}
                            </Text>
                          ) : null}
                        </View>
                      ))
                    )}
                  </View>
                </>
                  )}
                </>
              )}
            </SectionCard>
          ) : null}

          {shouldShow('academic-calendar') ? (
            <SectionCard
              title="Kalender Akademik"
              subtitle="Kelola event penting (libur, ujian, rapor, dan kegiatan sekolah) langsung dari mobile."
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`calendar-year-${item.id}`}
                      active={effectiveCalendarAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setCalendarAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Semester</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {(['ALL', 'ODD', 'EVEN'] as const).map((item) => (
                  <SelectChip
                    key={`calendar-semester-${item}`}
                    active={calendarSemesterFilter === item}
                    label={item === 'ALL' ? 'Semua' : item === 'ODD' ? 'Ganjil' : 'Genap'}
                    onPress={() => setCalendarSemesterFilter(item)}
                  />
                ))}
              </View>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Jenis Event</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  <SelectChip
                    active={calendarTypeFilter === 'ALL'}
                    label="Semua"
                    onPress={() => setCalendarTypeFilter('ALL')}
                  />
                  {ACADEMIC_EVENT_TYPE_OPTIONS.map((item) => (
                    <SelectChip
                      key={`calendar-type-${item.value}`}
                      active={calendarTypeFilter === item.value}
                      label={item.label}
                      onPress={() => setCalendarTypeFilter(item.value)}
                    />
                  ))}
                </View>
              </ScrollView>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                  backgroundColor: '#f8fbff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  {editingAcademicEventId ? `Edit Event #${editingAcademicEventId}` : 'Tambah Event Kalender'}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Judul Event</Text>
                <TextInput
                  value={academicEventForm.title}
                  onChangeText={(value) => setAcademicEventForm((prev) => ({ ...prev, title: value }))}
                  placeholder="Contoh: Penilaian Akhir Semester"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jenis Event</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    {ACADEMIC_EVENT_TYPE_OPTIONS.map((item) => (
                      <SelectChip
                        key={`form-calendar-type-${item.value}`}
                        active={academicEventForm.type === item.value}
                        label={item.label}
                        onPress={() => setAcademicEventForm((prev) => ({ ...prev, type: item.value }))}
                      />
                    ))}
                  </View>
                </ScrollView>

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
                  Tanggal Mulai (YYYY-MM-DD)
                </Text>
                <TextInput
                  value={academicEventForm.startDate}
                  onChangeText={(value) => setAcademicEventForm((prev) => ({ ...prev, startDate: value }))}
                  placeholder="2026-09-01"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>
                  Tanggal Selesai (YYYY-MM-DD)
                </Text>
                <TextInput
                  value={academicEventForm.endDate}
                  onChangeText={(value) => setAcademicEventForm((prev) => ({ ...prev, endDate: value }))}
                  placeholder="2026-09-07"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Semester Event</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <SelectChip
                    active={academicEventForm.semester === ''}
                    label="Semua Semester"
                    onPress={() => setAcademicEventForm((prev) => ({ ...prev, semester: '' }))}
                  />
                  <SelectChip
                    active={academicEventForm.semester === 'ODD'}
                    label="Ganjil"
                    onPress={() => setAcademicEventForm((prev) => ({ ...prev, semester: 'ODD' }))}
                  />
                  <SelectChip
                    active={academicEventForm.semester === 'EVEN'}
                    label="Genap"
                    onPress={() => setAcademicEventForm((prev) => ({ ...prev, semester: 'EVEN' }))}
                  />
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Kategori Hari</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                  <SelectChip
                    active={!academicEventForm.isHoliday}
                    label="Hari Sekolah"
                    onPress={() => setAcademicEventForm((prev) => ({ ...prev, isHoliday: false }))}
                  />
                  <SelectChip
                    active={academicEventForm.isHoliday}
                    label="Hari Libur"
                    onPress={() => setAcademicEventForm((prev) => ({ ...prev, isHoliday: true }))}
                  />
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Deskripsi (Opsional)</Text>
                <TextInput
                  value={academicEventForm.description}
                  onChangeText={(value) => setAcademicEventForm((prev) => ({ ...prev, description: value }))}
                  placeholder="Deskripsi singkat event..."
                  placeholderTextColor="#94a3b8"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    minHeight: 80,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    textAlignVertical: 'top',
                    marginBottom: 8,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={handleSubmitAcademicEvent}
                    disabled={isSubmittingAcademicEvent}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      opacity: isSubmittingAcademicEvent ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {isSubmittingAcademicEvent ? 'Memproses...' : editingAcademicEventId ? 'Simpan Event' : 'Buat Event'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={resetAcademicEventForm}
                    disabled={isSubmittingAcademicEvent}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                      opacity: isSubmittingAcademicEvent ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>
                      {editingAcademicEventId ? 'Batal Edit' : 'Reset'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {academicEventsQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat event kalender akademik..." />
              ) : null}
              {academicEventsQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat event kalender akademik."
                  onRetry={() => academicEventsQuery.refetch()}
                />
              ) : null}

              {!academicEventsQuery.isLoading && !academicEventsQuery.isError ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    Daftar Event ({sortedAcademicEvents.length})
                  </Text>
                  {sortedAcademicEvents.map((item) => (
                    <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {getAcademicEventTypeLabel(item.type)} | {formatDate(item.startDate)} - {formatDate(item.endDate)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                        Semester: {item.semester === 'ODD' ? 'Ganjil' : item.semester === 'EVEN' ? 'Genap' : 'Semua'} |{' '}
                        {item.isHoliday ? 'Hari Libur' : 'Hari Sekolah'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => handleEditAcademicEvent(item)}
                          disabled={isSubmittingAcademicEvent || deleteAcademicEventMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            backgroundColor: '#fff',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            opacity: isSubmittingAcademicEvent || deleteAcademicEventMutation.isPending ? 0.65 : 1,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}>Edit</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleDeleteAcademicEvent(item)}
                          disabled={isSubmittingAcademicEvent || deleteAcademicEventMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            borderRadius: 8,
                            backgroundColor: '#fff1f2',
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            opacity: isSubmittingAcademicEvent || deleteAcademicEventMutation.isPending ? 0.65 : 1,
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>
                            {deleteAcademicEventMutation.isPending ? 'Memproses...' : 'Hapus'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {sortedAcademicEvents.length === 0 ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                      Belum ada event kalender pada filter ini.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('teacher-assignments') ? (
            <SectionCard
              title="Assignment Guru"
              subtitle="Kelola assignment guru-mapel-kelas (upsert + hapus) seperti modul web."
            >
              <TextInput
                value={assignmentTeacherSearch}
                onChangeText={setAssignmentTeacherSearch}
                placeholder="Cari guru..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                Guru terpilih: {selectedAssignmentTeacher?.name || '-'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredTeacherOptions.map((item) => (
                    <SelectChip
                      key={item.id}
                      active={assignmentTeacherId === String(item.id)}
                      label={`${item.name} (@${item.username})`}
                      onPress={() => setAssignmentTeacherId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <TextInput
                value={assignmentSubjectSearch}
                onChangeText={setAssignmentSubjectSearch}
                placeholder="Cari mata pelajaran..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                Mapel terpilih: {selectedAssignmentSubject ? `${selectedAssignmentSubject.code} - ${selectedAssignmentSubject.name}` : '-'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredSubjectOptions.map((item) => (
                    <SelectChip
                      key={item.id}
                      active={assignmentSubjectId === String(item.id)}
                      label={`${item.code} - ${item.name}`}
                      onPress={() => setAssignmentSubjectId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <TextInput
                value={assignmentClassSearch}
                onChangeText={setAssignmentClassSearch}
                placeholder="Cari kelas..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                Kelas dipilih: {assignmentSelectedClassIds.length}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredClassOptions.map((item) => (
                    <SelectChip
                      key={item.id}
                      active={assignmentSelectedClassIds.includes(item.id)}
                      label={item.name}
                      onPress={() => toggleAssignmentClass(item.id)}
                    />
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                <Pressable
                  onPress={handleSubmitAssignment}
                  disabled={upsertAssignmentMutation.isPending}
                  style={{
                    flex: 1,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: upsertAssignmentMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {upsertAssignmentMutation.isPending ? 'Memproses...' : 'Simpan Assignment'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={resetAssignmentForm}
                  disabled={upsertAssignmentMutation.isPending}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#fff',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: upsertAssignmentMutation.isPending ? 0.7 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Reset Form</Text>
                </Pressable>
              </View>

              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                Group Assignment ({assignmentGroups.length})
              </Text>
              {assignmentGroups.slice(0, 12).map((group) => (
                <View key={`${group.teacherId}-${group.subjectId}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {group.teacherName} - {group.subjectCode}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                    Kelas: {group.classNames.join(', ')}
                  </Text>
                  <Pressable
                    onPress={() => loadGroupToForm(group)}
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Muat ke Form</Text>
                  </Pressable>
                </View>
              ))}

              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 10, marginBottom: 6 }}>
                Detail Assignment ({academicQuery.data?.assignments.items.length || 0})
              </Text>
              {(academicQuery.data?.assignments.items || []).slice(0, 40).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.subject?.code || '-'} - {item.class?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                    Guru: {item.teacher?.name || '-'} | Jadwal: {item._count?.scheduleEntries || 0}
                  </Text>
                  <Pressable
                    onPress={() =>
                      handleDeleteAssignment(item.id, `${item.teacher?.name || '-'} / ${item.subject?.code || '-'} / ${item.class?.name || '-'}`)
                    }
                    disabled={deleteAssignmentMutation.isPending}
                    style={{
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fef2f2',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      opacity: deleteAssignmentMutation.isPending ? 0.7 : 1,
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>
                      {deleteAssignmentMutation.isPending ? 'Memproses...' : 'Hapus Assignment'}
                    </Text>
                  </Pressable>
                </View>
              ))}
              {(academicQuery.data?.assignments.items || []).length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Belum ada assignment pada tahun ajaran aktif.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('schedule') ? (
            <SectionCard
              title="Manajemen Jadwal Pelajaran"
              subtitle="Setara web: pilih tahun ajaran/kelas, input per jam, hapus slot, dan atur konfigurasi waktu."
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`schedule-year-${item.id}`}
                      active={effectiveScheduleAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setScheduleAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <StatCard
                  title="Kelas Berassignment"
                  value={String(scheduleClassCount)}
                  subtitle="Kelas pada tahun ajaran terpilih"
                />
                <StatCard
                  title="Total Assignment"
                  value={String(scheduleAssignments.length)}
                  subtitle="Mapel-guru-kelas aktif"
                />
              </View>
              <View style={{ marginBottom: 8 }}>
                <StatCard
                  title="Total Slot Jadwal"
                  value={String(scheduleTotalSlotCount)}
                  subtitle="Akumulasi seluruh kelas"
                />
              </View>

              <TextInput
                value={scheduleClassSearch}
                onChangeText={setScheduleClassSearch}
                placeholder="Cari kelas..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredScheduleClassOptions.map((item) => (
                    <SelectChip
                      key={`schedule-class-${item.id}`}
                      active={effectiveScheduleClassId === item.id}
                      label={item.name}
                      onPress={() => setScheduleClassId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                Kelas terpilih: {scheduleClasses.find((item) => item.id === effectiveScheduleClassId)?.name || '-'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setScheduleTimeEditorOpen((prev) => !prev)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                    {scheduleTimeEditorOpen ? 'Tutup Pengaturan Jam' : 'Atur Waktu Jam'}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => saveScheduleConfigMutation.mutate()}
                  disabled={saveScheduleConfigMutation.isPending || !effectiveScheduleAcademicYearId}
                  style={{
                    borderWidth: 1,
                    borderColor: '#86efac',
                    backgroundColor: '#dcfce7',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    opacity: saveScheduleConfigMutation.isPending || !effectiveScheduleAcademicYearId ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: '#166534', fontWeight: '700', fontSize: 12 }}>
                    {saveScheduleConfigMutation.isPending ? 'Menyimpan...' : 'Simpan Konfigurasi Jam'}
                  </Text>
                </Pressable>
              </View>

              {scheduleTimeEditorOpen ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#d6e0f2',
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 10,
                    backgroundColor: '#f8fbff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    Editor Waktu Jam
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                      {scheduleDays.map((day) => (
                        <SelectChip
                          key={`schedule-day-edit-${day}`}
                          active={scheduleEditingDay === day}
                          label={SCHEDULE_DAY_LABELS[day]}
                          onPress={() => setScheduleEditingDay(day)}
                        />
                      ))}
                      {SCHEDULE_ALL_DAYS.some((day) => !scheduleDays.includes(day)) ? (
                        <Pressable
                          onPress={addScheduleDayToEditor}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            borderRadius: 999,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            backgroundColor: '#eff6ff',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>+ Hari</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </ScrollView>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                    <Pressable
                      onPress={resetScheduleCurrentDay}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                        Reset Hari Ini
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={addSchedulePeriodSlot}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        backgroundColor: '#eff6ff',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>+ Tambah Jam</Text>
                    </Pressable>
                    <Pressable
                      onPress={resetScheduleAllDays}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        backgroundColor: '#fff1f2',
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Reset Semua</Text>
                    </Pressable>
                  </View>

                  {Object.keys(schedulePeriodTimes[scheduleEditingDay] || {})
                    .map(Number)
                    .filter((value) => Number.isFinite(value) && value > 0)
                    .sort((a, b) => a - b)
                    .map((period) => (
                      <View
                        key={`schedule-period-editor-${scheduleEditingDay}-${period}`}
                        style={{
                          borderTopWidth: 1,
                          borderTopColor: '#e2e8f0',
                          paddingTop: 8,
                          marginTop: 8,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}>
                            Slot {period} ({SCHEDULE_DAY_LABELS[scheduleEditingDay]})
                          </Text>
                          <Pressable
                            onPress={() => removeSchedulePeriodSlot(scheduleEditingDay, period)}
                            style={{
                              borderWidth: 1,
                              borderColor: '#fecaca',
                              borderRadius: 8,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                              backgroundColor: '#fff1f2',
                            }}
                          >
                            <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 11 }}>Hapus</Text>
                          </Pressable>
                        </View>
                        <TextInput
                          value={schedulePeriodTimes[scheduleEditingDay]?.[period] || ''}
                          onChangeText={(value) =>
                            setSchedulePeriodTimes((prev) => ({
                              ...prev,
                              [scheduleEditingDay]: {
                                ...(prev[scheduleEditingDay] || {}),
                                [period]: value,
                              },
                            }))
                          }
                          placeholder="Contoh: 07.00 - 07.45"
                          placeholderTextColor="#94a3b8"
                          style={{
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            backgroundColor: '#fff',
                            color: BRAND_COLORS.textDark,
                            marginBottom: 6,
                          }}
                        />
                        <TextInput
                          value={schedulePeriodNotes[scheduleEditingDay]?.[period] || ''}
                          onChangeText={(value) =>
                            setSchedulePeriodNotes((prev) => ({
                              ...prev,
                              [scheduleEditingDay]: {
                                ...(prev[scheduleEditingDay] || {}),
                                [period]: value,
                              },
                            }))
                          }
                          placeholder="Catatan slot (opsional)"
                          placeholderTextColor="#94a3b8"
                          style={{
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            backgroundColor: '#fff',
                            color: BRAND_COLORS.textDark,
                            marginBottom: 6,
                          }}
                        />
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                          <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                            {(['TEACHING', 'UPACARA', 'ISTIRAHAT', 'TADARUS', 'OTHER'] as const).map((item) => (
                              <SelectChip
                                key={`schedule-type-${scheduleEditingDay}-${period}-${item}`}
                                active={(schedulePeriodTypes[scheduleEditingDay]?.[period] || 'TEACHING') === item}
                                label={item}
                                onPress={() =>
                                  setSchedulePeriodTypes((prev) => ({
                                    ...prev,
                                    [scheduleEditingDay]: {
                                      ...(prev[scheduleEditingDay] || {}),
                                      [period]: item,
                                    },
                                  }))
                                }
                              />
                            ))}
                          </View>
                        </ScrollView>
                      </View>
                    ))}
                </View>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                  backgroundColor: '#f8fbff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                  Form Input Entri Jadwal
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    {scheduleDays.map((day) => (
                      <SelectChip
                        key={`schedule-form-day-${day}`}
                        active={scheduleFormDay === day}
                        label={SCHEDULE_DAY_LABELS[day]}
                        onPress={() => setScheduleFormDay(day)}
                      />
                    ))}
                  </View>
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jam Mulai (jam pelajaran ke-)</Text>
                    <TextInput
                      value={scheduleFormStartTeachingHour}
                      onChangeText={(value) => {
                        const next = value.replace(/[^0-9]/g, '');
                        setScheduleFormStartTeachingHour(next || '1');
                      }}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: '#fff',
                        color: BRAND_COLORS.textDark,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jam Akhir (opsional)</Text>
                    <TextInput
                      value={scheduleFormEndTeachingHour}
                      onChangeText={(value) => {
                        const next = value.replace(/[^0-9]/g, '');
                        setScheduleFormEndTeachingHour(next);
                      }}
                      keyboardType="number-pad"
                      placeholder="Kosongkan jika 1 slot"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        backgroundColor: '#fff',
                        color: BRAND_COLORS.textDark,
                      }}
                    />
                  </View>
                </View>

                <TextInput
                  value={scheduleAssignmentSearch}
                  onChangeText={setScheduleAssignmentSearch}
                  placeholder="Cari mapel/guru assignment kelas ini..."
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 6,
                  }}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    {filteredScheduleClassAssignments.map((item) => (
                      <SelectChip
                        key={`schedule-assignment-${item.id}`}
                        active={scheduleFormAssignmentId === String(item.id)}
                        label={`${item.subject?.code || '-'} • ${item.teacher?.name || '-'}`}
                        onPress={() => setScheduleFormAssignmentId(String(item.id))}
                      />
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Assignment terpilih:{' '}
                  {scheduleClassAssignments.find((item) => String(item.id) === scheduleFormAssignmentId)
                    ? `${scheduleClassAssignments.find((item) => String(item.id) === scheduleFormAssignmentId)?.subject?.code || '-'} • ${scheduleClassAssignments.find((item) => String(item.id) === scheduleFormAssignmentId)?.teacher?.name || '-'}`
                    : '-'}
                </Text>

                <TextInput
                  value={scheduleFormRoom}
                  onChangeText={setScheduleFormRoom}
                  placeholder="Ruang (opsional)"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Pressable
                  onPress={submitScheduleEntries}
                  disabled={createScheduleEntryMutation.isPending || !effectiveScheduleClassId}
                  style={{
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    opacity: createScheduleEntryMutation.isPending || !effectiveScheduleClassId ? 0.65 : 1,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {createScheduleEntryMutation.isPending ? 'Memproses...' : 'Simpan Entri Jadwal'}
                  </Text>
                </Pressable>
              </View>

              {scheduleClassesQuery.isLoading || scheduleAssignmentsQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat data kelas dan assignment jadwal..." />
              ) : null}
              {scheduleClassesQuery.isError || scheduleAssignmentsQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat data kelas/assignment jadwal."
                  onRetry={() => {
                    scheduleClassesQuery.refetch();
                    scheduleAssignmentsQuery.refetch();
                  }}
                />
              ) : null}
              {scheduleEntriesQuery.isLoading && effectiveScheduleClassId ? (
                <QueryStateView type="loading" message="Memuat entri jadwal kelas..." />
              ) : null}
              {scheduleEntriesQuery.isError && effectiveScheduleClassId ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat entri jadwal kelas."
                  onRetry={() => scheduleEntriesQuery.refetch()}
                />
              ) : null}

              {!effectiveScheduleClassId ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Pilih kelas untuk menampilkan grid jadwal.
                </Text>
              ) : null}
              {effectiveScheduleClassId && !scheduleEntriesQuery.isLoading && !scheduleEntriesQuery.isError ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    Grid Jadwal Kelas ({scheduleEntries.length} slot)
                  </Text>
                  {scheduleDays.map((day) => {
                    const periodsConfigured = Object.keys(schedulePeriodTimes[day] || {})
                      .map(Number)
                      .filter((value) => Number.isFinite(value) && value > 0);
                    const maxConfigured = periodsConfigured.length ? Math.max(...periodsConfigured) : 0;
                    const maxFromEntries = scheduleEntries
                      .filter((entry) => entry.dayOfWeek === day)
                      .reduce((max, entry) => (entry.period > max ? entry.period : max), 0);
                    const dayMaxPeriod = Math.max(1, maxConfigured, maxFromEntries);
                    const dayPeriods = Array.from({ length: dayMaxPeriod }, (_, idx) => idx + 1);

                    return (
                      <View
                        key={`schedule-grid-day-${day}`}
                        style={{
                          borderWidth: 1,
                          borderColor: '#d6e0f2',
                          borderRadius: 10,
                          padding: 10,
                          marginBottom: 8,
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                          {SCHEDULE_DAY_LABELS[day]}
                        </Text>
                        {dayPeriods.map((period) => {
                          const entry = scheduleEntryMap.get(`${day}-${period}`);
                          const note = schedulePeriodNotes[day]?.[period];
                          const periodType = (schedulePeriodTypes[day]?.[period] || inferPeriodTypeFromNote(note)) as SchedulePeriodType;
                          const isNonTeaching = periodType !== 'TEACHING';
                          const teachingHour = getScheduleTeachingHour(day, period);
                          const noteBackground =
                            periodType === 'UPACARA' ? '#dcfce7' : periodType === 'ISTIRAHAT' ? '#fee2e2' : '#fef3c7';
                          const noteColor =
                            periodType === 'UPACARA' ? '#065f46' : periodType === 'ISTIRAHAT' ? '#991b1b' : '#92400e';

                          return (
                            <View
                              key={`schedule-grid-${day}-${period}`}
                              style={{
                                borderTopWidth: 1,
                                borderTopColor: '#eef3ff',
                                paddingVertical: 8,
                              }}
                            >
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }}>
                                  Slot {period} | Jam ke: {teachingHour ?? '-'}
                                </Text>
                                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }}>
                                  {schedulePeriodTimes[day]?.[period] || '-'}
                                </Text>
                              </View>

                              {isNonTeaching ? (
                                <View
                                  style={{
                                    borderRadius: 999,
                                    backgroundColor: noteBackground,
                                    alignSelf: 'flex-start',
                                    paddingHorizontal: 10,
                                    paddingVertical: 4,
                                  }}
                                >
                                  <Text style={{ color: noteColor, fontWeight: '700', fontSize: 11 }}>
                                    {note || periodType}
                                  </Text>
                                </View>
                              ) : entry ? (
                                <>
                                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                                    {entry.teacherAssignment.subject.code} - {entry.teacherAssignment.subject.name}
                                  </Text>
                                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                                    Guru: {entry.teacherAssignment.teacher.name}
                                  </Text>
                                  {entry.room ? (
                                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Ruang: {entry.room}</Text>
                                  ) : null}
                                  <Pressable
                                    onPress={() =>
                                      confirmDeleteScheduleEntry(
                                        entry.id,
                                        `${SCHEDULE_DAY_LABELS[day]} slot ${period} (${entry.teacherAssignment.subject.code})`,
                                      )
                                    }
                                    disabled={deleteScheduleEntryMutation.isPending}
                                    style={{
                                      marginTop: 6,
                                      alignSelf: 'flex-start',
                                      borderWidth: 1,
                                      borderColor: '#fecaca',
                                      borderRadius: 8,
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      backgroundColor: '#fff1f2',
                                      opacity: deleteScheduleEntryMutation.isPending ? 0.65 : 1,
                                    }}
                                  >
                                    <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>
                                      {deleteScheduleEntryMutation.isPending ? 'Memproses...' : 'Hapus Slot'}
                                    </Text>
                                  </Pressable>
                                </>
                              ) : (
                                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Slot kosong</Text>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('teaching-load') ? (
            <SectionCard title="Rekap Jam Mengajar" subtitle="Filter tahun ajaran dan guru, lalu lihat detail sesi/jam per mapel.">
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`teaching-load-year-${item.id}`}
                      active={effectiveTeachingLoadAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setTeachingLoadAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <TextInput
                value={teachingLoadTeacherSearch}
                onChangeText={setTeachingLoadTeacherSearch}
                placeholder="Cari guru..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  <SelectChip
                    active={!effectiveTeachingLoadTeacherId}
                    label="Semua Guru"
                    onPress={() => setTeachingLoadTeacherId('')}
                  />
                  {filteredTeachingLoadTeacherOptions.map((item) => (
                    <SelectChip
                      key={`teaching-load-teacher-${item.id}`}
                      active={effectiveTeachingLoadTeacherId === item.id}
                      label={`${item.name} (@${item.username})`}
                      onPress={() => setTeachingLoadTeacherId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <StatCard
                  title="Guru Mengajar"
                  value={String(teachingLoadTotals.totalTeachers)}
                  subtitle="Hasil filter saat ini"
                />
                <StatCard
                  title="Total Jam"
                  value={String(teachingLoadTotals.totalHours)}
                  subtitle={`Sesi: ${teachingLoadTotals.totalSessions}`}
                />
              </View>
              <View style={{ marginBottom: 8 }}>
                <StatCard
                  title="Rata-rata Jam/Guru"
                  value={teachingLoadTotals.totalTeachers ? teachingLoadTotals.averageHours.toFixed(1) : '0.0'}
                  subtitle="Hasil filter saat ini"
                />
              </View>

              {teachingLoadAssignmentsQuery.isLoading || teachingLoadSummaryQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat rekap jam mengajar..." />
              ) : null}
              {teachingLoadAssignmentsQuery.isError || teachingLoadSummaryQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat rekap jam mengajar."
                  onRetry={() => {
                    teachingLoadAssignmentsQuery.refetch();
                    teachingLoadSummaryQuery.refetch();
                  }}
                />
              ) : null}

              {!teachingLoadAssignmentsQuery.isLoading &&
              !teachingLoadSummaryQuery.isLoading &&
              !teachingLoadAssignmentsQuery.isError &&
              !teachingLoadSummaryQuery.isError ? (
                <>
                  {teachingLoadSummary.map((item) => (
                    <View key={item.teacherId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {item.teacherName} (@{item.teacherUsername})
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Kelas: {item.totalClasses} | Mapel: {item.totalSubjects} | Sesi: {item.totalSessions} | Jam: {item.totalHours}
                      </Text>
                      {(item.details || []).slice(0, 30).map((detail) => (
                        <Text
                          key={`teaching-load-detail-${item.teacherId}-${detail.subjectId}`}
                          style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}
                        >
                          - {detail.subjectCode} {detail.subjectName}: {detail.classCount} kelas, {detail.sessionCount} sesi ({detail.hours} jam)
                        </Text>
                      ))}
                    </View>
                  ))}
                  {teachingLoadSummary.length === 0 ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                      Rekap jam mengajar belum tersedia untuk filter ini.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('kkm') ? (
            <SectionCard
              title="Cakupan Data KKM"
              subtitle={`${filteredKkmSubjects.length} mapel sesuai filter level/pencarian`}
            >
              <TextInput
                value={kkmSearch}
                onChangeText={setKkmSearch}
                placeholder="Cari kode/nama mapel..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                {(['ALL', 'X', 'XI', 'XII'] as const).map((item) => (
                  <SelectChip
                    key={`kkm-level-${item}`}
                    active={kkmLevelFilter === item}
                    label={item === 'ALL' ? 'Semua Level' : `Kelas ${item}`}
                    onPress={() => setKkmLevelFilter(item)}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <StatCard
                  title="Rata-rata KKM X"
                  value={averageKkmByLevel.X !== null ? String(averageKkmByLevel.X) : '-'}
                  subtitle="Hasil filter saat ini"
                />
                <StatCard
                  title="Rata-rata KKM XI"
                  value={averageKkmByLevel.XI !== null ? String(averageKkmByLevel.XI) : '-'}
                  subtitle="Hasil filter saat ini"
                />
              </View>
              <View style={{ marginBottom: 8 }}>
                <StatCard
                  title="Rata-rata KKM XII"
                  value={averageKkmByLevel.XII !== null ? String(averageKkmByLevel.XII) : '-'}
                  subtitle="Hasil filter saat ini"
                />
              </View>
              {filteredKkmSubjects.slice(0, 30).map((item) => (
                <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.code} - {item.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    {item.kkms?.map((kkm) => `${kkm.classLevel}:${kkm.kkm}`).join(' | ') || '-'}
                  </Text>
                </View>
              ))}
              {filteredKkmSubjects.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Tidak ada data KKM yang sesuai filter.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('attendance-recap') ? (
            <SectionCard
              title="Rekap Absensi Kelas"
              subtitle="Filter tahun ajaran, kelas, dan periode untuk melihat rekap harian + ringkasan keterlambatan."
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`attendance-year-${item.id}`}
                      active={effectiveOperationalAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setOperationalAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <TextInput
                value={attendanceClassSearch}
                onChangeText={setAttendanceClassSearch}
                placeholder="Cari kelas..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredAttendanceClassOptions.map((item) => (
                    <SelectChip
                      key={`attendance-class-${item.id}`}
                      active={attendanceClassId === String(item.id)}
                      label={item.name}
                      onPress={() => setAttendanceClassId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                Kelas terpilih: {selectedAttendanceClass?.name || '-'}
              </Text>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Periode</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {([
                  { value: 'ALL', label: 'Satu Tahun' },
                  { value: 'ODD', label: 'Semester Ganjil' },
                  { value: 'EVEN', label: 'Semester Genap' },
                ] as const).map((item) => (
                  <SelectChip
                    key={`attendance-semester-${item.value}`}
                    active={attendanceSemesterFilter === item.value}
                    label={item.label}
                    onPress={() => setAttendanceSemesterFilter(item.value)}
                  />
                ))}
              </View>

              {dailyAttendanceRecapQuery.data?.meta?.dateRange ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Rentang data:{' '}
                  {formatDate(dailyAttendanceRecapQuery.data.meta.dateRange.start || null)} -{' '}
                  {formatDate(dailyAttendanceRecapQuery.data.meta.dateRange.end || null)}
                </Text>
              ) : null}

              {dailyAttendanceRecapQuery.isLoading || lateSummaryByClassQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat rekap absensi..." />
              ) : null}
              {dailyAttendanceRecapQuery.isError || lateSummaryByClassQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat rekap absensi."
                  onRetry={() => {
                    dailyAttendanceRecapQuery.refetch();
                    lateSummaryByClassQuery.refetch();
                  }}
                />
              ) : null}

              {!dailyAttendanceRecapQuery.isLoading &&
              !lateSummaryByClassQuery.isLoading &&
              !dailyAttendanceRecapQuery.isError &&
              !lateSummaryByClassQuery.isError ? (
                <>
                  {attendanceDailyTotals ? (
                    <>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <StatCard
                          title="Total Hadir (incl. telat)"
                          value={String(attendanceDailyTotals.present + attendanceDailyTotals.late)}
                          subtitle="Akumulasi siswa pada periode"
                        />
                        <StatCard
                          title="Total Telat"
                          value={String(attendanceDailyTotals.late)}
                          subtitle="Akumulasi periode terpilih"
                        />
                      </View>
                      <View style={{ marginBottom: 8 }}>
                        <StatCard
                          title="Rata-rata Kehadiran"
                          value={`${attendanceDailyTotals.averagePercentage.toFixed(1)}%`}
                          subtitle={`Sakit:${attendanceDailyTotals.sick} Izin:${attendanceDailyTotals.permission} Alpha:${attendanceDailyTotals.absent}`}
                        />
                      </View>
                    </>
                  ) : null}

                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    Rekap Harian ({attendanceDailyRecap.length} siswa)
                  </Text>
                  {attendanceDailyRecap.map((item) => (
                    <View key={`attendance-daily-${item.student.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Hadir: {item.present} | Telat: {item.late} | Sakit: {item.sick} | Izin: {item.permission} | Alpha: {item.absent}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Total catatan: {item.total} | Kehadiran: {Number(item.percentage || 0).toFixed(1)}%
                      </Text>
                    </View>
                  ))}

                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 8, marginBottom: 6 }}>
                    Rekap Keterlambatan
                  </Text>
                  {(lateSummaryByClassQuery.data?.recap || []).map((item) => (
                    <View key={item.student.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Sem 1: {item.semester1Late} | Sem 2: {item.semester2Late} | Total: {item.totalLate}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
              {attendanceDailyRecap.length === 0 &&
              (lateSummaryByClassQuery.data?.recap || []).length === 0 &&
              !dailyAttendanceRecapQuery.isLoading &&
              !lateSummaryByClassQuery.isLoading &&
              !dailyAttendanceRecapQuery.isError &&
              !lateSummaryByClassQuery.isError ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Pilih kelas untuk melihat rekap absensi, atau data belum tersedia.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('report-cards') ? (
            <SectionCard title="Ringkasan Rapor Kelas" subtitle="Mode Leger dan Peringkat kelas (semester) seperti modul web." >
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`report-year-${item.id}`}
                      active={effectiveOperationalAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setOperationalAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <TextInput
                value={reportClassSearch}
                onChangeText={setReportClassSearch}
                placeholder="Cari kelas..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {filteredReportClassOptions.map((item) => (
                    <SelectChip
                      key={`report-class-${item.id}`}
                      active={reportClassId === String(item.id)}
                      label={item.name}
                      onPress={() => setReportClassId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                Kelas terpilih: {selectedReportClass?.name || '-'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SelectChip
                  active={reportViewMode === 'REPORT'}
                  label="Leger Nilai"
                  onPress={() => setReportViewMode('REPORT')}
                />
                <SelectChip
                  active={reportViewMode === 'RANKING'}
                  label="Peringkat Kelas"
                  onPress={() => setReportViewMode('RANKING')}
                />
              </View>

              {reportViewMode === 'RANKING' ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Semester</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <SelectChip
                      active={reportSemesterFilter === 'ODD'}
                      label="Semester Ganjil"
                      onPress={() => setReportSemesterFilter('ODD')}
                    />
                    <SelectChip
                      active={reportSemesterFilter === 'EVEN'}
                      label="Semester Genap"
                      onPress={() => setReportSemesterFilter('EVEN')}
                    />
                  </View>
                </>
              ) : null}

              {reportViewMode === 'REPORT' && classReportSummaryQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat ringkasan rapor kelas..." />
              ) : null}
              {reportViewMode === 'REPORT' && classReportSummaryQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat ringkasan rapor kelas."
                  onRetry={() => classReportSummaryQuery.refetch()}
                />
              ) : null}

              {reportViewMode === 'RANKING' && !reportSemesterFilter ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Pilih semester untuk memuat data peringkat kelas.
                </Text>
              ) : null}
              {reportViewMode === 'RANKING' && reportSemesterFilter && classRankingQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat peringkat kelas..." />
              ) : null}
              {reportViewMode === 'RANKING' && reportSemesterFilter && classRankingQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat peringkat kelas."
                  onRetry={() => classRankingQuery.refetch()}
                />
              ) : null}

              {reportViewMode === 'REPORT' && !classReportSummaryQuery.isLoading && !classReportSummaryQuery.isError ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    Total Mapel: {classReportSummaryQuery.data?.subjects?.length || 0}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                    Total Siswa: {classReportSummaryQuery.data?.students?.length || 0}
                  </Text>

                  <TextInput
                    value={reportSubjectSearch}
                    onChangeText={setReportSubjectSearch}
                    placeholder="Cari mapel pada ringkasan rapor..."
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#d5e0f5',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 9,
                      color: BRAND_COLORS.textDark,
                      marginBottom: 8,
                    }}
                  />

                  {filteredReportSubjects.slice(0, 40).map((item, index) => (
                    <Text key={`${item.subject?.id || index}`} style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {item.subject?.code || '-'} - {item.subject?.name || '-'}
                    </Text>
                  ))}
                </>
              ) : null}
              {reportViewMode === 'REPORT' &&
              (classReportSummaryQuery.data?.subjects || []).length === 0 &&
              !classReportSummaryQuery.isLoading &&
              !classReportSummaryQuery.isError ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Pilih kelas untuk melihat ringkasan rapor, atau data belum tersedia.
                </Text>
              ) : null}

              {reportViewMode === 'RANKING' &&
              reportSemesterFilter &&
              !classRankingQuery.isLoading &&
              !classRankingQuery.isError ? (
                <>
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                    <StatCard
                      title="Total Siswa"
                      value={String(classRankingStats.totalStudents)}
                      subtitle="Data peringkat kelas"
                    />
                    <StatCard
                      title="Rata-rata Nilai"
                      value={classRankingStats.averageScore !== null ? String(classRankingStats.averageScore) : '-'}
                      subtitle={classRankingQuery.data?.academicYear || 'Tahun ajaran'}
                    />
                  </View>
                  <View style={{ marginBottom: 8 }}>
                    <StatCard
                      title="Peringkat 1"
                      value={classRankingStats.topStudent?.student?.name || '-'}
                      subtitle={
                        classRankingStats.topStudent
                          ? `Skor rata-rata ${classRankingStats.topStudent.averageScore}`
                          : 'Belum ada data'
                      }
                    />
                  </View>

                  {classRankingRows.map((item) => (
                    <View key={`report-ranking-${item.student.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        #{item.rank} - {item.student.name}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Rata-rata: {item.averageScore} | Total Nilai: {item.totalScore} | Mapel: {item.subjectCount}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
              {reportViewMode === 'RANKING' &&
              reportSemesterFilter &&
              classRankingRows.length === 0 &&
              !classRankingQuery.isLoading &&
              !classRankingQuery.isError ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Belum ada data peringkat pada filter ini.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}

          {shouldShow('question-bank') ? (
            <SectionCard title="Bank Soal" subtitle="Filter by tahun/mapel/semester/tipe + pencarian konten seperti modul web.">
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`question-bank-year-${item.id}`}
                      active={effectiveQuestionBankAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setQuestionBankAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={questionBankSearchDraft}
                  onChangeText={setQuestionBankSearchDraft}
                  placeholder="Cari konten soal..."
                  placeholderTextColor="#94a3b8"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                  }}
                />
                <Pressable
                  onPress={applyQuestionBankSearch}
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    backgroundColor: '#eff6ff',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Cari</Text>
                </Pressable>
              </View>

              <TextInput
                value={questionBankSubjectSearch}
                onChangeText={setQuestionBankSubjectSearch}
                placeholder="Cari mapel..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 6,
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  <SelectChip
                    active={!questionBankSubjectId}
                    label="Semua Mapel"
                    onPress={() => setQuestionBankSubjectId('')}
                  />
                  {filteredQuestionBankSubjectOptions.map((item) => (
                    <SelectChip
                      key={`question-bank-subject-${item.id}`}
                      active={questionBankSubjectId === String(item.id)}
                      label={`${item.code} - ${item.name}`}
                      onPress={() => setQuestionBankSubjectId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                Mapel terpilih: {selectedQuestionBankSubject ? `${selectedQuestionBankSubject.code} - ${selectedQuestionBankSubject.name}` : 'Semua Mapel'}
              </Text>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tipe Soal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {EXAM_QUESTION_TYPE_OPTIONS.map((item) => (
                    <SelectChip
                      key={`question-bank-type-${item.value || 'ALL'}`}
                      active={questionBankTypeFilter === item.value}
                      label={item.label}
                      onPress={() => setQuestionBankTypeFilter(item.value)}
                    />
                  ))}
                </View>
              </ScrollView>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Semester</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SelectChip
                  active={questionBankSemesterFilter === ''}
                  label="Semua Semester"
                  onPress={() => setQuestionBankSemesterFilter('')}
                />
                <SelectChip
                  active={questionBankSemesterFilter === 'ODD'}
                  label="Ganjil"
                  onPress={() => setQuestionBankSemesterFilter('ODD')}
                />
                <SelectChip
                  active={questionBankSemesterFilter === 'EVEN'}
                  label="Genap"
                  onPress={() => setQuestionBankSemesterFilter('EVEN')}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <StatCard
                  title="Total Soal"
                  value={String(questionBankPagination.total || 0)}
                  subtitle="Hasil filter saat ini"
                />
                <StatCard
                  title="Halaman"
                  value={`${questionBankCurrentPage}/${questionBankTotalPages}`}
                  subtitle={`Limit ${questionBankPagination.limit || 20}/page`}
                />
              </View>

              {questionBankQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat bank soal..." />
              ) : null}
              {questionBankQuery.isError ? (
                <QueryStateView type="error" message="Gagal memuat bank soal." onRetry={() => questionBankQuery.refetch()} />
              ) : null}

              {!questionBankQuery.isLoading && !questionBankQuery.isError ? (
                <>
                  {questionBankItems.map((item) => (
                    <View key={`question-bank-item-${item.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        #{item.id} • {item.type || '-'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Mapel: {item.bank?.subject?.code || '-'} {item.bank?.subject?.name || '-'} | TA:{' '}
                        {item.bank?.academicYear?.name || '-'} | Semester: {item.bank?.semester || '-'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {stripHtml(item.content).slice(0, 180) || '-'}
                        {stripHtml(item.content).length > 180 ? '...' : ''}
                      </Text>
                    </View>
                  ))}
                </>
              ) : null}
              {!questionBankQuery.isLoading && !questionBankQuery.isError && questionBankItems.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Tidak ada soal pada filter ini.
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <Pressable
                  onPress={() => goToQuestionBankPage(questionBankCurrentPage - 1)}
                  disabled={questionBankCurrentPage <= 1}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    opacity: questionBankCurrentPage <= 1 ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Prev</Text>
                </Pressable>
                <Pressable
                  onPress={() => goToQuestionBankPage(questionBankCurrentPage + 1)}
                  disabled={questionBankCurrentPage >= questionBankTotalPages}
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingVertical: 9,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    opacity: questionBankCurrentPage >= questionBankTotalPages ? 0.5 : 1,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Next</Text>
                </Pressable>
              </View>
            </SectionCard>
          ) : null}

          {shouldShow('exam-sessions') ? (
            <SectionCard title="Sesi Ujian" subtitle="Buat, aktif/nonaktifkan, dan hapus sesi ujian langsung dari mobile.">
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Tahun Ajaran</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {(academicQuery.data?.years.items || []).map((item) => (
                    <SelectChip
                      key={`exam-session-year-${item.id}`}
                      active={effectiveExamSessionAcademicYearId === item.id}
                      label={item.name}
                      onPress={() => setExamSessionAcademicYearId(String(item.id))}
                    />
                  ))}
                </View>
              </ScrollView>

              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>Filter Tipe Ujian</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                  {EXAM_TYPE_OPTIONS.map((item) => (
                    <SelectChip
                      key={`exam-session-type-${item.value}`}
                      active={examSessionTypeFilter === item.value}
                      label={item.label}
                      onPress={() => setExamSessionTypeFilter(item.value)}
                    />
                  ))}
                </View>
              </ScrollView>

              <TextInput
                value={examSessionSearch}
                onChangeText={setExamSessionSearch}
                placeholder="Cari sesi (judul paket/kelas/mapel)..."
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d5e0f5',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <StatCard
                  title="Total Sesi"
                  value={String(examSessionStats.total)}
                  subtitle="Hasil filter saat ini"
                />
                <StatCard
                  title="Sesi Aktif"
                  value={String(examSessionStats.active)}
                  subtitle={`Nonaktif: ${examSessionStats.inactive}`}
                />
              </View>
              <View style={{ marginBottom: 8 }}>
                <StatCard
                  title="Sesi Punya Paket"
                  value={String(examSessionStats.withPacket)}
                  subtitle="Kesiapan materi ujian"
                />
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e0f2',
                  borderRadius: 12,
                  padding: 10,
                  marginBottom: 10,
                  backgroundColor: '#f8fbff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Buat Sesi Ujian</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Paket Ujian</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    {filteredExamSessionPacketOptions.map((item) => (
                      <SelectChip
                        key={`exam-session-packet-${item.id}`}
                        active={examSessionPacketId === String(item.id)}
                        label={`${item.title} (${item.type || '-'})`}
                        onPress={() => setExamSessionPacketId(String(item.id))}
                      />
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Paket terpilih: {selectedExamSessionPacket?.title || '-'}
                </Text>

                <TextInput
                  value={examSessionClassSearch}
                  onChangeText={setExamSessionClassSearch}
                  placeholder="Cari kelas..."
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#d5e0f5',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    color: BRAND_COLORS.textDark,
                    marginBottom: 6,
                  }}
                />
                <Pressable
                  onPress={() =>
                    toggleAllExamSessionClasses(
                      examSessionClasses.length === 0 ||
                        examSessionSelectedClassIds.length !== examSessionClasses.length,
                    )
                  }
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    alignSelf: 'flex-start',
                    backgroundColor: '#fff',
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                    {examSessionSelectedClassIds.length === examSessionClasses.length && examSessionClasses.length > 0
                      ? 'Batal Pilih Semua Kelas'
                      : 'Pilih Semua Kelas'}
                  </Text>
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    {filteredExamSessionClassOptions.map((item) => (
                      <SelectChip
                        key={`exam-session-class-${item.id}`}
                        active={examSessionSelectedClassIds.includes(item.id)}
                        label={item.name}
                        onPress={() => toggleExamSessionClass(item.id)}
                      />
                    ))}
                  </View>
                </ScrollView>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 8 }}>
                  Kelas dipilih: {selectedExamSessionClasses.length}
                </Text>

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Tanggal Ujian (YYYY-MM-DD)</Text>
                <TextInput
                  value={examSessionDate}
                  onChangeText={setExamSessionDate}
                  placeholder="2026-10-12"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jam Mulai (HH:mm)</Text>
                    <TextInput
                      value={examSessionStartTime}
                      onChangeText={setExamSessionStartTime}
                      placeholder="07:30"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: '#fff',
                        color: BRAND_COLORS.textDark,
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Jam Selesai (HH:mm)</Text>
                    <TextInput
                      value={examSessionEndTime}
                      onChangeText={setExamSessionEndTime}
                      placeholder="09:30"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: '#fff',
                        color: BRAND_COLORS.textDark,
                      }}
                    />
                  </View>
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Ruang (opsional)</Text>
                <TextInput
                  value={examSessionRoom}
                  onChangeText={setExamSessionRoom}
                  placeholder="Contoh: Lab Komputer 1"
                  placeholderTextColor="#94a3b8"
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                    color: BRAND_COLORS.textDark,
                    marginBottom: 8,
                  }}
                />

                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 4 }}>Pengawas (opsional)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
                    <SelectChip active={!examSessionProctorId} label="Tanpa Pengawas" onPress={() => setExamSessionProctorId('')} />
                    {teacherUsers.slice(0, 120).map((item) => (
                      <SelectChip
                        key={`exam-session-proctor-${item.id}`}
                        active={examSessionProctorId === String(item.id)}
                        label={item.name}
                        onPress={() => setExamSessionProctorId(String(item.id))}
                      />
                    ))}
                  </View>
                </ScrollView>

                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable
                    onPress={submitExamSessionForm}
                    disabled={createExamSessionMutation.isPending}
                    style={{
                      flex: 1,
                      backgroundColor: BRAND_COLORS.blue,
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      opacity: createExamSessionMutation.isPending ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {createExamSessionMutation.isPending ? 'Memproses...' : 'Buat Sesi Ujian'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={resetExamSessionForm}
                    disabled={createExamSessionMutation.isPending}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                      opacity: createExamSessionMutation.isPending ? 0.65 : 1,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Reset Form</Text>
                  </Pressable>
                </View>
              </View>

              {examSessionClassesQuery.isLoading || examSessionPacketsQuery.isLoading || examSessionSchedulesQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat data sesi ujian..." />
              ) : null}
              {examSessionClassesQuery.isError || examSessionPacketsQuery.isError || examSessionSchedulesQuery.isError ? (
                <QueryStateView
                  type="error"
                  message="Gagal memuat data sesi ujian."
                  onRetry={() => {
                    examSessionClassesQuery.refetch();
                    examSessionPacketsQuery.refetch();
                    examSessionSchedulesQuery.refetch();
                  }}
                />
              ) : null}

              {!examSessionClassesQuery.isLoading &&
              !examSessionPacketsQuery.isLoading &&
              !examSessionSchedulesQuery.isLoading &&
              !examSessionClassesQuery.isError &&
              !examSessionPacketsQuery.isError &&
              !examSessionSchedulesQuery.isError ? (
                <>
                  {filteredExamSessions.slice(0, 120).map((item) => (
                    <View key={`exam-session-item-${item.id}`} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {item.packet?.title || 'Sesi Ujian'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {item.class?.name || '-'} | {getExamTypeLabel(item.packet?.type)} | {item.isActive ? 'Aktif' : 'Nonaktif'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {formatDateTime(item.startTime)} - {formatDateTime(item.endTime)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                        Ruang: {item.room || '-'} | Pengawas: {item.proctor?.name || '-'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Pressable
                          onPress={() => confirmToggleExamSessionActive(item.id, !item.isActive)}
                          disabled={updateExamSessionMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#cbd5e1',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            backgroundColor: '#fff',
                            opacity: updateExamSessionMutation.isPending ? 0.65 : 1,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 12, fontWeight: '700' }}>
                            {item.isActive ? 'Set Nonaktif' : 'Set Aktif'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            confirmDeleteExamSession(item.id, `${item.packet?.title || 'Sesi'} - ${item.class?.name || '-'}`)
                          }
                          disabled={deleteExamSessionMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#fecaca',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            backgroundColor: '#fff1f2',
                            opacity: deleteExamSessionMutation.isPending ? 0.65 : 1,
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontSize: 12, fontWeight: '700' }}>
                            {deleteExamSessionMutation.isPending ? 'Memproses...' : 'Hapus'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </>
              ) : null}
              {!examSessionClassesQuery.isLoading &&
              !examSessionPacketsQuery.isLoading &&
              !examSessionSchedulesQuery.isLoading &&
              !examSessionClassesQuery.isError &&
              !examSessionPacketsQuery.isError &&
              !examSessionSchedulesQuery.isError &&
              filteredExamSessions.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', paddingVertical: 8 }}>
                  Belum ada sesi ujian pada filter ini.
                </Text>
              ) : null}
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}
