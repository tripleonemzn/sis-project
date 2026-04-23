import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { teachingResourceProgramApi } from '../../../../src/features/learningResources/teachingResourceProgramApi';
import { principalApi } from '../../../../src/features/principal/principalApi';
import { staffAdministrationApi } from '../../../../src/features/staff/staffAdministrationApi';
import { workProgramApi } from '../../../../src/features/workPrograms/workProgramApi';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { scaleWithAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function daysSince(value?: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / (24 * 60 * 60 * 1000)));
}

function countTeachingStatus(
  rows: Array<{ status: string; total: number }> | undefined,
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED',
) {
  return rows?.find((item) => item.status === status)?.total || 0;
}

function MonitoringCard({
  title,
  value,
  subtitle,
  accent,
  onPress,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  accent: string;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: accent,
        borderRadius: 12,
        padding: 12,
        minHeight: 112,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: scaleWithAppTextScale(11) }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(20), marginTop: 6 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>{subtitle}</Text>
    </View>
  );

  if (!onPress) return content;
  return <Pressable onPress={onPress}>{content}</Pressable>;
}

export default function PrincipalMonitoringOperationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [reportDate, setReportDate] = useState(todayInput());

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-operations-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const monitoringQuery = useQuery({
    queryKey: ['mobile-principal-operations', user?.id, activeYearQuery.data?.id || 'none', reportDate],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      const academicYearId = activeYearQuery.data?.id;
      const [budgetsResult, workProgramsResult, proctorResult, bpbkResult, teachingResult, officeResult, administrationResult] =
        await Promise.allSettled([
          principalApi.listBudgetApprovals({ academicYearId }),
          workProgramApi.listPendingApprovals(),
          principalApi.getProctorReports({ academicYearId, date: reportDate }),
          principalApi.getBpBkSummary({ academicYearId }),
          teachingResourceProgramApi.getEntriesSummary({ academicYearId }),
          principalApi.getOfficeSummary({ academicYearId }),
          staffAdministrationApi.getSummary({ academicYearId }),
        ]);

      const budgets = budgetsResult.status === 'fulfilled' ? budgetsResult.value : [];
      const pendingBudgets = budgets.filter((item) => item.status === 'PENDING');
      const pendingWorkPrograms =
        workProgramsResult.status === 'fulfilled'
          ? workProgramsResult.value.filter((item) => {
              if (String(item.approvalStatus || '').toUpperCase() !== 'PENDING') return false;
              if (!academicYearId) return true;
              return Number(item.academicYear?.id || 0) === Number(academicYearId);
            })
          : [];
      const proctor =
        proctorResult.status === 'fulfilled'
          ? proctorResult.value
          : {
              rows: [],
              summary: {
                totalRooms: 0,
                totalExpected: 0,
                totalPresent: 0,
                totalAbsent: 0,
                reportedRooms: 0,
              },
            };
      const bpbk =
        bpbkResult.status === 'fulfilled'
          ? bpbkResult.value
          : {
              academicYear: null,
              summary: {
                totalCases: 0,
                negativeCases: 0,
                highRiskStudents: 0,
                openCounselings: 0,
                inProgressCounselings: 0,
                closedCounselings: 0,
                summonPendingCounselings: 0,
                overdueCounselings: 0,
              },
              highRiskStudents: [],
              overdueCounselings: [],
            };
      const teaching =
        teachingResult.status === 'fulfilled'
          ? teachingResult.value
          : { total: 0, canReview: false, byStatus: [], byProgram: [], latest: [] };
      const office =
        officeResult.status === 'fulfilled'
          ? officeResult.value
          : { totalLetters: 0, monthlyLetters: 0, byType: [], latest: [] };
      const administration =
        administrationResult.status === 'fulfilled'
          ? administrationResult.value
          : {
              filters: { academicYearId: academicYearId || 0, generatedAt: new Date().toISOString() },
              overview: {
                totalStudents: 0,
                totalTeachers: 0,
                studentCompletenessRate: 0,
                teacherCompletenessRate: 0,
                studentsCompleteCount: 0,
                studentsNeedAttentionCount: 0,
                studentsPriorityCount: 0,
                teachersCompleteCount: 0,
                teachersNeedAttentionCount: 0,
                teachersPriorityCount: 0,
                pendingStudentVerification: 0,
                rejectedStudentVerification: 0,
                pendingTeacherVerification: 0,
                rejectedTeacherVerification: 0,
                pendingPermissions: 0,
                approvedPermissions: 0,
                rejectedPermissions: 0,
              },
              studentClassRecap: [],
              teacherPtkRecap: [],
              studentPriorityQueue: [],
              teacherPriorityQueue: [],
              studentVerificationQueue: [],
              teacherVerificationQueue: [],
              permissionAging: [],
              permissionQueue: [],
            };

      return {
        budgets: pendingBudgets,
        pendingBudgetAmount: pendingBudgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
        overdueBudgetCount: pendingBudgets.filter((item) => daysSince(item.createdAt) > 2).length,
        pendingWorkPrograms,
        overdueWorkProgramCount: pendingWorkPrograms.filter((item) => daysSince(item.createdAt) > 5).length,
        proctor,
        bpbk,
        teaching,
        office,
        administration,
      };
    },
    staleTime: 60 * 1000,
  });

  const monitoring = monitoringQuery.data;
  const quickActions = useMemo(() => {
    if (!monitoring) return [];
    const actions = [
      monitoring.budgets.length > 0
        ? {
            key: 'budget',
            title: `${monitoring.budgets.length} pengajuan anggaran menunggu keputusan`,
            subtitle: `Total Rp ${Math.trunc(monitoring.pendingBudgetAmount).toLocaleString('id-ID')}`,
            route: '/principal/finance/requests',
          }
        : null,
      monitoring.pendingWorkPrograms.length > 0
        ? {
            key: 'work-program',
            title: `${monitoring.pendingWorkPrograms.length} program kerja menunggu persetujuan`,
            subtitle: `${monitoring.overdueWorkProgramCount} melewati SLA 5 hari`,
            route: '/principal/work-program-approvals',
          }
        : null,
      monitoring.proctor.summary.totalAbsent > 0 || monitoring.proctor.summary.totalRooms > monitoring.proctor.summary.reportedRooms
        ? {
            key: 'exam',
            title: `${Math.max(0, monitoring.proctor.summary.totalRooms - monitoring.proctor.summary.reportedRooms)} ruang belum melapor`,
            subtitle: `${monitoring.proctor.summary.totalAbsent} peserta tidak hadir pada tanggal ini`,
            route: '/principal/exams/reports',
          }
        : null,
      monitoring.bpbk.summary.highRiskStudents > 0 || monitoring.bpbk.summary.overdueCounselings > 0
        ? {
            key: 'bpbk',
            title: `${monitoring.bpbk.summary.highRiskStudents} siswa risiko tinggi BP/BK`,
            subtitle: `${monitoring.bpbk.summary.overdueCounselings} konseling overdue perlu tindak lanjut`,
            route: '/principal/monitoring/bpbk',
          }
        : null,
      countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED') > 0
        ? {
            key: 'teaching',
            title: `${countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED')} perangkat ajar menunggu review`,
            subtitle: `${countTeachingStatus(monitoring.teaching.byStatus, 'APPROVED')} sudah disetujui`,
            route: '/principal/academic/reports',
          }
        : null,
      monitoring.administration.overview.pendingPermissions > 0
        ? {
            key: 'administration',
            title: `${monitoring.administration.overview.pendingPermissions} perizinan menunggu tindak lanjut`,
            subtitle: `${monitoring.administration.overview.studentsPriorityCount + monitoring.administration.overview.teachersPriorityCount} data prioritas perlu dilengkapi`,
            route: '/principal/students',
          }
        : null,
    ].filter(Boolean);

    return actions as Array<{ key: string; title: string; subtitle: string; route: string }>;
  }, [monitoring]);

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring principal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Monitoring</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || monitoringQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void monitoringQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Operasional Harian
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pusat monitoring operasional kepala sekolah untuk approval, ujian, BP/BK, perangkat ajar, dan layanan TU.
      </Text>

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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Tanggal Monitoring Ujian</Text>
        <TextInput
          value={reportDate}
          onChangeText={setReportDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
          }}
        />
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 6 }}>
          Gunakan format tanggal `YYYY-MM-DD` agar ringkasan berita acara ujian sesuai hari yang dipilih.
        </Text>
      </View>

      {monitoringQuery.isLoading ? <QueryStateView type="loading" message="Menyusun monitoring operasional..." /> : null}
      {monitoringQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat monitoring principal." onRetry={() => monitoringQuery.refetch()} />
      ) : null}

      {monitoring ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Pengajuan Anggaran"
                value={monitoring.budgets.length}
                subtitle={`${monitoring.overdueBudgetCount} melewati SLA 2 hari`}
                accent="#bfdbfe"
                onPress={() => router.push('/principal/finance/requests')}
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Program Kerja Pending"
                value={monitoring.pendingWorkPrograms.length}
                subtitle={`${monitoring.overdueWorkProgramCount} melewati SLA 5 hari`}
                accent="#fde68a"
                onPress={() => router.push('/principal/work-program-approvals')}
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Ruang Belum Melapor"
                value={Math.max(0, monitoring.proctor.summary.totalRooms - monitoring.proctor.summary.reportedRooms)}
                subtitle={`${monitoring.proctor.summary.totalAbsent} peserta tidak hadir`}
                accent="#fecaca"
                onPress={() => router.push('/principal/exams/reports')}
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Risiko Tinggi BP/BK"
                value={monitoring.bpbk.summary.highRiskStudents}
                subtitle={`${monitoring.bpbk.summary.overdueCounselings} konseling overdue`}
                accent="#ddd6fe"
                onPress={() => router.push('/principal/monitoring/bpbk')}
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Perangkat Ajar Pending Review"
                value={countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED')}
                subtitle={`${countTeachingStatus(monitoring.teaching.byStatus, 'APPROVED')} disetujui`}
                accent="#bae6fd"
                onPress={() => router.push('/principal/academic/reports')}
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Surat TU Bulan Ini"
                value={monitoring.office.monthlyLetters}
                subtitle={`${monitoring.office.totalLetters} arsip surat tercatat`}
                accent="#d5e1f5"
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MonitoringCard
                title="Administrasi Prioritas"
                value={
                  monitoring.administration.overview.studentsPriorityCount +
                  monitoring.administration.overview.teachersPriorityCount
                }
                subtitle={`${monitoring.administration.overview.pendingPermissions} izin masih pending`}
                accent="#bbf7d0"
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
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Panel Prioritas Tindakan
            </Text>
            {quickActions.length > 0 ? (
              quickActions.map((item) => (
                <Pressable
                  key={item.key}
                  onPress={() => router.push(item.route as never)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                    backgroundColor: '#f8fbff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.title}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>{item.subtitle}</Text>
                </Pressable>
              ))
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada backlog kritis pada filter monitoring saat ini.</Text>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Siswa Risiko Tinggi BP/BK
            </Text>
            {monitoring.bpbk.highRiskStudents.length > 0 ? (
              monitoring.bpbk.highRiskStudents.slice(0, 5).map((row) => (
                <View
                  key={row.studentId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e9d5ff',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.studentName}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                    {row.className || '-'} • {row.nis || row.nisn || '-'}
                  </Text>
                  <Text style={{ color: '#7c3aed', fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                    {row.negativeCaseCount} kasus negatif • {row.totalNegativePoint} poin
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa risiko tinggi pada tahun ajaran aktif.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Dokumen Perangkat Ajar Terbaru
            </Text>
            {monitoring.teaching.latest.length > 0 ? (
              monitoring.teaching.latest.slice(0, 5).map((entry) => (
                <View
                  key={entry.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{entry.title}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                    {entry.teacher?.name || '-'} • {entry.programCode}
                  </Text>
                  <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>{entry.status}</Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada perangkat ajar terbaru untuk dimonitor.</Text>
              </View>
            )}
          </View>

          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
              Arsip Surat TU Terbaru
            </Text>
            {monitoring.office.latest.length > 0 ? (
              monitoring.office.latest.slice(0, 5).map((letter) => (
                <View
                  key={letter.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {letter.title || letter.recipientName}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                    {letter.letterNumber} • {letter.type}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                    Penerima: {letter.recipientName} • {formatDate(letter.createdAt)}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 10,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada arsip surat yang tercatat pada periode ini.</Text>
              </View>
            )}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
