import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
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
import { AdminClass, adminApi } from '../../../src/features/admin/adminApi';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { AttendanceRecapRow } from '../../../src/features/attendanceRecap/types';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type PerformanceSection = 'RINGKASAN' | 'RISIKO_SISWA' | 'DISIPLIN_KELAS';
type PerformanceSummaryId = 'students' | 'attendance' | 'risk' | 'behavior';

type ClassPerformanceRow = {
  classId: number;
  className: string;
  studentCount: number;
  avgAttendance: number;
  totalLate: number;
  totalAbsent: number;
  positiveBehaviorCount: number;
  negativeBehaviorCount: number;
  riskCount: number;
};

type RiskStudentRow = {
  studentId: number;
  studentName: string;
  nisn?: string | null;
  classId: number;
  className: string;
  percentage: number;
  present: number;
  late: number;
  absent: number;
  sick: number;
  permission: number;
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

function resolveRiskLevel(percentage: number) {
  if (percentage < 75) {
    return { label: 'Tinggi', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' };
  }
  if (percentage < 85) {
    return { label: 'Sedang', bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
  }
  return { label: 'Rendah', bg: '#dcfce7', border: '#86efac', text: '#166534' };
}

const SECTION_ITEMS: Array<{ key: PerformanceSection; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'RINGKASAN', label: 'Ringkasan', iconName: 'grid' },
  { key: 'RISIKO_SISWA', label: 'Risiko Siswa', iconName: 'alert-triangle' },
  { key: 'DISIPLIN_KELAS', label: 'Disiplin Kelas', iconName: 'shield' },
];

function ProgressRow({
  label,
  valueText,
  percent,
  labelTextStyle,
  valueTextStyle,
}: {
  label: string;
  valueText: string;
  percent: number;
  labelTextStyle?: { fontSize?: number; lineHeight?: number };
  valueTextStyle?: { fontSize?: number; lineHeight?: number };
}) {
  const safePercent = Math.max(0, Math.min(100, percent));

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', ...labelTextStyle }}>{label}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, ...valueTextStyle }}>{valueText}</Text>
      </View>
      <View style={{ height: 8, borderRadius: 999, backgroundColor: '#dde7fa', overflow: 'hidden' }}>
        <View
          style={{
            width: `${safePercent}%`,
            height: 8,
            borderRadius: 999,
            backgroundColor: BRAND_COLORS.blue,
          }}
        />
      </View>
    </View>
  );
}

function getSearchPlaceholder(section: PerformanceSection) {
  if (section === 'RISIKO_SISWA') return 'Cari siswa / kelas / NISN';
  if (section === 'DISIPLIN_KELAS') return 'Cari nama kelas';
  return 'Cari data ringkasan';
}

function buildRiskRows(className: string, classId: number, recapRows: AttendanceRecapRow[]): RiskStudentRow[] {
  return recapRows
    .map((row) => ({
      studentId: row.student.id,
      studentName: row.student.name,
      nisn: row.student.nisn,
      classId,
      className,
      percentage: Number(row.percentage || 0),
      present: Number(row.present || 0),
      late: Number(row.late || 0),
      absent: Number(row.absent || 0),
      sick: Number(row.sick || 0),
      permission: Number(row.permission || 0),
    }))
    .filter((row) => row.percentage < 85)
    .sort((a, b) => a.percentage - b.percentage);
}

export default function TeacherWakasisPerformanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const [section, setSection] = useState<PerformanceSection>('RINGKASAN');
  const [activeSummaryId, setActiveSummaryId] = useState<PerformanceSummaryId | null>(null);
  const [search, setSearch] = useState('');
  const headingTextStyle = useMemo(
    () => ({ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28) }),
    [scaleFont, scaleLineHeight],
  );
  const sectionTitleTextStyle = useMemo(
    () => ({ fontSize: scaleFont(16), lineHeight: scaleLineHeight(24) }),
    [scaleFont, scaleLineHeight],
  );
  const bodyTextStyle = useMemo(
    () => ({ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }),
    [scaleFont, scaleLineHeight],
  );
  const helperTextStyle = useMemo(
    () => ({ fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }),
    [scaleFont, scaleLineHeight],
  );
  const inputTextStyle = useMemo(
    () => ({ fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }),
    [scaleFont, scaleLineHeight],
  );

  const isAllowed = user?.role === 'TEACHER' && hasStudentAffairsDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakasis-performance-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-wakasis-performance-classes', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        academicYearId: Number(activeYearQuery.data?.id),
        page: 1,
        limit: 320,
      });
      return result.items;
    },
  });

  const studentTotalsQuery = useQuery({
    queryKey: ['mobile-wakasis-performance-student-totals'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => {
      const students = await adminApi.listUsers({ role: 'STUDENT' });
      return {
        totalStudents: students.length,
        activeStudents: students.filter((item) => String(item.studentStatus || '').toUpperCase() === 'ACTIVE').length,
      };
    },
  });

  const classPerformanceQuery = useQuery({
    queryKey: ['mobile-wakasis-performance-class-performance', activeYearQuery.data?.id, classesQuery.data?.length],
    enabled:
      isAuthenticated &&
      !!isAllowed &&
      !!activeYearQuery.data?.id &&
      !!classesQuery.data &&
      classesQuery.data.length > 0,
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);
      const classes = [...(classesQuery.data || [])].sort((a: AdminClass, b: AdminClass) =>
        (a.name || '').localeCompare(b.name || '', 'id'),
      );

      const classRows: ClassPerformanceRow[] = [];
      const riskRows: RiskStudentRow[] = [];

      for (const cls of classes) {
        const className = cls.name || `Kelas ${cls.id}`;

        let attendanceRows: AttendanceRecapRow[] = [];
        let avgAttendance = 0;
        let totalLate = 0;
        let totalAbsent = 0;

        try {
          const recap = await attendanceRecapApi.getDailyRecap({
            classId: cls.id,
            academicYearId,
          });
          attendanceRows = recap?.recap || [];
          if (attendanceRows.length > 0) {
            avgAttendance =
              attendanceRows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / attendanceRows.length;
            totalLate = attendanceRows.reduce((sum, row) => sum + Number(row.late || 0), 0);
            totalAbsent = attendanceRows.reduce((sum, row) => sum + Number(row.absent || 0), 0);
          }
        } catch {
          attendanceRows = [];
        }

        riskRows.push(...buildRiskRows(className, cls.id, attendanceRows));

        let positiveBehaviorCount = 0;
        let negativeBehaviorCount = 0;

        try {
          const [positive, negative] = await Promise.all([
            kesiswaanApi.getBehaviors({
              classId: cls.id,
              academicYearId,
              type: 'POSITIVE',
              page: 1,
              limit: 1,
            }),
            kesiswaanApi.getBehaviors({
              classId: cls.id,
              academicYearId,
              type: 'NEGATIVE',
              page: 1,
              limit: 1,
            }),
          ]);

          positiveBehaviorCount = positive?.meta?.total || 0;
          negativeBehaviorCount = negative?.meta?.total || 0;
        } catch {
          positiveBehaviorCount = 0;
          negativeBehaviorCount = 0;
        }

        const riskCount = attendanceRows.filter((row) => Number(row.percentage || 0) < 85).length;

        classRows.push({
          classId: cls.id,
          className,
          studentCount: attendanceRows.length,
          avgAttendance,
          totalLate,
          totalAbsent,
          positiveBehaviorCount,
          negativeBehaviorCount,
          riskCount,
        });
      }

      return {
        classRows,
        riskRows,
      };
    },
  });

  const normalizedSearch = search.trim().toLowerCase();
  const classRows = useMemo(
    () => classPerformanceQuery.data?.classRows || [],
    [classPerformanceQuery.data?.classRows],
  );
  const riskRows = useMemo(
    () => classPerformanceQuery.data?.riskRows || [],
    [classPerformanceQuery.data?.riskRows],
  );

  const filteredRiskRows = useMemo(() => {
    if (!normalizedSearch) return riskRows;
    return riskRows.filter((item) => {
      const haystacks = [item.studentName || '', item.className || '', item.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [riskRows, normalizedSearch]);

  const filteredClassRows = useMemo(() => {
    if (!normalizedSearch) return classRows;
    return classRows.filter((item) => item.className.toLowerCase().includes(normalizedSearch));
  }, [classRows, normalizedSearch]);

  const summary = useMemo(() => {
    const totalClasses = classRows.length;
    const avgAttendance =
      totalClasses > 0 ? classRows.reduce((sum, row) => sum + row.avgAttendance, 0) / totalClasses : 0;
    const totalNegativeBehavior = classRows.reduce((sum, row) => sum + row.negativeBehaviorCount, 0);
    const totalPositiveBehavior = classRows.reduce((sum, row) => sum + row.positiveBehaviorCount, 0);
    const totalRiskStudents = riskRows.length;
    const highRiskStudents = riskRows.filter((row) => row.percentage < 75).length;
    const classesWithRisk = classRows.filter((row) => row.riskCount > 0).length;

    return {
      totalClasses,
      avgAttendance,
      totalNegativeBehavior,
      totalPositiveBehavior,
      totalRiskStudents,
      highRiskStudents,
      classesWithRisk,
    };
  }, [classRows, riskRows]);

  const summaryCards = useMemo<
    Array<{
      id: PerformanceSummaryId;
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
        value: formatNumber(studentTotalsQuery.data?.totalStudents || 0),
        subtitle: `${formatNumber(studentTotalsQuery.data?.activeStudents || 0)} siswa aktif`,
        iconName: 'users',
        accentColor: '#2563eb',
      },
      {
        id: 'attendance',
        title: 'Rata-rata Kehadiran',
        value: formatPercent(summary.avgAttendance),
        subtitle: `${formatNumber(summary.classesWithRisk)} kelas punya siswa berisiko`,
        iconName: 'activity',
        accentColor: '#0f766e',
      },
      {
        id: 'risk',
        title: 'Risiko Siswa',
        value: formatNumber(summary.totalRiskStudents),
        subtitle: `${formatNumber(summary.highRiskStudents)} kategori tinggi (<75%)`,
        iconName: 'alert-triangle',
        accentColor: '#ef4444',
      },
      {
        id: 'behavior',
        title: 'Perilaku Negatif',
        value: formatNumber(summary.totalNegativeBehavior),
        subtitle: `Positif: ${formatNumber(summary.totalPositiveBehavior)}`,
        iconName: 'shield',
        accentColor: '#f59e0b',
      },
    ],
    [
      studentTotalsQuery.data?.activeStudents,
      studentTotalsQuery.data?.totalStudents,
      summary.avgAttendance,
      summary.classesWithRisk,
      summary.highRiskStudents,
      summary.totalNegativeBehavior,
      summary.totalPositiveBehavior,
      summary.totalRiskStudents,
    ],
  );
  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring kinerja siswa..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8 }}>Monitoring Kinerja</Text>
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
          <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ ...headingTextStyle, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Monitoring Kinerja
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
          <Text style={{ color: '#fff', fontWeight: '700', ...bodyTextStyle }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const isRefreshing =
    activeYearQuery.isFetching ||
    classesQuery.isFetching ||
    studentTotalsQuery.isFetching ||
    classPerformanceQuery.isFetching;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void studentTotalsQuery.refetch();
            void classPerformanceQuery.refetch();
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontWeight: '700', ...headingTextStyle }}>
          Monitoring Kinerja
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10, ...inputTextStyle }}>
        Pantau risiko siswa berdasarkan absensi dan disiplin perilaku pada setiap kelas.
      </Text>

      {activeYearQuery.isLoading ? <QueryStateView type="loading" message="Memuat tahun ajaran aktif..." /> : null}

      {!activeYearQuery.isLoading && !activeYearQuery.data ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." />
        </View>
      ) : null}

      {(classesQuery.isLoading || studentTotalsQuery.isLoading || classPerformanceQuery.isLoading) &&
      !classPerformanceQuery.data ? (
        <QueryStateView type="loading" message="Menghitung performa siswa per kelas..." />
      ) : null}

      {(classesQuery.isError || studentTotalsQuery.isError || classPerformanceQuery.isError) ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView
            type="error"
            message="Gagal memuat data monitoring kinerja siswa."
            onRetry={() => {
              void classesQuery.refetch();
              void studentTotalsQuery.refetch();
              void classPerformanceQuery.refetch();
            }}
          />
        </View>
      ) : null}

      {classPerformanceQuery.data ? (
        <>
          <MobileMenuTabBar
            items={SECTION_ITEMS}
            activeKey={section}
            onChange={(key) => setSection(key as PerformanceSection)}
            style={{ marginBottom: 12 }}
            contentContainerStyle={{ paddingRight: 8 }}
            minTabWidth={74}
            maxTabWidth={108}
          />

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
                ...inputTextStyle,
              }}
            />
          </View>

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
                <ProgressRow
                  label="Cakupan Kelas Terekap"
                  valueText={`${formatNumber(summary.totalClasses)} kelas`}
                  percent={toPercent(summary.totalClasses, classesQuery.data?.length || 0)}
                  labelTextStyle={bodyTextStyle}
                  valueTextStyle={helperTextStyle}
                />
                <ProgressRow
                  label="Siswa Berisiko Tinggi"
                  valueText={`${formatNumber(summary.highRiskStudents)} dari ${formatNumber(summary.totalRiskStudents)}`}
                  percent={toPercent(summary.highRiskStudents, summary.totalRiskStudents || 1)}
                  labelTextStyle={bodyTextStyle}
                  valueTextStyle={helperTextStyle}
                />
                <ProgressRow
                  label="Perilaku Positif"
                  valueText={`${formatNumber(summary.totalPositiveBehavior)} data`}
                  percent={toPercent(
                    summary.totalPositiveBehavior,
                    summary.totalPositiveBehavior + summary.totalNegativeBehavior,
                  )}
                  labelTextStyle={bodyTextStyle}
                  valueTextStyle={helperTextStyle}
                />
              </View>

              <View
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6, ...sectionTitleTextStyle }}>Catatan Cepat</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4, ...bodyTextStyle }}>
                  • Kelas dengan siswa berisiko: {formatNumber(summary.classesWithRisk)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4, ...bodyTextStyle }}>
                  • Total perilaku negatif: {formatNumber(summary.totalNegativeBehavior)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                  • Total perilaku positif: {formatNumber(summary.totalPositiveBehavior)}
                </Text>
              </View>
            </>
          ) : null}

          {section === 'RISIKO_SISWA' ? (
            <View style={{ gap: 10 }}>
              {filteredRiskRows.length === 0 ? (
                <QueryStateView type="error" message="Tidak ada siswa berisiko untuk filter saat ini." />
              ) : (
                filteredRiskRows.slice(0, 200).map((item) => {
                  const level = resolveRiskLevel(item.percentage);
                  return (
                    <View
                      key={`${item.studentId}-${item.classId}`}
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
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...sectionTitleTextStyle }}>{item.studentName}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                            {item.className} | NISN: {item.nisn || '-'}
                          </Text>
                        </View>
                        <View
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            borderWidth: 1,
                            borderColor: level.border,
                            backgroundColor: level.bg,
                          }}
                        >
                          <Text style={{ color: level.text, fontWeight: '700', ...helperTextStyle }}>{level.label}</Text>
                        </View>
                      </View>

                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8, ...bodyTextStyle }}>
                        Kehadiran: {formatPercent(item.percentage)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                          Hadir: {formatNumber(item.present)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                          Telat: {formatNumber(item.late)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                          Alpha: {formatNumber(item.absent)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
              {filteredRiskRows.length > 200 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', ...bodyTextStyle }}>
                  Menampilkan 200 dari {formatNumber(filteredRiskRows.length)} siswa berisiko.
                </Text>
              ) : null}
            </View>
          ) : null}

          {section === 'DISIPLIN_KELAS' ? (
            <View style={{ gap: 10 }}>
              {filteredClassRows.length === 0 ? (
                <QueryStateView type="error" message="Data disiplin kelas tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredClassRows.map((item) => (
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
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', ...sectionTitleTextStyle }}>{item.className}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2, ...bodyTextStyle }}>
                      Rata-rata kehadiran: {formatPercent(item.avgAttendance)} | Siswa: {formatNumber(item.studentCount)}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        Positif: {formatNumber(item.positiveBehaviorCount)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        Negatif: {formatNumber(item.negativeBehaviorCount)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 3 }}>
                      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        Siswa berisiko: {formatNumber(item.riskCount)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        Alpha: {formatNumber(item.totalAbsent)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
                        Telat: {formatNumber(item.totalLate)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          ) : null}

        </>
      ) : null}

      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Kinerja'}
        subtitle="Detail ringkasan dipindahkan ke popup agar tampilan utama tetap rapi di layar mobile."
        iconName={activeSummaryMeta?.iconName || 'bar-chart-2'}
        accentColor={activeSummaryMeta?.accentColor || BRAND_COLORS.blue}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'students' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
            Total siswa terdaftar: {formatNumber(studentTotalsQuery.data?.totalStudents || 0)}. Dari jumlah itu, siswa aktif saat ini sebanyak {formatNumber(studentTotalsQuery.data?.activeStudents || 0)}.
          </Text>
        ) : null}
        {activeSummaryId === 'attendance' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
            Rata-rata kehadiran seluruh kelas: {formatPercent(summary.avgAttendance)}. Saat ini ada {formatNumber(summary.classesWithRisk)} kelas yang punya siswa berisiko berdasarkan absensi.
          </Text>
        ) : null}
        {activeSummaryId === 'risk' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
            Total siswa berisiko: {formatNumber(summary.totalRiskStudents)}. Kategori tinggi di bawah 75% berjumlah {formatNumber(summary.highRiskStudents)} siswa.
          </Text>
        ) : null}
        {activeSummaryId === 'behavior' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, ...bodyTextStyle }}>
            Perilaku negatif tercatat: {formatNumber(summary.totalNegativeBehavior)} data. Sebagai pembanding, perilaku positif yang masuk sistem berjumlah {formatNumber(summary.totalPositiveBehavior)} data.
          </Text>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
