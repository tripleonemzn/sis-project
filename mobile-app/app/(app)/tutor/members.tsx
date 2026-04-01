import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { examApi, ExamProgramItem } from '../../../src/features/exams/examApi';
import { tutorApi } from '../../../src/features/tutor/tutorApi';
import {
  canAccessTutorWorkspace,
  getExtracurricularTutorAssignments,
} from '../../../src/features/tutor/tutorAccess';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type SemesterType = 'ODD' | 'EVEN';

function normalizeProgramCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveTutorReportSlot(
  program: ExamProgramItem | null | undefined,
  semester: SemesterType,
): 'SBTS' | 'SAS' | 'SAT' | '' {
  if (!program) return '';
  const baseType = normalizeProgramCode(program.baseTypeCode || program.baseType);
  if (baseType === 'SAT') return 'SAT';
  if (baseType === 'SAS') return 'SAS';
  if (baseType === 'SBTS') return 'SBTS';
  const componentType = normalizeProgramCode(
    program.gradeComponentTypeCode || program.gradeComponentType,
  );
  if (componentType === 'MIDTERM') return 'SBTS';
  if (componentType === 'FINAL') {
    const fixedSemester = program.fixedSemester || null;
    if (fixedSemester === 'EVEN') return 'SAT';
    if (fixedSemester === 'ODD') return 'SAS';
    return semester === 'EVEN' ? 'SAT' : 'SAS';
  }
  return '';
}

function isMidtermAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  return ['SBTS', 'MIDTERM', 'PTS', 'UTS'].includes(code) || code.includes('MIDTERM');
}

function isFinalAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) {
    return true;
  }
  return code.includes('FINAL');
}

function getExistingGrade(
  row: Awaited<ReturnType<typeof tutorApi.listMembers>>[number],
  program: ExamProgramItem | null,
  semester: SemesterType,
) {
  const slot = resolveTutorReportSlot(program, semester);
  if (slot === 'SAS') return { grade: row.gradeSas || '', description: row.descSas || '' };
  if (slot === 'SAT') return { grade: row.gradeSat || '', description: row.descSat || '' };
  if (slot === 'SBTS' && semester === 'EVEN') {
    return { grade: row.gradeSbtsEven || '', description: row.descSbtsEven || '' };
  }
  if (slot === 'SBTS') return { grade: row.gradeSbtsOdd || '', description: row.descSbtsOdd || '' };
  return { grade: row.grade || '', description: row.description || '' };
}

export default function TutorMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ assignmentId?: string; ekskulId?: string; academicYearId?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const hasTutorWorkspaceAccess = canAccessTutorWorkspace(user);

  const [search, setSearch] = useState('');
  const [selectedAssignmentIdState, setSelectedAssignmentIdState] = useState<number | null>(null);
  const [selectedProgramCodeState, setSelectedProgramCodeState] = useState<string>('');
  const [semesterState, setSemesterState] = useState<SemesterType>('ODD');
  const [gradeMap, setGradeMap] = useState<Record<number, string>>({});
  const [descriptionMap, setDescriptionMap] = useState<Record<number, string>>({});

  const activeYearQuery = useQuery({
    queryKey: ['mobile-tutor-members-active-year'],
    enabled: isAuthenticated && hasTutorWorkspaceAccess,
    queryFn: () => adminApi.getActiveAcademicYear(),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-tutor-members-assignments', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && hasTutorWorkspaceAccess,
    queryFn: () => tutorApi.listAssignments(activeYearQuery.data?.id),
  });

  const assignments = useMemo(
    () => getExtracurricularTutorAssignments(assignmentsQuery.data || []),
    [assignmentsQuery.data],
  );
  const selectedAssignmentId = useMemo(() => {
    if (!assignments.length) return null;
    if (
      selectedAssignmentIdState &&
      assignments.some((item) => item.id === selectedAssignmentIdState)
    ) {
      return selectedAssignmentIdState;
    }

    const queryAssignmentId = Number(params.assignmentId || 0);
    if (queryAssignmentId) {
      const found = assignments.find((item) => Number(item.id) === queryAssignmentId);
      if (found) return found.id;
    }

    const queryEkskulId = Number(params.ekskulId || 0);
    const queryAcademicYearId = Number(params.academicYearId || 0);
    if (queryEkskulId && queryAcademicYearId) {
      const found = assignments.find(
        (item) =>
          Number(item.ekskulId) === queryEkskulId &&
          Number(item.academicYearId) === queryAcademicYearId,
      );
      if (found) return found.id;
    }
    return assignments[0].id;
  }, [assignments, params.academicYearId, params.assignmentId, params.ekskulId, selectedAssignmentIdState]);

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId) || null;

  const reportProgramsQuery = useQuery({
    queryKey: [
      'mobile-tutor-members-report-programs',
      selectedAssignment?.academicYearId,
    ],
    enabled: Boolean(selectedAssignment?.academicYearId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await examApi.getExamPrograms({
        academicYearId: Number(selectedAssignment?.academicYearId),
        roleContext: 'student',
      });
      return result.programs || [];
    },
  });

  const reportPrograms = useMemo(() => {
    const rows = reportProgramsQuery.data || [];
    return rows
      .filter((program) => {
        if (!program.isActive || !program.showOnStudentMenu) return false;
        const baseType = normalizeProgramCode(program.baseTypeCode || program.baseType);
        if (isMidtermAliasCode(baseType) || isFinalAliasCode(baseType)) return true;
        const componentType = normalizeProgramCode(
          program.gradeComponentTypeCode || program.gradeComponentType,
        );
        return isMidtermAliasCode(componentType) || isFinalAliasCode(componentType);
      })
      .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  }, [reportProgramsQuery.data]);

  const selectedProgramCode = useMemo(() => {
    if (!reportPrograms.length) return '';
    const normalizedCurrent = normalizeProgramCode(selectedProgramCodeState);
    const exists = reportPrograms.some(
      (item) => normalizeProgramCode(item.code) === normalizedCurrent,
    );
    if (exists) return normalizedCurrent;
    return normalizeProgramCode(reportPrograms[0].code);
  }, [reportPrograms, selectedProgramCodeState]);

  const selectedReportProgram = useMemo(
    () =>
      reportPrograms.find(
        (item) => normalizeProgramCode(item.code) === normalizeProgramCode(selectedProgramCode),
      ) || null,
    [reportPrograms, selectedProgramCode],
  );

  const selectedReportSlot = useMemo(
    () => resolveTutorReportSlot(selectedReportProgram, selectedReportProgram?.fixedSemester || semesterState),
    [selectedReportProgram, semesterState],
  );
  const effectiveReportType = useMemo(
    () =>
      selectedReportSlot ||
      normalizeProgramCode(selectedReportProgram?.code || selectedProgramCode || ''),
    [selectedReportSlot, selectedProgramCode, selectedReportProgram?.code],
  );
  const semester = selectedReportProgram?.fixedSemester || semesterState;

  const membersQuery = useQuery({
    queryKey: [
      'mobile-tutor-members-list',
      selectedAssignment?.ekskulId,
      selectedAssignment?.academicYearId,
    ],
    enabled: Boolean(selectedAssignment),
    queryFn: () =>
      tutorApi.listMembers({
        ekskulId: Number(selectedAssignment?.ekskulId),
        academicYearId: Number(selectedAssignment?.academicYearId),
      }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { enrollmentId: number; grade: string; description: string }) => {
      return tutorApi.inputGrade({
        enrollmentId: payload.enrollmentId,
        grade: payload.grade,
        description: payload.description,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
        semester,
      });
    },
    onSuccess: async () => {
      notifySuccess('Nilai ekskul berhasil disimpan.');
      await queryClient.invalidateQueries({
        queryKey: [
          'mobile-tutor-members-list',
          selectedAssignment?.ekskulId,
          selectedAssignment?.academicYearId,
        ],
      });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan nilai ekskul.');
    },
  });

  const members = useMemo(() => membersQuery.data || [], [membersQuery.data]);
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((item) => {
      const haystacks = [
        item.student?.name || '',
        item.student?.nis || '',
        item.student?.nisn || '',
        item.student?.studentClass?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(q));
    });
  }, [members, search]);

  if (isLoading) return <AppLoadingScreen message="Memuat anggota & nilai..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!hasTutorWorkspaceAccess) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Anggota & Nilai</Text>
        <QueryStateView type="error" message="Halaman ini tersedia untuk pembina ekstrakurikuler aktif." />
      </ScrollView>
    );
  }
  const hasFixedSemester = selectedReportProgram?.fixedSemester != null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={assignmentsQuery.isFetching || membersQuery.isFetching}
          onRefresh={() => {
            void assignmentsQuery.refetch();
            void membersQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Anggota & Nilai</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Input nilai ekstrakurikuler sesuai Program Ujian aktif dan semester.
      </Text>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Assignment Ekskul</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          {assignments.map((item) => {
            const selected = selectedAssignmentId === item.id;
            return (
              <View key={item.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => {
                    setSelectedAssignmentIdState(item.id);
                    setGradeMap({});
                    setDescriptionMap({});
                  }}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: selected ? '#e9f1ff' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 8,
                    paddingHorizontal: 8,
                  }}
                >
                  <Text numberOfLines={1} style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                    {item.ekskul?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                    {item.academicYear?.name || '-'}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Program Ujian</Text>
        {reportProgramsQuery.isLoading ? (
          <QueryStateView type="loading" message="Memuat program ujian..." />
        ) : reportPrograms.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
            {reportPrograms.map((program) => {
              const code = normalizeProgramCode(program.code);
              const selected = normalizeProgramCode(selectedProgramCode) === code;
              return (
                <View key={program.code} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                  <Pressable
                    onPress={() => {
                      setSelectedProgramCodeState(code);
                      setGradeMap({});
                      setDescriptionMap({});
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                      backgroundColor: selected ? '#e9f1ff' : '#fff',
                      borderRadius: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}
                    >
                      {String(program.label || program.shortLabel || program.code)}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
                      {program.fixedSemester === 'ODD'
                        ? 'Semester Ganjil'
                        : program.fixedSemester === 'EVEN'
                        ? 'Semester Genap'
                        : 'Semester Otomatis'}
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
              borderColor: '#facc15',
              borderRadius: 10,
              backgroundColor: '#fef9c3',
              padding: 10,
              marginBottom: 8,
            }}
          >
            <Text style={{ color: '#854d0e', fontWeight: '700' }}>Program ujian belum tersedia.</Text>
            <Text style={{ color: '#854d0e', fontSize: 12, marginTop: 2 }}>
              Aktifkan program ujian komponen rapor dari menu Wakasek Kurikulum.
            </Text>
          </View>
        )}

        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          {(['ODD', 'EVEN'] as SemesterType[]).map((item) => {
            const selected = semester === item;
            return (
              <View key={item} style={{ width: '50%', paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => {
                    setSemesterState(item);
                    setGradeMap({});
                    setDescriptionMap({});
                  }}
                  disabled={Boolean(selectedReportProgram?.fixedSemester)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: selected ? '#e9f1ff' : hasFixedSemester ? '#f1f5f9' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                    opacity: hasFixedSemester ? 0.75 : 1,
                  }}
                >
                  <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                    {item === 'ODD' ? 'Ganjil' : 'Genap'}
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
          borderColor: '#dbe7fb',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari nama/NIS/NISN siswa..."
          placeholderTextColor="#95a3be"
          style={{
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
          }}
        />
      </View>

      {membersQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data anggota ekskul..." /> : null}
      {membersQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data anggota ekskul." onRetry={() => membersQuery.refetch()} />
      ) : null}

      {!membersQuery.isLoading && !membersQuery.isError ? (
        filteredMembers.length > 0 ? (
          filteredMembers.map((item) => {
            const existing = getExistingGrade(item, selectedReportProgram, semester);
            const currentGrade = gradeMap[item.id] ?? existing.grade;
            const currentDescription = descriptionMap[item.id] ?? existing.description;

            return (
              <View
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  borderWidth: 1,
                  borderColor: '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.student?.name || '-'}</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2 }}>
                  {item.student?.studentClass?.name || '-'} • NIS: {item.student?.nis || '-'}
                </Text>

                <TextInput
                  value={currentGrade}
                  onChangeText={(value) =>
                    setGradeMap((prev) => ({
                      ...prev,
                      [item.id]: value,
                    }))
                  }
                  placeholder="Nilai (contoh: A / 90)"
                  placeholderTextColor="#95a3be"
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: '#d6e2f7',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    color: BRAND_COLORS.textDark,
                    backgroundColor: '#fff',
                  }}
                />

                <TextInput
                  value={currentDescription}
                  onChangeText={(value) =>
                    setDescriptionMap((prev) => ({
                      ...prev,
                      [item.id]: value,
                    }))
                  }
                  placeholder="Deskripsi nilai"
                  placeholderTextColor="#95a3be"
                  multiline
                  style={{
                    marginTop: 8,
                    borderWidth: 1,
                    borderColor: '#d6e2f7',
                    borderRadius: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 80,
                    textAlignVertical: 'top',
                    color: BRAND_COLORS.textDark,
                    backgroundColor: '#fff',
                  }}
                />

                <Pressable
                  disabled={
                    saveMutation.isPending ||
                    !selectedReportProgram ||
                    !String(currentGrade || '').trim()
                  }
                  onPress={() =>
                    saveMutation.mutate({
                      enrollmentId: item.id,
                      grade: String(currentGrade || '').trim(),
                      description: String(currentDescription || '').trim(),
                    })
                  }
                  style={{
                    marginTop: 10,
                    backgroundColor:
                      saveMutation.isPending || !selectedReportProgram || !String(currentGrade || '').trim()
                        ? '#93c5fd'
                        : BRAND_COLORS.blue,
                    borderRadius: 10,
                    alignItems: 'center',
                    paddingVertical: 10,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Nilai'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        ) : (
          <View
            style={{
              borderRadius: 10,
              borderWidth: 1,
              borderColor: '#cbd5e1',
              borderStyle: 'dashed',
              backgroundColor: '#fff',
              padding: 14,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Data tidak ditemukan</Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada anggota ekskul sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 8,
          backgroundColor: BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
