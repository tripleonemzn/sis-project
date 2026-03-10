import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { studentExtracurricularApi } from '../../../src/features/student/studentExtracurricularApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

export default function StudentExtracurricularScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [search, setSearch] = useState('');
  const [selectedEkskulId, setSelectedEkskulId] = useState<number | null>(null);

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

  const listQuery = useQuery({
    queryKey: ['mobile-student-extracurricular-list'],
    queryFn: () => studentExtracurricularApi.listExtracurriculars(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const enrollMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEkskulId) throw new Error('Pilih ekstrakurikuler terlebih dahulu.');
      return studentExtracurricularApi.enroll(selectedEkskulId, activeYearQuery.data?.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-extracurricular-enrollment', user?.id] });
      notifySuccess('Pendaftaran ekstrakurikuler berhasil.');
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mendaftar ekstrakurikuler.');
    },
  });

  const list = useMemo(() => listQuery.data || [], [listQuery.data]);
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description || '').toLowerCase().includes(q) ||
        (item.tutorAssignments || []).some((assignment) =>
          String(assignment.tutor?.name || '')
            .toLowerCase()
            .includes(q),
        ),
    );
  }, [list, search]);

  const myEnrollment = enrollmentQuery.data;

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
            (enrollmentQuery.isFetching && !enrollmentQuery.isLoading)
          }
          onRefresh={() => {
            void listQuery.refetch();
            void enrollmentQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Ekstrakurikuler
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pilih ekstrakurikuler aktif untuk tahun ajaran berjalan.
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Status Ekstrakurikuler</Text>
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
              {myEnrollment.ekskul.description || 'Tanpa deskripsi.'}
            </Text>
          </View>
        ) : (
          <Text style={{ color: '#b45309', marginTop: 8, fontSize: 12 }}>
            Anda belum memilih ekstrakurikuler.
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
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari ekstrakurikuler..."
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

        {listQuery.isLoading ? <QueryStateView type="loading" message="Mengambil daftar ekstrakurikuler..." /> : null}
        {listQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat daftar ekstrakurikuler." onRetry={() => listQuery.refetch()} />
        ) : null}

        {!listQuery.isLoading && !listQuery.isError ? (
          filteredList.length > 0 ? (
            filteredList.map((item) => {
              const selected = selectedEkskulId === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedEkskulId(item.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 10,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.name}</Text>
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Data tidak ditemukan</Text>
              <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada ekstrakurikuler sesuai pencarian.</Text>
            </View>
          )
        ) : null}
      </View>

      {!myEnrollment ? (
        <Pressable
          onPress={() => enrollMutation.mutate()}
          disabled={enrollMutation.isPending || !selectedEkskulId}
          style={{
            backgroundColor: enrollMutation.isPending || !selectedEkskulId ? '#93c5fd' : BRAND_COLORS.blue,
            borderRadius: 10,
            alignItems: 'center',
            paddingVertical: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>
            {enrollMutation.isPending ? 'Memproses...' : 'Daftar Ekstrakurikuler'}
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 10,
          alignItems: 'center',
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
