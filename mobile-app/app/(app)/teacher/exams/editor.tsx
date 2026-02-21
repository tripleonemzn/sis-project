import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { examApi } from '../../../../src/features/exams/examApi';
import {
  ExamDisplayType,
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
};

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
    options:
      type === 'ESSAY' ? [] : type === 'TRUE_FALSE' ? createTrueFalseOptions() : createChoiceOptions(),
  };
}

function parsePacketId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
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
  const params = useLocalSearchParams<{ packetId?: string | string[] }>();
  const packetId = useMemo(() => parsePacketId(params.packetId), [params.packetId]);
  const isEditMode = !!packetId;
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = teacherAssignmentsQuery.data?.assignments || [];

  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [examType, setExamType] = useState<ExamDisplayType>('FORMATIF');
  const [semester, setSemester] = useState<'ODD' | 'EVEN'>('ODD');
  const [duration, setDuration] = useState('60');
  const [kkm, setKkm] = useState('75');
  const [saveToBank, setSaveToBank] = useState(true);
  const [questions, setQuestions] = useState<QuestionDraft[]>([createQuestion()]);
  const [hydratedPacket, setHydratedPacket] = useState(false);

  useEffect(() => {
    if (!selectedAssignmentId && assignments.length > 0) {
      setSelectedAssignmentId(assignments[0].id);
    }
  }, [selectedAssignmentId, assignments]);

  const packetDetailQuery = useQuery({
    queryKey: ['mobile-teacher-exam-packet-detail', packetId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!packetId,
    queryFn: async () => examApi.getTeacherPacketById(packetId!),
    retry: 1,
  });

  useEffect(() => {
    if (!isEditMode || !packetDetailQuery.data || hydratedPacket) return;

    const packet = packetDetailQuery.data;
    setTitle(packet.title || '');
    setDescription(packet.description || '');
    setInstructions(packet.instructions || '');
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
  }, [isEditMode, packetDetailQuery.data, hydratedPacket, assignments]);

  const selectedAssignment =
    assignments.find((assignment) => assignment.id === selectedAssignmentId) || null;

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

      cleanedQuestions.forEach((question, idx) => {
        if (!question.content.trim()) {
          throw new Error(`Isi soal nomor ${idx + 1} masih kosong.`);
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
        type: examType,
        semester,
        duration: durationValue,
        description: description.trim() || undefined,
        instructions: instructions.trim() || undefined,
        kkm: kkmValue,
        saveToBank,
        questions: cleanedQuestions,
      };

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
    onError: (error: any) => {
      const message = error?.response?.data?.message || error?.message || 'Gagal menyimpan packet ujian.';
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
          {assignments.map((assignment) => {
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
                  <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 11 }}>
                    {assignment.class.name}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 11 }} numberOfLines={2}>
                    {assignment.subject.name}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
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

      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Tipe Ujian</Text>
      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
        {(['FORMATIF', 'SBTS', 'SAS', 'SAT'] as ExamDisplayType[]).map((item) => {
          const selected = examType === item;
          return (
            <View key={item} style={{ width: '25%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setExamType(item)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                  backgroundColor: selected ? '#eff6ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 11, fontWeight: '700' }}>
                  {item}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 6 }}>Semester</Text>
      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        {(['ODD', 'EVEN'] as Array<'ODD' | 'EVEN'>).map((item) => {
          const selected = semester === item;
          return (
            <View key={item} style={{ width: '50%', paddingHorizontal: 4 }}>
              <Pressable
                onPress={() => setSemester(item)}
                style={{
                  borderWidth: 1,
                  borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                  backgroundColor: selected ? '#eff6ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
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
              marginBottom: question.type === 'ESSAY' ? 0 : 8,
            }}
          />

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

      <Pressable
        onPress={() => router.replace('/teacher/exams')}
        style={{
          backgroundColor: '#1d4ed8',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Daftar Ujian</Text>
      </Pressable>
    </ScrollView>
  );
}
