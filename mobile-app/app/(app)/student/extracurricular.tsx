import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import {
  studentExtracurricularApi,
  type StudentExtracurricular,
} from '../../../src/features/student/studentExtracurricularApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

function formatShortDate(raw?: string | null) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function StudentExtracurricularScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [search, setSearch] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-student-active-year'],
    queryFn: () => adminApi.getActiveAcademicYear(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const enrollmentQuery = useQuery({
    queryKey: ['mobile-student-extracurricular-enrollment', user?.id],
    queryFn: () => studentExtracurricularApi.getMyEnrollment(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const osisStatusQuery = useQuery({
    queryKey: ['mobile-student-osis-status', user?.id],
    queryFn: () => studentExtracurricularApi.getMyOsisStatus(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const listQuery = useQuery({
    queryKey: ['mobile-student-extracurricular-list'],
    queryFn: () => studentExtracurricularApi.listExtracurriculars(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItemId) throw new Error('Pilih ekstrakurikuler terlebih dahulu.');
      return studentExtracurricularApi.enroll(selectedItemId, activeYearQuery.data?.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-extracurricular-enrollment', user?.id],
      });
      notifySuccess('Pendaftaran ekstrakurikuler berhasil.');
      setSelectedItemId(null);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mendaftar ekstrakurikuler.');
    },
  });

  const osisJoinMutation = useMutation({
    mutationFn: async () => {
      if (!selectedItemId) throw new Error('Pilih OSIS terlebih dahulu.');
      return studentExtracurricularApi.requestOsisJoin(selectedItemId, activeYearQuery.data?.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-osis-status', user?.id],
      });
      notifySuccess('Pengajuan OSIS berhasil dikirim.');
      setSelectedItemId(null);
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengirim pengajuan OSIS.');
    },
  });

  const list = useMemo(() => listQuery.data || [], [listQuery.data]);
  const myEnrollment = enrollmentQuery.data;
  const myOsisStatus = osisStatusQuery.data;
  const osisMembership = myOsisStatus?.membership || null;
  const osisRequest = myOsisStatus?.request || null;
  const hasPendingOsisRequest = osisRequest?.status === 'PENDING';
  const canChooseRegularExtracurricular = !myEnrollment;
  const canRequestOsis = !osisMembership && !hasPendingOsisRequest;
  const availableItems = useMemo(
    () =>
      list.filter((item) =>
        item.category === 'OSIS' ? canRequestOsis : canChooseRegularExtracurricular,
      ),
    [canChooseRegularExtracurricular, canRequestOsis, list],
  );
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return availableItems;
    return availableItems.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.tutorAssignments || []).some((assignment) =>
          String(assignment.tutor?.name || '')
            .toLowerCase()
            .includes(q),
        ),
    );
  }, [availableItems, search]);
  const hasSearchTerm = search.trim().length > 0;
  const selectedItem = filteredList.find((item) => item.id === selectedItemId) || null;
  const selectedIsOsis = selectedItem?.category === 'OSIS';

  const canSubmit =
    Boolean(selectedItem && selectedItemId) &&
    (selectedIsOsis ? !osisMembership && !hasPendingOsisRequest : !myEnrollment);

  const submitLabel = !selectedItem
    ? 'Pilih data terlebih dahulu'
    : selectedIsOsis
      ? osisMembership
        ? 'Sudah Menjadi Anggota OSIS'
        : hasPendingOsisRequest
          ? 'Pengajuan OSIS Sedang Diproses'
          : osisJoinMutation.isPending
            ? 'Mengirim Pengajuan OSIS...'
            : 'Ajukan OSIS'
      : myEnrollment
        ? 'Ekskul Reguler Sudah Dipilih'
        : enrollMutation.isPending
          ? 'Memproses...'
          : 'Pilih Ekstrakurikuler';

  if (isLoading) return <AppLoadingScreen message="Memuat ekstrakurikuler..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Ekstrakurikuler</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role siswa." />
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
            (listQuery.isFetching && !listQuery.isLoading) ||
            (enrollmentQuery.isFetching && !enrollmentQuery.isLoading) ||
            (osisStatusQuery.isFetching && !osisStatusQuery.isLoading)
          }
          onRefresh={() => {
            void listQuery.refetch();
            void enrollmentQuery.refetch();
            void osisStatusQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Ekstrakurikuler
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pilih 1 ekskul reguler dan, jika tersedia, ajukan OSIS secara terpisah pada tahun ajaran berjalan.
      </Text>

      <View
        style={{
          backgroundColor: '#fef3c7',
          borderWidth: 1,
          borderColor: '#fcd34d',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Aturan Pilihan Siswa</Text>
        <Text style={{ color: '#92400e', fontSize: 12, lineHeight: 18 }}>
          Ekskul reguler hanya boleh dipilih satu kali. OSIS diproses terpisah oleh pembina OSIS sehingga tidak
          memakan slot ekskul reguler.
        </Text>
      </View>

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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Status Ekskul Reguler</Text>
        {myEnrollment?.ekskul ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', marginBottom: 3 }}>Pilihan Saya</Text>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>{myEnrollment.ekskul.name}</Text>
            <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              Terkunci untuk Tahun Ajaran {activeYearQuery.data?.name || '-'}
            </Text>
          </View>
        ) : (
          <Text style={{ color: '#b45309', marginTop: 8, fontSize: 12 }}>
            Anda belum memilih ekskul reguler.
          </Text>
        )}
      </View>

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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Status OSIS</Text>
        {osisMembership ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: '#a7f3d0',
              backgroundColor: '#ecfdf5',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#047857', fontWeight: '700', marginBottom: 3 }}>Anggota OSIS Aktif</Text>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>{osisMembership.position?.name || 'Pengurus OSIS'}</Text>
            <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              Divisi: {osisMembership.division?.name || osisMembership.position?.division?.name || '-'}
            </Text>
          </View>
        ) : osisRequest ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor: osisRequest.status === 'PENDING' ? '#fcd34d' : '#fecaca',
              backgroundColor: osisRequest.status === 'PENDING' ? '#fffbeb' : '#fef2f2',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>
              {osisRequest.status === 'PENDING' ? 'Pengajuan OSIS Menunggu Proses' : 'Riwayat Pengajuan OSIS'}
            </Text>
            <Text style={{ color: '#475569', fontSize: 12, marginTop: 2 }}>
              {osisRequest.ekskul?.name || 'OSIS'} • {formatShortDate(osisRequest.requestedAt)}
            </Text>
            {osisRequest.note ? (
              <Text style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>Catatan: {osisRequest.note}</Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: '#b45309', marginTop: 8, fontSize: 12 }}>
            Anda belum mengajukan OSIS.
          </Text>
        )}
      </View>

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
        {availableItems.length > 0 ? (
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari ekstrakurikuler atau OSIS..."
            placeholderTextColor="#94a3b8"
            style={{
              borderWidth: 1,
              borderColor: '#d6e2f7',
              borderRadius: 999,
              backgroundColor: '#f8fbff',
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: BRAND_COLORS.textDark,
              marginBottom: 10,
            }}
          />
        ) : null}

        {listQuery.isLoading ? <QueryStateView type="loading" message="Mengambil daftar ekstrakurikuler..." /> : null}
        {listQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat daftar ekstrakurikuler."
            onRetry={() => listQuery.refetch()}
          />
        ) : null}

        {!listQuery.isLoading && !listQuery.isError ? (
          availableItems.length > 0 ? (
            filteredList.length > 0 ? (
              filteredList.map((item: StudentExtracurricular) => {
              const isSelected = selectedItemId === item.id;
              const isOsis = item.category === 'OSIS';
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedItemId(item.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: isSelected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: isSelected ? '#eff6ff' : '#fff',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', flex: 1 }}>{item.name}</Text>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        backgroundColor: isOsis ? '#fef3c7' : '#dbeafe',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: isOsis ? '#b45309' : '#1d4ed8',
                        }}
                      >
                        {isOsis ? 'OSIS' : 'EKSKUL'}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                    {item.description || 'Tanpa deskripsi.'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 3 }}>
                    Pembina:{' '}
                    {(item.tutorAssignments || [])
                      .map((assignment) => assignment.tutor?.name)
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </Text>
                  {isOsis ? (
                    <Text style={{ color: '#b45309', fontSize: 12, marginTop: 6 }}>
                      Pembina OSIS akan menempatkan Anda ke divisi dan jabatan yang sesuai.
                    </Text>
                  ) : null}
                </Pressable>
              );
              })
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
                  Data tidak ditemukan
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted }}>
                  Tidak ada ekstrakurikuler atau OSIS sesuai pencarian.
                </Text>
              </View>
            )
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 10,
                padding: 12,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
                {hasSearchTerm ? 'Data tidak ditemukan' : 'Pilihan Sudah Terkunci'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                {hasSearchTerm
                  ? 'Tidak ada ekstrakurikuler atau OSIS sesuai pencarian.'
                  : myEnrollment && !canRequestOsis
                  ? 'Ekskul reguler Anda sudah terkunci dan status OSIS Anda juga sudah diproses.'
                  : myEnrollment
                    ? 'Ekskul reguler Anda sudah terkunci. Jika sekolah menyediakan OSIS, pengajuannya diproses terpisah.'
                    : 'Tidak ada pilihan tambahan yang tersedia saat ini.'}
              </Text>
            </View>
          )
        ) : null}
      </View>

      {availableItems.length > 0 ? (
        <Pressable
          onPress={() => {
            if (!selectedItem) return;
            if (selectedItem.category === 'OSIS') {
              osisJoinMutation.mutate();
              return;
            }
            enrollMutation.mutate();
          }}
          disabled={
            !canSubmit || enrollMutation.isPending || osisJoinMutation.isPending
          }
          style={{
            backgroundColor:
              !canSubmit || enrollMutation.isPending || osisJoinMutation.isPending
                ? '#93c5fd'
                : selectedIsOsis
                  ? '#f59e0b'
                  : BRAND_COLORS.blue,
            borderRadius: 10,
            alignItems: 'center',
            paddingVertical: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{submitLabel}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}
