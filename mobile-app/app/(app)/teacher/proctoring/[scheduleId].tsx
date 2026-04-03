import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { proctoringApi } from '../../../../src/features/proctoring/proctoringApi';
import { ProctorScheduleStatus } from '../../../../src/features/proctoring/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../../src/lib/ui/feedback';

function parseScheduleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function statusLabel(status: ProctorScheduleStatus) {
  if (status === 'NOT_STARTED') return 'Belum Mulai';
  if (status === 'IN_PROGRESS') return 'Mengerjakan';
  if (status === 'COMPLETED') return 'Selesai';
  return 'Waktu Habis';
}

function statusStyle(status: ProctorScheduleStatus) {
  if (status === 'NOT_STARTED') return { text: '#475569', border: '#cbd5e1', bg: '#f1f5f9' };
  if (status === 'IN_PROGRESS') return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  if (status === 'COMPLETED') return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' };
}

function formatTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string | null | undefined) {
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

export default function TeacherProctoringDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scheduleId } = useLocalSearchParams<{ scheduleId?: string | string[] }>();
  const parsedScheduleId = useMemo(() => parseScheduleId(scheduleId), [scheduleId]);
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [notes, setNotes] = useState('');
  const [incident, setIncident] = useState('');

  const detailQuery = useQuery({
    queryKey: ['mobile-proctoring-detail', parsedScheduleId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!parsedScheduleId,
    queryFn: async () => proctoringApi.getScheduleDetail(Number(parsedScheduleId)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!parsedScheduleId) throw new Error('Jadwal ujian tidak valid.');
      const students = detailQuery.data?.students || [];
      const presentCount = students.filter((item) => !!item.startTime).length;
      const absentCount = Math.max(0, students.length - presentCount);
      await proctoringApi.submitReport(parsedScheduleId, {
        notes: notes.trim(),
        incident: incident.trim(),
        studentCountPresent: presentCount,
        studentCountAbsent: absentCount,
      });
    },
    onSuccess: async () => {
      notifySuccess('Berita acara berhasil disimpan.');
      await detailQuery.refetch();
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan berita acara.');
    },
  });

  const students = detailQuery.data?.students || [];
  const presentCount = students.filter((item) => !!item.startTime).length;
  const inProgressCount = students.filter((item) => item.status === 'IN_PROGRESS').length;
  const completedCount = students.filter((item) => item.status === 'COMPLETED').length;
  const absentCount = Math.max(0, students.length - presentCount);

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Monitoring Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!parsedScheduleId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <QueryStateView type="error" message="ID jadwal ujian tidak valid." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={detailQuery.isFetching}
          onRefresh={() => {
            void detailQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/teacher/proctoring')}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            backgroundColor: '#fff',
          }}
        >
          <Feather name="arrow-left" size={18} color="#334155" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark }}>Monitoring Ujian</Text>
          <Text style={{ color: BRAND_COLORS.textMuted }}>Pantau status peserta dan simpan berita acara.</Text>
        </View>
      </View>

      {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat detail jadwal..." /> : null}
      {detailQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat detail ujian."
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
        <>
          <View
            style={{
              backgroundColor: '#1e3a8a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#bfdbfe', fontSize: 12 }}>Jadwal Ujian</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 3 }}>
              {detailQuery.data.schedule.packet?.title || 'Paket Tidak Ditemukan'}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              {detailQuery.data.schedule.packet?.subject?.name || '-'} • {detailQuery.data.schedule.class?.name || '-'}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              {formatDateTime(detailQuery.data.schedule.startTime)} - {formatTime(detailQuery.data.schedule.endTime)}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              Ruangan: {detailQuery.data.schedule.room || 'Belum ditentukan'} • Token:{' '}
              {detailQuery.data.schedule.token || '-'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Total Siswa"
                value={String(students.length)}
                subtitle="Peserta kelas"
                iconName="users"
                accentColor="#2563eb"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Mengerjakan"
                value={String(inProgressCount)}
                subtitle="Sedang berlangsung"
                iconName="play-circle"
                accentColor="#0f766e"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Selesai"
                value={String(completedCount)}
                subtitle={`Absen ${absentCount}`}
                iconName="check-circle"
                accentColor="#16a34a"
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Status Peserta</Text>
            {students.length > 0 ? (
              students.map((student) => {
                const style = statusStyle(student.status);
                return (
                  <View
                    key={student.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>NIS: {student.nis || '-'}</Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: style.border,
                          backgroundColor: style.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: style.text, fontWeight: '700', fontSize: 11 }}>
                          {statusLabel(student.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>
                      Mulai: {formatTime(student.startTime)} • Selesai: {formatTime(student.submitTime)} • Nilai:{' '}
                      {student.score ?? '-'}
                    </Text>
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
                  padding: 12,
                }}
              >
                <Text style={{ color: '#64748b' }}>Belum ada data peserta untuk jadwal ini.</Text>
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
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Berita Acara</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Catatan pelaksanaan ujian"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 10,
                minHeight: 86,
                textAlignVertical: 'top',
                marginBottom: 8,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />
            <TextInput
              value={incident}
              onChangeText={setIncident}
              placeholder="Kejadian khusus (opsional)"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 10,
                minHeight: 70,
                textAlignVertical: 'top',
                marginBottom: 8,
                color: '#0f172a',
              }}
              placeholderTextColor="#94a3b8"
              multiline
            />
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
              Hadir: {presentCount} siswa • Tidak hadir: {absentCount} siswa
            </Text>
            <Pressable
              onPress={() => {
                Alert.alert('Konfirmasi', 'Simpan berita acara ujian ini?', [
                  { text: 'Batal', style: 'cancel' },
                  {
                    text: 'Simpan',
                    onPress: () => {
                      void submitMutation.mutateAsync();
                    },
                  },
                ]);
              }}
              style={{
                backgroundColor: BRAND_COLORS.blue,
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
                opacity: submitMutation.isPending ? 0.6 : 1,
              }}
              disabled={submitMutation.isPending}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {submitMutation.isPending ? 'Menyimpan...' : 'Simpan Berita Acara'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
