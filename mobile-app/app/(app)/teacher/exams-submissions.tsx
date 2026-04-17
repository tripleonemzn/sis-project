import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { examApi } from '../../../src/features/exams/examApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type SessionStatusFilter = 'ALL' | 'IN_PROGRESS' | 'COMPLETED' | 'TIMEOUT';

function parseNumericParam(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseStringParam(raw: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value ? String(value) : fallback;
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function statusLabel(value: string): string {
  if (value === 'COMPLETED') return 'Selesai';
  if (value === 'IN_PROGRESS') return 'Berlangsung';
  if (value === 'TIMEOUT') return 'Timeout';
  return value;
}

function statusStyle(value: string): { bg: string; border: string; text: string } {
  if (value === 'COMPLETED') return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (value === 'IN_PROGRESS') return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' };
  if (value === 'TIMEOUT') return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  return { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155' };
}

export default function TeacherExamSubmissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 110 });
  const { isAuthenticated, isLoading, user } = useAuth();
  const params = useLocalSearchParams<{ packetId?: string | string[]; title?: string | string[] }>();
  const packetId = useMemo(() => parseNumericParam(params.packetId), [params.packetId]);
  const packetTitle = parseStringParam(params.title, 'Packet Ujian');
  const [statusFilter, setStatusFilter] = useState<SessionStatusFilter>('ALL');
  const { scaleFont, scaleLineHeight } = useAppTextScale();

  const submissionsQuery = useQuery({
    queryKey: ['mobile-teacher-exam-submissions', packetId, statusFilter],
    enabled: isAuthenticated && !!user && user.role === 'TEACHER' && !!packetId,
    queryFn: () =>
      examApi.getPacketSubmissions(packetId!, {
        status: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat submission ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>
          Submission Ujian
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!packetId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>
          Submission Ujian
        </Text>
        <QueryStateView type="error" message="Packet ID tidak valid." />
        <Pressable
          onPress={() => router.back()}
          style={{
            marginTop: 14,
            backgroundColor: '#1d4ed8',
            borderRadius: 10,
            paddingVertical: 12,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={submissionsQuery.isFetching && !submissionsQuery.isLoading}
          onRefresh={() => {
            void submissionsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>
        Submission Ujian
      </Text>
      <Text style={{ color: '#334155', marginBottom: 3, fontWeight: '600' }} numberOfLines={2}>
        {packetTitle}
      </Text>
      <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        Pantau progres siswa dan buka detail jawaban setiap sesi.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
        {([
          { value: 'ALL', label: 'Semua' },
          { value: 'IN_PROGRESS', label: 'Berlangsung' },
          { value: 'COMPLETED', label: 'Selesai' },
          { value: 'TIMEOUT', label: 'Timeout' },
        ] as Array<{ value: SessionStatusFilter; label: string }>).map((item) => {
          const active = statusFilter === item.value;
          return (
            <View key={item.value} style={{ width: '25%', paddingHorizontal: 4, marginBottom: 6 }}>
              <Pressable
                onPress={() => setStatusFilter(item.value)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? '#2563eb' : '#cbd5e1',
                  backgroundColor: active ? '#dbeafe' : '#fff',
                  borderRadius: 999,
                  paddingVertical: 7,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: active ? '#1d4ed8' : '#475569', fontWeight: '700', fontSize: scaleFont(11) }}>
                  {item.label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {submissionsQuery.data?.summary ? (
        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#dbeafe',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {[
              { label: 'Sesi', value: String(submissionsQuery.data.summary.sessionCount), color: '#1d4ed8' },
              { label: 'Peserta', value: String(submissionsQuery.data.summary.participantCount), color: '#0f766e' },
              { label: 'Selesai', value: String(submissionsQuery.data.summary.submittedCount), color: '#15803d' },
              {
                label: 'Rata-rata',
                value:
                  submissionsQuery.data.summary.averageScore === null
                    ? '-'
                    : submissionsQuery.data.summary.averageScore.toFixed(2),
                color: '#b45309',
              },
            ].map((item) => (
              <View key={item.label} style={{ width: '25%', paddingHorizontal: 4 }}>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: `${item.color}55`,
                    backgroundColor: `${item.color}15`,
                    borderRadius: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: item.color, fontWeight: '700', fontSize: scaleFont(16) }}>{item.value}</Text>
                  <Text style={{ color: '#64748b', fontSize: scaleFont(10), lineHeight: scaleLineHeight(14) }}>{item.label}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {submissionsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat daftar submission ujian..." />
      ) : null}

      {submissionsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat daftar submission ujian."
          onRetry={() => {
            void submissionsQuery.refetch();
          }}
        />
      ) : null}

      {!submissionsQuery.isLoading && !submissionsQuery.isError ? (
        submissionsQuery.data && submissionsQuery.data.sessions.length > 0 ? (
          <View>
            {submissionsQuery.data.sessions.map((item) => {
              const badge = statusStyle(item.status);
              return (
                <View
                  key={item.sessionId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>
                      {item.student.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: scaleFont(11),
                        fontWeight: '700',
                        color: badge.text,
                        backgroundColor: badge.bg,
                        borderWidth: 1,
                        borderColor: badge.border,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                      }}
                    >
                      {statusLabel(item.status)}
                    </Text>
                  </View>

                  <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 2 }}>
                    NIS: {item.student.nis || '-'} • Kelas: {item.class?.name || '-'}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 2 }}>
                    Nilai: {item.score === null ? '-' : item.score.toFixed(2)} • Progress:{' '}
                    {item.answeredCount}/{item.totalQuestions} ({formatPercent(item.completionRate)})
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 8 }}>
                    Mulai: {formatDateTime(item.startTime)} • Kumpul: {formatDateTime(item.submitTime)}
                  </Text>

                  <Pressable
                    onPress={() =>
                      router.push(
                        `/teacher/exams-session-detail?sessionId=${item.sessionId}&title=${encodeURIComponent(packetTitle)}` as never,
                      )
                    }
                    style={{
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      borderRadius: 8,
                      backgroundColor: '#eff6ff',
                      paddingVertical: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: scaleFont(12) }}>Lihat Detail Jawaban</Text>
                  </Pressable>
                </View>
              );
            })}
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
            }}
          >
            <Text style={{ color: '#334155' }}>Belum ada sesi ujian untuk filter ini.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.back()}
        style={{
          marginTop: 8,
          backgroundColor: '#1d4ed8',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
      </Pressable>
    </ScrollView>
  );
}
