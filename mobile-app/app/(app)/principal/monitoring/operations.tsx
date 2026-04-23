import { useMemo, useState, type ReactNode } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
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

function formatPermissionTypeLabel(value?: string | null) {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'SICK') return 'Sakit';
  if (normalized === 'PERMISSION') return 'Izin';
  return normalized ? normalized.replace(/_/g, ' ') : 'Lainnya';
}

function getTeachingStatusTone(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'APPROVED') {
    return {
      borderColor: '#a7f3d0',
      backgroundColor: '#ecfdf5',
      textColor: '#047857',
    };
  }
  if (normalized === 'REJECTED') {
    return {
      borderColor: '#fecdd3',
      backgroundColor: '#fff1f2',
      textColor: '#be123c',
    };
  }
  if (normalized === 'SUBMITTED') {
    return {
      borderColor: '#fde68a',
      backgroundColor: '#fffbeb',
      textColor: '#b45309',
    };
  }
  return {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    textColor: '#475569',
  };
}

function SectionCard({
  title,
  description,
  rightLabel,
  children,
}: {
  title: string;
  description?: string;
  rightLabel?: string;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 12,
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#e2e8f0',
          backgroundColor: '#f8fafc',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>
              {title}
            </Text>
            {description ? (
              <Text
                style={{
                  color: BRAND_COLORS.textMuted,
                  fontSize: scaleWithAppTextScale(12),
                  marginTop: 4,
                  lineHeight: scaleWithAppTextScale(18),
                }}
              >
                {description}
              </Text>
            ) : null}
          </View>
          {rightLabel ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                backgroundColor: '#fff',
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(11), fontWeight: '600' }}>
                {rightLabel}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ padding: 14 }}>{children}</View>
    </View>
  );
}

function MiniStatCard({
  label,
  value,
  helper,
  borderColor,
  backgroundColor,
  textColor,
}: {
  label: string;
  value: string | number;
  helper?: string;
  borderColor: string;
  backgroundColor: string;
  textColor: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor,
        backgroundColor,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text style={{ color: textColor, fontSize: scaleWithAppTextScale(10), fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: textColor, fontSize: scaleWithAppTextScale(19), fontWeight: '800', marginTop: 6 }}>
        {value}
      </Text>
      {helper ? (
        <Text style={{ color: textColor, opacity: 0.88, fontSize: scaleWithAppTextScale(11), marginTop: 4 }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}

function ListRowCard({
  title,
  subtitle,
  detail,
  badge,
  badgeTone,
  footer,
  onPress,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  badge?: string;
  badgeTone?: { borderColor: string; backgroundColor: string; textColor: string };
  footer?: string;
  onPress?: () => void;
}) {
  const content = (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(14) }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: badgeTone?.borderColor || '#dbe7fb',
              backgroundColor: badgeTone?.backgroundColor || '#f8fafc',
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text
              style={{
                color: badgeTone?.textColor || '#475569',
                fontSize: scaleWithAppTextScale(10),
                fontWeight: '700',
              }}
            >
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
      {detail ? (
        <Text style={{ color: '#475569', fontSize: scaleWithAppTextScale(12), marginTop: 8, lineHeight: scaleWithAppTextScale(18) }}>
          {detail}
        </Text>
      ) : null}
      {footer ? (
        <Text style={{ color: '#94a3b8', fontSize: scaleWithAppTextScale(11), marginTop: 8 }}>{footer}</Text>
      ) : null}
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

  const summaryCards = useMemo(() => {
    if (!monitoring) return [];
    return [
      {
        key: 'budget',
        title: 'Pengajuan Anggaran Pending',
        value: String(monitoring.budgets.length),
        subtitle: `Rp ${Math.trunc(monitoring.pendingBudgetAmount).toLocaleString('id-ID')}`,
        iconName: 'credit-card' as const,
        accentColor: '#2563eb',
        onPress: () => router.push('/principal/finance/requests' as never),
      },
      {
        key: 'work-program',
        title: 'Program Kerja Pending',
        value: String(monitoring.pendingWorkPrograms.length),
        subtitle: `${monitoring.overdueWorkProgramCount} melewati SLA 5 hari`,
        iconName: 'clipboard' as const,
        accentColor: '#d97706',
        onPress: () => router.push('/principal/work-program-approvals' as never),
      },
      {
        key: 'rooms',
        title: 'Ruang Belum Melapor',
        value: String(Math.max(0, monitoring.proctor.summary.totalRooms - monitoring.proctor.summary.reportedRooms)),
        subtitle: `${monitoring.proctor.summary.totalAbsent} peserta tidak hadir`,
        iconName: 'alert-triangle' as const,
        accentColor: '#dc2626',
        onPress: () => router.push('/principal/exams/reports' as never),
      },
      {
        key: 'bpbk',
        title: 'Kasus BP/BK Risiko Tinggi',
        value: String(monitoring.bpbk.summary.highRiskStudents),
        subtitle: `${monitoring.bpbk.summary.overdueCounselings} konseling overdue`,
        iconName: 'shield' as const,
        accentColor: '#7c3aed',
        onPress: () => router.push('/principal/monitoring/bpbk' as never),
      },
      {
        key: 'teaching',
        title: 'Perangkat Ajar Pending Review',
        value: String(countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED')),
        subtitle: `${countTeachingStatus(monitoring.teaching.byStatus, 'APPROVED')} disetujui`,
        iconName: 'book-open' as const,
        accentColor: '#0284c7',
        onPress: () => router.push('/principal/academic/reports' as never),
      },
      {
        key: 'office',
        title: 'Surat TU Bulan Ini',
        value: String(monitoring.office.monthlyLetters),
        subtitle: `${monitoring.office.totalLetters} arsip surat`,
        iconName: 'file-text' as const,
        accentColor: '#475569',
      },
      {
        key: 'administration',
        title: 'Administrasi Belum Lengkap',
        value: String(
          monitoring.administration.overview.studentsPriorityCount +
            monitoring.administration.overview.teachersPriorityCount,
        ),
        subtitle: `${monitoring.administration.overview.pendingPermissions} izin pending`,
        iconName: 'check-square' as const,
        accentColor: '#16a34a',
        onPress: () => router.push('/principal/students' as never),
      },
    ];
  }, [monitoring, router]);

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
          borderRadius: 16,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            borderRadius: 14,
            padding: 14,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontSize: scaleWithAppTextScale(11), fontWeight: '700' }}>
            Monitoring Harian Principal
          </Text>
          <Text
            style={{
              color: BRAND_COLORS.textDark,
              fontSize: scaleWithAppTextScale(16),
              fontWeight: '700',
              marginTop: 6,
              lineHeight: scaleWithAppTextScale(22),
            }}
          >
            Satu layar untuk backlog keputusan, risiko ujian, dan ritme layanan TU.
          </Text>
          <Text
            style={{
              color: '#475569',
              fontSize: scaleWithAppTextScale(12),
              marginTop: 6,
              lineHeight: scaleWithAppTextScale(18),
            }}
          >
            Prioritas harian disusun ulang agar lebih cepat dipindai tanpa perlu lompat antar modul.
          </Text>

          {monitoring ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginTop: 12 }}>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Keputusan Pending"
                  value={monitoring.budgets.length + monitoring.pendingWorkPrograms.length}
                  helper={`${monitoring.budgets.length} anggaran • ${monitoring.pendingWorkPrograms.length} program`}
                  borderColor="#bfdbfe"
                  backgroundColor="#ffffff"
                  textColor="#1d4ed8"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Risiko Ujian"
                  value={
                    Math.max(0, monitoring.proctor.summary.totalRooms - monitoring.proctor.summary.reportedRooms) +
                    monitoring.proctor.summary.totalAbsent
                  }
                  helper={`${Math.max(0, monitoring.proctor.summary.totalRooms - monitoring.proctor.summary.reportedRooms)} ruang • ${monitoring.proctor.summary.totalAbsent} absen`}
                  borderColor="#fecaca"
                  backgroundColor="#fff1f2"
                  textColor="#be123c"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Perangkat Review"
                  value={countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED')}
                  helper={`${countTeachingStatus(monitoring.teaching.byStatus, 'APPROVED')} disetujui`}
                  borderColor="#bae6fd"
                  backgroundColor="#f0f9ff"
                  textColor="#0369a1"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Izin TU Pending"
                  value={monitoring.administration.overview.pendingPermissions}
                  helper={`${monitoring.administration.overview.studentsPriorityCount + monitoring.administration.overview.teachersPriorityCount} data prioritas`}
                  borderColor="#bbf7d0"
                  backgroundColor="#f0fdf4"
                  textColor="#15803d"
                />
              </View>
            </View>
          ) : null}
        </View>

        <View style={{ marginTop: 12 }}>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
            Tanggal Monitoring Ujian
          </Text>
          <TextInput
            value={reportDate}
            onChangeText={setReportDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 12,
              color: BRAND_COLORS.textDark,
              backgroundColor: '#fff',
            }}
          />
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11), marginTop: 6 }}>
            Gunakan format `YYYY-MM-DD` agar ringkasan berita acara ujian sesuai hari yang dipilih.
          </Text>
          <Pressable
            onPress={() => {
              void activeYearQuery.refetch();
              void monitoringQuery.refetch();
            }}
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 12,
              backgroundColor: '#fff',
              paddingVertical: 11,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#334155', fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>
              Muat Ulang Monitoring
            </Text>
          </Pressable>
        </View>
      </View>

      {monitoringQuery.isLoading ? <QueryStateView type="loading" message="Menyusun monitoring operasional..." /> : null}
      {monitoringQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat monitoring principal." onRetry={() => monitoringQuery.refetch()} />
      ) : null}

      {monitoring ? (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6, marginBottom: 12 }}>
            {summaryCards.map((card) => (
              <View key={card.key} style={{ width: '50%', paddingHorizontal: 6, marginBottom: 12 }}>
                <MobileSummaryCard
                  title={card.title}
                  value={card.value}
                  subtitle={card.subtitle}
                  iconName={card.iconName}
                  accentColor={card.accentColor}
                  onPress={card.onPress}
                />
              </View>
            ))}
          </View>

          <SectionCard
            title="Panel Prioritas Tindakan"
            description="Antrian keputusan dan tindak lanjut yang perlu dibuka lebih dulu."
            rightLabel={`${quickActions.length} aktif`}
          >
            {quickActions.length > 0 ? (
              <View style={{ gap: 10 }}>
                {quickActions.map((item) => (
                  <ListRowCard
                    key={item.key}
                    title={item.title}
                    subtitle={item.subtitle}
                    detail="Buka modul terkait untuk menindaklanjuti item ini."
                    badge="Tindak Lanjut"
                    badgeTone={{
                      borderColor: '#bfdbfe',
                      backgroundColor: '#eff6ff',
                      textColor: '#1d4ed8',
                    }}
                    onPress={() => router.push(item.route as never)}
                  />
                ))}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#bbf7d0',
                  backgroundColor: '#f0fdf4',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <Text style={{ color: '#166534', fontSize: scaleWithAppTextScale(12) }}>
                  Belum ada backlog kritis pada filter monitoring saat ini.
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard
            title="Approval Backlog"
            description="Ringkas backlog anggaran dan program kerja yang masih menunggu keputusan."
          >
            <View style={{ gap: 12 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Pengajuan Anggaran
                </Text>
                {monitoring.budgets.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {monitoring.budgets.slice(0, 3).map((budget) => (
                      <ListRowCard
                        key={budget.id}
                        title={budget.title}
                        subtitle={budget.requester?.name || '-'}
                        detail={`Rp ${Math.trunc(Number(budget.totalAmount || 0)).toLocaleString('id-ID')}`}
                        footer={`Umur antrian ${daysSince(budget.createdAt)} hari`}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Tidak ada pengajuan pending.
                  </Text>
                )}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Program Kerja
                </Text>
                {monitoring.pendingWorkPrograms.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {monitoring.pendingWorkPrograms.slice(0, 3).map((program) => (
                      <ListRowCard
                        key={program.id}
                        title={program.title}
                        subtitle={String(program.additionalDuty || '-').replace(/_/g, ' ')}
                        detail={program.academicYear?.name || '-'}
                        footer={`Umur antrian ${daysSince(program.createdAt)} hari`}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Tidak ada program kerja pending.
                  </Text>
                )}
              </View>
            </View>
          </SectionCard>

          <SectionCard
            title="Spotlight BP/BK"
            description="Sorotan siswa berisiko tinggi dan tindak lanjut konseling yang terlambat."
            rightLabel={`${monitoring.bpbk.summary.openCounselings} aktif`}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ width: '33.3333%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Risiko Tinggi"
                  value={monitoring.bpbk.summary.highRiskStudents}
                  borderColor="#ddd6fe"
                  backgroundColor="#f5f3ff"
                  textColor="#7c3aed"
                />
              </View>
              <View style={{ width: '33.3333%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Overdue"
                  value={monitoring.bpbk.summary.overdueCounselings}
                  borderColor="#fecaca"
                  backgroundColor="#fff1f2"
                  textColor="#be123c"
                />
              </View>
              <View style={{ width: '33.3333%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Kasus Aktif"
                  value={monitoring.bpbk.summary.openCounselings}
                  borderColor="#cbd5e1"
                  backgroundColor="#f8fafc"
                  textColor="#475569"
                />
              </View>
            </View>

            <View style={{ gap: 10 }}>
              {monitoring.bpbk.highRiskStudents.slice(0, 3).map((row) => (
                <ListRowCard
                  key={`risk-${row.studentId}`}
                  title={row.studentName}
                  subtitle={`${row.className || '-'} • ${row.nis || row.nisn || '-'}`}
                  detail={`${row.negativeCaseCount} kasus negatif • ${row.totalNegativePoint} poin`}
                  badge="Risiko Tinggi"
                  badgeTone={{
                    borderColor: '#ddd6fe',
                    backgroundColor: '#f5f3ff',
                    textColor: '#7c3aed',
                  }}
                />
              ))}
              {monitoring.bpbk.overdueCounselings.slice(0, 2).map((row) => (
                <ListRowCard
                  key={`overdue-${row.id}`}
                  title={row.student.name}
                  subtitle={`${row.student.className || '-'} • ${formatDate(row.sessionDate)}`}
                  detail={row.issueSummary}
                  footer={`Konselor: ${row.counselor?.name || '-'}`}
                  badge="Overdue"
                  badgeTone={{
                    borderColor: '#fecaca',
                    backgroundColor: '#fff1f2',
                    textColor: '#be123c',
                  }}
                />
              ))}
              {monitoring.bpbk.highRiskStudents.length === 0 && monitoring.bpbk.overdueCounselings.length === 0 ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderStyle: 'dashed',
                    borderColor: '#cbd5e1',
                    borderRadius: 12,
                    padding: 14,
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Tidak ada siswa risiko tinggi atau konseling overdue pada filter aktif.
                  </Text>
                </View>
              ) : null}
            </View>
          </SectionCard>

          <SectionCard
            title="Perangkat Ajar Terbaru"
            description="Ringkas status review dokumen pembelajaran dan item terbaru yang masuk."
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Menunggu Review"
                  value={countTeachingStatus(monitoring.teaching.byStatus, 'SUBMITTED')}
                  borderColor="#fde68a"
                  backgroundColor="#fffbeb"
                  textColor="#b45309"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Disetujui"
                  value={countTeachingStatus(monitoring.teaching.byStatus, 'APPROVED')}
                  borderColor="#a7f3d0"
                  backgroundColor="#ecfdf5"
                  textColor="#047857"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Perlu Revisi"
                  value={countTeachingStatus(monitoring.teaching.byStatus, 'REJECTED')}
                  borderColor="#fecdd3"
                  backgroundColor="#fff1f2"
                  textColor="#be123c"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Draft"
                  value={countTeachingStatus(monitoring.teaching.byStatus, 'DRAFT')}
                  borderColor="#cbd5e1"
                  backgroundColor="#f8fafc"
                  textColor="#475569"
                />
              </View>
            </View>

            {monitoring.teaching.latest.length > 0 ? (
              <View style={{ gap: 10 }}>
                {monitoring.teaching.latest.slice(0, 5).map((entry) => {
                  const tone = getTeachingStatusTone(entry.status);
                  return (
                    <ListRowCard
                      key={entry.id}
                      title={entry.title}
                      subtitle={`${entry.teacher?.name || '-'} • ${entry.programCode || '-'}`}
                      badge={String(entry.status || 'DRAFT').replace(/_/g, ' ')}
                      badgeTone={tone}
                    />
                  );
                })}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                  Belum ada perangkat ajar terbaru untuk dimonitor.
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard
            title="Ringkasan Surat Tata Usaha"
            description="Pantau ritme surat bulanan, distribusi tipe surat, dan arsip terbaru."
            rightLabel={`${monitoring.office.totalLetters} arsip`}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Surat Bulan Ini"
                  value={monitoring.office.monthlyLetters}
                  borderColor="#cbd5e1"
                  backgroundColor="#f8fafc"
                  textColor="#475569"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Jenis Surat Aktif"
                  value={monitoring.office.byType.length}
                  borderColor="#bfdbfe"
                  backgroundColor="#eff6ff"
                  textColor="#1d4ed8"
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {monitoring.office.byType.length === 0 ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                  Belum ada surat tercatat.
                </Text>
              ) : (
                monitoring.office.byType.map((row) => (
                  <View
                    key={row.type}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      backgroundColor: '#f8fafc',
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    <Text style={{ color: '#334155', fontSize: scaleWithAppTextScale(11), fontWeight: '600' }}>
                      {row.type.replace(/_/g, ' ')} • {row._count._all}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {monitoring.office.latest.length > 0 ? (
              <View style={{ gap: 10 }}>
                {monitoring.office.latest.slice(0, 4).map((letter) => (
                  <ListRowCard
                    key={letter.id}
                    title={letter.title || letter.recipientName}
                    subtitle={`${letter.letterNumber} • ${letter.type.replace(/_/g, ' ')}`}
                    detail={`Penerima: ${letter.recipientName}`}
                    footer={formatDate(letter.createdAt)}
                  />
                ))}
              </View>
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  padding: 14,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                  Belum ada arsip surat yang tercatat pada periode ini.
                </Text>
              </View>
            )}
          </SectionCard>

          <SectionCard
            title="Monitoring Administrasi TU"
            description="Kelengkapan data prioritas dan izin administratif yang masih tertahan."
            rightLabel={`${monitoring.administration.overview.pendingPermissions} izin pending`}
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Siswa Prioritas"
                  value={monitoring.administration.overview.studentsPriorityCount}
                  helper={`${monitoring.administration.overview.studentCompletenessRate}% lengkap`}
                  borderColor="#fde68a"
                  backgroundColor="#fffbeb"
                  textColor="#b45309"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <MiniStatCard
                  label="Guru/Staff Prioritas"
                  value={monitoring.administration.overview.teachersPriorityCount}
                  helper={`${monitoring.administration.overview.teacherCompletenessRate}% lengkap`}
                  borderColor="#bfdbfe"
                  backgroundColor="#eff6ff"
                  textColor="#1d4ed8"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Verifikasi Siswa"
                  value={monitoring.administration.overview.pendingStudentVerification}
                  borderColor="#fecdd3"
                  backgroundColor="#fff1f2"
                  textColor="#be123c"
                />
              </View>
              <View style={{ width: '50%', paddingHorizontal: 4 }}>
                <MiniStatCard
                  label="Verifikasi Guru"
                  value={monitoring.administration.overview.pendingTeacherVerification}
                  borderColor="#bbf7d0"
                  backgroundColor="#f0fdf4"
                  textColor="#15803d"
                />
              </View>
            </View>

            <View style={{ gap: 12 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Siswa Prioritas Dilengkapi
                </Text>
                {monitoring.administration.studentPriorityQueue.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {monitoring.administration.studentPriorityQueue.slice(0, 3).map((row) => (
                      <ListRowCard
                        key={row.id}
                        title={row.name}
                        subtitle={`${row.className || '-'} • ${row.username}`}
                        detail={`Kurang: ${row.missingFields.slice(0, 3).join(', ') || 'Perlu review manual'}`}
                        badge={row.label}
                        badgeTone={{
                          borderColor: '#fde68a',
                          backgroundColor: '#fffbeb',
                          textColor: '#b45309',
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Semua data siswa utama terlihat stabil.
                  </Text>
                )}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Guru/Staff Prioritas Dilengkapi
                </Text>
                {monitoring.administration.teacherPriorityQueue.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {monitoring.administration.teacherPriorityQueue.slice(0, 3).map((row) => (
                      <ListRowCard
                        key={row.id}
                        title={row.name}
                        subtitle={`${String(row.ptkType || 'PTK').replace(/_/g, ' ')} • ${row.username}`}
                        detail={`Kurang: ${row.missingFields.slice(0, 3).join(', ') || 'Perlu review manual'}`}
                        badge={row.label}
                        badgeTone={{
                          borderColor: '#bfdbfe',
                          backgroundColor: '#eff6ff',
                          textColor: '#1d4ed8',
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Semua data guru/staff utama terlihat stabil.
                  </Text>
                )}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Perizinan Menunggu Tindak Lanjut
                </Text>
                {monitoring.administration.permissionQueue.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    {monitoring.administration.permissionQueue.slice(0, 3).map((row) => (
                      <ListRowCard
                        key={row.id}
                        title={row.studentName}
                        subtitle={`${row.className || '-'} • ${formatPermissionTypeLabel(row.type)}`}
                        detail={row.reason || 'Belum ada alasan terisi.'}
                        footer={`${formatDate(row.startDate)} - ${formatDate(row.endDate)} • ${row.ageDays} hari`}
                        badge={row.agingLabel}
                        badgeTone={{
                          borderColor: '#fecdd3',
                          backgroundColor: '#fff1f2',
                          textColor: '#be123c',
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
                    Tidak ada perizinan yang masih pending.
                  </Text>
                )}
              </View>
            </View>
          </SectionCard>
        </>
      ) : null}
    </ScrollView>
  );
}
