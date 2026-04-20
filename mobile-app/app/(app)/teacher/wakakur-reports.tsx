import { Feather } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { attendanceRecapApi } from '../../../src/features/attendanceRecap/attendanceRecapApi';
import { principalApi } from '../../../src/features/principal/principalApi';
import { finalLedgerApi, type FinalLedgerPreviewRow } from '../../../src/features/reports/finalLedgerApi';
import { type PrincipalProctorReportRow } from '../../../src/features/principal/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type SemesterChoice = 'ALL' | 'ODD' | 'EVEN';

const semesterLabel: Record<SemesterChoice, string> = {
  ALL: 'Semua Semester',
  ODD: 'Semester Ganjil',
  EVEN: 'Semester Genap',
};

function hasCurriculumDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value: number) {
  return value.toLocaleString('id-ID');
}

function formatScore(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return '-';
  return Number(value).toFixed(2).replace('.', ',');
}

async function openExternalUrl(url: string) {
  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    Alert.alert('Gagal', 'Tautan verifikasi tidak dapat dibuka pada perangkat ini.');
    return;
  }
  await Linking.openURL(url);
}

function getWebBaseUrl() {
  return ENV.API_BASE_URL.replace(/\/api\/?$/, '');
}

function formatSafeDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatSafeTime(value: string | null | undefined) {
  if (!value) return '--.--';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = String(value).match(/(\d{2}:\d{2})/);
    return fallback ? fallback[1].replace(':', '.') : String(value);
  }
  return parsed
    .toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Jakarta',
    })
    .replace(':', '.');
}

function SummaryMetric({
  label,
  value,
  bg,
  border,
  text,
}: {
  label: string;
  value: string;
  bg: string;
  border: string;
  text: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 140,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: text, fontSize: scaleWithAppTextScale(12) }}>{label}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleWithAppTextScale(18), fontWeight: '800', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

function StudentPreviewCard({ row }: { row: FinalLedgerPreviewRow }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
        backgroundColor: '#fff',
      }}
    >
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(14) }}>{row.student.name}</Text>
      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
        {row.student.class?.name || '-'} • {row.student.major?.code || '-'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        <SummaryMetric label="Portofolio" value={formatScore(row.portfolioAverage)} bg="#f8fafc" border="#e2e8f0" text="#475569" />
        <SummaryMetric label="US" value={formatScore(row.usAverage)} bg="#eef2ff" border="#c7d2fe" text="#4338ca" />
        <SummaryMetric label="PKL" value={formatScore(row.pklScore)} bg="#fdf2f8" border="#fbcfe8" text="#be185d" />
        <SummaryMetric label="Nilai Akhir" value={formatScore(row.finalScore)} bg="#ecfeff" border="#a5f3fc" text="#0f766e" />
      </View>
    </View>
  );
}

export default function TeacherWakakurReportsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedSemester, setSelectedSemester] = useState<SemesterChoice>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<number | 'ALL'>('ALL');
  const [reportDate] = useState<string>(todayIso());

  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakakur-reports-active-year'],
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
    queryKey: ['mobile-wakakur-reports-classes', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const response = await adminApi.listClasses({
        academicYearId: Number(activeYearQuery.data?.id),
        page: 1,
        limit: 400,
      });
      return response.items;
    },
  });

  const ledgerQuery = useQuery({
    queryKey: ['mobile-wakakur-reports-ledger', activeYearQuery.data?.id, selectedSemester, selectedClassId],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () =>
      finalLedgerApi.getPreview({
        academicYearIds: [Number(activeYearQuery.data?.id)],
        semesters: selectedSemester === 'ALL' ? ['ODD', 'EVEN'] : [selectedSemester],
        classId: selectedClassId === 'ALL' ? undefined : Number(selectedClassId),
        limitStudents: 300,
      }),
  });

  const attendanceQuery = useQuery({
    queryKey: ['mobile-wakakur-reports-attendance', activeYearQuery.data?.id, selectedClassId, selectedSemester],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id && selectedClassId !== 'ALL',
    queryFn: async () => {
      const academicYearId = Number(activeYearQuery.data?.id);
      const classId = Number(selectedClassId);
      const semesterParam = selectedSemester === 'ALL' ? undefined : selectedSemester;
      const [dailyRecap, lateSummary] = await Promise.all([
        attendanceRecapApi.getDailyRecap({
          classId,
          academicYearId,
          semester: semesterParam,
        }),
        adminApi.getLateSummaryByClass({
          classId,
          academicYearId,
        }),
      ]);
      return {
        dailyRecap,
        lateSummary,
      };
    },
  });

  const proctorSummaryQuery = useQuery({
    queryKey: ['mobile-wakakur-reports-proctor', activeYearQuery.data?.id, reportDate],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const payload = await principalApi.getProctorReports({
        academicYearId: Number(activeYearQuery.data?.id),
        date: reportDate,
      });
      const rows = Array.isArray(payload?.rows) ? payload.rows : [];
      const summary = payload?.summary || {
        totalRooms: rows.length,
        totalExpected: rows.reduce((sum, row) => sum + Number(row.expectedParticipants || 0), 0),
        totalPresent: rows.reduce((sum, row) => sum + Number(row.presentParticipants || 0), 0),
        totalAbsent: rows.reduce((sum, row) => sum + Number(row.absentParticipants || 0), 0),
        reportedRooms: rows.filter((row) => Boolean(row.report)).length,
      };
      return { summary, rows };
    },
  });

  const groupedProctorTimeGroups = useMemo(() => {
    const rows = (proctorSummaryQuery.data?.rows || []) as PrincipalProctorReportRow[];
    const grouped = new Map<
      string,
      {
        timeKey: string;
        startTime: string;
        endTime: string;
        periodNumber: number | null;
        sessionLabel: string | null;
        rows: PrincipalProctorReportRow[];
      }
    >();

    rows.forEach((row) => {
      const periodNumber = Number.isFinite(Number(row.periodNumber)) ? Number(row.periodNumber) : null;
      const sessionLabel = typeof row.sessionLabel === 'string' && row.sessionLabel.trim() ? row.sessionLabel.trim() : null;
      const timeKey = [row.startTime, row.endTime, periodNumber ?? '', sessionLabel ?? ''].join('|');
      if (!grouped.has(timeKey)) {
        grouped.set(timeKey, {
          timeKey,
          startTime: row.startTime,
          endTime: row.endTime,
          periodNumber,
          sessionLabel,
          rows: [],
        });
      }
      grouped.get(timeKey)?.rows.push(row);
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        rows: [...group.rows].sort((left, right) =>
          String(left.room || '').localeCompare(String(right.room || ''), 'id', { sensitivity: 'base' }),
        ),
      }))
      .sort((left, right) => {
        const leftTime = new Date(left.startTime).getTime();
        const rightTime = new Date(right.startTime).getTime();
        if (leftTime !== rightTime) return leftTime - rightTime;
        return Number(left.periodNumber || 0) - Number(right.periodNumber || 0);
      });
  }, [proctorSummaryQuery.data?.rows]);

  const classOptions = useMemo(
    () => (classesQuery.data || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'id')),
    [classesQuery.data],
  );
  const semesterOptions = useMemo(
    () => (['ALL', 'ODD', 'EVEN'] as SemesterChoice[]).map((choice) => ({ value: choice, label: semesterLabel[choice] })),
    [],
  );
  const classFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Kelas' },
      ...classOptions.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.name || `Kelas ${classItem.id}`,
      })),
    ],
    [classOptions],
  );

  const previewRows = useMemo(() => (ledgerQuery.data?.rows || []).slice(0, 20), [ledgerQuery.data?.rows]);

  const attendanceAggregate = useMemo(() => {
    const recapRows = attendanceQuery.data?.dailyRecap?.recap || [];
    if (recapRows.length === 0) {
      return { present: 0, sick: 0, permission: 0, absent: 0, late: 0 };
    }
    return recapRows.reduce(
      (acc, row) => ({
        present: acc.present + Number(row.present || 0),
        sick: acc.sick + Number(row.sick || 0),
        permission: acc.permission + Number(row.permission || 0),
        absent: acc.absent + Number(row.absent || 0),
        late: acc.late + Number(row.late || 0),
      }),
      { present: 0, sick: 0, permission: 0, absent: 0, late: 0 },
    );
  }, [attendanceQuery.data?.dailyRecap?.recap]);

  const lateTotal = useMemo(() => {
    const recapRows = attendanceQuery.data?.lateSummary?.recap || [];
    return recapRows.reduce((sum, row) => sum + Number(row.totalLate || 0), 0);
  }, [attendanceQuery.data?.lateSummary?.recap]);

  if (isLoading) return <AppLoadingScreen message="Memuat laporan akademik..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Laporan Akademik</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Laporan Akademik
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan Wakasek Kurikulum atau Sekretaris Kurikulum."
        />
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
            classesQuery.isFetching ||
            ledgerQuery.isFetching ||
            attendanceQuery.isFetching ||
            proctorSummaryQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void ledgerQuery.refetch();
            void attendanceQuery.refetch();
            void proctorSummaryQuery.refetch();
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
          Laporan Akademik
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Rekap nilai akhir, kehadiran kelas, dan ringkasan berita acara ujian untuk kurikulum.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
          gap: 12,
        }}
      >
        <MobileSelectField
          label="Semester"
          value={selectedSemester}
          options={semesterOptions}
          onChange={(next) => setSelectedSemester((next as SemesterChoice) || 'ALL')}
          placeholder="Pilih semester"
        />

        <MobileSelectField
          label="Filter Kelas"
          value={String(selectedClassId)}
          options={classFilterOptions}
          onChange={(next) => setSelectedClassId(next === 'ALL' ? 'ALL' : Number(next))}
          placeholder="Pilih kelas"
        />
      </View>

      {activeYearQuery.isLoading || ledgerQuery.isLoading ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="loading" message="Memuat data laporan akademik..." />
        </View>
      ) : null}

      {!activeYearQuery.isLoading && !activeYearQuery.data ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="error" message="Tahun ajaran aktif tidak ditemukan." />
        </View>
      ) : null}

      {ledgerQuery.isError ? (
        <View style={{ marginBottom: 12 }}>
          <QueryStateView type="error" message="Gagal memuat data laporan akademik." onRetry={() => ledgerQuery.refetch()} />
        </View>
      ) : null}

      {ledgerQuery.data ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginBottom: 12 }}>
            <View style={{ width: 168 }}>
              <MobileSummaryCard
                title="Total Siswa (Preview)"
                value={formatNumber(ledgerQuery.data.summary.totalStudents || 0)}
                subtitle="Siswa pada filter aktif"
                iconName="users"
                accentColor="#2563eb"
              />
            </View>
            <View style={{ width: 168 }}>
              <MobileSummaryCard
                title="Rata-rata Nilai Akhir"
                value={formatScore(ledgerQuery.data.summary.averageFinal)}
                subtitle="Akumulasi seluruh hasil"
                iconName="bar-chart-2"
                accentColor="#16a34a"
              />
            </View>
            <View style={{ width: 168 }}>
              <MobileSummaryCard
                title="Rata-rata US"
                value={formatScore(ledgerQuery.data.summary.averageUs)}
                subtitle="Ujian sekolah"
                iconName="award"
                accentColor="#6d28d9"
              />
            </View>
            <View style={{ width: 168 }}>
              <MobileSummaryCard
                title="Rata-rata Portofolio"
                value={formatScore(ledgerQuery.data.summary.averagePortfolio)}
                subtitle="Portofolio siswa"
                iconName="book-open"
                accentColor="#ca8a04"
              />
            </View>
            <View style={{ width: 168 }}>
              <MobileSummaryCard
                title="Siswa Sudah Terhitung"
                value={formatNumber(ledgerQuery.data.summary.studentsWithResult || 0)}
                subtitle="Sudah punya hasil akhir"
                iconName="check-circle"
                accentColor="#475569"
              />
            </View>
          </ScrollView>

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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
              Preview Nilai Akhir (20 Siswa)
            </Text>
            {previewRows.length === 0 ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data pada filter ini.</Text>
            ) : (
              previewRows.map((row) => <StudentPreviewCard key={`ledger-preview-${row.student.id}`} row={row} />)
            )}
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
              Ringkasan Kehadiran Kelas
            </Text>
            {selectedClassId === 'ALL' ? (
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Pilih kelas untuk melihat ringkasan kehadiran dan keterlambatan.
              </Text>
            ) : attendanceQuery.isLoading ? (
              <QueryStateView type="loading" message="Memuat data kehadiran..." />
            ) : attendanceQuery.isError ? (
              <QueryStateView type="error" message="Gagal memuat data kehadiran kelas." onRetry={() => attendanceQuery.refetch()} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <SummaryMetric label="Hadir" value={formatNumber(attendanceAggregate.present)} bg="#ecfdf5" border="#a7f3d0" text="#047857" />
                <SummaryMetric label="Sakit" value={formatNumber(attendanceAggregate.sick)} bg="#fef3c7" border="#fcd34d" text="#b45309" />
                <SummaryMetric label="Izin" value={formatNumber(attendanceAggregate.permission)} bg="#e0f2fe" border="#7dd3fc" text="#0369a1" />
                <SummaryMetric label="Alpa" value={formatNumber(attendanceAggregate.absent)} bg="#fee2e2" border="#fca5a5" text="#b91c1c" />
                <SummaryMetric label="Total Telat" value={formatNumber(lateTotal)} bg="#f5f3ff" border="#ddd6fe" text="#6d28d9" />
              </View>
            )}
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
              Ringkasan Berita Acara Ujian
            </Text>
            {proctorSummaryQuery.isLoading ? (
              <QueryStateView type="loading" message="Memuat ringkasan ujian..." />
            ) : proctorSummaryQuery.isError || !proctorSummaryQuery.data ? (
              <QueryStateView type="error" message="Gagal memuat ringkasan berita acara." onRetry={() => proctorSummaryQuery.refetch()} />
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  <SummaryMetric label="Ruang Aktif" value={formatNumber(proctorSummaryQuery.data.summary.totalRooms || 0)} bg="#f8fafc" border="#cbd5e1" text="#475569" />
                  <SummaryMetric label="Sudah Lapor" value={formatNumber(proctorSummaryQuery.data.summary.reportedRooms || 0)} bg="#ecfdf5" border="#a7f3d0" text="#047857" />
                  <SummaryMetric label="Hadir" value={formatNumber(proctorSummaryQuery.data.summary.totalPresent || 0)} bg="#eff6ff" border="#bfdbfe" text="#1d4ed8" />
                  <SummaryMetric label="Tidak Hadir" value={formatNumber(proctorSummaryQuery.data.summary.totalAbsent || 0)} bg="#fee2e2" border="#fca5a5" text="#b91c1c" />
                </View>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: '#e2e8f0',
                    marginHorizontal: -12,
                    marginBottom: 12,
                    paddingHorizontal: 12,
                    paddingTop: 12,
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11), fontWeight: '700', letterSpacing: 0.4 }}>
                    GROUPING HARI & JAM
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleWithAppTextScale(13), marginTop: 4 }}>
                    {formatSafeDate(reportDate)} • {groupedProctorTimeGroups.length} kelompok jam
                  </Text>
                </View>

                {groupedProctorTimeGroups.length === 0 ? (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>
                    Belum ada berita acara pada tanggal ini.
                  </Text>
                ) : (
                  groupedProctorTimeGroups.map((group) => (
                    <View
                      key={group.timeKey}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe2ea',
                        borderRadius: 14,
                        overflow: 'hidden',
                        backgroundColor: '#fff',
                        marginBottom: 10,
                      }}
                    >
                      <View
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(14) }}>
                          {formatSafeTime(group.startTime)} - {formatSafeTime(group.endTime)} WIB
                          {group.periodNumber ? ` • Jam Ke-${group.periodNumber}` : ''}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                          {group.sessionLabel ? `Sesi ${group.sessionLabel}` : 'Tanpa sesi'} • {group.rows.length} ruang
                        </Text>
                      </View>
                      <View style={{ padding: 12, gap: 10 }}>
                        {group.rows.map((row, index) => (
                          <View
                            key={`${group.timeKey}-${row.room || 'ruang'}-${index}`}
                            style={{
                              borderWidth: 1,
                              borderColor: '#e2e8f0',
                              borderRadius: 12,
                              padding: 12,
                              backgroundColor: '#fff',
                            }}
                          >
                            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                              {row.room || 'Belum ditentukan'}
                            </Text>
                            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                              {(row.subjectName || 'Mata Pelajaran')} • {row.classNames.join(', ') || 'Belum ada rombel'}
                            </Text>
                            <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                              {row.examType || '-'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                              <SummaryMetric label="Seharusnya" value={formatNumber(Number(row.expectedParticipants || 0))} bg="#f8fafc" border="#cbd5e1" text="#475569" />
                              <SummaryMetric label="Hadir" value={formatNumber(row.presentParticipants || 0)} bg="#ecfdf5" border="#a7f3d0" text="#047857" />
                              <SummaryMetric label="Tidak Hadir" value={formatNumber(row.absentParticipants || 0)} bg="#fee2e2" border="#fca5a5" text="#b91c1c" />
                            </View>
                            {row.report ? (
                              <View style={{ marginTop: 10 }}>
                                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12) }}>
                                  BA: {row.report.documentNumber || 'Nomor dokumen dibuat saat preview dibuka.'}
                                </Text>
                                <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                                  Pengawas: {row.report.proctor?.name || '-'}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                  <Pressable
                                    onPress={() => {
                                      void openExternalUrl(`${getWebBaseUrl()}/print/proctor-report/${row.report?.id}`);
                                    }}
                                    style={{
                                      flex: 1,
                                      minWidth: 140,
                                      borderWidth: 1,
                                      borderColor: '#bfdbfe',
                                      borderRadius: 10,
                                      paddingVertical: 10,
                                      alignItems: 'center',
                                      backgroundColor: '#eff6ff',
                                    }}
                                  >
                                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lihat & Print BA</Text>
                                  </Pressable>
                                  <Pressable
                                    onPress={() => {
                                      void openExternalUrl(`${getWebBaseUrl()}/print/proctor-attendance/${row.report?.id}`);
                                    }}
                                    style={{
                                      flex: 1,
                                      minWidth: 160,
                                      borderWidth: 1,
                                      borderColor: '#fde68a',
                                      borderRadius: 10,
                                      paddingVertical: 10,
                                      alignItems: 'center',
                                      backgroundColor: '#fffbeb',
                                    }}
                                  >
                                    <Text style={{ color: '#b45309', fontWeight: '700' }}>Lihat & Print Daftar Hadir</Text>
                                  </Pressable>
                                  {row.report.verificationUrl ? (
                                    <Pressable
                                      onPress={() => {
                                        void openExternalUrl(row.report?.verificationUrl || '');
                                      }}
                                      style={{
                                        width: '100%',
                                        borderWidth: 1,
                                        borderColor: '#cbd5e1',
                                        borderRadius: 10,
                                        paddingVertical: 10,
                                        alignItems: 'center',
                                        backgroundColor: '#fff',
                                      }}
                                    >
                                      <Text style={{ color: '#475569', fontWeight: '700' }}>Verifikasi Dokumen</Text>
                                    </Pressable>
                                  ) : null}
                                </View>
                              </View>
                            ) : (
                              <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(12), marginTop: 10 }}>
                                Belum ada dokumen pengawas.
                              </Text>
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  ))
                )}
              </>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
