import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { examApi, ExamProgramItem } from '../../../../src/features/exams/examApi';
import {
  ExamDisplayType,
  ExamQuestionBlueprint,
  ExamQuestionCard,
  ExamQuestionType,
  TeacherExamQuestionPayload,
} from '../../../../src/features/exams/types';
import { useTeacherAssignmentsQuery } from '../../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

type OptionDraft = {
  id: string;
  content: string;
  isCorrect: boolean;
};

type QuestionDraft = {
  id: string;
  type: ExamQuestionType;
  content: string;
  score: string;
  options: OptionDraft[];
  blueprint: ExamQuestionBlueprint;
  questionCard: ExamQuestionCard;
};

type EditorSection = 'INFO' | 'QUESTIONS';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createChoiceOptions() {
  return [
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
    { id: createId('opt'), content: '', isCorrect: false },
  ];
}

function createTrueFalseOptions() {
  return [
    { id: createId('opt'), content: 'Benar', isCorrect: true },
    { id: createId('opt'), content: 'Salah', isCorrect: false },
  ];
}

function createQuestion(type: ExamQuestionType = 'MULTIPLE_CHOICE'): QuestionDraft {
  return {
    id: createId('q'),
    type,
    content: '',
    score: '1',
    blueprint: createDefaultBlueprint(),
    questionCard: createDefaultQuestionCard(),
    options:
      type === 'ESSAY' ? [] : type === 'TRUE_FALSE' ? createTrueFalseOptions() : createChoiceOptions(),
  };
}

function createDefaultBlueprint(): ExamQuestionBlueprint {
  return {
    competency: '',
    learningObjective: '',
    indicator: '',
    materialScope: '',
    cognitiveLevel: '',
  };
}

function createDefaultQuestionCard(): ExamQuestionCard {
  return {
    stimulus: '',
    answerRationale: '',
    scoringGuideline: '',
    distractorNotes: '',
  };
}

function normalizeBlueprint(raw: unknown): ExamQuestionBlueprint {
  if (!raw || typeof raw !== 'object') {
    return createDefaultBlueprint();
  }
  const source = raw as ExamQuestionBlueprint;
  return {
    ...createDefaultBlueprint(),
    competency: source.competency || '',
    learningObjective: source.learningObjective || '',
    indicator: source.indicator || '',
    materialScope: source.materialScope || '',
    cognitiveLevel: source.cognitiveLevel || '',
  };
}

function normalizeQuestionCard(raw: unknown): ExamQuestionCard {
  if (!raw || typeof raw !== 'object') {
    return createDefaultQuestionCard();
  }
  const source = raw as ExamQuestionCard;
  return {
    ...createDefaultQuestionCard(),
    stimulus: source.stimulus || '',
    answerRationale: source.answerRationale || '',
    scoringGuideline: source.scoringGuideline || '',
    distractorNotes: source.distractorNotes || '',
  };
}

function parsePacketId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseExamType(raw: string | string[] | undefined): ExamDisplayType | null {
  const value = String(Array.isArray(raw) ? raw[0] : raw || '')
    .trim()
    .toUpperCase();
  if (!value) return null;
  if (value === 'QUIZ') return 'FORMATIF';
  return value;
}

function normalizeProgramCode(raw: string | string[] | undefined): string | null {
  const value = String(Array.isArray(raw) ? raw[0] : raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return value || null;
}

function assertFixedSemesterMatch(fixedSemester: 'ODD' | 'EVEN' | null | undefined, semester: 'ODD' | 'EVEN') {
  if (fixedSemester && semester !== fixedSemester) {
    throw new Error(`Program ini hanya boleh semester ${fixedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.`);
  }
}

function getScoreSyncHint(program?: ExamProgramItem | null): string {
  if (!program) {
    return 'Nilai ujian otomatis tersinkron ke komponen nilai sesuai konfigurasi Program Ujian.';
  }

  const componentLabel = String(
    program.gradeComponentLabel || program.shortLabel || program.label || program.gradeComponentCode || program.code,
  )
    .trim()
    .toUpperCase();
  const entryModeCode = normalizeProgramCode(program.gradeEntryModeCode || program.gradeEntryMode);
  const fixedSemester = program.fixedSemester;

  if (entryModeCode === 'NF_SERIES') {
    return `Nilai disimpan sebagai entri formatif dinamis pada komponen ${componentLabel}.`;
  }
  if (fixedSemester === 'ODD') {
    return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}. Program ini khusus semester Ganjil.`;
  }
  if (fixedSemester === 'EVEN') {
    return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}. Program ini khusus semester Genap.`;
  }
  return `Nilai ujian otomatis tersinkron ke komponen ${componentLabel}.`;
}

function resolveProgramExamType(program?: ExamProgramItem | null, fallback: ExamDisplayType = 'FORMATIF'): ExamDisplayType {
  const baseType = parseExamType(program?.baseTypeCode || program?.baseType);
  if (baseType) return baseType;
  const componentType = normalizeProgramCode(program?.gradeComponentTypeCode || program?.gradeComponentType);
  if (componentType === 'FORMATIVE') return 'FORMATIF';
  return fallback;
}

function parseQuestions(raw: unknown): QuestionDraft[] {
  let source = raw;
  if (typeof raw === 'string') {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }

  if (!Array.isArray(source)) return [createQuestion()];

  const mapped = source
    .filter((item) => item && typeof item === 'object')
    .map((item, idx) => {
      const q = item as Record<string, unknown>;
      const type = String(q.type || q.question_type || 'MULTIPLE_CHOICE').toUpperCase() as ExamQuestionType;
      const rawOptions = Array.isArray(q.options) ? q.options : [];
      const options = rawOptions
        .filter((option) => option && typeof option === 'object')
        .map((option) => {
          const data = option as Record<string, unknown>;
          return {
            id: String(data.id || createId('opt')),
            content: String(data.content || data.option_text || ''),
            isCorrect: Boolean(data.isCorrect),
          };
        });

      return {
        id: String(q.id || `q-${idx + 1}`),
        type,
        content: String(q.content || q.question_text || ''),
        score: String(typeof q.score === 'number' ? q.score : 1),
        blueprint: normalizeBlueprint(q.blueprint || (q.metadata as Record<string, unknown> | undefined)?.blueprint),
        questionCard: normalizeQuestionCard(
          q.questionCard || (q.metadata as Record<string, unknown> | undefined)?.questionCard,
        ),
        options:
          type === 'ESSAY'
            ? []
            : type === 'TRUE_FALSE'
              ? options.length > 0
                ? options.slice(0, 2)
                : createTrueFalseOptions()
              : options.length > 0
                ? options
                : createChoiceOptions(),
      };
    });

  return mapped.length > 0 ? mapped : [createQuestion()];
}

function sanitizeQuestions(questions: QuestionDraft[]): TeacherExamQuestionPayload[] {
  return questions.map((question, idx) => {
    const score = Number(question.score);
    const normalizedScore = Number.isNaN(score) || score <= 0 ? 1 : score;

    const payload: TeacherExamQuestionPayload = {
      id: question.id || `q-${idx + 1}`,
      type: question.type,
      content: question.content.trim(),
      score: normalizedScore,
      blueprint: normalizeBlueprint(question.blueprint),
      questionCard: normalizeQuestionCard(question.questionCard),
    };

    if (question.type !== 'ESSAY') {
      payload.options = question.options
        .map((option, optIdx) => ({
          id: option.id || `${payload.id}-opt-${optIdx + 1}`,
          content: option.content.trim(),
          isCorrect: option.isCorrect,
        }))
        .filter((option) => option.content.length > 0);
    }

    return payload;
  });
}

export default function TeacherExamEditorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    packetId?: string | string[];
    examType?: string | string[];
    programCode?: string | string[];
  }>();
  const packetId = useMemo(() => parsePacketId(params.packetId), [params.packetId]);
  const isEditMode = !!packetId;
  const forcedProgramCode = useMemo(() => {
    if (isEditMode) return null;
    return normalizeProgramCode(params.programCode) || normalizeProgramCode(params.examType);
  }, [isEditMode, params.programCode, params.examType]);
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = useMemo(
    () => teacherAssignmentsQuery.data?.assignments || [],
    [teacherAssignmentsQuery.data?.assignments],
  );

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-teacher-exam-editor-programs', teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: isAuthenticated && Boolean(teacherAssignmentsQuery.data?.activeYear?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: teacherAssignmentsQuery.data?.activeYear?.id,
        roleContext: 'teacher',
      }),
  });

  const availablePrograms = useMemo(
    () =>
      (examProgramsQuery.data?.programs || [])
        .filter((program: ExamProgramItem) => program.isActive && program.showOnTeacherMenu)
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)),
    [examProgramsQuery.data?.programs],
  );

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedProgramCode, setSelectedProgramCode] = useState<string>(forcedProgramCode || '');
  const [examType, setExamType] = useState<ExamDisplayType>('FORMATIF');
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [duration, setDuration] = useState('60');
  const [kkm, setKkm] = useState('75');
  const [saveToBank, setSaveToBank] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [hydratedPacket, setHydratedPacket] = useState(false);
  const [activeSection, setActiveSection] = useState<EditorSection>('INFO');
  const selectedProgram = useMemo(
    () =>
      availablePrograms.find((program) => normalizeProgramCode(program.code) === normalizeProgramCode(selectedProgramCode)) ||
      null,
    [availablePrograms, selectedProgramCode],
  );
  const allowedSubjectIdsByProgram = useMemo(() => {
    const ids = Array.isArray(selectedProgram?.allowedSubjectIds) ? selectedProgram.allowedSubjectIds : [];
    return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
  }, [selectedProgram]);
  const filteredAssignments = useMemo(() => {
    if (!selectedProgram || allowedSubjectIdsByProgram.size === 0) return assignments;
    return assignments.filter((assignment) => allowedSubjectIdsByProgram.has(Number(assignment.subject?.id)));
  }, [selectedProgram, allowedSubjectIdsByProgram, assignments]);
  const lockedSemester = (selectedProgram?.fixedSemester as 'ODD' | 'EVEN' | null) || null;
  const isTypeLockedFromMenu = !isEditMode && !!forcedProgramCode;
  const scoreSyncHint = useMemo(
    () => String(selectedProgram?.description || '').trim() || getScoreSyncHint(selectedProgram),
    [selectedProgram],
  );
  const completedQuestions = useMemo(
    () => questions.filter((question) => question.content.trim().length > 0).length,
    [questions],
  );

  useEffect(() => {
    if (filteredAssignments.length === 0) {
      if (selectedAssignmentId !== null) {
        const timerId = setTimeout(() => setSelectedAssignmentId(null), 0);
        return () => clearTimeout(timerId);
      }
      return;
    }
    const stillValid = filteredAssignments.some((assignment) => assignment.id === selectedAssignmentId);
    if (!stillValid) {
      const timerId = setTimeout(() => setSelectedAssignmentId(filteredAssignments[0].id), 0);
      return () => clearTimeout(timerId);
    }
  }, [selectedAssignmentId, filteredAssignments]);

  useEffect(() => {
    if (isEditMode) return;
    if (forcedProgramCode) {
      const timerId = setTimeout(() => setSelectedProgramCode(forcedProgramCode), 0);
      return () => clearTimeout(timerId);
    }
    if (!selectedProgramCode && availablePrograms.length > 0) {
      const timerId = setTimeout(
        () => setSelectedProgramCode(normalizeProgramCode(availablePrograms[0].code) || ''),
        0,
      );
      return () => clearTimeout(timerId);
    }
  }, [isEditMode, forcedProgramCode, selectedProgramCode, availablePrograms]);

  useEffect(() => {
    if (!selectedProgram) {
      if (!availablePrograms.length) return;
      const fallbackCode = normalizeProgramCode(availablePrograms[0].code);
      if (fallbackCode && fallbackCode !== selectedProgramCode) {
        const timerId = setTimeout(() => setSelectedProgramCode(fallbackCode), 0);
        return () => clearTimeout(timerId);
      }
      return;
    }
    const nextType = resolveProgramExamType(selectedProgram, examType || 'FORMATIF');
    if (examType !== nextType) {
      const timerId = setTimeout(() => setExamType(nextType), 0);
      return () => clearTimeout(timerId);
    }
  }, [selectedProgram, availablePrograms, selectedProgramCode, examType]);

  useEffect(() => {
    if (lockedSemester && semester !== lockedSemester) {
      const timerId = setTimeout(() => setSemester(lockedSemester), 0);
      return () => clearTimeout(timerId);
    }
  }, [lockedSemester, semester]);

  const packetDetailQuery = useQuery({
    queryKey: ['mobile-teacher-exam-packet-detail', packetId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!packetId,
    queryFn: async () => examApi.getTeacherPacketById(packetId!),
    retry: 1,
  });

  useEffect(() => {
    if (!isEditMode || !packetDetailQuery.data || hydratedPacket) return;

    const packet = packetDetailQuery.data;
    const timerId = setTimeout(() => {
      setTitle(packet.title || '');
      setDescription(packet.description || '');
      setInstructions(packet.instructions || '');
      setSelectedProgramCode(normalizeProgramCode(packet.programCode || packet.type) || '');
      setExamType((String(packet.type).toUpperCase() as ExamDisplayType) || 'FORMATIF');
      setSemester((String(packet.semester).toUpperCase() as 'ODD' | 'EVEN') || 'ODD');
      setDuration(String(packet.duration || 60));
      setKkm('75');
      setQuestions(parseQuestions(packet.questions));

      if (assignments.length > 0) {
        const matched = assignments.find(
          (assignment) =>
            assignment.subject.id === packet.subject.id &&
            (!packet.academicYear?.id || assignment.academicYear.id === packet.academicYear.id),
        );
        if (matched) {
          setSelectedAssignmentId(matched.id);
        }
      }

      setHydratedPacket(true);
    }, 0);
    return () => clearTimeout(timerId);
  }, [isEditMode, packetDetailQuery.data, hydratedPacket, assignments]);

  const selectedAssignment =
    filteredAssignments.find((assignment) => assignment.id === selectedAssignmentId) || null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Pilih kelas/mapel terlebih dahulu.');
      if (!title.trim()) throw new Error('Judul ujian wajib diisi.');

      const durationValue = Number(duration);
      if (Number.isNaN(durationValue) || durationValue < 1 || durationValue > 300) {
        throw new Error('Durasi harus antara 1 sampai 300 menit.');
      }

      const kkmValue = Number(kkm);
      if (Number.isNaN(kkmValue) || kkmValue < 0 || kkmValue > 100) {
        throw new Error('KKM harus antara 0 sampai 100.');
      }

      const cleanedQuestions = sanitizeQuestions(questions);
      if (cleanedQuestions.length === 0) {
        throw new Error('Minimal harus ada 1 soal.');
      }
      const normalizedProgramCode = normalizeProgramCode(selectedProgramCode);
      if (!normalizedProgramCode) {
        throw new Error('Program ujian belum dipilih.');
      }

      cleanedQuestions.forEach((question, idx) => {
        if (!question.content.trim()) {
          throw new Error(`Isi soal nomor ${idx + 1} masih kosong.`);
        }

        const blueprint = normalizeBlueprint(question.blueprint);
        if (!String(blueprint.learningObjective || '').trim() || !String(blueprint.indicator || '').trim()) {
          throw new Error(
            `Soal nomor ${idx + 1} wajib mengisi kisi-kisi: tujuan pembelajaran dan indikator soal.`,
          );
        }

        const questionCard = normalizeQuestionCard(question.questionCard);
        if (!String(questionCard.answerRationale || '').trim()) {
          throw new Error(`Soal nomor ${idx + 1} wajib mengisi kartu soal: pembahasan/jawaban.`);
        }

        if (question.type !== 'ESSAY') {
          const options = question.options || [];
          if (options.length < 2) {
            throw new Error(`Soal nomor ${idx + 1} harus punya minimal 2 opsi jawaban.`);
          }
          const correctCount = options.filter((option) => option.isCorrect).length;
          if (correctCount === 0) {
            throw new Error(`Soal nomor ${idx + 1} belum punya jawaban benar.`);
          }
        }
      });

      const payload = {
        title: title.trim(),
        subjectId: selectedAssignment.subject.id,
        academicYearId: selectedAssignment.academicYear.id,
        type: resolveProgramExamType(selectedProgram, examType || 'FORMATIF'),
        programCode: normalizedProgramCode,
        semester,
        duration: durationValue,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        kkm: kkmValue,
        saveToBank,
        questions: cleanedQuestions,
      };
      assertFixedSemesterMatch(lockedSemester, payload.semester);

      if (isEditMode && packetId) {
        return examApi.updateTeacherPacket(packetId, payload);
      }
      return examApi.createTeacherPacket(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-exam-packets'] });
      if (packetId) {
        await queryClient.invalidateQueries({ queryKey: ['mobile-teacher-exam-packet-detail', packetId] });
      }
      Alert.alert('Sukses', isEditMode ? 'Packet ujian berhasil diperbarui.' : 'Packet ujian berhasil dibuat.', [
        {
          text: 'OK',
          onPress: () => router.replace('/teacher/exams'),
        },
      ]);
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } }; message?: string };
      const message = apiError?.response?.data?.message || apiError?.message || 'Gagal menyimpan packet ujian.';
      Alert.alert('Gagal', message);
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat editor ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Editor Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (isEditMode && packetDetailQuery.isLoading) {
    return <AppLoadingScreen message="Memuat packet ujian..." />;
  }

  if (isEditMode && (packetDetailQuery.isError || !packetDetailQuery.data)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Editor Ujian</Text>
        <QueryStateView
          type="error"
          message="Gagal memuat detail packet ujian."
          onRetry={() => packetDetailQuery.refetch()}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={teacherAssignmentsQuery.isFetching || packetDetailQuery.isFetching}
          onRefresh={async () => {
            await teacherAssignmentsQuery.refetch();
            if (isEditMode) {
              await packetDetailQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>
        {isEditMode ? 'Edit Packet Ujian' : 'Buat Packet Ujian'}
      </Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Susun metadata ujian dan soal secara sederhana dari mobile.
      </Text>

      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: -4,
          marginBottom: 10,
        }}
      >
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setActiveSection('INFO')}
            style={{
              borderWidth: 1,
              borderColor: activeSection === 'INFO' ? '#1d4ed8' : '#cbd5e1',
              backgroundColor: activeSection === 'INFO' ? '#eff6ff' : '#fff',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: activeSection === 'INFO' ? '#1d4ed8' : '#334155', fontWeight: '700', fontSize: 12 }}>
              1. Informasi Ujian
            </Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => setActiveSection('QUESTIONS')}
            style={{
              borderWidth: 1,
              borderColor: activeSection === 'QUESTIONS' ? '#1d4ed8' : '#cbd5e1',
              backgroundColor: activeSection === 'QUESTIONS' ? '#eff6ff' : '#fff',
              borderRadius: 10,
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color: activeSection === 'QUESTIONS' ? '#1d4ed8' : '#334155',
                fontWeight: '700',
                fontSize: 12,
              }}
            >
              2. Butir Soal ({completedQuestions}/{questions.length})
            </Text>
          </Pressable>
        </View>
      </View>

      {activeSection === 'INFO' ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#f8fbff',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Tahap 1: Informasi Ujian</Text>
          <Text style={{ color: '#334155', fontSize: 12 }}>
            Lengkapi kelas/mapel, judul, tipe, semester, durasi, dan konfigurasi ujian sebelum menyusun butir soal.
          </Text>
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#f8fbff',
            borderRadius: 10,
            padding: 10,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Tahap 2: Butir Soal</Text>
          <Text style={{ color: '#334155', fontSize: 12 }}>
            Fokus menyusun isi soal, kisi-kisi, kartu soal, serta opsi jawaban. Informasi ujian sudah dipisahkan di tahap 1.
          </Text>
        </View>
      )}

      {activeSection === 'INFO' ? (
        <>
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
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Kelas & Mapel</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
          {filteredAssignments.map((assignment) => {
            const selected = selectedAssignmentId === assignment.id;
            return (
              <View key={assignment.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setSelectedAssignmentId(assignment.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 11 }} numberOfLines={2}>
                    {assignment.subject.name}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 11 }} numberOfLines={1}>
                    Kelas: {assignment.class.name}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {filteredAssignments.length === 0 ? (
          <Text style={{ color: '#b45309', fontSize: 11, marginTop: 4 }}>
            Tidak ada mapel penugasan yang diizinkan untuk program ini.
          </Text>
        ) : null}
      </View>

      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Judul ujian"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          marginBottom: 8,
        }}
      />

      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Deskripsi ujian (opsional)"
        multiline
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 80,
          backgroundColor: '#fff',
          marginBottom: 8,
        }}
      />

      <TextInput
        value={instructions}
        onChangeText={setInstructions}
        placeholder="Instruksi ujian (opsional)"
        multiline
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          minHeight: 80,
          backgroundColor: '#fff',
          marginBottom: 8,
        }}
      />

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <TextInput
            value={duration}
            onChangeText={setDuration}
            placeholder="Durasi (menit)"
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#fff',
            }}
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <TextInput
            value={kkm}
            onChangeText={setKkm}
            placeholder="KKM"
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: '#fff',
            }}
          />
        </View>
      </View>

      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Program Ujian</Text>
      {examProgramsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat program ujian..." />
      ) : availablePrograms.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          {availablePrograms.map((program) => {
            const code = normalizeProgramCode(program.code) || '';
            const selected = selectedProgramCode === code;
            const optionLocked = isTypeLockedFromMenu && forcedProgramCode !== code;
            return (
              <View key={code} style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => {
                    if (optionLocked) return;
                    setSelectedProgramCode(code);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : optionLocked ? '#f8fafc' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    alignItems: 'center',
                    opacity: optionLocked ? 0.45 : 1,
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 11, fontWeight: '700' }}>
                    {String(program.shortLabel || program.label || code).trim() || code}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fecaca',
            backgroundColor: '#fef2f2',
            borderRadius: 8,
            padding: 10,
            marginBottom: 8,
          }}
        >
          <Text style={{ color: '#991b1b', fontSize: 12 }}>
            Program ujian belum tersedia. Minta Wakasek Kurikulum menambahkan Program Ujian terlebih dahulu.
          </Text>
        </View>
      )}
      {isTypeLockedFromMenu ? (
        <Text style={{ color: '#475569', fontSize: 11, marginBottom: 8 }}>
          Program ujian dikunci sesuai menu yang dipilih: {selectedProgram?.label || forcedProgramCode}.
        </Text>
      ) : null}

      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Semester</Text>
      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        {(['ODD', 'EVEN'] as Array<'ODD' | 'EVEN'>).map((item) => {
          const selected = semester === item;
          const optionLocked = !!lockedSemester && lockedSemester !== item;
          return (
            <View key={item} style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => {
                  if (lockedSemester) return;
                  setSemester(item);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                  backgroundColor: selected ? '#eff6ff' : optionLocked ? '#f8fafc' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                  opacity: optionLocked ? 0.45 : 1,
                }}
              >
                <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 12, fontWeight: '700' }}>
                  {item === 'ODD' ? 'Ganjil' : 'Genap'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
      {lockedSemester ? (
        <Text style={{ color: '#475569', fontSize: 11, marginBottom: 8 }}>
          Semester otomatis untuk {selectedProgram?.label || examType}: {lockedSemester === 'ODD' ? 'Ganjil' : 'Genap'}.
        </Text>
      ) : null}

      <View
        style={{
          backgroundColor: '#f8fafc',
          borderWidth: 1,
          borderColor: '#dbeafe',
          borderRadius: 10,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 4 }}>Sinkronisasi Nilai</Text>
        <Text style={{ color: '#334155', fontSize: 12 }}>{scoreSyncHint}</Text>
      </View>

      <Pressable
        onPress={() => setSaveToBank((prev) => !prev)}
        style={{
          backgroundColor: saveToBank ? '#dcfce7' : '#f1f5f9',
          borderWidth: 1,
          borderColor: saveToBank ? '#86efac' : '#cbd5e1',
          borderRadius: 8,
          padding: 10,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: saveToBank ? '#166534' : '#334155', fontWeight: '700' }}>
          {saveToBank ? 'Simpan ke bank soal: Aktif' : 'Simpan ke bank soal: Nonaktif'}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setActiveSection('QUESTIONS')}
        style={{
          borderWidth: 1,
          borderColor: '#1d4ed8',
          backgroundColor: '#eff6ff',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Lanjut ke Butir Soal</Text>
      </Pressable>
        </>
      ) : null}

      {activeSection === 'QUESTIONS' ? (
        <>
      <Pressable
        onPress={() => setActiveSection('INFO')}
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          backgroundColor: '#fff',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#334155', fontWeight: '700' }}>Kembali ke Informasi Ujian</Text>
      </Pressable>
      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Daftar Soal</Text>
      {questions.map((question, index) => (
        <View
          key={question.id}
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#e2e8f0',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>Soal {index + 1}</Text>
            <Pressable
              onPress={() => {
                if (questions.length <= 1) {
                  Alert.alert('Info', 'Minimal harus ada 1 soal.');
                  return;
                }
                setQuestions((prev) => prev.filter((item) => item.id !== question.id));
              }}
            >
              <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus</Text>
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 8 }}>
            {(['MULTIPLE_CHOICE', 'COMPLEX_MULTIPLE_CHOICE', 'TRUE_FALSE', 'ESSAY'] as ExamQuestionType[]).map(
              (typeItem) => {
                const selected = question.type === typeItem;
                return (
                  <View key={typeItem} style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
                    <Pressable
                      onPress={() => {
                        setQuestions((prev) =>
                          prev.map((item) => {
                            if (item.id !== question.id) return item;
                            if (typeItem === 'ESSAY') {
                              return { ...item, type: typeItem, options: [] };
                            }
                            if (typeItem === 'TRUE_FALSE') {
                              return {
                                ...item,
                                type: typeItem,
                                options: createTrueFalseOptions(),
                              };
                            }
                            return {
                              ...item,
                              type: typeItem,
                              options: item.options.length > 0 ? item.options : createChoiceOptions(),
                            };
                          }),
                        );
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                        backgroundColor: selected ? '#eff6ff' : '#fff',
                        borderRadius: 8,
                        paddingVertical: 7,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 10, fontWeight: '700' }}>
                        {typeItem === 'MULTIPLE_CHOICE'
                          ? 'Pilihan Ganda'
                          : typeItem === 'COMPLEX_MULTIPLE_CHOICE'
                            ? 'PG Kompleks'
                            : typeItem === 'TRUE_FALSE'
                              ? 'Benar/Salah'
                              : 'Esai'}
                      </Text>
                    </Pressable>
                  </View>
                );
              },
            )}
          </View>

          <TextInput
            value={question.content}
            onChangeText={(value) => {
              setQuestions((prev) =>
                prev.map((item) => (item.id === question.id ? { ...item, content: value } : item)),
              );
            }}
            placeholder="Tulis isi soal"
            multiline
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 10,
              minHeight: 80,
              backgroundColor: '#fff',
              marginBottom: 8,
            }}
          />

          <TextInput
            value={question.score}
            onChangeText={(value) => {
              setQuestions((prev) =>
                prev.map((item) => (item.id === question.id ? { ...item, score: value } : item)),
              );
            }}
            placeholder="Bobot skor"
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderRadius: 10,
              paddingHorizontal: 10,
              paddingVertical: 9,
              backgroundColor: '#fff',
              marginBottom: 8,
            }}
          />

          <View
            style={{
              borderWidth: 1,
              borderColor: '#dbeafe',
              backgroundColor: '#f8fbff',
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#1e3a8a', fontWeight: '700', marginBottom: 6 }}>Kisi-kisi Soal</Text>
            <TextInput
              value={String(question.blueprint.learningObjective || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            learningObjective: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Tujuan pembelajaran*"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
              }}
            />
            <TextInput
              value={String(question.blueprint.indicator || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            indicator: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Indikator soal*"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
              }}
            />
            <TextInput
              value={String(question.blueprint.competency || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          blueprint: {
                            ...normalizeBlueprint(item.blueprint),
                            competency: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Kompetensi / capaian"
              style={{
                borderWidth: 1,
                borderColor: '#bfdbfe',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                marginBottom: 6,
              }}
            />
            <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <TextInput
                  value={String(question.blueprint.materialScope || '')}
                  onChangeText={(value) =>
                    setQuestions((prev) =>
                      prev.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              blueprint: {
                                ...normalizeBlueprint(item.blueprint),
                                materialScope: value,
                              },
                            }
                          : item,
                      ),
                    )
                  }
                  placeholder="Ruang lingkup materi"
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                  }}
                />
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <TextInput
                  value={String(question.blueprint.cognitiveLevel || '')}
                  onChangeText={(value) =>
                    setQuestions((prev) =>
                      prev.map((item) =>
                        item.id === question.id
                          ? {
                              ...item,
                              blueprint: {
                                ...normalizeBlueprint(item.blueprint),
                                cognitiveLevel: value,
                              },
                            }
                          : item,
                      ),
                    )
                  }
                  placeholder="Level kognitif"
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    backgroundColor: '#fff',
                  }}
                />
              </View>
            </View>
          </View>

          <View
            style={{
              borderWidth: 1,
              borderColor: '#a7f3d0',
              backgroundColor: '#ecfdf5',
              borderRadius: 10,
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#065f46', fontWeight: '700', marginBottom: 6 }}>Kartu Soal</Text>
            <TextInput
              value={String(question.questionCard.stimulus || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          questionCard: {
                            ...normalizeQuestionCard(item.questionCard),
                            stimulus: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Stimulus soal"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 60,
                marginBottom: 6,
              }}
            />
            <TextInput
              value={String(question.questionCard.answerRationale || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          questionCard: {
                            ...normalizeQuestionCard(item.questionCard),
                            answerRationale: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Pembahasan / alasan jawaban benar*"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 60,
                marginBottom: 6,
              }}
            />
            <TextInput
              value={String(question.questionCard.scoringGuideline || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          questionCard: {
                            ...normalizeQuestionCard(item.questionCard),
                            scoringGuideline: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Pedoman penskoran"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 54,
                marginBottom: 6,
              }}
            />
            <TextInput
              value={String(question.questionCard.distractorNotes || '')}
              onChangeText={(value) =>
                setQuestions((prev) =>
                  prev.map((item) =>
                    item.id === question.id
                      ? {
                          ...item,
                          questionCard: {
                            ...normalizeQuestionCard(item.questionCard),
                            distractorNotes: value,
                          },
                        }
                      : item,
                  ),
                )
              }
              placeholder="Catatan distraktor"
              multiline
              style={{
                borderWidth: 1,
                borderColor: '#86efac',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                backgroundColor: '#fff',
                minHeight: 54,
              }}
            />
          </View>

          {question.type !== 'ESSAY' ? (
            <View>
              {question.options.map((option) => (
                <View key={option.id} style={{ flexDirection: 'row', marginBottom: 6 }}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <TextInput
                      value={option.content}
                      onChangeText={(value) => {
                        setQuestions((prev) =>
                          prev.map((item) => {
                            if (item.id !== question.id) return item;
                            return {
                              ...item,
                              options: item.options.map((candidate) =>
                                candidate.id === option.id ? { ...candidate, content: value } : candidate,
                              ),
                            };
                          }),
                        );
                      }}
                      placeholder="Isi opsi jawaban"
                      editable={question.type !== 'TRUE_FALSE'}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 9,
                        backgroundColor: question.type === 'TRUE_FALSE' ? '#f8fafc' : '#fff',
                      }}
                    />
                  </View>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          return {
                            ...item,
                            options: item.options.map((candidate) => {
                              if (question.type === 'COMPLEX_MULTIPLE_CHOICE') {
                                return candidate.id === option.id
                                  ? { ...candidate, isCorrect: !candidate.isCorrect }
                                  : candidate;
                              }
                              return {
                                ...candidate,
                                isCorrect: candidate.id === option.id,
                              };
                            }),
                          };
                        }),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: option.isCorrect ? '#16a34a' : '#cbd5e1',
                      backgroundColor: option.isCorrect ? '#dcfce7' : '#fff',
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: option.isCorrect ? '#166534' : '#334155', fontWeight: '700' }}>
                      Benar
                    </Text>
                  </Pressable>
                </View>
              ))}

              {question.type !== 'TRUE_FALSE' ? (
                <View style={{ flexDirection: 'row', marginTop: 2 }}>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          return {
                            ...item,
                            options: [...item.options, { id: createId('opt'), content: '', isCorrect: false }],
                          };
                        }),
                      );
                    }}
                    style={{
                      marginRight: 10,
                      borderWidth: 1,
                      borderColor: '#1d4ed8',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#eff6ff',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Tambah Opsi</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setQuestions((prev) =>
                        prev.map((item) => {
                          if (item.id !== question.id) return item;
                          if (item.options.length <= 2) return item;
                          return {
                            ...item,
                            options: item.options.slice(0, -1),
                          };
                        }),
                      );
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      backgroundColor: '#fff1f2',
                    }}
                  >
                    <Text style={{ color: '#b91c1c', fontWeight: '700', fontSize: 12 }}>Hapus Opsi</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}

      <Pressable
        onPress={() => setQuestions((prev) => [...prev, createQuestion()])}
        style={{
          borderWidth: 1,
          borderColor: '#1d4ed8',
          backgroundColor: '#eff6ff',
          borderRadius: 9,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Tambah Soal Baru</Text>
      </Pressable>

      <Pressable
        onPress={() => saveMutation.mutate()}
        disabled={saveMutation.isPending}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          opacity: saveMutation.isPending ? 0.5 : 1,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {saveMutation.isPending ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Buat Packet Ujian'}
        </Text>
      </Pressable>
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/teacher/exams')}
        style={{
          backgroundColor: '#1d4ed8',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Program Ujian</Text>
      </Pressable>
    </ScrollView>
  );
}
