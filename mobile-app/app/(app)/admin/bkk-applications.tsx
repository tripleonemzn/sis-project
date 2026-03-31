import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { AdminBkkApplication, AdminBkkApplicationStatus, adminApi } from '../../../src/features/admin/adminApi';
import { BRAND_COLORS } from '../../../src/config/brand';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type StatusFilter = 'ALL' | 'REVIEWING' | 'SHORTLISTED' | 'PARTNER_INTERVIEW' | 'HIRED' | 'REJECTED';

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua' },
  { value: 'REVIEWING', label: 'Review' },
  { value: 'SHORTLISTED', label: 'Shortlist' },
  { value: 'PARTNER_INTERVIEW', label: 'Interview' },
  { value: 'HIRED', label: 'Diterima' },
  { value: 'REJECTED', label: 'Ditolak' },
];

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

function resolveCompanyName(application: AdminBkkApplication) {
  return application.vacancy.industryPartner?.name || application.vacancy.companyName || 'Perusahaan umum';
}

function getApplicationStatusMeta(status: AdminBkkApplicationStatus) {
  switch (status) {
    case 'SUBMITTED':
      return { label: 'Dikirim', bg: '#e0f2fe', border: '#bae6fd', text: '#0369a1' };
    case 'REVIEWING':
      return { label: 'Review Internal', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
    case 'SHORTLISTED':
      return { label: 'Shortlist', bg: '#e0e7ff', border: '#c7d2fe', text: '#4338ca' };
    case 'PARTNER_INTERVIEW':
      return { label: 'Interview Mitra', bg: '#f3e8ff', border: '#e9d5ff', text: '#7e22ce' };
    case 'INTERVIEW':
      return { label: 'Interview', bg: '#fae8ff', border: '#f5d0fe', text: '#a21caf' };
    case 'HIRED':
      return { label: 'Diterima Mitra', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
    case 'ACCEPTED':
      return { label: 'Accepted', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
    case 'REJECTED':
      return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
    case 'WITHDRAWN':
      return { label: 'Dibatalkan', bg: '#e2e8f0', border: '#cbd5e1', text: '#475569' };
    default:
      return { label: status, bg: '#e2e8f0', border: '#cbd5e1', text: '#475569' };
  }
}

function getVerificationMeta(status?: string | null) {
  if (status === 'VERIFIED') {
    return { label: 'Terverifikasi', bg: '#dcfce7', border: '#bbf7d0', text: '#15803d' };
  }
  if (status === 'REJECTED') {
    return { label: 'Ditolak', bg: '#fee2e2', border: '#fecaca', text: '#b91c1c' };
  }
  return { label: 'Pending', bg: '#fef3c7', border: '#fde68a', text: '#b45309' };
}

function StatCard({
  title,
  value,
  helper,
  tone,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  tone: { bg: string; border: string; iconBg: string; iconColor: string };
  icon: keyof typeof Feather.glyphMap;
}) {
  return (
    <View
      style={{
        flexBasis: '48%',
        flexGrow: 1,
        backgroundColor: tone.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tone.border,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#64748b', fontSize: 12 }}>{title}</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 24, marginTop: 6 }}>{value}</Text>
        </View>
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: tone.iconBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name={icon} size={18} color={tone.iconColor} />
        </View>
      </View>
      <Text style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>{helper}</Text>
    </View>
  );
}

function Chip({
  label,
  meta,
}: {
  label: string;
  meta: { bg: string; border: string; text: string };
}) {
  return (
    <View
      style={{
        borderRadius: 999,
        borderWidth: 1,
        borderColor: meta.border,
        backgroundColor: meta.bg,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <Text style={{ color: meta.text, fontSize: 11, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function FilterChip({
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
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontSize: 12, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AdminBkkApplicationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const applicantUsersQuery = useQuery({
    queryKey: ['mobile-admin-bkk-users-summary'],
    enabled: isAuthenticated && user?.role === 'ADMIN',
    queryFn: async () => adminApi.listUsers({ role: 'UMUM' }),
  });

  const applicationsQuery = useQuery({
    queryKey: ['mobile-admin-bkk-applications', statusFilter],
    enabled: isAuthenticated && user?.role === 'ADMIN',
    queryFn: async () =>
      adminApi.listBkkApplications({
        page: 1,
        limit: 25,
        status: statusFilter,
      }),
  });

  const applicantSummary = useMemo(() => {
    const users = applicantUsersQuery.data || [];
    return {
      total: users.length,
      verified: users.filter((item) => item.verificationStatus === 'VERIFIED').length,
      pending: users.filter((item) => item.verificationStatus === 'PENDING').length,
      rejected: users.filter((item) => item.verificationStatus === 'REJECTED').length,
    };
  }, [applicantUsersQuery.data]);

  const applicationSummary = applicationsQuery.data?.summary || {
    total: 0,
    submitted: 0,
    reviewing: 0,
    shortlisted: 0,
    partnerInterview: 0,
    interview: 0,
    hired: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
  };

  const inProgressApplications =
    applicationSummary.submitted +
    applicationSummary.reviewing +
    applicationSummary.shortlisted +
    applicationSummary.partnerInterview +
    applicationSummary.interview;
  const acceptedApplications = applicationSummary.hired + Math.max(applicationSummary.accepted - applicationSummary.hired, 0);

  const handleRefresh = async () => {
    await Promise.all([applicantUsersQuery.refetch(), applicationsQuery.refetch()]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat ringkasan BKK admin..." />;
  if (!isAuthenticated || !user) return <Redirect href="/welcome" />;
  if (user.role !== 'ADMIN') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#eef3fb' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={Boolean(applicationsQuery.isFetching && !applicationsQuery.isLoading)} onRefresh={() => void handleRefresh()} />}
    >
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          padding: 16,
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              backgroundColor: '#e0ecff',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Feather name="clipboard" size={20} color={BRAND_COLORS.navy} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 20 }}>Lamaran BKK</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Pantau akun pelamar, status pipeline BKK, dan daftar lamaran terbaru langsung dari admin mobile.
            </Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <StatCard
          title="Akun Pelamar"
          value={String(applicantSummary.total)}
          helper={`${applicantSummary.verified} terverifikasi`}
          icon="users"
          tone={{ bg: '#eff6ff', border: '#bfdbfe', iconBg: '#dbeafe', iconColor: '#1d4ed8' }}
        />
        <StatCard
          title="Menunggu Verifikasi"
          value={String(applicantSummary.pending)}
          helper={`${applicantSummary.rejected} ditolak`}
          icon="shield"
          tone={{ bg: '#fffbeb', border: '#fde68a', iconBg: '#fef3c7', iconColor: '#b45309' }}
        />
        <StatCard
          title="Total Lamaran"
          value={String(applicationsQuery.data?.total || 0)}
          helper={`${inProgressApplications} sedang diproses`}
          icon="clipboard"
          tone={{ bg: '#ecfdf5', border: '#a7f3d0', iconBg: '#d1fae5', iconColor: '#047857' }}
        />
        <StatCard
          title="Diterima Mitra"
          value={String(acceptedApplications)}
          helper={`${applicationSummary.partnerInterview} interview mitra`}
          icon="briefcase"
          tone={{ bg: '#f5f3ff', border: '#ddd6fe', iconBg: '#ede9fe', iconColor: '#6d28d9' }}
        />
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          padding: 14,
          marginBottom: 14,
          gap: 10,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Aksi Cepat Admin</Text>
        <Pressable
          onPress={() => router.push('/admin/user-management?role=UMUM' as never)}
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#dbe7fb',
            backgroundColor: '#f8fbff',
            padding: 14,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Kelola Akun Pelamar</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
            Verifikasi akun, cek identitas, dan rapikan data pelamar BKK langsung dari user management native.
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/admin/user-management?role=UMUM&verification=PENDING' as never)}
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            padding: 14,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700' }}>Tinjau Pelamar Pending</Text>
          <Text style={{ color: '#a16207', fontSize: 12, marginTop: 4 }}>
            Ada {applicantSummary.pending} akun pelamar yang masih menunggu verifikasi admin.
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          padding: 14,
          marginBottom: 14,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Filter Status</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {STATUS_FILTERS.map((item) => (
            <FilterChip key={item.value} active={statusFilter === item.value} label={item.label} onPress={() => setStatusFilter(item.value)} />
          ))}
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          borderWidth: 1,
          borderColor: '#d6e0f2',
          padding: 14,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Lamaran Terbaru</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4, marginBottom: 12 }}>
          Menampilkan {applicationsQuery.data?.applications.length || 0} data terbaru dari total {applicationsQuery.data?.total || 0} lamaran.
        </Text>

        {applicationsQuery.isLoading ? (
          <QueryStateView type="loading" message="Memuat daftar lamaran BKK..." />
        ) : null}
        {applicationsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat daftar lamaran BKK." onRetry={() => void applicationsQuery.refetch()} />
        ) : null}
        {!applicationsQuery.isLoading && !applicationsQuery.isError && (applicationsQuery.data?.applications.length || 0) === 0 ? (
          <View
            style={{
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: '#cbd5e1',
              borderRadius: 14,
              backgroundColor: '#fff',
              padding: 16,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Belum ada lamaran</Text>
            <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
              Tidak ada data lamaran untuk filter yang dipilih saat ini.
            </Text>
          </View>
        ) : null}

        {!applicationsQuery.isLoading && !applicationsQuery.isError
          ? (applicationsQuery.data?.applications || []).map((application) => {
              const statusMeta = getApplicationStatusMeta(application.status);
              const verificationMeta = getVerificationMeta(application.applicant.verificationStatus);

              return (
                <View
                  key={application.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 16,
                    padding: 14,
                    marginBottom: 10,
                    backgroundColor: '#fcfdff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 15 }}>
                        {application.applicant.name}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                        @{application.applicant.username}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                      <Chip label={statusMeta.label} meta={statusMeta} />
                      <Chip label={verificationMeta.label} meta={verificationMeta} />
                    </View>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{application.vacancy.title}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>{resolveCompanyName(application)}</Text>
                  </View>

                  <View style={{ marginTop: 10, gap: 4 }}>
                    <Text style={{ color: '#475569', fontSize: 12 }}>
                      Dikirim: {formatDateTime(application.appliedAt)}
                    </Text>
                    {application.profile?.schoolName ? (
                      <Text style={{ color: '#475569', fontSize: 12 }}>
                        Sekolah asal: {application.profile.schoolName}
                      </Text>
                    ) : null}
                    {application.profile?.major ? (
                      <Text style={{ color: '#475569', fontSize: 12 }}>Jurusan: {application.profile.major}</Text>
                    ) : null}
                    {application.partnerReferenceCode ? (
                      <Text style={{ color: '#475569', fontSize: 12 }}>
                        Batch shortlist: {application.partnerReferenceCode}
                      </Text>
                    ) : null}
                  </View>

                  {application.reviewerNotes?.trim() ? (
                    <View
                      style={{
                        marginTop: 12,
                        borderRadius: 12,
                        backgroundColor: '#f8fafc',
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        padding: 12,
                      }}
                    >
                      <Text style={{ color: '#475569', fontSize: 11, fontWeight: '700', marginBottom: 4 }}>Catatan Reviewer</Text>
                      <Text style={{ color: BRAND_COLORS.textDark, fontSize: 12 }}>{application.reviewerNotes}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })
          : null}
      </View>
    </ScrollView>
  );
}
