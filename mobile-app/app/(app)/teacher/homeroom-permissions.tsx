import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { examApi } from '../../../src/features/exams/examApi';
import HomeroomBookMobilePanel from '../../../src/features/homeroomBook/HomeroomBookMobilePanel';
import { permissionApi } from '../../../src/features/permissions/permissionApi';
import { PermissionStatus, PermissionType, StudentPermission } from '../../../src/features/permissions/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';

type StatusFilter = 'ALL' | PermissionStatus;
type TypeFilter = 'ALL' | PermissionType;
type HomeroomPermissionTab = 'IZIN' | 'BUKU_WALI_KELAS';

const STATUS_LABEL: Record<StatusFilter, string> = {
  ALL: 'Semua',
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

const TYPE_LABEL: Record<TypeFilter, string> = {
  ALL: 'Semua Jenis',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  OTHER: 'Lainnya',
};

function isHomeroomTeacher(duties?: string[], classesCount?: number) {
  if ((classesCount || 0) > 0) return true;
  const normalized = (duties || []).map((item) => item.trim().toUpperCase());
  return normalized.includes('WALI_KELAS');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateRange(start: string, end: string) {
  return `${formatDate(start)} - ${formatDate(end)}`;
}

function statusStyle(status: PermissionStatus) {
  if (status === 'APPROVED') return { text: '#15803d', border: '#86efac', bg: '#dcfce7' };
  if (status === 'REJECTED') return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' };
  return { text: '#b45309', border: '#fcd34d', bg: '#fef3c7' };
}

function typeStyle(type: PermissionType) {
  if (type === 'SICK') return { text: '#b91c1c', bg: '#fee2e2' };
  if (type === 'PERMISSION') return { text: '#1d4ed8', bg: '#dbeafe' };
  return { text: '#475569', bg: '#e2e8f0' };
}

function resolveFileUrl(fileUrl: string | null | undefined) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (fileUrl.startsWith('/')) return `${webBaseUrl}${fileUrl}`;
  return `${webBaseUrl}/${fileUrl}`;
}

export default function TeacherHomeroomPermissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [activeTab, setActiveTab] = useState<HomeroomPermissionTab>('IZIN');
  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [rejectionNotes, setRejectionNotes] = useState<Record<number, string>>({});
  const [summaryDetailVisible, setSummaryDetailVisible] = useState(false);

  const isAllowed = user?.role === 'TEACHER' && isHomeroomTeacher(user?.additionalDuties, user?.teacherClasses?.length);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-homeroom-permissions-active-year'],
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
    queryKey: ['mobile-homeroom-permissions-classes', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!user?.id && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const result = await adminApi.listClasses({
        page: 1,
        limit: 300,
        academicYearId: activeYearQuery.data?.id,
        teacherId: user?.id,
      });
      return result.items;
    },
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-homeroom-book-exam-programs', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id && activeTab === 'BUKU_WALI_KELAS',
    queryFn: async () => {
      const result = await examApi.getExamPrograms({
        academicYearId: Number(activeYearQuery.data?.id),
        roleContext: 'student',
      });
      return result.programs || [];
    },
  });

  const classItems = classesQuery.data || [];
  const effectiveSelectedClassId = selectedClassId ?? classItems[0]?.id ?? null;
  const classSelectOptions = useMemo(
    () =>
      classItems.map((classItem) => ({
        value: String(classItem.id),
        label: classItem.major?.code ? `${classItem.name} • ${classItem.major.code}` : classItem.name,
      })),
    [classItems],
  );
  const statusFilterOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABEL) as StatusFilter[]).map((status) => ({
        value: status,
        label: STATUS_LABEL[status],
      })),
    [],
  );
  const typeFilterOptions = useMemo(
    () =>
      (Object.keys(TYPE_LABEL) as TypeFilter[]).map((type) => ({
        value: type,
        label: TYPE_LABEL[type],
      })),
    [],
  );

  const permissionsQuery = useQuery({
    queryKey: [
      'mobile-homeroom-permissions',
      effectiveSelectedClassId,
      activeYearQuery.data?.id,
      statusFilter,
      typeFilter,
      search,
    ],
    enabled: isAuthenticated && !!isAllowed && !!effectiveSelectedClassId && !!activeYearQuery.data?.id,
    queryFn: async () =>
      permissionApi.listForHomeroom({
        classId: Number(effectiveSelectedClassId),
        academicYearId: Number(activeYearQuery.data?.id),
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        search: search.trim() || undefined,
        page: 1,
        limit: 250,
      }),
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { id: number; status: PermissionStatus; approvalNote?: string }) =>
      permissionApi.updateStatus(payload),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-homeroom-permissions'] });
      const message = payload.status === 'APPROVED' ? 'Pengajuan izin disetujui.' : 'Pengajuan izin ditolak.';
      Alert.alert('Berhasil', message);
      setRejectionNotes((prev) => ({ ...prev, [payload.id]: '' }));
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = normalized.response?.data?.message || normalized.message || 'Gagal memproses persetujuan izin.';
      Alert.alert('Proses Gagal', msg);
    },
  });

  const permissions = useMemo(
    () => permissionsQuery.data?.permissions || [],
    [permissionsQuery.data?.permissions],
  );
  const selectedClass = classItems.find((item) => item.id === effectiveSelectedClassId) || null;

  const summary = useMemo(() => {
    const result = {
      total: permissions.length,
      pending: 0,
      approved: 0,
      rejected: 0,
      sick: 0,
      permission: 0,
      other: 0,
    };
    for (const item of permissions) {
      if (item.status === 'PENDING') result.pending += 1;
      if (item.status === 'APPROVED') result.approved += 1;
      if (item.status === 'REJECTED') result.rejected += 1;

      if (item.type === 'SICK') result.sick += 1;
      if (item.type === 'PERMISSION') result.permission += 1;
      if (item.type === 'OTHER') result.other += 1;
    }
    return result;
  }, [permissions]);

  const openAttachment = async (item: StudentPermission) => {
    const url = resolveFileUrl(item.fileUrl);
    if (!url) {
      Alert.alert('Lampiran Tidak Ada', 'Pengajuan ini tidak memiliki lampiran bukti.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'teacher-homeroom-permissions',
      webPath: url,
      label: 'Bukti Izin',
    });
  };

  const handleApprove = (item: StudentPermission) => {
    Alert.alert('Konfirmasi Persetujuan', `Setujui pengajuan izin dari ${item.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Setujui',
        style: 'default',
        onPress: () =>
          decisionMutation.mutate({
            id: item.id,
            status: 'APPROVED',
          }),
      },
    ]);
  };

  const handleReject = (item: StudentPermission) => {
    const note = (rejectionNotes[item.id] || '').trim() || 'Pengajuan tidak memenuhi ketentuan wali kelas.';
    Alert.alert('Konfirmasi Penolakan', `Tolak pengajuan izin dari ${item.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Tolak',
        style: 'destructive',
        onPress: () =>
          decisionMutation.mutate({
            id: item.id,
            status: 'REJECTED',
            approvalNote: note,
          }),
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan izin..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Persetujuan Izin</Text>
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
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Persetujuan Izin
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Modul ini tersedia untuk wali kelas yang memiliki kelas aktif.
        </Text>
        <QueryStateView type="error" message="Anda tidak memiliki hak akses untuk modul ini." />
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
            classesQuery.isFetching ||
            permissionsQuery.isFetching ||
            examProgramsQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void permissionsQuery.refetch();
            void examProgramsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        {activeTab === 'IZIN' ? 'Persetujuan Izin' : 'Buku Wali Kelas'}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {activeTab === 'IZIN'
          ? 'Verifikasi pengajuan izin siswa pada kelas wali.'
          : 'Kelola pengecualian ujian finance dan laporan kasus siswa pada kelas wali.'}
      </Text>

      <MobileMenuTabBar
        items={[
          { key: 'IZIN', label: 'Daftar Izin', iconName: 'file-text' },
          { key: 'BUKU_WALI_KELAS', label: 'Buku Wali', iconName: 'book-open' },
        ]}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as HomeroomPermissionTab)}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ paddingRight: 8 }}
      />

      {classesQuery.isLoading ? <QueryStateView type="loading" message="Memuat kelas wali..." /> : null}
      {classesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat kelas wali." onRetry={() => classesQuery.refetch()} />
      ) : null}

      {!classesQuery.isLoading && !classesQuery.isError ? (
        classItems.length > 0 ? (
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
            <MobileSelectField
              label="Kelas Wali"
              value={effectiveSelectedClassId ? String(effectiveSelectedClassId) : ''}
              options={classSelectOptions}
              onChange={(next) => setSelectedClassId(next ? Number(next) : null)}
              placeholder="Pilih kelas wali"
            />
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
              marginBottom: 12,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Tidak ada kelas wali
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Anda belum terdaftar sebagai wali kelas di tahun ajaran aktif.
            </Text>
          </View>
        )
      ) : null}

      {selectedClass ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>{selectedClass.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedClass.major?.name || '-'} • Wali: {selectedClass.teacher?.name || '-'}
          </Text>
        </View>
      ) : null}

      {activeTab === 'IZIN' ? (
      <>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[
          {
            key: 'total',
            title: 'Total Pengajuan',
            value: `${summary.total}`,
            subtitle: 'Sesuai filter saat ini',
            iconName: 'inbox' as const,
            accentColor: '#2563eb',
          },
          {
            key: 'pending',
            title: 'Menunggu Proses',
            value: `${summary.pending}`,
            subtitle: 'Perlu verifikasi wali kelas',
            iconName: 'clock' as const,
            accentColor: '#f97316',
          },
          {
            key: 'approved',
            title: 'Disetujui',
            value: `${summary.approved}`,
            subtitle: `Sakit ${summary.sick} • Izin ${summary.permission}`,
            iconName: 'check-circle' as const,
            accentColor: '#16a34a',
          },
          {
            key: 'rejected',
            title: 'Ditolak',
            value: `${summary.rejected}`,
            subtitle: `Lainnya ${summary.other}`,
            iconName: 'x-circle' as const,
            accentColor: '#dc2626',
          },
        ].map((item) => (
          <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title={item.title}
              value={item.value}
              subtitle={item.subtitle}
              iconName={item.iconName}
              accentColor={item.accentColor}
              onPress={() => setSummaryDetailVisible(true)}
            />
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 10,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa / NIS / NISN"
          placeholderTextColor="#8ea0bf"
          style={{
            flex: 1,
            paddingVertical: 11,
            paddingHorizontal: 9,
            color: BRAND_COLORS.textDark,
          }}
        />
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
        <MobileSelectField
          label="Filter Status"
          value={statusFilter}
          options={statusFilterOptions}
          onChange={(next) => setStatusFilter((next as StatusFilter) || 'ALL')}
          placeholder="Pilih status pengajuan"
        />
        <MobileSelectField
          label="Filter Jenis Izin"
          value={typeFilter}
          options={typeFilterOptions}
          onChange={(next) => setTypeFilter((next as TypeFilter) || 'ALL')}
          placeholder="Pilih jenis izin"
        />
      </View>

      {permissionsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data izin siswa..." /> : null}
      {permissionsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat data izin siswa."
          onRetry={() => permissionsQuery.refetch()}
        />
      ) : null}

      {!permissionsQuery.isLoading && !permissionsQuery.isError ? (
        permissions.length > 0 ? (
          permissions.map((item) => {
            const currentStatusStyle = statusStyle(item.status);
            const currentTypeStyle = typeStyle(item.type);
            const isPending = item.status === 'PENDING';
            return (
              <View
                key={item.id}
                style={{
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  backgroundColor: '#fff',
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 6,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>
                      {item.student?.name || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2 }}>
                      NIS: {item.student?.nis || '-'} • NISN: {item.student?.nisn || '-'}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: currentStatusStyle.border,
                      backgroundColor: currentStatusStyle.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: currentStatusStyle.text, fontWeight: '700', fontSize: 11 }}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    alignSelf: 'flex-start',
                    borderRadius: 999,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    backgroundColor: currentTypeStyle.bg,
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ color: currentTypeStyle.text, fontWeight: '700', fontSize: 12 }}>{TYPE_LABEL[item.type]}</Text>
                </View>

                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Tanggal: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{formatDateRange(item.startDate, item.endDate)}</Text>
                </Text>
                <Text style={{ color: '#475569', marginBottom: 2 }}>
                  Alasan: <Text style={{ color: BRAND_COLORS.textDark }}>{item.reason || '-'}</Text>
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                  Diajukan: {formatDate(item.createdAt)}
                </Text>

                {item.status === 'REJECTED' && item.approvalNote ? (
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fff1f2',
                      borderRadius: 8,
                      padding: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#991b1b', fontSize: 12 }}>{item.approvalNote}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: isPending ? 8 : 0 }}>
                  <Pressable
                    onPress={() => void openAttachment(item)}
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      backgroundColor: '#f8fafc',
                      paddingVertical: 9,
                      alignItems: 'center',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      gap: 6,
                    }}
                    >
                      <Feather name="paperclip" size={14} color="#334155" />
                    <Text style={{ color: '#334155', fontWeight: '600' }}>Lihat Bukti</Text>
                  </Pressable>
                </View>

                {isPending ? (
                  <>
                    <TextInput
                      value={rejectionNotes[item.id] || ''}
                      onChangeText={(value) =>
                        setRejectionNotes((prev) => ({
                          ...prev,
                          [item.id]: value,
                        }))
                      }
                      placeholder="Catatan penolakan (opsional)"
                      placeholderTextColor="#94a3b8"
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        color: BRAND_COLORS.textDark,
                        backgroundColor: '#f8fbff',
                        marginBottom: 8,
                      }}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => handleApprove(item)}
                        disabled={decisionMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          backgroundColor: '#16a34a',
                          alignItems: 'center',
                          paddingVertical: 10,
                          opacity: decisionMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Setujui</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => handleReject(item)}
                        disabled={decisionMutation.isPending}
                        style={{
                          flex: 1,
                          borderRadius: 8,
                          backgroundColor: '#dc2626',
                          alignItems: 'center',
                          paddingVertical: 10,
                          opacity: decisionMutation.isPending ? 0.7 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700' }}>Tolak</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            );
          })
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
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data izin siswa sesuai filter.</Text>
          </View>
        )
      ) : null}

      <MobileDetailModal
        visible={summaryDetailVisible}
        title="Ringkasan Persetujuan Izin"
        subtitle="Detail ringkas status pengajuan izin pada kelas dan filter yang sedang aktif."
        iconName="check-square"
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            {
              label: 'Total Pengajuan',
              value: `${summary.total}`,
              note: 'Jumlah pengajuan yang tampil sesuai kelas dan pencarian aktif',
            },
            {
              label: 'Menunggu Proses',
              value: `${summary.pending}`,
              note: 'Masih menunggu verifikasi wali kelas',
            },
            {
              label: 'Disetujui',
              value: `${summary.approved}`,
              note: `Sakit ${summary.sick} • Izin ${summary.permission}`,
            },
            {
              label: 'Ditolak',
              value: `${summary.rejected}`,
              note: `Kategori lainnya ${summary.other}`,
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 3 }}>{item.note}</Text>
            </View>
          ))}
          <View
            style={{
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 14,
              paddingHorizontal: 12,
              paddingVertical: 11,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Konteks Aktif</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
              Kelas: {selectedClass?.name || 'Semua kelas wali'}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Status: {STATUS_LABEL[statusFilter]}
            </Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
              Jenis: {TYPE_LABEL[typeFilter]}
            </Text>
          </View>
        </View>
      </MobileDetailModal>
      </>
      ) : (
        <HomeroomBookMobilePanel
          mode="homeroom"
          academicYearId={activeYearQuery.data?.id}
          classId={effectiveSelectedClassId}
          examPrograms={examProgramsQuery.data || []}
        />
      )}

    </ScrollView>
  );
}
