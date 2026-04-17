import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { scaleLineHeightWithAppTextScale, scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileDetailModal } from '../../../src/components/MobileDetailModal';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminClass, AdminUser, adminApi } from '../../../src/features/admin/adminApi';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import HomeroomBookMobilePanel from '../../../src/features/homeroomBook/HomeroomBookMobilePanel';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { KesiswaanTutorAssignment } from '../../../src/features/kesiswaan/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type StudentSection = 'RINGKASAN' | 'SISWA' | 'ORTU' | 'PEMBINA' | 'EKSKUL' | 'ABSENSI' | 'BUKU_WALI_KELAS';
type StudentSummaryId = 'students' | 'parents' | 'advisors' | 'clubs';

type AttendanceClassRow = {
  classId: number;
  className: string;
  students: number;
  avgAttendance: number;
  totalLate: number;
  totalAbsent: number;
};

type AdvisorUser = AdminUser & {
  advisorSourceLabel: string;
};

function hasStudentAffairsDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KESISWAAN') || duties.includes('SEKRETARIS_KESISWAAN');
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID');
}

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(1).replace('.', ',')}%`;
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) return 0;
  return (numerator / denominator) * 100;
}

function resolveStudentStatusLabel(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'ACTIVE') return 'Aktif';
  if (normalized === 'GRADUATED') return 'Lulus';
  if (normalized === 'MOVED') return 'Pindah';
  if (normalized === 'DROPPED_OUT') return 'Drop Out';
  return 'Tidak Diketahui';
}

function resolveStudentStatusStyle(status: string | null | undefined) {
  const normalized = (status || '').toUpperCase();
  if (normalized === 'ACTIVE') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (normalized === 'GRADUATED') return { bg: '#e0e7ff', border: '#a5b4fc', text: '#3730a3' };
  if (normalized === 'MOVED') return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  if (normalized === 'DROPPED_OUT') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  return { bg: '#e2e8f0', border: '#cbd5e1', text: '#334155' };
}

const SECTION_ITEMS: Array<{ key: StudentSection; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'RINGKASAN', label: 'Ringkasan', iconName: 'grid' },
  { key: 'SISWA', label: 'Siswa', iconName: 'user' },
  { key: 'ORTU', label: 'Orang Tua', iconName: 'users' },
  { key: 'PEMBINA', label: 'Pembina', iconName: 'shield' },
  { key: 'EKSKUL', label: 'Ekstrakurikuler', iconName: 'activity' },
  { key: 'ABSENSI', label: 'Absensi', iconName: 'check-square' },
  { key: 'BUKU_WALI_KELAS', label: 'Buku Wali', iconName: 'book-open' },
];

function StatusBadge({ status }: { status: string | null | undefined }) {
  const style = resolveStudentStatusStyle(status);
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: style.border,
        backgroundColor: style.bg,
      }}
    >
      <Text style={{ color: style.text, fontWeight: '700', fontSize: scaleWithAppTextScale(11) }}>
        {resolveStudentStatusLabel(status)}
      </Text>
    </View>
  );
}

function getSearchPlaceholder(section: StudentSection) {
  if (section === 'SISWA') return 'Cari siswa (nama/username/kelas)';
  if (section === 'ORTU') return 'Cari orang tua (nama/username)';
  if (section === 'PEMBINA') return 'Cari pembina ekskul atau guru aktif';
  if (section === 'EKSKUL') return 'Cari ekstrakurikuler';
  if (section === 'ABSENSI') return 'Cari nama kelas';
  if (section === 'BUKU_WALI_KELAS') return 'Cari entri Buku Wali Kelas';
  return 'Cari data kesiswaan';
}

export default function TeacherWakasisStudentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [section, setSection] = useState<StudentSection>('RINGKASAN');
  const [activeSummaryId, setActiveSummaryId] = useState<StudentSummaryId | null>(null);
  const [search, setSearch] = useState('');
  const openStudentCrud = (target: 'STUDENT' | 'PARENT' | 'ADVISORS' | 'EXTRACURRICULARS' | 'ATTENDANCE') => {
    if (target === 'EXTRACURRICULARS') {
      router.push('/admin/master-data?section=extracurriculars' as never);
      return;
    }
    if (target === 'ADVISORS') {
      router.push('/admin/user-management?role=EXTRACURRICULAR_TUTOR' as never);
      return;
    }
    if (target === 'ATTENDANCE') {
      router.push('/admin/academic?section=attendance-recap' as never);
      return;
    }
    router.push(`/admin/user-management?role=${target}` as never);
  };

  const isAllowed = user?.role === 'TEACHER' && hasStudentAffairsDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakasis-students-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const baseDataQuery = useQuery({
    queryKey: ['mobile-wakasis-students-base', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);
      const [students, parents, teachers, externalTutors, extracurricularResult, assignments, classesResult] = await Promise.all([
        adminApi.listUsers({ role: 'STUDENT' }),
        adminApi.listUsers({ role: 'PARENT' }),
        adminApi.listUsers({ role: 'TEACHER' }),
        adminApi.listUsers({ role: 'EXTRACURRICULAR_TUTOR' }),
        kesiswaanApi.listExtracurriculars({ page: 1, limit: 300 }),
        kesiswaanApi.listTutorAssignments({ academicYearId }),
        adminApi.listClasses({
          academicYearId,
          page: 1,
          limit: 300,
        }),
      ]);

      return {
        students,
        parents,
        advisors: [...teachers, ...externalTutors]
          .map((advisor) => ({
            ...advisor,
            advisorSourceLabel:
              String(advisor.role || '').toUpperCase() === 'TEACHER'
                ? 'Guru Aktif'
                : 'Tutor Eksternal',
          }))
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
        extracurriculars: extracurricularResult.extracurriculars,
        assignments,
        classes: classesResult.items,
      };
    },
  });

  const students = useMemo(() => baseDataQuery.data?.students || [], [baseDataQuery.data?.students]);
  const parents = useMemo(() => baseDataQuery.data?.parents || [], [baseDataQuery.data?.parents]);
  const tutors = useMemo<AdvisorUser[]>(() => baseDataQuery.data?.advisors || [], [baseDataQuery.data?.advisors]);
  const extracurriculars = useMemo(
    () => baseDataQuery.data?.extracurriculars || [],
    [baseDataQuery.data?.extracurriculars],
  );
  const assignments = useMemo(() => baseDataQuery.data?.assignments || [], [baseDataQuery.data?.assignments]);
  const classes = useMemo(() => baseDataQuery.data?.classes || [], [baseDataQuery.data?.classes]);
  const normalizedSearch = search.trim().toLowerCase();

  const assignmentsByTutor = useMemo(() => {
    const map = new Map<number, KesiswaanTutorAssignment[]>();
    for (const assignment of assignments) {
      if (!assignment.tutorId) continue;
      if (!map.has(assignment.tutorId)) {
        map.set(assignment.tutorId, []);
      }
      map.get(assignment.tutorId)!.push(assignment);
    }
    return map;
  }, [assignments]);

  const assignmentsByEkskul = useMemo(() => {
    const map = new Map<number, KesiswaanTutorAssignment[]>();
    for (const assignment of assignments) {
      if (!assignment.ekskulId) continue;
      if (!map.has(assignment.ekskulId)) {
        map.set(assignment.ekskulId, []);
      }
      map.get(assignment.ekskulId)!.push(assignment);
    }
    return map;
  }, [assignments]);

  const studentStats = useMemo(() => {
    const result = {
      total: students.length,
      active: 0,
      graduated: 0,
      moved: 0,
      droppedOut: 0,
    };

    for (const student of students as AdminUser[]) {
      const status = (student.studentStatus || '').toUpperCase();
      if (status === 'ACTIVE') result.active += 1;
      if (status === 'GRADUATED') result.graduated += 1;
      if (status === 'MOVED') result.moved += 1;
      if (status === 'DROPPED_OUT') result.droppedOut += 1;
    }

    return result;
  }, [students]);

  const summary = useMemo(() => {
    const parentsWithChildren = parents.filter((item) => (item.children?.length || 0) > 0).length;
    const assignedTutorIds = new Set(assignments.map((item) => item.tutorId).filter(Boolean));
    const assignedEkskulIds = new Set(assignments.map((item) => item.ekskulId).filter(Boolean));

    return {
      parentsTotal: parents.length,
      parentsWithChildren,
      tutorsTotal: tutors.length,
      tutorsAssigned: assignedTutorIds.size,
      extracurricularTotal: extracurriculars.length,
      extracurricularAssigned: assignedEkskulIds.size,
      classTotal: classes.length,
    };
  }, [parents, tutors, assignments, extracurriculars, classes]);

  const filteredStudents = useMemo(() => {
    if (!normalizedSearch) return students;
    return students.filter((item) => {
      const haystacks = [
        item.name || '',
        item.username || '',
        item.studentClass?.name || '',
        resolveStudentStatusLabel(item.studentStatus),
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [students, normalizedSearch]);

  const filteredParents = useMemo(() => {
    if (!normalizedSearch) return parents;
    return parents.filter((item) => {
      const childNames = (item.children || []).map((child) => child.name || '').join(' ');
      const haystacks = [item.name || '', item.username || '', childNames];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [parents, normalizedSearch]);

  const filteredTutors = useMemo(() => {
    if (!normalizedSearch) return tutors;
    return tutors.filter((item) => {
      const assignmentsOfTutor = assignmentsByTutor.get(item.id) || [];
      const ekskulNames = assignmentsOfTutor.map((row) => row.ekskul?.name || '').join(' ');
      const haystacks = [item.name || '', item.username || '', item.advisorSourceLabel || '', ekskulNames];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [tutors, normalizedSearch, assignmentsByTutor]);

  const filteredExtracurriculars = useMemo(() => {
    if (!normalizedSearch) return extracurriculars;
    return extracurriculars.filter((item) => {
      const assignmentRows = assignmentsByEkskul.get(item.id) || [];
      const tutorNames = assignmentRows.map((row) => row.tutor?.name || '').join(' ');
      const haystacks = [item.name || '', item.description || '', tutorNames];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [extracurriculars, normalizedSearch, assignmentsByEkskul]);

  const attendanceClassQuery = useQuery({
    queryKey: ['mobile-wakasis-students-attendance-by-class', activeYearQuery.data?.id, classes.length],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id && section === 'ABSENSI' && classes.length > 0,
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);
      const sortedClasses = [...classes].sort((a: AdminClass, b: AdminClass) =>
        (a.name || '').localeCompare(b.name || '', 'id'),
      );

      const classRows = await Promise.all(
        sortedClasses.map(async (item: AdminClass): Promise<AttendanceClassRow | null> => {
          try {
            const recap = await attendanceRecapApi.getDailyRecap({
              classId: item.id,
              academicYearId,
            });
            const rows = recap?.recap || [];
            const avgAttendance = rows.length
              ? rows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / rows.length
              : 0;
            const totalLate = rows.reduce((sum, row) => sum + Number(row.late || 0), 0);
            const totalAbsent = rows.reduce((sum, row) => sum + Number(row.absent || 0), 0);

            return {
              classId: item.id,
              className: item.name || `Kelas ${item.id}`,
              students: rows.length,
              avgAttendance,
              totalLate,
              totalAbsent,
            };
          } catch {
            return null;
          }
        }),
      );

      return classRows.filter((item): item is AttendanceClassRow => !!item);
    },
  });

  const filteredAttendanceClasses = useMemo(() => {
    const rows = attendanceClassQuery.data || [];
    const searched = !normalizedSearch
      ? rows
      : rows.filter((item) => item.className.toLowerCase().includes(normalizedSearch));
    return [...searched].sort((a, b) => a.avgAttendance - b.avgAttendance);
  }, [attendanceClassQuery.data, normalizedSearch]);

  const attendanceSummary = useMemo(() => {
    const rows = attendanceClassQuery.data || [];
    if (!rows.length) {
      return {
        avgAttendance: 0,
        totalLate: 0,
        totalAbsent: 0,
        classesWithRisk: 0,
      };
    }

    const avgAttendance = rows.reduce((sum, row) => sum + row.avgAttendance, 0) / rows.length;
    const totalLate = rows.reduce((sum, row) => sum + row.totalLate, 0);
    const totalAbsent = rows.reduce((sum, row) => sum + row.totalAbsent, 0);
    const classesWithRisk = rows.filter((row) => row.avgAttendance < 85).length;

    return {
      avgAttendance,
      totalLate,
      totalAbsent,
      classesWithRisk,
    };
  }, [attendanceClassQuery.data]);

  const summaryCards = useMemo<
    Array<{
      id: StudentSummaryId;
      title: string;
      value: string;
      subtitle: string;
      iconName: React.ComponentProps<typeof Feather>['name'];
      accentColor: string;
    }>
  >(
    () => [
      {
        id: 'students',
        title: 'Total Siswa',
        value: formatNumber(studentStats.total),
        subtitle: `${formatNumber(studentStats.active)} siswa aktif`,
        iconName: 'user',
        accentColor: '#2563eb',
      },
      {
        id: 'parents',
        title: 'Orang Tua',
        value: formatNumber(summary.parentsTotal),
        subtitle: `${formatNumber(summary.parentsWithChildren)} sudah terhubung`,
        iconName: 'users',
        accentColor: '#7c3aed',
      },
      {
        id: 'advisors',
        title: 'Pembina Aktif',
        value: formatNumber(summary.tutorsTotal),
        subtitle: `${formatNumber(summary.tutorsAssigned)} sudah ditugaskan`,
        iconName: 'shield',
        accentColor: '#0ea5e9',
      },
      {
        id: 'clubs',
        title: 'Ekstrakurikuler',
        value: formatNumber(summary.extracurricularTotal),
        subtitle: `${formatNumber(summary.extracurricularAssigned)} sudah ada pembina`,
        iconName: 'activity',
        accentColor: '#ec4899',
      },
    ],
    [
      studentStats.total,
      studentStats.active,
      summary.parentsTotal,
      summary.parentsWithChildren,
      summary.tutorsTotal,
      summary.tutorsAssigned,
      summary.extracurricularTotal,
      summary.extracurricularAssigned,
    ],
  );
  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;

  if (isLoading) return <AppLoadingScreen message="Memuat modul kesiswaan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Kelola Kesiswaan</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Kelola Kesiswaan
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan Wakasek Kesiswaan atau Sekretaris Kesiswaan."
        />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching ||
            baseDataQuery.isFetching ||
            (section === 'ABSENSI' && attendanceClassQuery.isFetching)
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void baseDataQuery.refetch();
            if (section === 'ABSENSI') {
              void attendanceClassQuery.refetch();
            }
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: scaleWithAppTextScale(20), fontWeight: '700' }}>
          Kelola Kesiswaan
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Kelola data siswa, orang tua, pembina ekskul dari guru aktif atau tutor eksternal, dan ringkasan absensi per kelas.
      </Text>

      {activeYearQuery.isLoading ? <QueryStateView type="loading" message="Memuat tahun ajaran aktif..." /> : null}

      {!activeYearQuery.isLoading && !activeYearQuery.data ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." />
        </View>
      ) : null}

      {baseDataQuery.isLoading ? <QueryStateView type="loading" message="Memuat data kesiswaan..." /> : null}

      {baseDataQuery.isError ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView
            type="error"
            message="Gagal memuat data kesiswaan."
            onRetry={() => baseDataQuery.refetch()}
          />
        </View>
      ) : null}

      {baseDataQuery.data ? (
        <>
          <MobileMenuTabBar
            items={SECTION_ITEMS}
            activeKey={section}
            onChange={(key) => setSection(key as StudentSection)}
            style={{ marginBottom: 12 }}
            contentContainerStyle={{ paddingRight: 8 }}
            minTabWidth={74}
            maxTabWidth={110}
          />

          {section !== 'BUKU_WALI_KELAS' ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: '#fff',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#d6e0f2',
                paddingHorizontal: 12,
                marginBottom: 12,
              }}
            >
              <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={getSearchPlaceholder(section)}
                placeholderTextColor="#94a3b8"
                style={{
                  flex: 1,
                  paddingHorizontal: 8,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                }}
              />
            </View>
          ) : null}

          {section === 'RINGKASAN' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 }}>
                {summaryCards.map((item) => (
                  <View key={item.id} style={{ width: '48.5%', marginBottom: 8 }}>
                    <MobileSummaryCard
                      title={item.title}
                      value={item.value}
                      subtitle={item.subtitle}
                      iconName={item.iconName}
                      accentColor={item.accentColor}
                      onPress={() => setActiveSummaryId(item.id)}
                    />
                  </View>
                ))}
              </View>

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Cakupan Kesiswaan</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Kelas tercatat: {formatNumber(summary.classTotal)} kelas
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Siswa lulus: {formatNumber(studentStats.graduated)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Siswa pindah: {formatNumber(studentStats.moved)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Siswa drop out: {formatNumber(studentStats.droppedOut)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  • Rasio pembina aktif: {formatPercent(toPercent(summary.tutorsAssigned, summary.tutorsTotal))}
                </Text>
              </View>

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Aksi Kelola (CRUD)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    { label: 'Kelola Siswa', action: () => openStudentCrud('STUDENT') },
                    { label: 'Kelola Orang Tua', action: () => openStudentCrud('PARENT') },
                    { label: 'Kelola Tutor Eksternal', action: () => openStudentCrud('ADVISORS') },
                    { label: 'Kelola Ekstrakurikuler', action: () => openStudentCrud('EXTRACURRICULARS') },
                    { label: 'Rekap Absensi', action: () => openStudentCrud('ATTENDANCE') },
                  ].map((item) => (
                    <View key={item.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={item.action}
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          borderRadius: 10,
                          backgroundColor: '#f8fbff',
                          paddingVertical: 9,
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>{item.label}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}

          {section === 'SISWA' ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => openStudentCrud('STUDENT')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Kelola Siswa</Text>
              </Pressable>
              {filteredStudents.length === 0 ? (
                <QueryStateView type="error" message="Data siswa tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredStudents.slice(0, 150).map((student) => (
                  <View
                    key={student.id}
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>{student.username}</Text>
                      </View>
                      <StatusBadge status={student.studentStatus} />
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                        Kelas: {student.studentClass?.name || '-'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>NISN: {student.nisn || '-'}</Text>
                    </View>
                  </View>
                ))
              )}
              {filteredStudents.length > 150 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', fontSize: scaleWithAppTextScale(12) }}>
                  Menampilkan 150 dari {formatNumber(filteredStudents.length)} data siswa.
                </Text>
              ) : null}
            </View>
          ) : null}

          {section === 'ORTU' ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => openStudentCrud('PARENT')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Kelola Orang Tua</Text>
              </Pressable>
              {filteredParents.length === 0 ? (
                <QueryStateView type="error" message="Data orang tua tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredParents.slice(0, 150).map((parent) => {
                  const children = parent.children || [];
                  const childPreview = children.slice(0, 3).map((item) => item.name).filter(Boolean).join(', ');
                  return (
                    <View
                      key={parent.id}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{parent.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>{parent.username}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                        Anak terhubung: {formatNumber(children.length)}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 2, fontSize: scaleWithAppTextScale(12) }}>
                        {childPreview || '-'}
                      </Text>
                    </View>
                  );
                })
              )}
              {filteredParents.length > 150 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', fontSize: scaleWithAppTextScale(12) }}>
                  Menampilkan 150 dari {formatNumber(filteredParents.length)} data orang tua.
                </Text>
              ) : null}
            </View>
          ) : null}

          {section === 'BUKU_WALI_KELAS' ? (
            <HomeroomBookMobilePanel
              mode="student_affairs"
              academicYearId={activeYearQuery.data?.id}
            />
          ) : null}

          {section === 'PEMBINA' ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => openStudentCrud('ADVISORS')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Kelola Tutor Eksternal</Text>
              </Pressable>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                Guru aktif sebagai pembina dikelola dari menu Kelola Ekstrakurikuler.
              </Text>
              {filteredTutors.length === 0 ? (
                <QueryStateView type="error" message="Data pembina aktif tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredTutors.slice(0, 150).map((tutor) => {
                  const rows = assignmentsByTutor.get(tutor.id) || [];
                  const ekskulNames = rows
                    .map((item) => item.ekskul?.name || '-')
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ');
                  return (
                    <View
                      key={tutor.id}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{tutor.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>{tutor.username}</Text>
                      <Text style={{ color: '#1d4ed8', marginTop: 4, fontSize: scaleWithAppTextScale(12), fontWeight: '700' }}>
                        {tutor.advisorSourceLabel}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                        Tugas aktif: {formatNumber(rows.length)} ekstrakurikuler
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 2, fontSize: scaleWithAppTextScale(12) }}>{ekskulNames || '-'}</Text>
                    </View>
                  );
                })
              )}
              {filteredTutors.length > 150 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', fontSize: scaleWithAppTextScale(12) }}>
                  Menampilkan 150 dari {formatNumber(filteredTutors.length)} data pembina.
                </Text>
              ) : null}
            </View>
          ) : null}

          {section === 'EKSKUL' ? (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={() => openStudentCrud('EXTRACURRICULARS')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Kelola Ekstrakurikuler</Text>
              </Pressable>
              {filteredExtracurriculars.length === 0 ? (
                <QueryStateView type="error" message="Data ekstrakurikuler tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredExtracurriculars.map((item) => {
                  const assignmentRows = assignmentsByEkskul.get(item.id) || [];
                  const tutorNames = assignmentRows
                    .map((row) => row.tutor?.name || '')
                    .filter(Boolean)
                    .slice(0, 3)
                    .join(', ');
                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                        {item.description || '-'}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 6 }}>
                        Pembina aktif: {formatNumber(assignmentRows.length)}
                      </Text>
                      <Text style={{ color: '#64748b', marginTop: 2, fontSize: scaleWithAppTextScale(12) }}>{tutorNames || '-'}</Text>
                    </View>
                  );
                })
              )}
            </View>
          ) : null}

          {section === 'ABSENSI' ? (
            <>
              <Pressable
                onPress={() => openStudentCrud('ATTENDANCE')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Rekap Absensi Lengkap</Text>
              </Pressable>
              {attendanceClassQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat rekap absensi per kelas..." />
              ) : null}

              {attendanceClassQuery.isError ? (
                <View style={{ marginBottom: 10 }}>
                  <QueryStateView
                    type="error"
                    message="Gagal memuat rekap absensi kelas."
                    onRetry={() => attendanceClassQuery.refetch()}
                  />
                </View>
              ) : null}

              {attendanceClassQuery.data ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={{ width: '48.5%', marginBottom: 8 }}>
                      <MobileSummaryCard
                        title="Rata-rata Kehadiran"
                        value={formatPercent(attendanceSummary.avgAttendance)}
                        subtitle={`${formatNumber(attendanceSummary.classesWithRisk)} kelas di bawah 85%`}
                        iconName="activity"
                        accentColor="#0f766e"
                      />
                    </View>
                    <View style={{ width: '48.5%', marginBottom: 8 }}>
                      <MobileSummaryCard
                        title="Total Terlambat"
                        value={formatNumber(attendanceSummary.totalLate)}
                        subtitle="Akumulasi seluruh kelas"
                        iconName="clock"
                        accentColor="#f59e0b"
                      />
                    </View>
                    <View style={{ width: '48.5%', marginBottom: 8 }}>
                      <MobileSummaryCard
                        title="Total Alpha"
                        value={formatNumber(attendanceSummary.totalAbsent)}
                        subtitle="Akumulasi seluruh kelas"
                        iconName="alert-circle"
                        accentColor="#ef4444"
                      />
                    </View>
                    <View style={{ width: '48.5%', marginBottom: 8 }}>
                      <MobileSummaryCard
                        title="Kelas Terekap"
                        value={formatNumber((attendanceClassQuery.data || []).length)}
                        subtitle="Kelas dengan data absensi"
                        iconName="layout"
                        accentColor="#2563eb"
                      />
                    </View>
                  </View>

                  <View style={{ gap: 10 }}>
                    {filteredAttendanceClasses.length === 0 ? (
                      <QueryStateView type="error" message="Data absensi kelas tidak ditemukan untuk filter saat ini." />
                    ) : (
                      filteredAttendanceClasses.map((item) => (
                        <View
                          key={item.classId}
                          style={{
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 12,
                            padding: 12,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.className}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                            Rata-rata hadir: {formatPercent(item.avgAttendance)} | Siswa: {formatNumber(item.students)}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                              Terlambat: {formatNumber(item.totalLate)}
                            </Text>
                            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                              Alpha: {formatNumber(item.totalAbsent)}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

        </>
      ) : null}

      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Kesiswaan'}
        subtitle="Ringkasan utama dibuat compact, sedangkan detailnya ditampilkan lewat popup."
        iconName={activeSummaryMeta?.iconName || 'bar-chart-2'}
        accentColor={activeSummaryMeta?.accentColor || BRAND_COLORS.blue}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'students' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: scaleLineHeightWithAppTextScale(20) }}>
            Total siswa terdaftar: {formatNumber(studentStats.total)}. Siswa aktif saat ini: {formatNumber(studentStats.active)}, lulus: {formatNumber(studentStats.graduated)}, pindah: {formatNumber(studentStats.moved)}, dan drop out: {formatNumber(studentStats.droppedOut)}.
          </Text>
        ) : null}
        {activeSummaryId === 'parents' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: scaleLineHeightWithAppTextScale(20) }}>
            Total akun orang tua: {formatNumber(summary.parentsTotal)}. Yang sudah terhubung dengan data anak: {formatNumber(summary.parentsWithChildren)}.
          </Text>
        ) : null}
        {activeSummaryId === 'advisors' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: scaleLineHeightWithAppTextScale(20) }}>
            Total pembina/tutor terdata: {formatNumber(summary.tutorsTotal)}. Yang sudah mendapat penugasan aktif: {formatNumber(summary.tutorsAssigned)}.
          </Text>
        ) : null}
        {activeSummaryId === 'clubs' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: scaleLineHeightWithAppTextScale(20) }}>
            Total ekstrakurikuler: {formatNumber(summary.extracurricularTotal)}. Yang sudah memiliki pembina aktif: {formatNumber(summary.extracurricularAssigned)}.
          </Text>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
