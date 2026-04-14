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
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { ENV } from '../../../src/config/env';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { adminApi } from '../../../src/features/admin/adminApi';
import { kesiswaanApi } from '../../../src/features/kesiswaan/kesiswaanApi';
import { KesiswaanPermission, KesiswaanPermissionStatus, KesiswaanPermissionType } from '../../../src/features/kesiswaan/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';

type StatusFilter = 'ALL' | KesiswaanPermissionStatus;
type TypeFilter = 'ALL' | KesiswaanPermissionType;

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

function hasStudentAffairsDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KESISWAAN') || duties.includes('SEKRETARIS_KESISWAAN');
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

function formatDateRange(startDate: string, endDate: string) {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
}

function statusColor(status: KesiswaanPermissionStatus) {
  if (status === 'APPROVED') return '#15803d';
  if (status === 'REJECTED') return '#b91c1c';
  return '#b45309';
}

function statusBg(status: KesiswaanPermissionStatus) {
  if (status === 'APPROVED') return '#dcfce7';
  if (status === 'REJECTED') return '#fee2e2';
  return '#fef3c7';
}

function typeColor(type: KesiswaanPermissionType) {
  if (type === 'SICK') return '#b91c1c';
  if (type === 'PERMISSION') return '#1d4ed8';
  return '#475569';
}

function resolveFileUrl(fileUrl: string | null | undefined) {
  if (!fileUrl) return null;
  if (/^https?:\/\//i.test(fileUrl)) return fileUrl;
  const webBaseUrl = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  if (fileUrl.startsWith('/')) return `${webBaseUrl}${fileUrl}`;
  return `${webBaseUrl}/${fileUrl}`;
}

export default function TeacherWakasisApprovalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [selectedClassId, setSelectedClassId] = useState<number | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionNote, setRejectionNote] = useState('');

  const isAllowed = user?.role === 'TEACHER' && hasStudentAffairsDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakasis-approvals-active-year'],
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
    queryKey: ['mobile-wakasis-approvals-classes', activeYearQuery.data?.id],
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

  const approvalsQuery = useQuery({
    queryKey: [
      'mobile-wakasis-approvals-list',
      activeYearQuery.data?.id,
      selectedClassId,
      statusFilter,
      typeFilter,
      search,
    ],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      return kesiswaanApi.listPermissionApprovals({
        academicYearId: Number(activeYearQuery.data?.id),
        classId: selectedClassId === 'ALL' ? undefined : selectedClassId,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        search: search.trim() || undefined,
        page: 1,
        limit: 250,
      });
    },
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { id: number; status: 'APPROVED' | 'REJECTED'; approvalNote?: string }) =>
      kesiswaanApi.updatePermissionApprovalStatus(payload.id, {
        status: payload.status,
        approvalNote: payload.approvalNote,
      }),
    onSuccess: async (_, payload) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-wakasis-approvals-list'] });
      const message = payload.status === 'APPROVED' ? 'Pengajuan izin disetujui.' : 'Pengajuan izin ditolak.';
      Alert.alert('Berhasil', message);
      setRejectingId(null);
      setRejectionNote('');
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = normalized.response?.data?.message || normalized.message || 'Gagal memproses persetujuan.';
      Alert.alert('Proses Gagal', msg);
    },
  });

  const permissions = approvalsQuery.data?.permissions || [];
  const totalFiltered = approvalsQuery.data?.meta?.total ?? permissions.length;
  const pendingCount = permissions.filter((item) => item.status === 'PENDING').length;

  const selectedClassLabel = useMemo(() => {
    if (selectedClassId === 'ALL') return 'Semua kelas';
    return classesQuery.data?.find((item) => item.id === selectedClassId)?.name || `Kelas ${selectedClassId}`;
  }, [selectedClassId, classesQuery.data]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(STATUS_LABEL) as StatusFilter[]).map((status) => ({
        label: STATUS_LABEL[status],
        value: status,
      })),
    [],
  );

  const typeOptions = useMemo(
    () =>
      (Object.keys(TYPE_LABEL) as TypeFilter[]).map((type) => ({
        label: TYPE_LABEL[type],
        value: type,
      })),
    [],
  );

  const classOptions = useMemo(
    () => [
      { label: 'Semua kelas', value: 'ALL' },
      ...(classesQuery.data || []).map((item) => ({
        label: item.name,
        value: String(item.id),
      })),
    ],
    [classesQuery.data],
  );

  const statusStats = (() => {
    const result = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const item of permissions) {
      if (item.status === 'PENDING') result.PENDING += 1;
      if (item.status === 'APPROVED') result.APPROVED += 1;
      if (item.status === 'REJECTED') result.REJECTED += 1;
    }
    return result;
  })();

  const openAttachment = async (permission: KesiswaanPermission) => {
    const url = resolveFileUrl(permission.fileUrl);
    if (!url) {
      Alert.alert('Berkas Tidak Ada', 'Pengajuan ini tidak memiliki lampiran bukti.');
      return;
    }
    openWebModuleRoute(router, {
      moduleKey: 'teacher-wakasis-approvals',
      webPath: url,
      label: 'Lampiran Pengajuan',
    });
  };

  const handleApprove = (permission: KesiswaanPermission) => {
    Alert.alert('Konfirmasi Persetujuan', `Setujui pengajuan dari ${permission.student?.name || 'siswa ini'}?`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Setujui',
        style: 'default',
        onPress: () =>
          decisionMutation.mutate({
            id: permission.id,
            status: 'APPROVED',
          }),
      },
    ]);
  };

  const submitReject = (permissionId: number) => {
    decisionMutation.mutate({
      id: permissionId,
      status: 'REJECTED',
      approvalNote: rejectionNote.trim() || 'Pengajuan tidak memenuhi ketentuan.',
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat persetujuan..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Persetujuan</Text>
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
          Persetujuan
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
            activeYearQuery.isFetching || classesQuery.isFetching || approvalsQuery.isFetching || decisionMutation.isPending
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void classesQuery.refetch();
            void approvalsQuery.refetch();
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
          Persetujuan
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Verifikasi pengajuan izin siswa dan tindak lanjuti status persetujuannya.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e2f7',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <View
          style={{
            backgroundColor: '#f8fbff',
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 999,
            paddingHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama siswa, NIS, NISN"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        <MobileSelectField
          label="Filter status"
          value={statusFilter}
          options={statusOptions}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          placeholder="Pilih status"
        />

        <MobileSelectField
          label="Filter jenis izin"
          value={typeFilter}
          options={typeOptions}
          onChange={(value) => setTypeFilter(value as TypeFilter)}
          placeholder="Pilih jenis izin"
        />

        <MobileSelectField
          label="Filter kelas"
          value={selectedClassId === 'ALL' ? 'ALL' : String(selectedClassId)}
          options={classOptions}
          onChange={(value) => setSelectedClassId(value === 'ALL' ? 'ALL' : Number(value))}
          placeholder="Pilih kelas"
          maxHeight={260}
        />

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 10 }}>
          Filter aktif: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{selectedClassLabel}</Text>
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
          Total data: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{totalFiltered.toLocaleString('id-ID')}</Text> • Pending: <Text style={{ color: '#b45309', fontWeight: '700' }}>{pendingCount.toLocaleString('id-ID')}</Text>
        </Text>
      </View>

      {approvalsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data persetujuan izin..." /> : null}

      {approvalsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data persetujuan izin." onRetry={() => approvalsQuery.refetch()} />
      ) : null}

      {!approvalsQuery.isLoading && !approvalsQuery.isError ? (
        permissions.length > 0 ? (
          <View style={{ marginBottom: 8 }}>
            {permissions.map((item) => (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 15 }}>
                      {item.student?.name || '-'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      NIS: {item.student?.nis || '-'} | NISN: {item.student?.nisn || '-'}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: statusColor(item.status),
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      backgroundColor: statusBg(item.status),
                    }}
                  >
                    <Text style={{ color: statusColor(item.status), fontWeight: '700', fontSize: 11 }}>
                      {STATUS_LABEL[item.status]}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                  <View
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: typeColor(item.type),
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ color: typeColor(item.type), fontWeight: '700', fontSize: 11 }}>{TYPE_LABEL[item.type]}</Text>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                    {formatDateRange(item.startDate, item.endDate)}
                  </Text>
                </View>

                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6 }}>{item.reason || '-'}</Text>

                {item.approvedBy?.name ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 2 }}>
                    Diproses oleh: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.approvedBy.name}</Text>
                  </Text>
                ) : null}

                {item.approvalNote ? (
                  <View
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      backgroundColor: '#f8fbff',
                      padding: 8,
                      marginTop: 4,
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>{item.approvalNote}</Text>
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <Pressable
                    onPress={() => void openAttachment(item)}
                    style={{
                      flex: 1,
                      borderRadius: 9,
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      alignItems: 'center',
                      paddingVertical: 10,
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Lihat Bukti</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (item.status === 'PENDING') {
                        handleApprove(item);
                        return;
                      }
                      Alert.alert('Informasi', 'Pengajuan yang sudah diproses tidak bisa disetujui ulang.');
                    }}
                    disabled={decisionMutation.isPending}
                    style={{
                      flex: 1,
                      borderRadius: 9,
                      alignItems: 'center',
                      paddingVertical: 10,
                      backgroundColor: item.status === 'PENDING' ? BRAND_COLORS.blue : '#93c5fd',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {decisionMutation.isPending ? 'Memproses...' : 'Setujui'}
                    </Text>
                  </Pressable>
                </View>

                {item.status === 'PENDING' ? (
                  rejectingId === item.id ? (
                    <View style={{ marginTop: 8 }}>
                      <TextInput
                        value={rejectionNote}
                        onChangeText={setRejectionNote}
                        placeholder="Alasan penolakan (opsional)"
                        placeholderTextColor="#94a3b8"
                        multiline
                        style={{
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          borderRadius: 10,
                          backgroundColor: '#fff7f7',
                          color: BRAND_COLORS.textDark,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          minHeight: 72,
                          textAlignVertical: 'top',
                        }}
                      />

                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          onPress={() => {
                            setRejectingId(null);
                            setRejectionNote('');
                          }}
                          style={{
                            flex: 1,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderColor: '#d6e2f7',
                            alignItems: 'center',
                            paddingVertical: 10,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Batal</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => submitReject(item.id)}
                          disabled={decisionMutation.isPending}
                          style={{
                            flex: 1,
                            borderRadius: 9,
                            alignItems: 'center',
                            paddingVertical: 10,
                            backgroundColor: '#dc2626',
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>
                            {decisionMutation.isPending ? 'Memproses...' : 'Kirim Tolak'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        setRejectingId(item.id);
                        setRejectionNote('');
                      }}
                      style={{
                        marginTop: 8,
                        borderRadius: 9,
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        alignItems: 'center',
                        paddingVertical: 10,
                        backgroundColor: '#fff5f5',
                      }}
                    >
                      <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Tolak Pengajuan</Text>
                    </Pressable>
                  )
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada data</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada pengajuan izin sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: '#dbe7fb',
          backgroundColor: '#fff',
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Ringkasan Filter Saat Ini</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 2 }}>
          Pending: {statusStats.PENDING.toLocaleString('id-ID')} | Disetujui: {statusStats.APPROVED.toLocaleString('id-ID')}
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted }}>
          Ditolak: {statusStats.REJECTED.toLocaleString('id-ID')}
        </Text>
      </View>

    </ScrollView>
  );
}
