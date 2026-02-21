import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { teacherAssignmentApi } from '../../../src/features/teacherAssignments/teacherAssignmentApi';
import { teacherGradeApi } from '../../../src/features/teacherGrades/teacherGradeApi';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type Semester = 'ODD' | 'EVEN';
type SemesterOption = Semester | '';

const FORMATIVE_FIELDS = ['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6'] as const;
type FormativeField = (typeof FORMATIVE_FIELDS)[number];
type CompetencySettings = { A: string; B: string; C: string; D: string };

function parseScore(raw?: string) {
  if (raw === undefined) return { value: null as number | null, invalid: false };
  const trimmed = raw.trim();
  if (!trimmed) return { value: null as number | null, invalid: false };
  const value = Number(trimmed);
  if (Number.isNaN(value)) return { value: null as number | null, invalid: true };
  return { value, invalid: false };
}

function toFixedOrInt(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function emptyCompetencySettings(): CompetencySettings {
  return { A: '', B: '', C: '', D: '' };
}

function calculatePredicate(score: number, kkm: number) {
  if (score >= 86) return 'A';
  if (score >= kkm) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

function formatComponentLabel(component: { name: string; type: string; weight: number }) {
  if (component.type === 'FORMATIVE') return `Formatif (${component.weight}%)`;
  if (component.type === 'MIDTERM') return `SBTS (${component.weight}%)`;
  if (component.type === 'FINAL') return `SAS/SAT (${component.weight}%)`;
  return `${component.name} (${component.weight}%)`;
}

export default function TeacherGradesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignments = assignmentsQuery.data?.assignments || [];
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<number | null>(null);
  const [semester, setSemester] = useState<SemesterOption>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreDraft, setScoreDraft] = useState<Record<string, string>>({});
  const [nfDraft, setNfDraft] = useState<Record<string, string>>({});
  const [showCompetencyModal, setShowCompetencyModal] = useState(false);
  const [competencySettings, setCompetencySettings] = useState<CompetencySettings>(emptyCompetencySettings());

  useEffect(() => {
    setSelectedComponentId(null);
  }, [selectedAssignmentId]);

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId) || null;

  const assignmentDetailQuery = useQuery({
    queryKey: ['mobile-grade-assignment-detail', selectedAssignmentId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignmentId,
    queryFn: () => teacherAssignmentApi.getById(selectedAssignmentId!),
  });

  const componentsQuery = useQuery({
    queryKey: ['mobile-grade-components', selectedAssignment?.subject.id],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment?.subject.id,
    queryFn: () => teacherGradeApi.getComponents(selectedAssignment!.subject.id),
  });

  const gradesQuery = useQuery({
    queryKey: ['mobile-grade-rows', selectedAssignmentId, semester],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment && !!semester,
    queryFn: () =>
      teacherGradeApi.getStudentGrades({
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
        semester: semester as Semester,
      }),
  });
  const selectedKkm = selectedAssignment?.kkm ?? assignmentDetailQuery.data?.kkm ?? 75;
  const components = componentsQuery.data || [];
  const selectedComponent = components.find((component) => component.id === selectedComponentId) || null;
  const formativeComponent = components.find((component) => component.type === 'FORMATIVE') || null;
  const midtermComponent = components.find((component) => component.type === 'MIDTERM') || null;
  const finalComponent = components.find((component) => component.type === 'FINAL') || null;

  useEffect(() => {
    if (selectedComponentId && !components.some((component) => component.id === selectedComponentId)) {
      setSelectedComponentId(null);
    }
  }, [components, selectedComponentId]);

  useEffect(() => {
    if (!selectedAssignmentId) {
      setCompetencySettings(emptyCompetencySettings());
      return;
    }
    const assignmentThresholds = assignmentDetailQuery.data?.competencyThresholds;
    if (!assignmentThresholds) {
      setCompetencySettings(emptyCompetencySettings());
      return;
    }
    setCompetencySettings({
      A: assignmentThresholds.A || '',
      B: assignmentThresholds.B || '',
      C: assignmentThresholds.C || '',
      D: assignmentThresholds.D || '',
    });
  }, [selectedAssignmentId, assignmentDetailQuery.data?.competencyThresholds]);

  useEffect(() => {
    const nextScoreDraft: Record<string, string> = {};
    const nextNfDraft: Record<string, string> = {};
    for (const item of gradesQuery.data || []) {
      nextScoreDraft[`${item.studentId}:${item.componentId}`] = String(item.score ?? '');
      for (const field of FORMATIVE_FIELDS) {
        const value = item[field];
        if (value !== null && value !== undefined) {
          nextNfDraft[`${item.studentId}:${item.componentId}:${field}`] = String(value);
        }
      }
    }
    setScoreDraft(nextScoreDraft);
    setNfDraft(nextNfDraft);
  }, [selectedAssignmentId, semester, gradesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Assignment belum dipilih.');
      if (!selectedComponent) throw new Error('Pilih komponen nilai terlebih dahulu.');
      if (!semester) throw new Error('Pilih semester terlebih dahulu.');
      const activeSemester = semester as Semester;
      const students = assignmentDetailQuery.data?.class.students || [];
      const components = componentsQuery.data || [];
      const payload: Array<{
        student_id: number;
        subject_id: number;
        academic_year_id: number;
        grade_component_id: number;
        semester: Semester;
        score: number | null;
        nf1?: number | null;
        nf2?: number | null;
        nf3?: number | null;
        nf4?: number | null;
        nf5?: number | null;
        nf6?: number | null;
        description?: string;
      }> = [];

      for (const student of students) {
        const component = selectedComponent;
        const key = `${student.id}:${component.id}`;
        const rawScore = scoreDraft[key];
        const parsedScore = parseScore(rawScore);
        if (parsedScore.invalid) {
          throw new Error(`Nilai ${student.name} pada ${component.name} harus berupa angka.`);
        }

        if (component.type === 'FORMATIVE') {
          const nfScores: Partial<Record<FormativeField, number | null>> = {};
          let hasAnyNf = false;

          for (const field of FORMATIVE_FIELDS) {
            const nfKey = `${student.id}:${component.id}:${field}`;
            const parsedNf = parseScore(nfDraft[nfKey]);
            if (parsedNf.invalid) {
              throw new Error(`Nilai ${field.toUpperCase()} ${student.name} harus berupa angka.`);
            }
            if (parsedNf.value !== null) {
              if (parsedNf.value < 0 || parsedNf.value > 100) {
                throw new Error(`Nilai ${field.toUpperCase()} ${student.name} harus 0-100.`);
              }
              hasAnyNf = true;
            }
            nfScores[field] = parsedNf.value;
          }

          let formativeScore = parsedScore.value;
          if (hasAnyNf) {
            const values = FORMATIVE_FIELDS.map((field) => nfScores[field]).filter(
              (value): value is number => value !== null && value !== undefined,
            );
            formativeScore = values.length > 0 ? values.reduce((acc, value) => acc + value, 0) / values.length : null;
          }

          if (formativeScore === null && !hasAnyNf) {
            continue;
          }
          if (formativeScore !== null && (formativeScore < 0 || formativeScore > 100)) {
            throw new Error(`Nilai Formatif ${student.name} pada ${component.name} harus 0-100.`);
          }

          payload.push({
            student_id: student.id,
            subject_id: selectedAssignment.subject.id,
            academic_year_id: selectedAssignment.academicYear.id,
            grade_component_id: component.id,
            semester: activeSemester,
            score: formativeScore,
            nf1: nfScores.nf1 ?? null,
            nf2: nfScores.nf2 ?? null,
            nf3: nfScores.nf3 ?? null,
            nf4: nfScores.nf4 ?? null,
            nf5: nfScores.nf5 ?? null,
            nf6: nfScores.nf6 ?? null,
          });
          continue;
        }

        if (parsedScore.value === null) continue;
        if (parsedScore.value < 0 || parsedScore.value > 100) {
          throw new Error(`Nilai ${student.name} pada ${component.name} harus 0-100.`);
        }

        let description: string | undefined;
        if (component.type === 'FINAL') {
          const formative = components.find((item) => item.type === 'FORMATIVE') || null;
          const midterm = components.find((item) => item.type === 'MIDTERM') || null;
          const formativeScore = formative
            ? parseScore(scoreDraft[`${student.id}:${formative.id}`]).value ?? 0
            : 0;
          const midtermScore = midterm ? parseScore(scoreDraft[`${student.id}:${midterm.id}`]).value ?? 0 : 0;
          const finalScore = parsedScore.value;

          const formativeWeight = formative?.weight ?? 0;
          const midtermWeight = midterm?.weight ?? 0;
          const finalWeight = component.weight ?? 0;

          let weightedTotal = 0;
          let weightTotal = 0;
          if (formativeWeight > 0) {
            weightedTotal += formativeScore * (formativeWeight / 100);
            weightTotal += formativeWeight;
          }
          if (midtermWeight > 0) {
            weightedTotal += midtermScore * (midtermWeight / 100);
            weightTotal += midtermWeight;
          }
          if (finalWeight > 0) {
            weightedTotal += finalScore * (finalWeight / 100);
            weightTotal += finalWeight;
          }

          let raporSas = weightedTotal;
          if (weightTotal > 0 && weightTotal !== 100) {
            raporSas = (weightedTotal / weightTotal) * 100;
          } else if (weightTotal === 0) {
            raporSas = (formativeScore + midtermScore + finalScore) / 3;
          }

          const predicate = calculatePredicate(raporSas, selectedKkm);
          const mappedDescription = competencySettings[predicate as keyof CompetencySettings]?.trim();
          description = mappedDescription || undefined;
        }

        payload.push({
          student_id: student.id,
          subject_id: selectedAssignment.subject.id,
          academic_year_id: selectedAssignment.academicYear.id,
          grade_component_id: component.id,
          semester: activeSemester,
          score: parsedScore.value,
          description,
        });
      }

      if (payload.length === 0) {
        throw new Error('Belum ada nilai yang diisi.');
      }

      return teacherGradeApi.saveBulk({ grades: payload });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-grade-rows', selectedAssignmentId, semester],
      });
      notifySuccess(`Simpan nilai selesai. Berhasil: ${result.success}, Gagal: ${result.failed}`);
    },
    onError: (error: any) => {
      notifyApiError(error, 'Gagal menyimpan nilai.');
    },
  });

  const saveCompetencyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignmentId) throw new Error('Assignment belum dipilih.');
      return teacherAssignmentApi.updateCompetencyThresholds(selectedAssignmentId, {
        A: competencySettings.A.trim(),
        B: competencySettings.B.trim(),
        C: competencySettings.C.trim(),
        D: competencySettings.D.trim(),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-grade-assignment-detail', selectedAssignmentId],
      });
      setShowCompetencyModal(false);
      notifySuccess('Pengaturan deskripsi predikat berhasil disimpan.');
    },
    onError: (error: any) => {
      notifyApiError(error, 'Gagal menyimpan pengaturan predikat.');
    },
  });

  const students = assignmentDetailQuery.data?.class.students || [];
  const filteredStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return students;
    return students.filter((student) => {
      const name = student.name.toLowerCase();
      const nis = (student.nis || '').toLowerCase();
      const nisn = (student.nisn || '').toLowerCase();
      return name.includes(q) || nis.includes(q) || nisn.includes(q);
    });
  }, [students, searchQuery]);
  const recap = useMemo(() => {
    if (!selectedComponent) return { total: students.length, filled: 0 };
    let filled = 0;
    const total = students.length;
    for (const student of students) {
      const scoreRaw = scoreDraft[`${student.id}:${selectedComponent.id}`];
      const hasScore = scoreRaw !== undefined && scoreRaw.trim() !== '';
      if (selectedComponent.type === 'FORMATIVE') {
        const hasAnyNf = FORMATIVE_FIELDS.some((field) => {
          const value = nfDraft[`${student.id}:${selectedComponent.id}:${field}`];
          return value !== undefined && value.trim() !== '';
        });
        if (hasScore || hasAnyNf) filled += 1;
      } else if (hasScore) {
        filled += 1;
      }
    }
    return { total, filled };
  }, [students, selectedComponent, scoreDraft, nfDraft]);

  const getFormativeAverage = (studentId: number, componentId: number, fields: FormativeField[]) => {
    const values: number[] = [];
    for (const field of fields) {
      const key = `${studentId}:${componentId}:${field}`;
      const parsed = parseScore(nfDraft[key]);
      if (!parsed.invalid && parsed.value !== null) values.push(parsed.value);
    }
    if (values.length === 0) return null;
    return values.reduce((acc, value) => acc + value, 0) / values.length;
  };

  const hasUpperFormativeScores = (studentId: number, componentId: number) => {
    const upperFields: FormativeField[] = ['nf4', 'nf5', 'nf6'];
    return upperFields.some((field) => {
      const parsed = parseScore(nfDraft[`${studentId}:${componentId}:${field}`]);
      return !parsed.invalid && parsed.value !== null;
    });
  };

  const competencyConfigured = useMemo(
    () =>
      !!(
        competencySettings.A.trim() ||
        competencySettings.B.trim() ||
        competencySettings.C.trim() ||
        competencySettings.D.trim()
      ),
    [competencySettings],
  );

  const getWeightedFinalScore = (studentId: number) => {
    if (!finalComponent) return null;
    const finalParsed = parseScore(scoreDraft[`${studentId}:${finalComponent.id}`]);
    if (finalParsed.invalid || finalParsed.value === null) return null;

    const formativeParsed =
      formativeComponent !== null ? parseScore(scoreDraft[`${studentId}:${formativeComponent.id}`]) : null;
    const midtermParsed =
      midtermComponent !== null ? parseScore(scoreDraft[`${studentId}:${midtermComponent.id}`]) : null;

    const formativeScore = formativeParsed && !formativeParsed.invalid ? formativeParsed.value ?? 0 : 0;
    const midtermScore = midtermParsed && !midtermParsed.invalid ? midtermParsed.value ?? 0 : 0;
    const finalScore = finalParsed.value;

    const formativeWeight = formativeComponent?.weight ?? 0;
    const midtermWeight = midtermComponent?.weight ?? 0;
    const finalWeight = finalComponent.weight ?? 0;

    let weightedTotal = 0;
    let weightTotal = 0;

    if (formativeWeight > 0) {
      weightedTotal += formativeScore * (formativeWeight / 100);
      weightTotal += formativeWeight;
    }
    if (midtermWeight > 0) {
      weightedTotal += midtermScore * (midtermWeight / 100);
      weightTotal += midtermWeight;
    }
    if (finalWeight > 0) {
      weightedTotal += finalScore * (finalWeight / 100);
      weightTotal += finalWeight;
    }

    if (weightTotal > 0 && weightTotal !== 100) return (weightedTotal / weightTotal) * 100;
    if (weightTotal === 0) return (formativeScore + midtermScore + finalScore) / 3;
    return weightedTotal;
  };

  const getAutoDescription = (studentId: number) => {
    if (!finalComponent) return '';
    if (!competencyConfigured) return '';
    const finalScore = getWeightedFinalScore(studentId);
    if (finalScore === null) return '';
    const predicate = calculatePredicate(finalScore, selectedKkm);
    return competencySettings[predicate as keyof CompetencySettings]?.trim() || '';
  };

  const onScoreChange = (studentId: number, componentId: number, value: string) => {
    setScoreDraft((prev) => ({
      ...prev,
      [`${studentId}:${componentId}`]: value.replace(',', '.'),
    }));
  };

  const onNfChange = (studentId: number, componentId: number, field: FormativeField, value: string) => {
    const normalized = value.replace(',', '.');
    setNfDraft((prev) => {
      const nextDraft = {
        ...prev,
        [`${studentId}:${componentId}:${field}`]: normalized,
      };
      const values: number[] = [];
      for (const keyField of FORMATIVE_FIELDS) {
        const parsed = parseScore(nextDraft[`${studentId}:${componentId}:${keyField}`]);
        if (!parsed.invalid && parsed.value !== null) values.push(parsed.value);
      }
      if (values.length > 0) {
        const avg = values.reduce((acc, score) => acc + score, 0) / values.length;
        setScoreDraft((prevScore) => ({
          ...prevScore,
          [`${studentId}:${componentId}`]: toFixedOrInt(avg),
        }));
      }
      return nextDraft;
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat input nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Input Nilai</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentPadding}
        refreshControl={
          <RefreshControl
            refreshing={assignmentsQuery.isFetching || assignmentDetailQuery.isFetching || gradesQuery.isFetching}
            onRefresh={async () => {
              await Promise.all([assignmentsQuery.refetch(), assignmentDetailQuery.refetch(), gradesQuery.refetch()]);
            }}
          />
        }
      >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Input Nilai</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>Masukkan nilai per komponen untuk kelas ajar Anda.</Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
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
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                {assignments.map((item) => {
                  const selected = selectedAssignmentId === item.id;
                  return (
                    <View key={item.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        disabled={!semester}
                        onPress={() => {
                          if (!semester) return;
                          setSelectedAssignmentId(item.id);
                        }}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                          backgroundColor: !semester ? '#f8fafc' : selected ? '#eff6ff' : '#fff',
                          borderRadius: 8,
                          padding: 9,
                          opacity: semester ? 1 : 0.6,
                        }}
                        >
                          <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 12 }}>
                          {item.class.name}
                          </Text>
                          <Text style={{ color: '#334155', fontSize: 12 }} numberOfLines={2}>
                          {item.subject.name}
                          </Text>
                          <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>KKM: {item.kkm}</Text>
                        </Pressable>
                    </View>
                  );
                })}
              </View>
              {!semester ? (
                <Text style={{ color: '#dc2626', fontSize: 12, marginTop: 2 }}>Silahkan Pilih Semester</Text>
              ) : null}
            </View>

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    setSemester('ODD');
                    setSelectedAssignmentId(null);
                    setSelectedComponentId(null);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: semester === 'ODD' ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: semester === 'ODD' ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: semester === 'ODD' ? '#1d4ed8' : '#334155', fontWeight: '700' }}>Ganjil</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    setSemester('EVEN');
                    setSelectedAssignmentId(null);
                    setSelectedComponentId(null);
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: semester === 'EVEN' ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: semester === 'EVEN' ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: semester === 'EVEN' ? '#1d4ed8' : '#334155', fontWeight: '700' }}>Genap</Text>
                </Pressable>
              </View>
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
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Komponen Nilai</Text>
              {componentsQuery.isLoading ? (
                <Text style={{ color: '#64748b', fontSize: 12 }}>Memuat komponen mapel...</Text>
              ) : components.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {components.map((component) => {
                    const selected = selectedComponentId === component.id;
                    return (
                      <View key={component.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          disabled={!selectedAssignmentId}
                          onPress={() => {
                            if (!selectedAssignmentId) return;
                            setSelectedComponentId(component.id);
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                            backgroundColor: !selectedAssignmentId ? '#f8fafc' : selected ? '#eff6ff' : '#fff',
                            borderRadius: 8,
                            padding: 9,
                            opacity: selectedAssignmentId ? 1 : 0.6,
                          }}
                        >
                          <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 12 }}>
                            {formatComponentLabel(component)}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={{ color: '#64748b', fontSize: 12 }}>
                  Komponen nilai untuk mapel ini belum tersedia.
                </Text>
              )}
              {!selectedAssignmentId && semester ? (
                <Text style={{ color: '#dc2626', fontSize: 12, marginTop: 2 }}>Silahkan Pilih Kelas & Mapel</Text>
              ) : null}
            </View>

            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Cari siswa / NIS / NISN..."
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: '#fff',
                color: '#0f172a',
                marginBottom: 10,
              }}
            />

            {assignmentDetailQuery.isLoading || componentsQuery.isLoading || gradesQuery.isLoading ? (
              <QueryStateView type="loading" message="Memuat siswa dan komponen nilai..." />
            ) : null}
            {assignmentDetailQuery.isError || componentsQuery.isError || gradesQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat data input nilai."
                onRetry={() => {
                  assignmentDetailQuery.refetch();
                  componentsQuery.refetch();
                  gradesQuery.refetch();
                }}
              />
            ) : null}

            {!assignmentDetailQuery.isLoading && !componentsQuery.isLoading && !gradesQuery.isLoading ? (
              <>
                <View
                  style={{
                    backgroundColor: '#1e3a8a',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: '#bfdbfe', fontSize: 12, marginBottom: 4 }}>
                    {selectedAssignment?.subject.name} • {selectedAssignment?.class.name} • Semester{' '}
                    {semester === 'ODD' ? 'Ganjil' : semester === 'EVEN' ? 'Genap' : '-'}
                  </Text>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    Terisi {recap.filled} / {recap.total} kolom nilai
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: 11, marginTop: 2 }}>
                    Menampilkan {filteredStudents.length} dari {students.length} siswa
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: 11, marginTop: 2 }}>
                    Komponen aktif: {selectedComponent ? formatComponentLabel(selectedComponent) : 'Belum dipilih'}
                  </Text>
                  <Text style={{ color: '#bfdbfe', fontSize: 11, marginTop: 2 }}>
                    KKM mapel: {selectedKkm}
                  </Text>
                </View>

                {selectedComponent?.type === 'FINAL' ? (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      borderWidth: 1,
                      borderColor: '#dbeafe',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
                      Deskripsi Predikat SAS
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                      A: nilai minimal 86, B: nilai minimal KKM sampai 85, C: nilai 60 sampai di bawah KKM, D: nilai di bawah 60
                    </Text>
                    <Pressable
                      onPress={() => setShowCompetencyModal(true)}
                      style={{
                        borderWidth: 1,
                        borderColor: '#1d4ed8',
                        backgroundColor: '#eff6ff',
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                        {competencyConfigured ? 'Ubah Pengaturan Predikat' : 'Atur Deskripsi Predikat'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}

                {filteredStudents.length > 0 && selectedComponent ? (
                  <View>
                    {filteredStudents.map((student) => (
                      <View
                        key={student.id}
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 10,
                          padding: 12,
                          marginBottom: 10,
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 2 }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                          NIS: {student.nis || '-'} | NISN: {student.nisn || '-'}
                        </Text>
                        <View style={{ marginBottom: 8 }}>
                          <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                            {formatComponentLabel(selectedComponent)}
                          </Text>
                          {selectedComponent.type === 'FORMATIVE' ? (
                            <>
                              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 6 }}>
                                {FORMATIVE_FIELDS.map((field) => (
                                  <View
                                    key={`${student.id}:${selectedComponent.id}:${field}`}
                                    style={{ width: '33.333%', paddingHorizontal: 3, marginBottom: 6 }}
                                  >
                                    <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 3 }}>
                                      {field.toUpperCase()}
                                    </Text>
                                    <TextInput
                                      value={nfDraft[`${student.id}:${selectedComponent.id}:${field}`] ?? ''}
                                      onChangeText={(value) => onNfChange(student.id, selectedComponent.id, field, value)}
                                      keyboardType="numeric"
                                      placeholder="0-100"
                                      placeholderTextColor="#94a3b8"
                                      style={{
                                        borderWidth: 1,
                                        borderColor: '#cbd5e1',
                                        borderRadius: 8,
                                        paddingHorizontal: 8,
                                        paddingVertical: 7,
                                        backgroundColor: '#fff',
                                        fontSize: 12,
                                        color: '#0f172a',
                                      }}
                                    />
                                  </View>
                                ))}
                              </View>
                              <View style={{ flexDirection: 'row', marginHorizontal: -3, alignItems: 'center' }}>
                                <View style={{ flex: 1, paddingHorizontal: 3 }}>
                                  <TextInput
                                    value={scoreDraft[`${student.id}:${selectedComponent.id}`] ?? ''}
                                    onChangeText={(value) => onScoreChange(student.id, selectedComponent.id, value)}
                                    keyboardType="numeric"
                                    placeholder="Nilai Formatif"
                                    placeholderTextColor="#94a3b8"
                                    style={{
                                      borderWidth: 1,
                                      borderColor: '#cbd5e1',
                                      borderRadius: 8,
                                      paddingHorizontal: 10,
                                      paddingVertical: 8,
                                      backgroundColor: '#fff',
                                      color: '#0f172a',
                                    }}
                                  />
                                </View>
                                <View style={{ width: 126, paddingHorizontal: 3 }}>
                                  <View
                                    style={{
                                      borderWidth: 1,
                                      borderColor: '#bfdbfe',
                                      backgroundColor: '#eff6ff',
                                      borderRadius: 8,
                                      paddingVertical: 8,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Text style={{ color: '#64748b', fontSize: 10 }}>Rerata SBTS (NF1-3)</Text>
                                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>
                                      {(() => {
                                        const avg = getFormativeAverage(student.id, selectedComponent.id, ['nf1', 'nf2', 'nf3']);
                                        return avg === null ? '-' : toFixedOrInt(avg);
                                      })()}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                              <View style={{ marginTop: 6 }}>
                                <View
                                  style={{
                                    borderWidth: 1,
                                    borderColor: '#bbf7d0',
                                    backgroundColor: '#f0fdf4',
                                    borderRadius: 8,
                                    paddingVertical: 8,
                                    alignItems: 'center',
                                  }}
                                >
                                  <Text style={{ color: '#166534', fontSize: 10 }}>Rerata SAS (NF1-6)</Text>
                                  <Text style={{ color: '#166534', fontWeight: '700' }}>
                                    {(() => {
                                      const avg = getFormativeAverage(
                                        student.id,
                                        selectedComponent.id,
                                        ['nf1', 'nf2', 'nf3', 'nf4', 'nf5', 'nf6'],
                                      );
                                      if (avg === null) return '-';
                                      return hasUpperFormativeScores(student.id, selectedComponent.id) ? toFixedOrInt(avg) : '-';
                                    })()}
                                  </Text>
                                </View>
                              </View>
                            </>
                          ) : (
                            <>
                              <TextInput
                                value={scoreDraft[`${student.id}:${selectedComponent.id}`] ?? ''}
                                onChangeText={(value) => onScoreChange(student.id, selectedComponent.id, value)}
                                keyboardType="numeric"
                                placeholder="0 - 100"
                                placeholderTextColor="#94a3b8"
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#cbd5e1',
                                  borderRadius: 8,
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  backgroundColor: '#fff',
                                  color: '#0f172a',
                                }}
                              />
                              {selectedComponent.type === 'FINAL' ? (
                                <View
                                  style={{
                                    marginTop: 6,
                                    borderWidth: 1,
                                    borderColor: '#dbeafe',
                                    borderRadius: 8,
                                    paddingHorizontal: 10,
                                    paddingVertical: 8,
                                    backgroundColor: '#eff6ff',
                                  }}
                                >
                                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}>
                                    Predikat otomatis
                                  </Text>
                                  <Text style={{ color: '#1e3a8a', fontWeight: '700', fontSize: 12 }}>
                                    {(() => {
                                      const finalScore = getWeightedFinalScore(student.id);
                                      if (finalScore === null) return 'Isi nilai SAS terlebih dahulu';
                                      const predicate = calculatePredicate(finalScore, selectedKkm);
                                      return `Predikat ${predicate} • ${getAutoDescription(student.id) || 'Deskripsi belum diatur'}`;
                                    })()}
                                  </Text>
                                </View>
                              ) : null}
                            </>
                          )}
                        </View>
                      </View>
                    ))}
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>
                      Data belum lengkap
                    </Text>
                    <Text style={{ color: '#64748b' }}>
                      {selectedComponent
                        ? 'Siswa aktif belum tersedia untuk mapel ini.'
                        : 'Pilih komponen nilai terlebih dahulu untuk mulai input.'}
                    </Text>
                  </View>
                )}
              </>
            ) : null}

            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || students.length === 0 || !selectedComponent}
              style={{
                marginTop: 8,
                backgroundColor: saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
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
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b' }}>Guru belum memiliki assignment mapel aktif.</Text>
          </View>
        )
      ) : null}

        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 18,
            backgroundColor: '#1d4ed8',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={showCompetencyModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCompetencyModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 20,
          }}
        >
          <View
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#dbeafe',
              padding: 14,
              maxHeight: '85%',
            }}
          >
            <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700', marginBottom: 6 }}>
              Pengaturan Deskripsi Predikat
            </Text>
            <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 10 }}>
              Deskripsi ini akan diterapkan otomatis ke komponen SAS.
            </Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbeafe',
                borderRadius: 8,
                padding: 10,
                backgroundColor: '#eff6ff',
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#1e3a8a', fontSize: 12, marginBottom: 2 }}>A: Nilai ≥ 86</Text>
              <Text style={{ color: '#1e3a8a', fontSize: 12, marginBottom: 2 }}>B: Nilai minimal KKM sampai 85</Text>
              <Text style={{ color: '#1e3a8a', fontSize: 12, marginBottom: 2 }}>C: Nilai 60 sampai di bawah KKM</Text>
              <Text style={{ color: '#1e3a8a', fontSize: 12 }}>D: Nilai di bawah 60</Text>
            </View>

            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <View key={key} style={{ marginBottom: 8 }}>
                <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700', marginBottom: 4 }}>
                  Deskripsi Predikat {key}
                </Text>
                <TextInput
                  value={competencySettings[key]}
                  onChangeText={(value) => {
                    setCompetencySettings((prev) => ({ ...prev, [key]: value }));
                  }}
                  multiline
                  numberOfLines={2}
                  placeholder={`Tulis deskripsi untuk predikat ${key}`}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    backgroundColor: '#fff',
                    minHeight: 56,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            ))}

            <View style={{ flexDirection: 'row', marginHorizontal: -4, marginTop: 4 }}>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setShowCompetencyModal(false)}
                  disabled={saveCompetencyMutation.isPending}
                  style={{
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff',
                  }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>Batal</Text>
                </Pressable>
              </View>
              <View style={{ flex: 1, paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => saveCompetencyMutation.mutate()}
                  disabled={saveCompetencyMutation.isPending}
                  style={{
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: saveCompetencyMutation.isPending ? '#93c5fd' : '#1d4ed8',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveCompetencyMutation.isPending ? 'Menyimpan...' : 'Simpan'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
