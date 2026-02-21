import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { examApi } from '../../../../src/features/exams/examApi';
import { ExamQuestion, ExamQuestionOption, ExamQuestionType } from '../../../../src/features/exams/types';
import { useStudentExamStartQuery } from '../../../../src/features/exams/useStudentExamStartQuery';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

function parseScheduleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function toPlainText(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeQuestionType(question: ExamQuestion): ExamQuestionType {
  const raw = String(question.question_type || question.type || '').toUpperCase();
  if (raw === 'ESSAY') return 'ESSAY';
  if (raw === 'TRUE_FALSE') return 'TRUE_FALSE';
  if (raw === 'COMPLEX_MULTIPLE_CHOICE') return 'COMPLEX_MULTIPLE_CHOICE';
  if (raw === 'MATCHING') return 'MATCHING';
  return 'MULTIPLE_CHOICE';
}

function parseQuestions(raw: unknown): ExamQuestion[] {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [];

  return source
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const q = item as Record<string, unknown>;
      const qId = String(q.id || `q-${idx + 1}`);
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const options: ExamQuestionOption[] = rawOptions
        .filter((option) => option && typeof option === 'object')
        .map((option, optIdx) => {
          const opt = option as Record<string, unknown>;
          return {
            id: String(opt.id || `${qId}-opt-${optIdx + 1}`),
            content: typeof opt.content === 'string' ? opt.content : null,
            option_text: typeof opt.option_text === 'string' ? opt.option_text : null,
            isCorrect: Boolean(opt.isCorrect),
            image_url: typeof opt.image_url === 'string' ? opt.image_url : null,
            option_image_url:
              typeof opt.option_image_url === 'string' ? opt.option_image_url : null,
          };
        });

      return {
        id: qId,
        content: typeof q.content === 'string' ? q.content : null,
        question_text: typeof q.question_text === 'string' ? q.question_text : null,
        type: typeof q.type === 'string' ? (q.type as ExamQuestionType) : undefined,
        question_type:
          typeof q.question_type === 'string' ? (q.question_type as ExamQuestionType) : undefined,
        score: typeof q.score === 'number' ? q.score : 1,
        options,
      };
    });
}

function parseAnswers(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remaining = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remaining).padStart(2, '0')}`;
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

export default function StudentExamTakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const pageContentPaddingCompact = getStandardPagePadding(insets, { horizontal: 20 });
  const scheduleId = useMemo(() => parseScheduleId(params.id), [params.id]);

  const startQuery = useStudentExamStartQuery({
    enabled: isAuthenticated && !!scheduleId,
    user,
    scheduleId,
  });

  const questions = useMemo(
    () => parseQuestions(startQuery.data?.packet?.questions),
    [startQuery.data?.packet?.questions],
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const initializedRef = useRef(false);
  const answersRef = useRef<Record<string, unknown>>({});
  const autoSubmitGuardRef = useRef(false);

  const submitMutation = useMutation({
    mutationFn: async (payload: { answers: Record<string, unknown>; isFinalSubmit: boolean }) => {
      if (!scheduleId) throw new Error('Schedule ID tidak valid.');
      return examApi.submitStudentAnswers({
        scheduleId,
        answers: payload.answers,
        isFinalSubmit: payload.isFinalSubmit,
      });
    },
  });

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (!startQuery.data || initializedRef.current) return;
    initializedRef.current = true;

    const previousAnswers = parseAnswers(startQuery.data.session.answers);
    setAnswers(previousAnswers);

    const durationMinutes =
      typeof startQuery.data.packet.duration === 'number' && startQuery.data.packet.duration > 0
        ? startQuery.data.packet.duration
        : 60;

    const startedAt = new Date(startQuery.data.session.startTime).getTime();
    const endAt = startedAt + durationMinutes * 60 * 1000;
    const now = Date.now();
    const nextRemaining = Math.max(0, Math.floor((endAt - now) / 1000));
    setRemainingSeconds(nextRemaining);
  }, [startQuery.data]);

  useEffect(() => {
    if (!initializedRef.current || isFinished) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isFinished]);

  const saveProgress = async (isFinalSubmit: boolean): Promise<boolean> => {
    if (isFinished) return false;
    if (submitMutation.isPending && !isFinalSubmit) return false;

    try {
      if (!isFinalSubmit) setAutosaveState('saving');
      await submitMutation.mutateAsync({
        answers: answersRef.current,
        isFinalSubmit,
      });
      if (!isFinalSubmit) {
        setAutosaveState('saved');
        setLastSavedAt(new Date().toISOString());
      }
      return true;
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Gagal menyimpan jawaban.';
      if (!isFinalSubmit) {
        setAutosaveState('error');
      } else {
        autoSubmitGuardRef.current = false;
        Alert.alert('Submit Gagal', msg);
      }
      return false;
    }
  };

  useEffect(() => {
    if (!initializedRef.current || isFinished || isFinalSubmitting) return;
    const interval = setInterval(() => {
      void saveProgress(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [isFinished, isFinalSubmitting]);

  useEffect(() => {
    if (!initializedRef.current || isFinished || isFinalSubmitting) return;
    if (remainingSeconds > 0) return;
    if (autoSubmitGuardRef.current) return;

    autoSubmitGuardRef.current = true;
    setIsFinalSubmitting(true);
    void (async () => {
      const ok = await saveProgress(true);
      setIsFinalSubmitting(false);
      if (!ok) return;
      setIsFinished(true);
      Alert.alert('Waktu Habis', 'Ujian otomatis dikumpulkan.', [
        {
          text: 'OK',
          onPress: () => router.replace('/exams'),
        },
      ]);
    })();
  }, [remainingSeconds, isFinished, isFinalSubmitting, router]);

  const submitFinal = () => {
    if (isFinalSubmitting || isFinished) return;
    Alert.alert(
      'Kumpulkan Ujian',
      `Jawaban terisi ${answeredCount}/${questions.length}. Yakin ingin mengumpulkan?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kumpulkan',
          style: 'destructive',
          onPress: () => {
            autoSubmitGuardRef.current = true;
            setIsFinalSubmitting(true);
            void (async () => {
              const ok = await saveProgress(true);
              setIsFinalSubmitting(false);
              if (!ok) return;
              setIsFinished(true);
              Alert.alert('Sukses', 'Ujian berhasil dikumpulkan.', [
                {
                  text: 'OK',
                  onPress: () => router.replace('/exams'),
                },
              ]);
            })();
          },
        },
      ],
    );
  };

  const currentQuestion = questions[currentIndex];
  const currentType = currentQuestion ? normalizeQuestionType(currentQuestion) : 'MULTIPLE_CHOICE';
  const currentOptions = currentQuestion?.options || [];

  const answeredCount = useMemo(() => {
    return questions.reduce((total, question) => {
      const value = answers[question.id];
      const type = normalizeQuestionType(question);
      if (type === 'ESSAY') {
        return typeof value === 'string' && value.trim().length > 0 ? total + 1 : total;
      }
      if (type === 'COMPLEX_MULTIPLE_CHOICE') {
        return Array.isArray(value) && value.length > 0 ? total + 1 : total;
      }
      return typeof value === 'string' && value.length > 0 ? total + 1 : total;
    }, 0);
  }, [answers, questions]);

  if (isLoading) return <AppLoadingScreen message="Memuat ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Mengerjakan Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role siswa." />
      </ScrollView>
    );
  }

  if (!scheduleId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Mengerjakan Ujian</Text>
        <QueryStateView type="error" message="ID jadwal ujian tidak valid." />
      </ScrollView>
    );
  }

  if (startQuery.isLoading) return <AppLoadingScreen message="Menyiapkan sesi ujian..." />;

  if (startQuery.isError || !startQuery.data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Mengerjakan Ujian</Text>
        <QueryStateView
          type="error"
          message="Gagal memulai sesi ujian."
          onRetry={() => startQuery.refetch()}
        />
        <Pressable
          onPress={() => router.replace('/exams')}
          style={{
            marginTop: 12,
            backgroundColor: '#1d4ed8',
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Ujian</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (questions.length === 0 || !currentQuestion) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Mengerjakan Ujian</Text>
        <QueryStateView type="error" message="Soal ujian tidak tersedia." />
        <Pressable
          onPress={() => router.replace('/exams')}
          style={{
            marginTop: 12,
            backgroundColor: '#1d4ed8',
            borderRadius: 8,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Ujian</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPaddingCompact}>
      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
          {startQuery.data.packet.title}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
          {startQuery.data.packet.subject.name} ({startQuery.data.packet.subject.code})
        </Text>
        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
          Sisa waktu: {formatTime(remainingSeconds)}
        </Text>
        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
          Mulai sesi: {formatDateTime(startQuery.data.session.startTime)}
        </Text>
        <Text style={{ color: '#334155', fontSize: 12 }}>
          Autosave:{' '}
          {autosaveState === 'saving'
            ? 'menyimpan...'
            : autosaveState === 'saved'
              ? `tersimpan (${formatDateTime(lastSavedAt)})`
              : autosaveState === 'error'
                ? 'gagal, akan dicoba lagi'
                : '-'}
        </Text>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#334155', fontSize: 12, marginBottom: 8 }}>
          Progres: {answeredCount}/{questions.length} soal terisi
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
          {questions.map((question, index) => {
            const value = answers[question.id];
            const type = normalizeQuestionType(question);
            const isAnswered =
              type === 'ESSAY'
                ? typeof value === 'string' && value.trim().length > 0
                : type === 'COMPLEX_MULTIPLE_CHOICE'
                  ? Array.isArray(value) && value.length > 0
                  : typeof value === 'string' && value.length > 0;
            const isCurrent = index === currentIndex;
            return (
              <View key={question.id} style={{ width: '10%', paddingHorizontal: 3, marginBottom: 6 }}>
                <Pressable
                  onPress={() => setCurrentIndex(index)}
                  style={{
                    height: 30,
                    borderRadius: 7,
                    borderWidth: 1,
                    borderColor: isCurrent ? '#1d4ed8' : isAnswered ? '#16a34a' : '#cbd5e1',
                    backgroundColor: isCurrent ? '#dbeafe' : isAnswered ? '#dcfce7' : '#fff',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: isCurrent ? '#1d4ed8' : '#0f172a', fontSize: 11, fontWeight: '700' }}>
                    {index + 1}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#e2e8f0',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
          Soal {currentIndex + 1} dari {questions.length}
        </Text>
        <Text style={{ color: '#0f172a', fontSize: 15, marginBottom: 12 }}>
          {toPlainText(currentQuestion.question_text || currentQuestion.content || '-')}
        </Text>

        {currentType === 'ESSAY' ? (
          <TextInput
            value={typeof answers[currentQuestion.id] === 'string' ? (answers[currentQuestion.id] as string) : ''}
            onChangeText={(value) => {
              setAnswers((prev) => ({
                ...prev,
                [currentQuestion.id]: value,
              }));
            }}
            multiline
            textAlignVertical="top"
            placeholder="Tulis jawaban Anda..."
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              minHeight: 140,
              paddingHorizontal: 10,
              paddingVertical: 10,
              backgroundColor: '#fff',
            }}
          />
        ) : currentOptions.length > 0 ? (
          <View>
            {currentOptions.map((option) => {
              const optionText = toPlainText(option.option_text || option.content || '-');
              const selectedValue = answers[currentQuestion.id];
              const selected =
                currentType === 'COMPLEX_MULTIPLE_CHOICE'
                  ? Array.isArray(selectedValue) && selectedValue.includes(option.id)
                  : selectedValue === option.id;

              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    if (currentType === 'COMPLEX_MULTIPLE_CHOICE') {
                      setAnswers((prev) => {
                        const existing = Array.isArray(prev[currentQuestion.id])
                          ? [...(prev[currentQuestion.id] as string[])]
                          : [];
                        if (existing.includes(option.id)) {
                          return {
                            ...prev,
                            [currentQuestion.id]: existing.filter((value) => value !== option.id),
                          };
                        }
                        return {
                          ...prev,
                          [currentQuestion.id]: [...existing, option.id],
                        };
                      });
                      return;
                    }
                    setAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: option.id,
                    }));
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 9,
                    padding: 10,
                    marginBottom: 8,
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '600' }}>
                    {optionText}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <Text style={{ color: '#b91c1c', fontSize: 12 }}>Opsi jawaban tidak tersedia pada soal ini.</Text>
        )}
      </View>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#fff',
              opacity: currentIndex === 0 ? 0.5 : 1,
            }}
            disabled={currentIndex === 0}
          >
            <Text style={{ color: '#334155', fontWeight: '700' }}>Sebelumnya</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
            style={{
              borderWidth: 1,
              borderColor: '#1d4ed8',
              borderRadius: 9,
              paddingVertical: 10,
              alignItems: 'center',
              backgroundColor: '#1d4ed8',
              opacity: currentIndex === questions.length - 1 ? 0.5 : 1,
            }}
            disabled={currentIndex === questions.length - 1}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Selanjutnya</Text>
          </Pressable>
        </View>
      </View>

      <Pressable
        onPress={submitFinal}
        disabled={isFinalSubmitting || isFinished}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: isFinalSubmitting || isFinished ? 0.5 : 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {isFinalSubmitting ? 'Mengumpulkan...' : isFinished ? 'Sudah Dikumpulkan' : 'Kumpulkan Ujian'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
