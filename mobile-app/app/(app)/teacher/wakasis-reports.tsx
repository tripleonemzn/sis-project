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
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminClass, AdminUser, adminApi } from '../../../src/features/admin/adminApi';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { AttendanceRecapRow } from '../../../src/features/attendanceRecap/types';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { KesiswaanPermission } from '../../../src/features/kesiswaan/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type ReportSection = 'RINGKASAN' | 'PER_KELAS' | 'PERIZINAN';
type SemesterFilter = 'ODD' | 'EVEN';
type ReportSummaryId = 'permissions' | 'attendance' | 'approved' | 'absent';

type ClassPermissionSummary = {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  sick: number;
  permission: number;
  other: number;
};

type ClassReportRow = {
  classId: number;
  className: string;
  studentCount: number;
  avgAttendance: number;
  totalLate: number;
  totalAbsent: number;
  permission: ClassPermissionSummary;
};

type StudentPermissionRow = {
  studentId: number;
  studentName: string;
  className: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
};

type MonthPermissionRow = {
  monthKey: string;
  monthLabel: string;
  total: number;
  approved: number;
  rejected: number;
  pending: number;
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

function defaultSemesterByDate(): SemesterFilter {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? 'ODD' : 'EVEN';
}

function createPermissionSummary(): ClassPermissionSummary {
  return {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    sick: 0,
    permission: 0,
    other: 0,
  };
}

function summarizeAttendanceRows(rows: AttendanceRecapRow[]) {
  const studentCount = rows.length;
  if (studentCount === 0) {
    return {
      studentCount: 0,
      avgAttendance: 0,
      totalLate: 0,
      totalAbsent: 0,
    };
  }

  const avgAttendance = rows.reduce((sum, row) => sum + Number(row.percentage || 0), 0) / studentCount;
  const totalLate = rows.reduce((sum, row) => sum + Number(row.late || 0), 0);
  const totalAbsent = rows.reduce((sum, row) => sum + Number(row.absent || 0), 0);

  return {
    studentCount,
    avgAttendance,
    totalLate,
    totalAbsent,
  };
}

function makeMonthKey(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${year}-${month}`;
}

function makeMonthLabel(monthKey: string) {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString('id-ID', {
    month: 'short',
    year: 'numeric',
  });
}

const SECTION_ITEMS: Array<{ key: ReportSection; label: string; iconName: React.ComponentProps<typeof Feather>['name'] }> = [
  { key: 'RINGKASAN', label: 'Ringkasan', iconName: 'grid' },
  { key: 'PER_KELAS', label: 'Per Kelas', iconName: 'layout' },
  { key: 'PERIZINAN', label: 'Perizinan', iconName: 'file-text' },
];

function ProgressRow({ label, valueText, percent }: { label: string; valueText: string; percent: number }) {
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

function getSearchPlaceholder(section: ReportSection) {
  if (section === 'PER_KELAS') return 'Cari nama kelas';
  if (section === 'PERIZINAN') return 'Cari siswa atau kelas';
  return 'Cari ringkasan laporan';
}

export default function TeacherWakasisReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [section, setSection] = useState<ReportSection>('RINGKASAN');
  const [semester, setSemester] = useState<SemesterFilter>(defaultSemesterByDate());
  const [activeSummaryId, setActiveSummaryId] = useState<ReportSummaryId | null>(null);
  const [search, setSearch] = useState('');

  const isAllowed = user?.role === 'TEACHER' && hasStudentAffairsDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakasis-reports-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const reportsQuery = useQuery({
    queryKey: ['mobile-wakasis-reports-data', activeYearQuery.data?.id, semester],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);

      const [classesResult, students, permissionPayload] = await Promise.all([
        adminApi.listClasses({
          academicYearId,
          page: 1,
          limit: 350,
        }),
        adminApi.listUsers({ role: 'STUDENT' }),
        kesiswaanApi.listPermissionApprovals({
          academicYearId,
          page: 1,
          limit: 2000,
        }),
      ]);

      const classes = [...(classesResult.items || [])].sort((a: AdminClass, b: AdminClass) =>
        (a.name || '').localeCompare(b.name || '', 'id'),
      );

      const studentClassMap = new Map<number, { classId: number; className: string }>();
      for (const student of students as AdminUser[]) {
        if (!student.studentClass?.id) continue;
        studentClassMap.set(student.id, {
          classId: student.studentClass.id,
          className: student.studentClass.name || `Kelas ${student.studentClass.id}`,
        });
      }

      const permissions = permissionPayload.permissions || [];
      const permissionByClass = new Map<number, ClassPermissionSummary>();
      const permissionByStudent = new Map<number, StudentPermissionRow>();
      const permissionByMonth = new Map<string, MonthPermissionRow>();

      const ensureClassPermission = (classId: number) => {
        if (!permissionByClass.has(classId)) {
          permissionByClass.set(classId, createPermissionSummary());
        }
        return permissionByClass.get(classId)!;
      };

      const ensureMonthPermission = (monthKey: string) => {
        if (!permissionByMonth.has(monthKey)) {
          permissionByMonth.set(monthKey, {
            monthKey,
            monthLabel: makeMonthLabel(monthKey),
            total: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
          });
        }
        return permissionByMonth.get(monthKey)!;
      };

      for (const permission of permissions as KesiswaanPermission[]) {
        const studentClass = studentClassMap.get(permission.studentId);
        if (!studentClass) continue;

        const classSummary = ensureClassPermission(studentClass.classId);
        classSummary.total += 1;
        if (permission.status === 'PENDING') classSummary.pending += 1;
        if (permission.status === 'APPROVED') classSummary.approved += 1;
        if (permission.status === 'REJECTED') classSummary.rejected += 1;
        if (permission.type === 'SICK') classSummary.sick += 1;
        if (permission.type === 'PERMISSION') classSummary.permission += 1;
        if (permission.type === 'OTHER') classSummary.other += 1;

        if (!permissionByStudent.has(permission.studentId)) {
          permissionByStudent.set(permission.studentId, {
            studentId: permission.studentId,
            studentName: permission.student?.name || `Siswa ${permission.studentId}`,
            className: studentClass.className,
            total: 0,
            approved: 0,
            rejected: 0,
            pending: 0,
          });
        }

        const studentRow = permissionByStudent.get(permission.studentId)!;
        studentRow.total += 1;
        if (permission.status === 'APPROVED') studentRow.approved += 1;
        if (permission.status === 'REJECTED') studentRow.rejected += 1;
        if (permission.status === 'PENDING') studentRow.pending += 1;

        const monthKey = makeMonthKey(permission.createdAt || permission.startDate);
        if (monthKey) {
          const monthRow = ensureMonthPermission(monthKey);
          monthRow.total += 1;
          if (permission.status === 'APPROVED') monthRow.approved += 1;
          if (permission.status === 'REJECTED') monthRow.rejected += 1;
          if (permission.status === 'PENDING') monthRow.pending += 1;
        }
      }

      const attendanceByClass = new Map<number, ReturnType<typeof summarizeAttendanceRows>>();
      await Promise.all(
        classes.map(async (item: AdminClass) => {
          try {
            const recap = await attendanceRecapApi.getDailyRecap({
              classId: item.id,
              academicYearId,
              semester,
            });
            attendanceByClass.set(item.id, summarizeAttendanceRows(recap?.recap || []));
          } catch {
            attendanceByClass.set(item.id, summarizeAttendanceRows([]));
          }
        }),
      );

      const classReports: ClassReportRow[] = classes.map((item: AdminClass) => {
        const attendance = attendanceByClass.get(item.id) || summarizeAttendanceRows([]);
        const permission = permissionByClass.get(item.id) || createPermissionSummary();

        return {
          classId: item.id,
          className: item.name || `Kelas ${item.id}`,
          studentCount: attendance.studentCount,
          avgAttendance: attendance.avgAttendance,
          totalLate: attendance.totalLate,
          totalAbsent: attendance.totalAbsent,
          permission,
        };
      });

      const studentPermissionRows = Array.from(permissionByStudent.values()).sort((a, b) => b.total - a.total);
      const monthPermissionRows = Array.from(permissionByMonth.values()).sort((a, b) =>
        a.monthKey.localeCompare(b.monthKey),
      );

      return {
        classReports,
        studentPermissionRows,
        monthPermissionRows,
        permissions,
      };
    },
  });

  const classReports = useMemo(
    () => reportsQuery.data?.classReports || [],
    [reportsQuery.data?.classReports],
  );
  const studentPermissionRows = useMemo(
    () => reportsQuery.data?.studentPermissionRows || [],
    [reportsQuery.data?.studentPermissionRows],
  );
  const monthPermissionRows = useMemo(
    () => reportsQuery.data?.monthPermissionRows || [],
    [reportsQuery.data?.monthPermissionRows],
  );
  const permissions = useMemo(() => reportsQuery.data?.permissions || [], [reportsQuery.data?.permissions]);
  const normalizedSearch = search.trim().toLowerCase();

  const filteredClassReports = useMemo(() => {
    if (!normalizedSearch) return classReports;
    return classReports.filter((row) => row.className.toLowerCase().includes(normalizedSearch));
  }, [classReports, normalizedSearch]);

  const filteredStudentPermissionRows = useMemo(() => {
    if (!normalizedSearch) return studentPermissionRows;
    return studentPermissionRows.filter((row) => {
      const haystacks = [row.studentName || '', row.className || ''];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [studentPermissionRows, normalizedSearch]);

  const summary = useMemo(() => {
    const totalClasses = classReports.length;
    const avgAttendance =
      totalClasses > 0 ? classReports.reduce((sum, row) => sum + row.avgAttendance, 0) / totalClasses : 0;

    const totalPermissions = permissions.length;
    const pendingPermissions = permissions.filter((item) => item.status === 'PENDING').length;
    const approvedPermissions = permissions.filter((item) => item.status === 'APPROVED').length;
    const rejectedPermissions = permissions.filter((item) => item.status === 'REJECTED').length;

    const sickPermissions = permissions.filter((item) => item.type === 'SICK').length;
    const permissionPermissions = permissions.filter((item) => item.type === 'PERMISSION').length;
    const otherPermissions = permissions.filter((item) => item.type === 'OTHER').length;

    const classLowAttendanceCount = classReports.filter((row) => row.avgAttendance < 85).length;
    const totalAbsent = classReports.reduce((sum, row) => sum + row.totalAbsent, 0);
    const totalLate = classReports.reduce((sum, row) => sum + row.totalLate, 0);

    return {
      totalClasses,
      avgAttendance,
      totalPermissions,
      pendingPermissions,
      approvedPermissions,
      rejectedPermissions,
      sickPermissions,
      permissionPermissions,
      otherPermissions,
      classLowAttendanceCount,
      totalAbsent,
      totalLate,
    };
  }, [classReports, permissions]);

  const semesterOptions = useMemo(
    () => [
      { label: 'Semester Ganjil', value: 'ODD' },
      { label: 'Semester Genap', value: 'EVEN' },
    ],
    [],
  );
  const summaryCards = useMemo<
    Array<{
      id: ReportSummaryId;
      title: string;
      value: string;
      subtitle: string;
      iconName: React.ComponentProps<typeof Feather>['name'];
      accentColor: string;
    }>
  >(
    () => [
      {
        id: 'permissions',
        title: 'Total Pengajuan',
        value: formatNumber(summary.totalPermissions),
        subtitle: `${formatNumber(summary.pendingPermissions)} menunggu persetujuan`,
        iconName: 'file-text',
        accentColor: '#2563eb',
      },
      {
        id: 'attendance',
        title: 'Rata-rata Kehadiran',
        value: formatPercent(summary.avgAttendance),
        subtitle: `${formatNumber(summary.classLowAttendanceCount)} kelas di bawah 85%`,
        iconName: 'activity',
        accentColor: '#0f766e',
      },
      {
        id: 'approved',
        title: 'Status Disetujui',
        value: formatNumber(summary.approvedPermissions),
        subtitle: `Ditolak: ${formatNumber(summary.rejectedPermissions)}`,
        iconName: 'check-circle',
        accentColor: '#16a34a',
      },
      {
        id: 'absent',
        title: 'Absensi Kumulatif',
        value: formatNumber(summary.totalAbsent),
        subtitle: `Telat: ${formatNumber(summary.totalLate)}`,
        iconName: 'alert-circle',
        accentColor: '#ef4444',
      },
    ],
    [
      summary.approvedPermissions,
      summary.avgAttendance,
      summary.classLowAttendanceCount,
      summary.pendingPermissions,
      summary.rejectedPermissions,
      summary.totalAbsent,
      summary.totalLate,
      summary.totalPermissions,
    ],
  );
  const activeSummaryMeta = summaryCards.find((item) => item.id === activeSummaryId) || null;

  const topRiskClasses = useMemo(() => {
    return [...classReports]
      .sort((a, b) => {
        if (a.avgAttendance !== b.avgAttendance) return a.avgAttendance - b.avgAttendance;
        return b.permission.total - a.permission.total;
      })
      .slice(0, 5);
  }, [classReports]);

  const topPermissionStudents = useMemo(() => studentPermissionRows.slice(0, 8), [studentPermissionRows]);

  if (isLoading) return <AppLoadingScreen message="Memuat laporan kesiswaan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Laporan Kesiswaan</Text>
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
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Laporan Kesiswaan
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
          refreshing={activeYearQuery.isFetching || reportsQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void reportsQuery.refetch();
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
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 20, fontWeight: '700' }}>
          Laporan Kesiswaan
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Ringkasan laporan absensi, perizinan siswa, dan temuan kelas prioritas.
      </Text>

      <MobileSelectField
        label="Semester"
        value={semester}
        options={semesterOptions}
        onChange={(value) => setSemester(value as SemesterFilter)}
        placeholder="Pilih semester"
      />

      <MobileMenuTabBar
        items={SECTION_ITEMS}
        activeKey={section}
        onChange={(key) => setSection(key as ReportSection)}
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
          }}
        />
      </View>

      {reportsQuery.isLoading ? <QueryStateView type="loading" message="Menyusun laporan kesiswaan..." /> : null}

      {reportsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat laporan kesiswaan." onRetry={() => reportsQuery.refetch()} />
      ) : null}

      {reportsQuery.data ? (
        <>
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
                  label="Rasio Persetujuan"
                  valueText={`${formatNumber(summary.approvedPermissions)} dari ${formatNumber(summary.totalPermissions)}`}
                  percent={toPercent(summary.approvedPermissions, summary.totalPermissions)}
                />
                <ProgressRow
                  label="Jenis Izin Sakit"
                  valueText={`${formatNumber(summary.sickPermissions)} data`}
                  percent={toPercent(summary.sickPermissions, summary.totalPermissions)}
                />
                <ProgressRow
                  label="Jenis Izin"
                  valueText={`${formatNumber(summary.permissionPermissions)} data`}
                  percent={toPercent(summary.permissionPermissions, summary.totalPermissions)}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Kelas Prioritas</Text>
                {topRiskClasses.length === 0 ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data kelas.</Text>
                ) : (
                  topRiskClasses.map((item) => (
                    <View key={item.classId} style={{ marginBottom: 6 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.className}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Kehadiran {formatPercent(item.avgAttendance)} • Izin {formatNumber(item.permission.total)} • Alpha {formatNumber(item.totalAbsent)}
                      </Text>
                    </View>
                  ))
                )}
              </View>
            </>
          ) : null}

          {section === 'PER_KELAS' ? (
            <View style={{ gap: 10 }}>
              {filteredClassReports.length === 0 ? (
                <QueryStateView type="error" message="Data kelas tidak ditemukan untuk filter saat ini." />
              ) : (
                filteredClassReports
                  .slice()
                  .sort((a, b) => a.className.localeCompare(b.className, 'id'))
                  .map((item) => (
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
                        Siswa terekap: {formatNumber(item.studentCount)} • Kehadiran: {formatPercent(item.avgAttendance)}
                      </Text>

                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Alpha: {formatNumber(item.totalAbsent)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Telat: {formatNumber(item.totalLate)}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Izin total: {formatNumber(item.permission.total)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Pending: {formatNumber(item.permission.pending)}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                          Ditolak: {formatNumber(item.permission.rejected)}
                        </Text>
                      </View>
                    </View>
                  ))
              )}
            </View>
          ) : null}

          {section === 'PERIZINAN' ? (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 }}>
                <View style={{ width: '48.5%', marginBottom: 8 }}>
                  <MobileSummaryCard
                    title="Izin Sakit"
                    value={formatNumber(summary.sickPermissions)}
                    subtitle={`Lainnya: ${formatNumber(summary.otherPermissions)}`}
                    iconName="heart"
                    accentColor="#ef4444"
                  />
                </View>
                <View style={{ width: '48.5%', marginBottom: 8 }}>
                  <MobileSummaryCard
                    title="Izin Umum"
                    value={formatNumber(summary.permissionPermissions)}
                    subtitle={`Pending: ${formatNumber(summary.pendingPermissions)}`}
                    iconName="file-text"
                    accentColor="#2563eb"
                  />
                </View>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Tren Bulanan</Text>
                {monthPermissionRows.length === 0 ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data perizinan.</Text>
                ) : (
                  monthPermissionRows.slice(-6).map((item) => (
                    <View key={item.monthKey} style={{ marginBottom: 6 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.monthLabel}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Total {formatNumber(item.total)} • Disetujui {formatNumber(item.approved)} • Ditolak {formatNumber(item.rejected)}
                      </Text>
                    </View>
                  ))
                )}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Siswa Pengajuan Terbanyak</Text>
                {topPermissionStudents.length === 0 ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data siswa.</Text>
                ) : (
                  topPermissionStudents.map((item) => (
                    <View key={item.studentId} style={{ marginBottom: 6 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.studentName}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        {item.className} • Total {formatNumber(item.total)} • Approved {formatNumber(item.approved)} • Rejected {formatNumber(item.rejected)}
                      </Text>
                    </View>
                  ))
                )}
              </View>

              <View style={{ gap: 10 }}>
                {filteredStudentPermissionRows.length > 0 ? (
                  filteredStudentPermissionRows.slice(0, 20).map((item) => (
                    <View
                      key={`${item.studentId}-${item.className}`}
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.studentName}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        {item.className} • Total {formatNumber(item.total)} • Pending {formatNumber(item.pending)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <QueryStateView type="error" message="Data perizinan siswa tidak ditemukan untuk filter saat ini." />
                )}
              </View>
            </>
          ) : null}

        </>
      ) : null}

      <MobileDetailModal
        visible={Boolean(activeSummaryId && activeSummaryMeta)}
        title={activeSummaryMeta?.title || 'Ringkasan Laporan'}
        subtitle="Ringkasan detail ditampilkan di popup agar layar utama mobile tetap hemat ruang."
        iconName={activeSummaryMeta?.iconName || 'bar-chart-2'}
        accentColor={activeSummaryMeta?.accentColor || BRAND_COLORS.blue}
        onClose={() => setActiveSummaryId(null)}
      >
        {activeSummaryId === 'permissions' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
            Total pengajuan masuk: {formatNumber(summary.totalPermissions)}. Yang masih menunggu persetujuan saat ini sebanyak {formatNumber(summary.pendingPermissions)}.
          </Text>
        ) : null}
        {activeSummaryId === 'attendance' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
            Rata-rata kehadiran seluruh kelas: {formatPercent(summary.avgAttendance)}. Kelas yang berada di bawah 85% saat ini berjumlah {formatNumber(summary.classLowAttendanceCount)}.
          </Text>
        ) : null}
        {activeSummaryId === 'approved' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
            Pengajuan yang sudah disetujui: {formatNumber(summary.approvedPermissions)}. Pengajuan yang ditolak: {formatNumber(summary.rejectedPermissions)}.
          </Text>
        ) : null}
        {activeSummaryId === 'absent' ? (
          <Text style={{ color: BRAND_COLORS.textMuted, lineHeight: 20 }}>
            Total alpha kumulatif: {formatNumber(summary.totalAbsent)}. Total keterlambatan kumulatif: {formatNumber(summary.totalLate)}.
          </Text>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
