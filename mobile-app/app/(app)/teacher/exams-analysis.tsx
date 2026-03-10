import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { examApi } from '../../../src/features/exams/examApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

function parsePacketId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
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

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined) return '-';
  return value.toFixed(digits);
}

export default function TeacherExamItemAnalysisScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 110 });
  const params = useLocalSearchParams<{ packetId?: string | string[]; title?: string | string[] }>();
  const packetId = useMemo(() => parsePacketId(params.packetId), [params.packetId]);
  const title = String(Array.isArray(params.title) ? params.title[0] : params.title || 'Packet Ujian');
  const { isAuthenticated, isLoading, user } = useAuth();

  const analysisQuery = useQuery({
    queryKey: ['mobile-teacher-exam-item-analysis', packetId],
    enabled: isAuthenticated && !!packetId && user?.role === 'TEACHER',
    queryFn: () => examApi.getPacketItemAnalysis(packetId!, { includeContentHtml: false }),
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!packetId) throw new Error('Packet ID tidak valid.');
      return examApi.syncPacketItemAnalysis(packetId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-exam-item-analysis', packetId],
      });
      Alert.alert('Sukses', 'Analisis butir berhasil disinkronkan ke packet.');
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const message = normalized.response?.data?.message || normalized.message || 'Gagal sinkron analisis.';
      Alert.alert('Gagal', message);
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat analisis butir..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Analisis Butir Soal</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!packetId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Analisis Butir Soal</Text>
        <QueryStateView type="error" message="Packet ID tidak valid." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={analysisQuery.isFetching && !analysisQuery.isLoading}
          onRefresh={() => {
            void analysisQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Analisis Butir Soal</Text>
      <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 3 }} numberOfLines={2}>
        {title}
      </Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Ringkasan kualitas butir soal berdasarkan hasil pengerjaan siswa.
      </Text>

      {analysisQuery.isLoading ? <QueryStateView type="loading" message="Memuat data analisis..." /> : null}

      {analysisQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat analisis butir."
          onRetry={() => {
            void analysisQuery.refetch();
          }}
        />
      ) : null}

      {!analysisQuery.isLoading && !analysisQuery.isError && analysisQuery.data ? (
        <>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbeafe',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>
              {analysisQuery.data.packet.subject.name} ({analysisQuery.data.packet.subject.code})
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Diperbarui: {formatDateTime(analysisQuery.data.summary.generatedAt)}
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Responden: {analysisQuery.data.summary.participantCount} • In Progress:{' '}
              {analysisQuery.data.summary.inProgressCount}
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Soal: {analysisQuery.data.summary.totalQuestions} (Objektif {analysisQuery.data.summary.objectiveQuestions} /
              Esai {analysisQuery.data.summary.essayQuestions})
            </Text>
            <Text style={{ color: '#334155', fontSize: 12 }}>
              Rata-rata: {analysisQuery.data.summary.averageScore?.toFixed(2) || '-'} • Tertinggi:{' '}
              {analysisQuery.data.summary.highestScore?.toFixed(2) || '-'} • Terendah:{' '}
              {analysisQuery.data.summary.lowestScore?.toFixed(2) || '-'}
            </Text>
          </View>

          <Pressable
            onPress={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            style={{
              borderWidth: 1,
              borderColor: '#bfdbfe',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#eff6ff',
              marginBottom: 10,
              opacity: syncMutation.isPending ? 0.6 : 1,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
              {syncMutation.isPending ? 'Sinkronisasi...' : 'Sinkronkan Analisis ke Packet'}
            </Text>
          </Pressable>

          {analysisQuery.data.items.length === 0 ? (
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
              <Text style={{ color: '#334155' }}>Belum ada data sesi siswa untuk dianalisis.</Text>
            </View>
          ) : (
            <View>
              {analysisQuery.data.items.map((item) => (
                <View
                  key={item.questionId}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 2 }}>
                    Soal {item.orderNumber} • {item.type}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>{item.contentPreview}</Text>

                  <Text style={{ color: '#475569', fontSize: 12 }}>
                    Dijawab: {item.answeredCount} • Kosong: {item.unansweredCount} ({formatPercent(item.unansweredRate)})
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12 }}>
                    Benar: {item.correctCount ?? '-'} • Salah: {item.incorrectCount ?? '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12 }}>
                    Indeks Kesukaran: {formatNumber(item.difficultyIndex)} ({item.difficultyCategory || '-'})
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginBottom: 6 }}>
                    Daya Pembeda: {formatNumber(item.discriminationIndex)} ({item.discriminationCategory || '-'})
                  </Text>

                  {item.optionDistribution.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                      {item.optionDistribution.map((opt) => (
                        <View key={`${item.questionId}-${opt.optionId}`} style={{ paddingHorizontal: 3, marginBottom: 6 }}>
                          <View
                            style={{
                              borderWidth: 1,
                              borderColor: opt.isCorrect ? '#86efac' : '#cbd5e1',
                              backgroundColor: opt.isCorrect ? '#dcfce7' : '#f8fafc',
                              borderRadius: 999,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            }}
                          >
                            <Text style={{ color: '#334155', fontSize: 11 }}>
                              {opt.label}: {opt.selectedCount} ({formatPercent(opt.selectedRate)})
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          )}
        </>
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
