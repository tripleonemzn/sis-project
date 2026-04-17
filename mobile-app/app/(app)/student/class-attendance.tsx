import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { apiClient } from '../../../src/lib/api/client';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type DailyAttendanceStatus = 'PRESENT' | 'SICK' | 'PERMISSION' | 'ABSENT' | 'LATE';

type DailyAttendanceRow = {
  student: {
    id: number;
    name: string;
    nis?: string | null;
    nisn?: string | null;
  };
  status: DailyAttendanceStatus | null;
  note?: string | null;
};

type ApiEnvelope<T> = {
  statusCode: number;
  success: boolean;
  message: string;
  data: T;
};

const STATUS_LABELS: Record<DailyAttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  ABSENT: 'Alpha',
  LATE: 'Terlambat',
};

export default function StudentClassAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { scaleFont, fontSizes } = useAppTextScale();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [statusMap, setStatusMap] = useState<Record<number, DailyAttendanceStatus>>({});
  const [noteMap, setNoteMap] = useState<Record<number, string>>({});

  const activeYearQuery = useQuery({
    queryKey: ['mobile-student-class-attendance-active-year'],
    queryFn: () => adminApi.getActiveAcademicYear(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const classId = user?.studentClass?.id || null;
  const academicYearId = activeYearQuery.data?.id || null;

  const attendanceQuery = useQuery({
    queryKey: ['mobile-student-class-attendance', classId, academicYearId, date],
    queryFn: async () => {
      const response = await apiClient.get<ApiEnvelope<DailyAttendanceRow[]>>('/attendances/daily', {
        params: {
          date,
          classId,
          academicYearId,
        },
      });
      return response.data?.data || [];
    },
    enabled: Boolean(classId && academicYearId && date),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!classId || !academicYearId) throw new Error('Data kelas atau tahun ajaran belum tersedia.');
      const rows = attendanceQuery.data || [];
      const records = rows.map((row) => {
        const studentId = row.student.id;
        return {
          studentId,
          status: statusMap[studentId] || row.status || 'PRESENT',
          note: noteMap[studentId] || row.note || '',
        };
      });
      await apiClient.post('/attendances/daily', {
        date,
        classId,
        academicYearId,
        records,
      });
    },
    onSuccess: async () => {
      notifySuccess('Presensi kelas berhasil disimpan.');
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-class-attendance', classId, academicYearId, date],
      });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan presensi kelas.');
    },
  });

  const rows = useMemo(() => attendanceQuery.data || [], [attendanceQuery.data]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.student.name.toLowerCase().includes(q) ||
        String(row.student.nis || '')
          .toLowerCase()
          .includes(q) ||
        String(row.student.nisn || '')
          .toLowerCase()
          .includes(q),
    );
  }, [rows, search]);

  if (isLoading) return <AppLoadingScreen message="Memuat presensi kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'STUDENT') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={attendanceQuery.isFetching && !attendanceQuery.isLoading}
          onRefresh={() => attendanceQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Presensi Kelas
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Input presensi harian kelas sebagai ketua murid.
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
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="Tanggal (YYYY-MM-DD)"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          style={{
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: fontSizes.body,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
            marginBottom: 8,
          }}
        />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari siswa..."
          placeholderTextColor="#94a3b8"
          style={{
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: fontSizes.body,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
          }}
        />
      </View>

      {attendanceQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data presensi..." /> : null}
      {attendanceQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data presensi kelas." onRetry={() => attendanceQuery.refetch()} />
      ) : null}

      {!attendanceQuery.isLoading && !attendanceQuery.isError ? (
        filteredRows.length > 0 ? (
          <>
            {filteredRows.map((row) => {
              const currentStatus = statusMap[row.student.id] || row.status || 'PRESENT';
              const currentNote = noteMap[row.student.id] ?? row.note ?? '';
              return (
                <View
                  key={row.student.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.student.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), marginBottom: 8 }}>
                    NIS: {row.student.nis || '-'} | NISN: {row.student.nisn || '-'}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 8 }}>
                    {(Object.keys(STATUS_LABELS) as DailyAttendanceStatus[]).map((status) => (
                      <View key={status} style={{ width: '33.3333%', paddingHorizontal: 3, marginBottom: 6 }}>
                        <Pressable
                          onPress={() =>
                            setStatusMap((prev) => ({
                              ...prev,
                              [row.student.id]: status,
                            }))
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: currentStatus === status ? BRAND_COLORS.blue : '#d6e2f7',
                            backgroundColor: currentStatus === status ? '#eff6ff' : '#fff',
                            borderRadius: 8,
                            paddingVertical: 7,
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: currentStatus === status ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                              fontWeight: '700',
                              fontSize: scaleFont(11),
                            }}
                          >
                            {STATUS_LABELS[status]}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    value={currentNote}
                    onChangeText={(value) =>
                      setNoteMap((prev) => ({
                        ...prev,
                        [row.student.id]: value,
                      }))
                    }
                    placeholder="Catatan (opsional)"
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: '#fff',
                    }}
                  />
                </View>
              );
            })}
            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{
                backgroundColor: saveMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                borderRadius: 10,
                alignItems: 'center',
                paddingVertical: 12,
                marginTop: 6,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Presensi Harian'}
              </Text>
            </Pressable>
          </>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 12,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Data tidak ditemukan</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada siswa sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 10,
          alignItems: 'center',
          paddingVertical: 12,
          marginTop: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
