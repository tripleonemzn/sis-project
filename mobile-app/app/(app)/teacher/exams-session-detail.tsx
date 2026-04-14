import { useMemo } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { examApi } from '../../../src/features/exams/examApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

function parseSessionId(raw: string | string[] | undefined): number | null {
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function statusLabel(value: string): string {
  if (value === 'COMPLETED') return 'Selesai';
  if (value === 'IN_PROGRESS') return 'Berlangsung';
  if (value === 'TIMEOUT') return 'Timeout';
  return value;
}

function correctnessLabel(value: boolean | null): string {
  if (value === true) return 'Benar';
  if (value === false) return 'Salah';
  return 'Belum Dinilai';
}

function correctnessStyle(value: boolean | null): { bg: string; border: string; text: string } {
  if (value === true) return { bg: '#dcfce7', border: '#86efac', text: '#166534' };
  if (value === false) return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
  return { bg: '#f1f5f9', border: '#cbd5e1', text: '#334155' };
}

export default function TeacherExamSessionDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 110 });
  const { isAuthenticated, isLoading, user } = useAuth();
  const params = useLocalSearchParams<{ sessionId?: string | string[]; title?: string | string[] }>();
  const sessionId = useMemo(() => parseSessionId(params.sessionId), [params.sessionId]);
  const packetTitle = String(Array.isArray(params.title) ? params.title[0] : params.title || 'Detail Jawaban');

  const detailQuery = useQuery({
    queryKey: ['mobile-teacher-exam-session-detail', sessionId],
    enabled: isAuthenticated && !!user && user.role === 'TEACHER' && !!sessionId,
    queryFn: () => examApi.getSessionDetail(sessionId!),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat detail sesi ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Detail Jawaban</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!sessionId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Detail Jawaban</Text>
        <QueryStateView type="error" message="Session ID tidak valid." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={detailQuery.isFetching && !detailQuery.isLoading}
          onRefresh={() => {
            void detailQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Detail Jawaban</Text>
      <Text style={{ color: '#334155', marginBottom: 3, fontWeight: '600' }} numberOfLines={2}>
        {packetTitle}
      </Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Review jawaban siswa per butir soal untuk sesi ini.
      </Text>

      {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat data sesi..." /> : null}

      {detailQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat detail jawaban sesi."
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
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
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
              {detailQuery.data.session.student.name} • {detailQuery.data.session.student.class?.name || '-'}
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Status: {statusLabel(detailQuery.data.session.status)}
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Nilai: {detailQuery.data.session.score === null ? '-' : detailQuery.data.session.score.toFixed(2)}
            </Text>
            <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
              Progres: {detailQuery.data.summary.answeredCount}/{detailQuery.data.summary.totalQuestions} (
              {formatPercent(detailQuery.data.summary.completionRate)})
            </Text>
            <Text style={{ color: '#334155', fontSize: 12 }}>
              Objektif benar: {detailQuery.data.summary.objectiveCorrectCount}/
              {detailQuery.data.summary.objectiveEvaluableCount}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#e2e8f0',
              borderRadius: 10,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Timeline</Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Mulai: {formatDateTime(detailQuery.data.session.startTime)}
            </Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Kumpul: {formatDateTime(detailQuery.data.session.submitTime)}
            </Text>
            <Text style={{ color: '#475569', fontSize: 12 }}>
              Jadwal: {formatDateTime(detailQuery.data.session.schedule.startTime)} -{' '}
              {formatDateTime(detailQuery.data.session.schedule.endTime)}
            </Text>
          </View>

          <View>
            {detailQuery.data.questions.map((question) => {
              const badge = correctnessStyle(question.isCorrect);
              return (
                <View
                  key={question.questionId}
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
                      Soal {question.orderNumber} • {question.type}
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
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
                      {correctnessLabel(question.isCorrect)}
                    </Text>
                  </View>

                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>{question.contentPreview}</Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>
                    Jawaban teks: {question.answerText || '-'}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>
                    Opsi dipilih:{' '}
                    {question.selectedOptionLabels.length > 0 ? question.selectedOptionLabels.join(', ') : '-'}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 2 }}>
                    Opsi benar:{' '}
                    {question.correctOptionLabels.length > 0 ? question.correctOptionLabels.join(', ') : '-'}
                  </Text>

                  {question.explanation ? (
                    <View
                      style={{
                        marginTop: 4,
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#f8fafc',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <Text style={{ color: '#334155', fontSize: 12 }}>Pembahasan: {question.explanation}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
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

