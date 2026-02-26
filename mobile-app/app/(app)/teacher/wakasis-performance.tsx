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
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminClass, adminApi } from '../../../src/features/admin/adminApi';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { AttendanceRecapRow } from '../../../src/features/attendanceRecap/types';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type PerformanceSection = 'RINGKASAN' | 'RISIKO_SISWA' | 'DISIPLIN_KELAS';

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

function SectionChip({
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
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
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
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

function ProgressRow({
  label,
  valueText,
  percent,
}: {
  label: string;
  valueText: string;
  percent: number;
}) {
  const safePercent = Math.max(0, Math.min(100, percent));

  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{valueText}</Text>
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
  const [section, setSection] = useState<PerformanceSection>('RINGKASAN');
  const [search, setSearch] = useState('');

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
  const classRows = classPerformanceQuery.data?.classRows || [];
  const riskRows = classPerformanceQuery.data?.riskRows || [];

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

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring kinerja siswa..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Monitoring Kinerja Siswa</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Monitoring Kinerja Siswa
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Monitoring Kinerja Siswa
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
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
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <SectionChip active={section === 'RINGKASAN'} label="Ringkasan" onPress={() => setSection('RINGKASAN')} />
            <SectionChip
              active={section === 'RISIKO_SISWA'}
              label="Risiko Siswa"
              onPress={() => setSection('RISIKO_SISWA')}
            />
            <SectionChip
              active={section === 'DISIPLIN_KELAS'}
              label="Disiplin Kelas"
              onPress={() => setSection('DISIPLIN_KELAS')}
            />
          </View>

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

          {section === 'RINGKASAN' ? (
            <>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Total Siswa"
                  value={formatNumber(studentTotalsQuery.data?.totalStudents || 0)}
                  subtitle={`${formatNumber(studentTotalsQuery.data?.activeStudents || 0)} siswa aktif`}
                />
                <SummaryCard
                  title="Rata-rata Kehadiran"
                  value={formatPercent(summary.avgAttendance)}
                  subtitle={`${formatNumber(summary.classesWithRisk)} kelas punya siswa berisiko`}
                />
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                <SummaryCard
                  title="Risiko Siswa"
                  value={formatNumber(summary.totalRiskStudents)}
                  subtitle={`${formatNumber(summary.highRiskStudents)} kategori tinggi (<75%)`}
                />
                <SummaryCard
                  title="Perilaku Negatif"
                  value={formatNumber(summary.totalNegativeBehavior)}
                  subtitle={`Positif: ${formatNumber(summary.totalPositiveBehavior)}`}
                />
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
                />
                <ProgressRow
                  label="Siswa Berisiko Tinggi"
                  valueText={`${formatNumber(summary.highRiskStudents)} dari ${formatNumber(summary.totalRiskStudents)}`}
                  percent={toPercent(summary.highRiskStudents, summary.totalRiskStudents || 1)}
                />
                <ProgressRow
                  label="Perilaku Positif"
                  valueText={`${formatNumber(summary.totalPositiveBehavior)} data`}
                  percent={toPercent(
                    summary.totalPositiveBehavior,
                    summary.totalPositiveBehavior + summary.totalNegativeBehavior,
                  )}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Catatan Cepat</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Kelas dengan siswa berisiko: {formatNumber(summary.classesWithRisk)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 4 }}>
                  • Total perilaku negatif: {formatNumber(summary.totalNegativeBehavior)}
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
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
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.studentName}</Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
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
                          <Text style={{ color: level.text, fontWeight: '700', fontSize: 11 }}>{level.label}</Text>
                        </View>
                      </View>

                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 8 }}>
                        Kehadiran: {formatPercent(item.percentage)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Hadir: {formatNumber(item.present)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Telat: {formatNumber(item.late)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Alpha: {formatNumber(item.absent)}
                        </Text>
                      </View>
                    </View>
                  );
                })
              )}
              {filteredRiskRows.length > 200 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, textAlign: 'center', fontSize: 12 }}>
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
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.className}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                      Rata-rata kehadiran: {formatPercent(item.avgAttendance)} | Siswa: {formatNumber(item.studentCount)}
                    </Text>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Positif: {formatNumber(item.positiveBehaviorCount)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Negatif: {formatNumber(item.negativeBehaviorCount)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 3 }}>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Siswa berisiko: {formatNumber(item.riskCount)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Alpha: {formatNumber(item.totalAbsent)}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
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
    </ScrollView>
  );
}
