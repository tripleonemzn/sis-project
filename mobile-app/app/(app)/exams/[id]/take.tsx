import { useMutation } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import ExamHtmlContent from '../../../../src/components/ExamHtmlContent';
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
        question_image_url:
          typeof q.question_image_url === 'string' ? q.question_image_url : null,
        image_url: typeof q.image_url === 'string' ? q.image_url : null,
        question_video_url:
          typeof q.question_video_url === 'string' ? q.question_video_url : null,
        video_url: typeof q.video_url === 'string' ? q.video_url : null,
        question_video_type:
          q.question_video_type === 'youtube' || q.question_video_type === 'upload'
            ? q.question_video_type
            : undefined,
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
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = date.getDate();
  const month = months[date.getMonth()] || '';
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hour}:${minute}`;
}

function normalizeSubjectToken(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericSubject(name?: string | null, code?: string | null): boolean {
  const normalizedName = normalizeSubjectToken(name);
  const normalizedCode = normalizeSubjectToken(code);
  if (!normalizedName && !normalizedCode) return true;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) return true;
  if (normalizedName === 'KONSENTRASI' || normalizedName === 'KEJURUAN') return true;
  if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
  return false;
}

function resolveTakeExamSubject(packet: {
  title?: string | null;
  subject?: {
    name?: string | null;
    code?: string | null;
  } | null;
}) {
  const packetSubject = packet?.subject || null;
  let fallbackName = '';
  const title = String(packet?.title || '').trim();
  if (title.includes('•')) {
    const parts = title
      .split('•')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (candidate && !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
        fallbackName = candidate;
      }
    }
  }

  const pickedIsGeneric = isGenericSubject(packetSubject?.name, packetSubject?.code);
  const useFallbackName = Boolean(fallbackName) && pickedIsGeneric;
  return {
    name: String(
      (useFallbackName ? fallbackName : packetSubject?.name) || fallbackName || 'Mata pelajaran',
    ),
    code: useFallbackName ? '' : String(packetSubject?.code || '').trim(),
  };
}

export default function StudentExamTakeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';
  const isCandidateMode = user?.role === 'CALON_SISWA';
  const isApplicantMode = user?.role === 'UMUM';
  const applicantVerificationLocked =
    isApplicantMode && String(user?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED';
  const examTakeLabel = isCandidateMode ? 'Tes Seleksi' : isApplicantMode ? 'Tes BKK' : 'Ujian';
  const pageContentPadding = getStandardPagePadding(insets);
  const pageContentPaddingCompact = getStandardPagePadding(insets, { horizontal: 20 });
  const scheduleId = useMemo(() => parseScheduleId(params.id), [params.id]);

  const startQuery = useStudentExamStartQuery({
    enabled: isAuthenticated && !!scheduleId && !applicantVerificationLocked,
    user,
    scheduleId,
  });

  const questions = useMemo(
    () => parseQuestions(startQuery.data?.packet?.questions),
    [startQuery.data?.packet?.questions],
  );

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isFinalSubmitting, setIsFinalSubmitting] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const answersRef = useRef<Record<string, unknown>>({});
  const autoSubmitGuardRef = useRef(false);
  const autoSubmitFailedRef = useRef(false);
  const finalSubmitOriginRef = useRef<'manual' | 'auto' | null>(null);
  const isExamReady = Boolean(startQuery.data);
  const persistedAnswers = useMemo(
    () => parseAnswers(startQuery.data?.session?.answers),
    [startQuery.data?.session?.answers],
  );
  const effectiveAnswers = useMemo(
    () => ({
      ...persistedAnswers,
      ...answers,
    }),
    [persistedAnswers, answers],
  );
  const remainingSeconds = useMemo(() => {
    if (!startQuery.data) return 0;
    const durationMinutes =
      typeof startQuery.data.packet.duration === 'number' && startQuery.data.packet.duration > 0
        ? startQuery.data.packet.duration
        : 60;
    const startedAt = new Date(startQuery.data.session.startTime).getTime();
    if (Number.isNaN(startedAt)) return durationMinutes * 60;
    const endAt = startedAt + durationMinutes * 60 * 1000;
    return Math.max(0, Math.floor((endAt - nowMs) / 1000));
  }, [startQuery.data, nowMs]);

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
    answersRef.current = effectiveAnswers;
  }, [effectiveAnswers]);

  useEffect(() => {
    if (!isExamReady || isFinished) return;

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [isExamReady, isFinished]);

  const saveProgress = useCallback(async (isFinalSubmit: boolean): Promise<boolean> => {
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
      } else {
        finalSubmitOriginRef.current = null;
      }
      return true;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = err.response?.data?.message || err.message || 'Gagal menyimpan jawaban.';
      if (!isFinalSubmit) {
        setAutosaveState('error');
      } else {
        if (finalSubmitOriginRef.current === 'auto') {
          autoSubmitFailedRef.current = true;
          Alert.alert('Waktu Ujian Berakhir', msg, [
            {
              text: 'OK',
              onPress: () => router.replace('/exams'),
            },
          ]);
        } else {
          autoSubmitGuardRef.current = false;
          Alert.alert('Submit Gagal', msg);
        }
        finalSubmitOriginRef.current = null;
      }
      return false;
    }
  }, [isFinished, router, submitMutation]);

  useEffect(() => {
    if (!isExamReady || isFinished || isFinalSubmitting) return;
    const interval = setInterval(() => {
      void saveProgress(false);
    }, 20000);
    return () => clearInterval(interval);
  }, [isExamReady, isFinished, isFinalSubmitting, saveProgress]);

  useEffect(() => {
    if (!isExamReady || isFinished || isFinalSubmitting) return;
    if (remainingSeconds > 0) return;
    if (autoSubmitGuardRef.current) return;
    if (autoSubmitFailedRef.current) return;

    autoSubmitGuardRef.current = true;
    finalSubmitOriginRef.current = 'auto';
    void (async () => {
      const ok = await saveProgress(true);
      if (!ok) return;
      setIsFinished(true);
      Alert.alert('Waktu Habis', 'Ujian otomatis dikumpulkan.', [
        {
          text: 'OK',
          onPress: () => router.replace('/exams'),
        },
      ]);
    })();
  }, [isExamReady, remainingSeconds, isFinished, isFinalSubmitting, router, saveProgress]);

  const submitFinal = () => {
    if (isFinalSubmitting || isFinished || autoSubmitGuardRef.current) return;
    if (answeredCount < questions.length) {
      Alert.alert(
        'Jawaban Belum Lengkap',
        `Masih ada ${questions.length - answeredCount} soal yang belum dijawab. Lengkapi semua jawaban sebelum mengumpulkan ujian.`,
      );
      return;
    }

    Alert.alert(
      'Kumpulkan Ujian',
      `Semua ${questions.length} soal sudah dijawab. Yakin ingin mengumpulkan ujian?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Kumpulkan',
          style: 'destructive',
          onPress: () => {
            autoSubmitGuardRef.current = true;
            finalSubmitOriginRef.current = 'manual';
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
  const resolvedTakeSubject = useMemo(
    () => resolveTakeExamSubject(startQuery.data?.packet || {}),
    [startQuery.data?.packet],
  );

  const answeredCount = questions.reduce((total, question) => {
    const value = effectiveAnswers[question.id];
    const type = normalizeQuestionType(question);
    if (type === 'ESSAY') {
      return typeof value === 'string' && value.trim().length > 0 ? total + 1 : total;
    }
    if (type === 'COMPLEX_MULTIPLE_CHOICE') {
      return Array.isArray(value) && value.length > 0 ? total + 1 : total;
    }
    return typeof value === 'string' && value.length > 0 ? total + 1 : total;
  }, 0);

  if (isLoading) return <AppLoadingScreen message="Memuat ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!canAccessExams) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>
          {`Mengerjakan ${examTakeLabel}`}
        </Text>
        <QueryStateView type="error" message="Halaman ini hanya tersedia untuk peserta ujian yang aktif." />
      </ScrollView>
    );
  }

  if (applicantVerificationLocked) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            borderRadius: 12,
            backgroundColor: '#fffbeb',
            padding: 14,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK menunggu verifikasi admin</Text>
          <Text style={{ color: '#92400e' }}>
            Akun pelamar Anda belum diverifikasi. Lengkapi profil pelamar lalu tunggu verifikasi admin sebelum mengikuti Tes BKK.
          </Text>
        </View>
      </ScrollView>
    );
  }

  if (!scheduleId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView type="error" message={`ID jadwal ${examTakeLabel.toLowerCase()} tidak valid.`} />
      </ScrollView>
    );
  }

  if (startQuery.isLoading) return <AppLoadingScreen message="Menyiapkan sesi ujian..." />;

  if (startQuery.isError || !startQuery.data) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView
          type="error"
          message={`Gagal memulai sesi ${examTakeLabel.toLowerCase()}.`}
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
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Tes</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (questions.length === 0 || !currentQuestion) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{`Mengerjakan ${examTakeLabel}`}</Text>
        <QueryStateView type="error" message={`Soal ${examTakeLabel.toLowerCase()} tidak tersedia.`} />
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
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Tes</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPaddingCompact}>
      <View
        style={{
          backgroundColor: '#ffffff',
          borderWidth: 1,
          borderColor: '#dbeafe',
          borderRadius: 18,
          padding: 16,
          marginBottom: 12,
          shadowColor: '#0f172a',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        }}
      >
        <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 19, marginBottom: 6 }}>
          {startQuery.data.packet.title}
        </Text>
        <Text style={{ color: '#64748b', fontSize: 13, marginBottom: 10 }}>
          {resolvedTakeSubject.name}
          {resolvedTakeSubject.code ? ` (${resolvedTakeSubject.code})` : ''}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View style={{ backgroundColor: '#ecfeff', borderColor: '#a5f3fc', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#0f766e', fontSize: 12, fontWeight: '700' }}>Sisa waktu {formatTime(remainingSeconds)}</Text>
          </View>
          <View style={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '700' }}>Mulai {formatDateTime(startQuery.data.session.startTime)}</Text>
          </View>
        </View>
        <Text style={{ color: '#475569', fontSize: 12, marginTop: 10 }}>
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
            const value = effectiveAnswers[question.id];
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
        <View style={{ marginBottom: 12 }}>
          <ExamHtmlContent
            html={currentQuestion.question_text || currentQuestion.content || '-'}
            imageUrl={currentQuestion.question_image_url || currentQuestion.image_url}
            videoUrl={currentQuestion.question_video_url || currentQuestion.video_url}
            videoType={currentQuestion.question_video_type || null}
            interactive={Boolean(currentQuestion.question_video_url || currentQuestion.video_url)}
          />
        </View>

        {currentType === 'ESSAY' ? (
          <TextInput
            value={typeof effectiveAnswers[currentQuestion.id] === 'string' ? (effectiveAnswers[currentQuestion.id] as string) : ''}
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
              const selectedValue = effectiveAnswers[currentQuestion.id];
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
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    marginBottom: 10,
                  }}
                >
                  <ExamHtmlContent
                    html={option.option_text || option.content || '-'}
                    imageUrl={option.option_image_url || option.image_url}
                    minHeight={56}
                  />
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
