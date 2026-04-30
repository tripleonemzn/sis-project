import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { teacherAssignmentApi } from '../../../src/features/teacherAssignments/teacherAssignmentApi';
import {
  buildTeacherAssignmentOptionLabel,
  filterRegularTeacherAssignments,
} from '../../../src/features/teacherAssignments/utils';
import { attendanceApi } from '../../../src/features/attendance/attendanceApi';
import {
  AttendanceDetailStudent,
  AttendanceRecapPeriod,
  TeacherAttendanceStatus,
} from '../../../src/features/attendance/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import {
  buildResponsivePageContentStyle,
  useResponsiveLayout,
} from '../../../src/lib/ui/useResponsiveLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type StatusConfig = {
  value: TeacherAttendanceStatus;
  label: string;
  shortLabel: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
  bg: string;
  border: string;
  text: string;
};

type TabKey = 'INPUT' | 'RECAP';
type Semester = 'ODD' | 'EVEN';

const STATUS_OPTIONS: StatusConfig[] = [
  { value: 'PRESENT', label: 'Hadir', shortLabel: 'H', iconName: 'check-circle', bg: '#dcfce7', border: '#86efac', text: '#166534' },
  { value: 'SICK', label: 'Sakit', shortLabel: 'S', iconName: 'plus-circle', bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
  { value: 'PERMISSION', label: 'Izin', shortLabel: 'I', iconName: 'file-text', bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  { value: 'ABSENT', label: 'Alpha', shortLabel: 'A', iconName: 'x-circle', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  { value: 'LATE', label: 'Telat', shortLabel: 'T', iconName: 'clock', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
];

const PERIOD_OPTIONS: Array<{ value: AttendanceRecapPeriod; label: string }> = [
  { value: 'WEEK', label: 'Mingguan' },
  { value: 'MONTH', label: 'Bulanan' },
  { value: 'SEMESTER', label: 'Semester' },
  { value: 'YEAR', label: 'Satu Tahun' },
];

const SEMESTER_OPTIONS: Array<{ value: Semester; label: string }> = [
  { value: 'ODD', label: 'Semester Ganjil' },
  { value: 'EVEN', label: 'Semester Genap' },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: new Date(2026, index, 1).toLocaleDateString('id-ID', { month: 'long' }),
}));

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function defaultSemesterByDate(): Semester {
  return new Date().getMonth() + 1 >= 7 ? 'ODD' : 'EVEN';
}

function formatShortDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status?: TeacherAttendanceStatus | null) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label || '-';
}

export default function TeacherAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const initialAssignmentId = params.assignmentId ? Number(params.assignmentId) : null;
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets, { horizontal: layout.pageHorizontal });
  const pageContentStyle = buildResponsivePageContentStyle(pageContentPadding, layout);
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(
    Number.isFinite(initialAssignmentId || NaN) ? initialAssignmentId : null,
  );
  const [tab, setTab] = useState<TabKey>('INPUT');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [draftOverrides, setDraftOverrides] = useState<Record<number, TeacherAttendanceStatus>>({});
  const [search, setSearch] = useState('');
  const [recapPeriod, setRecapPeriod] = useState<AttendanceRecapPeriod>('WEEK');
  const [recapSemester, setRecapSemester] = useState<Semester>(defaultSemesterByDate());
  const [recapMonth, setRecapMonth] = useState(String(new Date().getMonth() + 1));
  const [recapYear, setRecapYear] = useState(String(new Date().getFullYear()));
  const [recapWeekStart, setRecapWeekStart] = useState(new Date());
  const [selectedRecapStudentId, setSelectedRecapStudentId] = useState<number | null>(null);

  const assignments = useMemo(
    () => filterRegularTeacherAssignments(assignmentsQuery.data?.assignments || []),
    [assignmentsQuery.data?.assignments],
  );
  const effectiveSelectedAssignmentId = selectedAssignmentId ?? assignments[0]?.id ?? null;
  const selectedAssignment = assignments.find((item) => item.id === effectiveSelectedAssignmentId) || null;
  const assignmentOptions = useMemo(
    () =>
      assignments.map((item) => ({
        value: String(item.id),
        label: buildTeacherAssignmentOptionLabel(item),
      })),
    [assignments],
  );
  const selectedDateIso = toIsoDateLocal(selectedDate);
  const recapWeekStartIso = toIsoDateLocal(recapWeekStart);

  const detailQuery = useQuery({
    queryKey: ['mobile-teacher-assignment-detail', effectiveSelectedAssignmentId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!effectiveSelectedAssignmentId,
    queryFn: () => teacherAssignmentApi.getById(effectiveSelectedAssignmentId!),
  });

  const attendanceQuery = useQuery({
    queryKey: ['mobile-teacher-subject-attendance', effectiveSelectedAssignmentId, selectedDateIso],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment,
    queryFn: () =>
      attendanceApi.getSubjectAttendance({
        date: selectedDateIso,
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
      }),
  });

  const recapQuery = useQuery({
    queryKey: [
      'mobile-teacher-subject-recap',
      effectiveSelectedAssignmentId,
      recapPeriod,
      recapSemester,
      recapMonth,
      recapYear,
      recapWeekStartIso,
    ],
    enabled: isAuthenticated && user?.role === 'TEACHER' && tab === 'RECAP' && !!selectedAssignment,
    queryFn: () =>
      attendanceApi.getSubjectRecap({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        period: recapPeriod,
        semester: recapPeriod === 'SEMESTER' ? recapSemester : null,
        month: recapPeriod === 'MONTH' ? Number(recapMonth) : null,
        year: recapPeriod === 'MONTH' ? Number(recapYear) : null,
        weekStart: recapPeriod === 'WEEK' ? recapWeekStartIso : null,
      }),
  });

  const students = useMemo(() => detailQuery.data?.class.students || [], [detailQuery.data?.class.students]);
  const draft = useMemo(() => {
    const nextDraft: Record<number, TeacherAttendanceStatus> = {};
    for (const student of students) {
      nextDraft[student.id] = 'PRESENT';
    }
    for (const record of attendanceQuery.data?.records || []) {
      nextDraft[record.studentId] = record.status;
    }
    for (const [studentId, status] of Object.entries(draftOverrides)) {
      nextDraft[Number(studentId)] = status;
    }
    return nextDraft;
  }, [students, attendanceQuery.data?.records, draftOverrides]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Assignment belum dipilih.');
      const students = detailQuery.data?.class.students || [];
      const records = students.map((student) => ({
        studentId: student.id,
        status: draft[student.id] || 'PRESENT',
        note: null,
      }));
      return attendanceApi.saveSubjectAttendance({
        date: selectedDateIso,
        classId: selectedAssignment.class.id,
        subjectId: selectedAssignment.subject.id,
        academicYearId: selectedAssignment.academicYear.id,
        records,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-subject-attendance', effectiveSelectedAssignmentId, selectedDateIso],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-subject-recap', effectiveSelectedAssignmentId],
      });
      Alert.alert('Sukses', 'Presensi mapel berhasil disimpan.');
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = normalized.response?.data?.message || normalized.message || 'Gagal menyimpan presensi.';
      Alert.alert('Gagal', msg);
    },
  });

  const stats = useMemo(() => {
    const students = detailQuery.data?.class.students || [];
    const result = { present: 0, sick: 0, permission: 0, absent: 0, late: 0, total: students.length };
    for (const student of students) {
      const status = draft[student.id] || 'PRESENT';
      if (status === 'PRESENT') result.present += 1;
      if (status === 'SICK') result.sick += 1;
      if (status === 'PERMISSION') result.permission += 1;
      if (status === 'ABSENT') result.absent += 1;
      if (status === 'LATE') result.late += 1;
    }
    return result;
  }, [detailQuery.data?.class.students, draft]);

  const searchNormalized = search.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    if (!searchNormalized) return students;
    return students.filter((student) => {
      const haystacks = [student.name || '', student.nis || '', student.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [students, searchNormalized]);

  const recapStudents = useMemo(() => recapQuery.data?.students || [], [recapQuery.data?.students]);
  const filteredRecapStudents = useMemo(() => {
    if (!searchNormalized) return recapStudents;
    return recapStudents.filter((row) => {
      const haystacks = [row.student.name || '', row.student.nis || '', row.student.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [recapStudents, searchNormalized]);
  const selectedRecapStudent =
    filteredRecapStudents.find((row) => row.student.id === selectedRecapStudentId) || null;
  const recapSummary = useMemo(() => {
    if (!filteredRecapStudents.length) return { present: 0, sick: 0, permission: 0, absent: 0, late: 0, percentage: 0 };
    const totals = filteredRecapStudents.reduce(
      (acc, row) => {
        acc.present += row.summary.present;
        acc.sick += row.summary.sick;
        acc.permission += row.summary.permission;
        acc.absent += row.summary.absent;
        acc.late += row.summary.late;
        acc.percentage += row.summary.percentage;
        return acc;
      },
      { present: 0, sick: 0, permission: 0, absent: 0, late: 0, percentage: 0 },
    );
    totals.percentage = totals.percentage / filteredRecapStudents.length;
    return totals;
  }, [filteredRecapStudents]);

  const handleStatusChange = (studentId: number, status: TeacherAttendanceStatus) => {
    setDraftOverrides((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const markAll = (status: TeacherAttendanceStatus) => {
    if (!students.length) return;
    setDraftOverrides((prev) => {
      const next = { ...prev };
      for (const student of students) {
        next[student.id] = status;
      }
      return next;
    });
  };

  const shiftDate = (offset: number) => {
    setDraftOverrides({});
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + offset));
  };

  if (isLoading) return <AppLoadingScreen message="Memuat presensi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentStyle}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Presensi Siswa</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: '#1d4ed8',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentStyle}
      refreshControl={
        <RefreshControl
          refreshing={
            assignmentsQuery.isFetching ||
            detailQuery.isFetching ||
            (attendanceQuery.isFetching && !attendanceQuery.isLoading) ||
            (recapQuery.isFetching && !recapQuery.isLoading)
          }
          onRefresh={async () => {
            await Promise.all([assignmentsQuery.refetch(), detailQuery.refetch(), attendanceQuery.refetch(), recapQuery.refetch()]);
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>Presensi Siswa</Text>
      <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        Isi kehadiran per mapel untuk kelas yang Anda ampu.
      </Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment guru..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
          <>
            <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 12 }}>
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
                <MobileSelectField
                  value={effectiveSelectedAssignmentId ? String(effectiveSelectedAssignmentId) : ''}
                  options={assignmentOptions}
                  onChange={(next) => {
                    setSelectedAssignmentId(next ? Number(next) : null);
                    setDraftOverrides({});
                  }}
                  placeholder="Pilih kelas & mapel"
                />
              </View>

              {tab === 'INPUT' ? (
              <View
                style={{
                  flex: 1,
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Tanggal Presensi</Text>
                <Text style={{ color: '#334155', marginBottom: 8 }}>{formatLongDate(selectedDate)}</Text>
                <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => shiftDate(-1)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: '#334155', fontWeight: '600' }}>-1 Hari</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => {
                        setDraftOverrides({});
                        setSelectedDate(new Date());
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#eff6ff',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Hari Ini</Text>
                    </Pressable>
                  </View>
                  <View style={{ flex: 1, paddingHorizontal: 4 }}>
                    <Pressable
                      onPress={() => shiftDate(1)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: '#334155', fontWeight: '600' }}>+1 Hari</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
              ) : null}
            </View>

            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Mode Tampilan</Text>
              <MobileMenuTabBar
                items={[
                  { key: 'INPUT', label: 'Input Presensi', iconName: 'edit-3' },
                  { key: 'RECAP', label: 'Rekap Presensi', iconName: 'bar-chart-2' },
                ]}
                activeKey={tab}
                onChange={(next) => {
                  setTab(next as TabKey);
                  setSelectedRecapStudentId(null);
                }}
                layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
                minTabWidth={132}
                maxTabWidth={160}
                compact
              />
            </View>

            {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar siswa..." /> : null}
            {detailQuery.isError ? (
              <QueryStateView type="error" message="Gagal memuat detail assignment." onRetry={() => detailQuery.refetch()} />
            ) : null}
            {tab === 'INPUT' && attendanceQuery.isLoading ? <QueryStateView type="loading" message="Memuat presensi pada tanggal terpilih..." /> : null}
            {tab === 'INPUT' && attendanceQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat data presensi mapel."
                onRetry={() => attendanceQuery.refetch()}
              />
            ) : null}

            {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
              tab === 'INPUT' ? (
              <>
                <View
                  style={{
                    backgroundColor: '#1e3a8a',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: '#bfdbfe', fontSize: scaleFont(12), marginBottom: 6 }}>
                    {detailQuery.data.subject.name} • {detailQuery.data.class.name}
                  </Text>
                  <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                    {[
                      { label: 'Hadir', value: stats.present },
                      { label: 'Sakit', value: stats.sick },
                      { label: 'Izin', value: stats.permission },
                      { label: 'Alpha', value: stats.absent },
                      { label: 'Telat', value: stats.late },
                    ].map((item) => (
                      <View key={item.label} style={{ width: '20%', paddingHorizontal: 3 }}>
                        <View
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            borderRadius: 8,
                            paddingVertical: 7,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#bfdbfe', fontSize: scaleFont(10) }} numberOfLines={1}>
                            {item.label}
                          </Text>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(14) }}>{item.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {students.length > 0 ? (
                  <View>
                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        marginBottom: 10,
                      }}
                    >
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Cari siswa (nama / NIS / NISN)"
                        placeholderTextColor="#94a3b8"
                        style={{
                          paddingVertical: 10,
                          color: '#0f172a',
                        }}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', marginHorizontal: -3, marginBottom: 10 }}>
                      {STATUS_OPTIONS.map((statusOption) => (
                        <View key={statusOption.value} style={{ width: '20%', paddingHorizontal: 3 }}>
                          <Pressable
                            onPress={() => markAll(statusOption.value)}
                            style={{
                              backgroundColor: statusOption.bg,
                              borderWidth: 1,
                              borderColor: statusOption.border,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 4,
                              alignItems: 'center',
                              minHeight: 44,
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{ color: statusOption.text, fontWeight: '700', fontSize: scaleFont(10), textAlign: 'center' }}
                              numberOfLines={2}
                            >
                              Semua {statusOption.label}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>

                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#eef4ff',
                          borderBottomWidth: 1,
                          borderBottomColor: '#dbe7fb',
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                        }}
                      >
                        <Text style={{ color: '#334155', fontSize: scaleFont(12), fontWeight: '700' }}>
                          Daftar Presensi Kelas ({filteredStudents.length}/{students.length})
                        </Text>
                      </View>

                      {filteredStudents.length > 0 ? (
                        filteredStudents.map((student, index) => (
                          <View
                            key={student.id}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 9,
                              borderBottomWidth: index === filteredStudents.length - 1 ? 0 : 1,
                              borderBottomColor: '#eef2ff',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  backgroundColor: '#e2e8f0',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: 8,
                                }}
                              >
                                <Text style={{ color: '#334155', fontSize: scaleFont(11), fontWeight: '700' }}>{index + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{ fontWeight: '700', color: '#0f172a', fontSize: scaleFont(14), lineHeight: scaleLineHeight(20) }}
                                  numberOfLines={1}
                                >
                                  {student.name}
                                </Text>
                                <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }} numberOfLines={1}>
                                  NIS: {student.nis || '-'} • NISN: {student.nisn || '-'}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                              {STATUS_OPTIONS.map((option) => {
                                const selected = (draft[student.id] || 'PRESENT') === option.value;
                                return (
                                  <View key={option.value} style={{ width: '20%', paddingHorizontal: 3 }}>
                                    <Pressable
                                      accessibilityLabel={option.label}
                                      onPress={() => handleStatusChange(student.id, option.value)}
                                      style={{
                                        minHeight: 52,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        paddingVertical: 4,
                                      }}
                                    >
                                      <View style={{ minHeight: 26, alignItems: 'center', justifyContent: 'center' }}>
                                        <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
                                          <Feather
                                            name={option.iconName}
                                            size={18}
                                            color={selected ? option.text : '#94a3b8'}
                                          />
                                          {selected ? (
                                            <View
                                              style={{
                                                position: 'absolute',
                                                top: -5,
                                                right: -6,
                                                width: 8,
                                                height: 8,
                                                borderRadius: 999,
                                                backgroundColor: option.text,
                                              }}
                                            />
                                          ) : null}
                                        </View>
                                      </View>
                                      <Text
                                        style={{
                                          color: selected ? option.text : '#64748b',
                                          fontSize: scaleFont(9),
                                          fontWeight: '700',
                                          marginTop: 4,
                                          textAlign: 'center',
                                        }}
                                        numberOfLines={2}
                                      >
                                        {option.label}
                                      </Text>
                                      {selected ? (
                                        <View
                                          style={{
                                            marginTop: 4,
                                            width: 28,
                                            height: 2,
                                            borderRadius: 999,
                                            backgroundColor: option.text,
                                            opacity: 0.7,
                                          }}
                                        />
                                      ) : null}
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: '#64748b' }}>Tidak ada siswa yang cocok dengan pencarian.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderStyle: 'dashed',
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada siswa aktif</Text>
                    <Text style={{ color: '#64748b' }}>Kelas ini belum memiliki data siswa aktif.</Text>
                  </View>
                )}
              </>
              ) : (
                <>
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Filter Rekap</Text>
                    <MobileSelectField
                      label="Periode"
                      value={recapPeriod}
                      options={PERIOD_OPTIONS}
                      onChange={(next) => {
                        setRecapPeriod((next as AttendanceRecapPeriod) || 'WEEK');
                        setSelectedRecapStudentId(null);
                      }}
                      placeholder="Pilih periode"
                    />
                    {recapPeriod === 'SEMESTER' ? (
                      <View style={{ marginTop: 10 }}>
                        <MobileSelectField
                          label="Semester"
                          value={recapSemester}
                          options={SEMESTER_OPTIONS}
                          onChange={(next) => {
                            setRecapSemester((next as Semester) || defaultSemesterByDate());
                            setSelectedRecapStudentId(null);
                          }}
                          placeholder="Pilih semester"
                        />
                      </View>
                    ) : null}
                    {recapPeriod === 'MONTH' ? (
                      <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 10, marginTop: 10 }}>
                        <View style={{ flex: 1 }}>
                          <MobileSelectField
                            label="Bulan"
                            value={recapMonth}
                            options={MONTH_OPTIONS}
                            onChange={(next) => {
                              setRecapMonth(next || String(new Date().getMonth() + 1));
                              setSelectedRecapStudentId(null);
                            }}
                            placeholder="Pilih bulan"
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginBottom: 6 }}>Tahun</Text>
                          <TextInput
                            value={recapYear}
                            onChangeText={(value) => {
                              setRecapYear(value.replace(/[^0-9]/g, '').slice(0, 4));
                              setSelectedRecapStudentId(null);
                            }}
                            keyboardType="number-pad"
                            placeholder="Tahun"
                            placeholderTextColor="#94a3b8"
                            style={{
                              borderWidth: 1,
                              borderColor: '#dbe7fb',
                              borderRadius: 10,
                              paddingHorizontal: 12,
                              paddingVertical: 11,
                              color: '#0f172a',
                              backgroundColor: '#fff',
                            }}
                          />
                        </View>
                      </View>
                    ) : null}
                    {recapPeriod === 'WEEK' ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginBottom: 6 }}>Awal Minggu</Text>
                        <Text style={{ color: '#334155', marginBottom: 8 }}>{formatLongDate(recapWeekStart)}</Text>
                        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                          {[
                            { label: '-7 Hari', offset: -7 },
                            { label: 'Minggu Ini', offset: 0 },
                            { label: '+7 Hari', offset: 7 },
                          ].map((item) => (
                            <View key={item.label} style={{ flex: 1, paddingHorizontal: 4 }}>
                              <Pressable
                                onPress={() => {
                                  setRecapWeekStart(item.offset === 0 ? new Date() : new Date(recapWeekStart.getFullYear(), recapWeekStart.getMonth(), recapWeekStart.getDate() + item.offset));
                                  setSelectedRecapStudentId(null);
                                }}
                                style={{
                                  borderWidth: 1,
                                  borderColor: item.offset === 0 ? '#bfdbfe' : '#cbd5e1',
                                  borderRadius: 8,
                                  paddingVertical: 9,
                                  alignItems: 'center',
                                  backgroundColor: item.offset === 0 ? '#eff6ff' : '#fff',
                                }}
                              >
                                <Text style={{ color: item.offset === 0 ? '#1d4ed8' : '#334155', fontWeight: '700', fontSize: scaleFont(12) }}>
                                  {item.label}
                                </Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>

                  <View
                    style={{
                      backgroundColor: '#1e3a8a',
                      borderRadius: 12,
                      padding: 12,
                      marginBottom: 12,
                    }}
                  >
                    <Text style={{ color: '#bfdbfe', fontSize: scaleFont(12), marginBottom: 6 }}>
                      {detailQuery.data.subject.name} • {detailQuery.data.class.name}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                      {[
                        { label: 'Hadir', value: recapSummary.present },
                        { label: 'Sakit', value: recapSummary.sick },
                        { label: 'Izin', value: recapSummary.permission },
                        { label: 'Alpha', value: recapSummary.absent },
                        { label: 'Telat', value: recapSummary.late },
                      ].map((item) => (
                        <View key={item.label} style={{ width: '20%', paddingHorizontal: 3, marginBottom: 6 }}>
                          <View
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.12)',
                              borderRadius: 8,
                              paddingVertical: 7,
                              alignItems: 'center',
                            }}
                          >
                            <Text style={{ color: '#bfdbfe', fontSize: scaleFont(10) }} numberOfLines={1}>
                              {item.label}
                            </Text>
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(14) }}>{item.value}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    <Text style={{ color: '#fff', fontWeight: '700', marginTop: 4 }}>
                      Rata-rata Kehadiran: {recapSummary.percentage.toFixed(1)}%
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      marginBottom: 10,
                    }}
                  >
                    <TextInput
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Cari siswa (nama / NIS / NISN)"
                      placeholderTextColor="#94a3b8"
                      style={{ paddingVertical: 10, color: '#0f172a' }}
                    />
                  </View>

                  {recapQuery.isLoading ? <QueryStateView type="loading" message="Mengambil rekap presensi mapel..." /> : null}
                  {recapQuery.isError ? (
                    <QueryStateView type="error" message="Gagal memuat rekap presensi mapel." onRetry={() => recapQuery.refetch()} />
                  ) : null}

                  {!recapQuery.isLoading && !recapQuery.isError ? (
                    filteredRecapStudents.length > 0 ? (
                      <View>
                        {filteredRecapStudents.map((row: AttendanceDetailStudent) => {
                          const selected = selectedRecapStudent?.student.id === row.student.id;
                          return (
                            <View
                              key={row.student.id}
                              style={{
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: selected ? '#93c5fd' : '#dbe7fb',
                                borderRadius: 10,
                                padding: 10,
                                marginBottom: 8,
                              }}
                            >
                              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 3 }}>{row.student.name}</Text>
                              <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                                NIS: {row.student.nis || '-'} • NISN: {row.student.nisn || '-'}
                              </Text>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                                {[
                                  { label: 'Hadir', value: row.summary.present, color: '#166534' },
                                  { label: 'Telat', value: row.summary.late, color: '#92400e' },
                                  { label: 'Sakit', value: row.summary.sick, color: '#1d4ed8' },
                                  { label: 'Izin', value: row.summary.permission, color: '#a16207' },
                                  { label: 'Alpha', value: row.summary.absent, color: '#b91c1c' },
                                ].map((item) => (
                                  <View key={item.label} style={{ width: '20%', paddingHorizontal: 3 }}>
                                    <View
                                      style={{
                                        backgroundColor: '#f8fbff',
                                        borderWidth: 1,
                                        borderColor: '#dbe7fb',
                                        borderRadius: 8,
                                        paddingVertical: 6,
                                        alignItems: 'center',
                                      }}
                                    >
                                      <Text style={{ color: '#64748b', fontSize: scaleFont(10) }}>{item.label}</Text>
                                      <Text style={{ color: item.color, fontWeight: '700', fontSize: scaleFont(14) }}>{item.value}</Text>
                                    </View>
                                  </View>
                                ))}
                              </View>
                              <Pressable
                                onPress={() => setSelectedRecapStudentId(selected ? null : row.student.id)}
                                style={{
                                  marginTop: 8,
                                  borderWidth: 1,
                                  borderColor: '#bfdbfe',
                                  borderRadius: 8,
                                  paddingVertical: 8,
                                  alignItems: 'center',
                                  backgroundColor: selected ? '#eff6ff' : '#fff',
                                }}
                              >
                                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                                  {selected ? 'Tutup Detail Tanggal' : 'Lihat Detail Tanggal'}
                                </Text>
                              </Pressable>
                              {selected ? (
                                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 8 }}>
                                  {row.details.length > 0 ? (
                                    row.details.map((detail) => (
                                      <View
                                        key={`${detail.attendanceId || detail.id}-${detail.date}-${detail.status}`}
                                        style={{
                                          borderWidth: 1,
                                          borderColor: '#e2e8f0',
                                          borderRadius: 8,
                                          padding: 8,
                                          marginBottom: 6,
                                          backgroundColor: '#f8fafc',
                                        }}
                                      >
                                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>
                                          {formatShortDate(detail.date)} • {statusLabel(detail.status)}
                                        </Text>
                                        <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginTop: 2 }}>
                                          Catatan: {detail.note || '-'}
                                        </Text>
                                        <Text style={{ color: '#64748b', fontSize: scaleFont(11), marginTop: 2 }}>
                                          Input: {formatDateTime(detail.recordedAt || detail.createdAt)} • Edit: {formatDateTime(detail.editedAt || detail.updatedAt)}
                                        </Text>
                                      </View>
                                    ))
                                  ) : (
                                    <Text style={{ color: '#64748b' }}>Belum ada detail tanggal pada periode ini.</Text>
                                  )}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderStyle: 'dashed',
                          borderRadius: 10,
                          padding: 16,
                          backgroundColor: '#fff',
                        }}
                      >
                        <Text style={{ color: '#64748b' }}>Tidak ada data rekap sesuai filter.</Text>
                      </View>
                    )
                  ) : null}
                </>
              )
            ) : null}

            {tab === 'INPUT' ? (
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedAssignment || !detailQuery.data}
              style={{
                marginTop: 16,
                backgroundColor: saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Presensi'}
              </Text>
            </Pressable>
            ) : null}
          </>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b' }}>Guru belum memiliki penugasan mapel pada tahun ajaran aktif.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: '#1d4ed8',
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
