import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { ExamHtmlContent, plainTextFromExamRichText } from '../../components/ExamHtmlContent';
import { MobileSelectField } from '../../components/MobileSelectField';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { useAuth } from '../auth/AuthProvider';
import { useTeacherExamPacketsQuery } from './useTeacherExamPacketsQuery';
import { useTeacherAssignmentsQuery } from '../teacherAssignments/useTeacherAssignmentsQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { examApi, ExamProgramItem } from './examApi';
import { ExamQuestion, ExamQuestionOption, ExamQuestionType } from './types';

type ExamTypeFilter = 'ALL' | string;
type SemesterFilter = 'ODD' | 'EVEN';
type ExamLabelMap = Record<string, string>;

type TeacherExamPacketsModuleScreenProps = {
  title: string;
  subtitle: string;
  fixedType?: string;
  defaultType?: ExamTypeFilter;
  fixedProgramCode?: string;
};

function normalizeProgramCode(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeClassLevelToken(raw?: string | null): string {
  const value = String(raw || '').trim().toUpperCase();
  if (!value) return '';
  if (value.startsWith('XII')) return 'XII';
  if (value.startsWith('XI')) return 'XI';
  if (value.startsWith('X')) return 'X';
  return value;
}

function normalizeSemester(raw?: string | null): 'ODD' | 'EVEN' | undefined {
  const value = String(raw || '').toUpperCase();
  if (value === 'ODD' || value === 'GANJIL') return 'ODD';
  if (value === 'EVEN' || value === 'GENAP') return 'EVEN';
  return undefined;
}

function semesterLabel(value?: 'ODD' | 'EVEN') {
  if (value === 'EVEN') return 'Genap';
  if (value === 'ODD') return 'Ganjil';
  return '-';
}

function questionCountFromUnknown(questions: unknown): number {
  if (Array.isArray(questions)) return questions.length;
  if (typeof questions === 'string') {
    try {
      const parsed = JSON.parse(questions);
      if (Array.isArray(parsed)) return parsed.length;
    } catch {
      return 0;
    }
  }
  return 0;
}

function parsePacketQuestions(raw: unknown): ExamQuestion[] {
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
      const question = item as Record<string, unknown>;
      const questionId = String(question.id || `q-${idx + 1}`);
      const rawOptions = Array.isArray(question.options) ? question.options : [];
      const options: ExamQuestionOption[] = rawOptions
        .filter((option) => option && typeof option === 'object')
        .map((option, optionIdx) => {
          const data = option as Record<string, unknown>;
          return {
            id: String(data.id || `${questionId}-opt-${optionIdx + 1}`),
            content: typeof data.content === 'string' ? data.content : null,
            option_text: typeof data.option_text === 'string' ? data.option_text : null,
            isCorrect: Boolean(data.isCorrect),
            image_url: typeof data.image_url === 'string' ? data.image_url : null,
            option_image_url: typeof data.option_image_url === 'string' ? data.option_image_url : null,
          };
        });

      return {
        id: questionId,
        content: typeof question.content === 'string' ? question.content : null,
        question_text: typeof question.question_text === 'string' ? question.question_text : null,
        question_image_url: typeof question.question_image_url === 'string' ? question.question_image_url : null,
        image_url: typeof question.image_url === 'string' ? question.image_url : null,
        question_video_url: typeof question.question_video_url === 'string' ? question.question_video_url : null,
        video_url: typeof question.video_url === 'string' ? question.video_url : null,
        question_video_type:
          question.question_video_type === 'youtube' || question.question_video_type === 'upload'
            ? question.question_video_type
            : undefined,
        type: typeof question.type === 'string' ? (question.type as ExamQuestionType) : undefined,
        question_type:
          typeof question.question_type === 'string' ? (question.question_type as ExamQuestionType) : undefined,
        options,
      };
    });
}

function resolveQuestionHtml(question?: ExamQuestion | null) {
  return String(question?.content || question?.question_text || '').trim();
}

function resolveOptionHtml(option?: ExamQuestionOption | null) {
  return String(option?.content || option?.option_text || '').trim();
}

function resolveQuestionTypeLabel(question?: ExamQuestion | null) {
  const type = String(question?.question_type || question?.type || 'MULTIPLE_CHOICE').toUpperCase();
  if (type === 'ESSAY') return 'Esai';
  if (type === 'TRUE_FALSE') return 'Benar / Salah';
  if (type === 'COMPLEX_MULTIPLE_CHOICE') return 'PG Kompleks';
  if (type === 'MATCHING') return 'Menjodohkan';
  return 'Pilihan Ganda';
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function resolveExamTypeLabel(type: string, labels: ExamLabelMap): string {
  const normalized = normalizeProgramCode(type);
  const override = labels[normalized];
  if (!override) return normalized || '-';
  const cleaned = String(override).trim();
  return cleaned || normalized || '-';
}

function isMidtermAliasCode(raw?: string | null): boolean {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(normalized)) return true;
  return normalized.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw?: string | null): boolean {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(normalized)) return true;
  return normalized.includes('FINAL_EVEN');
}

function isFinalOddAliasCode(raw?: string | null): boolean {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(normalized)) return true;
  return normalized.includes('FINAL_ODD');
}

function isFinalAliasCode(raw?: string | null): boolean {
  const normalized = normalizeProgramCode(raw);
  if (!normalized) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_ODD', 'FINAL_EVEN'].includes(normalized)) {
    return true;
  }
  return normalized.includes('FINAL');
}

function matchProgramByBaseTypeHint(program: ExamProgramItem, hint: string, strictSemester = true): boolean {
  const normalizedHint = normalizeProgramCode(hint);
  const baseType = normalizeProgramCode(program.baseTypeCode || program.baseType);
  const fixedSemester = normalizeSemester(program.fixedSemester);

  if (!normalizedHint || !baseType) return false;
  if (isMidtermAliasCode(normalizedHint)) {
    return isMidtermAliasCode(baseType);
  }
  if (isFinalEvenAliasCode(normalizedHint)) {
    if (!isFinalAliasCode(baseType)) return false;
    return strictSemester ? fixedSemester === 'EVEN' || isFinalEvenAliasCode(baseType) : true;
  }
  if (isFinalOddAliasCode(normalizedHint)) {
    if (!isFinalAliasCode(baseType)) return false;
    return strictSemester ? fixedSemester === 'ODD' || isFinalOddAliasCode(baseType) : true;
  }
  if (isFinalAliasCode(normalizedHint)) {
    return isFinalAliasCode(baseType);
  }
  return baseType === normalizedHint;
}

export function TeacherExamPacketsModuleScreen({
  title,
  subtitle,
  fixedType,
  fixedProgramCode,
  defaultType = 'ALL',
}: TeacherExamPacketsModuleScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 120 });
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const assignmentOptions = useMemo(
    () => teacherAssignmentsQuery.data?.assignments || [],
    [teacherAssignmentsQuery.data?.assignments],
  );
  const fixedProgramCodeNormalized = normalizeProgramCode(fixedProgramCode);
  const fixedBaseTypeHint = normalizeProgramCode(fixedType);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [typeFilter, setTypeFilter] = useState<ExamTypeFilter>(fixedProgramCodeNormalized || defaultType);
  const [searchQuery, setSearchQuery] = useState('');
  const [semesterFilter, setSemesterFilter] = useState<SemesterFilter>('ODD');
  const [expandedPacketId, setExpandedPacketId] = useState<number | null>(null);

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-teacher-exam-programs', teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: isAuthenticated && Boolean(teacherAssignmentsQuery.data?.activeYear?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        academicYearId: teacherAssignmentsQuery.data?.activeYear?.id,
        roleContext: 'teacher',
      }),
  });

  const activePrograms = useMemo(
    () =>
      (examProgramsQuery.data?.programs || [])
        .filter((program: ExamProgramItem) => program.isActive && program.showOnTeacherMenu)
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)),
    [examProgramsQuery.data?.programs],
  );

  const lockedProgramCode = useMemo(() => {
    if (fixedProgramCodeNormalized) return fixedProgramCodeNormalized;
    if (!fixedBaseTypeHint) return '';
    const strictMatch = activePrograms.find((program) =>
      matchProgramByBaseTypeHint(program, fixedBaseTypeHint, true),
    );
    const relaxedMatch = activePrograms.find((program) =>
      matchProgramByBaseTypeHint(program, fixedBaseTypeHint, false),
    );
    return normalizeProgramCode((strictMatch || relaxedMatch)?.code);
  }, [activePrograms, fixedBaseTypeHint, fixedProgramCodeNormalized]);

  const effectiveTypeFilter = useMemo(() => {
    if (lockedProgramCode) return lockedProgramCode;
    if (typeFilter === 'ALL') return 'ALL';
    const allowed = new Set(activePrograms.map((program) => normalizeProgramCode(program.code)));
    return allowed.has(typeFilter) ? typeFilter : 'ALL';
  }, [activePrograms, lockedProgramCode, typeFilter]);

  const programMap = useMemo(() => {
    const map = new Map<string, ExamProgramItem>();
    activePrograms.forEach((program) => {
      map.set(normalizeProgramCode(program.code), program);
    });
    return map;
  }, [activePrograms]);

  const examTypeLabels = useMemo<ExamLabelMap>(() => {
    const map: ExamLabelMap = {};
    const programs = activePrograms;

    programs.forEach((program: ExamProgramItem) => {
      const code = normalizeProgramCode(program?.code);
      const label = String(program?.label || '').trim();
      if (!label) return;
      map[code] = label;
    });

    return map;
  }, [activePrograms]);

  const examTypeLabel = (type: string) => resolveExamTypeLabel(type, examTypeLabels);
  const typeFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Program' },
      ...activePrograms.map((program) => ({
        value: normalizeProgramCode(program.code),
        label: resolveExamTypeLabel(program.code, examTypeLabels),
      })),
    ],
    [activePrograms, examTypeLabels],
  );
  const semesterFilterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Ganjil' },
      { value: 'EVEN', label: 'Genap' },
    ],
    [],
  );
  const resolvedTitle = lockedProgramCode ? `Ujian ${examTypeLabel(lockedProgramCode)}` : title;
  const resolvedSubtitle = lockedProgramCode
    ? `Kelola paket ujian ${examTypeLabel(lockedProgramCode)} untuk kelas dan mata pelajaran yang Anda ampu.`
    : subtitle;

  const activeYearSemester = normalizeSemester(teacherAssignmentsQuery.data?.activeYear?.semester);
  const selectedProgramCode =
    effectiveTypeFilter !== 'ALL' ? normalizeProgramCode(effectiveTypeFilter) : '';
  const selectedProgramMeta = selectedProgramCode ? programMap.get(selectedProgramCode) : undefined;
  const allowedSubjectIdsByProgram = useMemo(() => {
    const ids = Array.isArray(selectedProgramMeta?.allowedSubjectIds) ? selectedProgramMeta.allowedSubjectIds : [];
    return new Set(ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
  }, [selectedProgramMeta]);
  const allowedClassLevelsByProgram = useMemo(() => {
    const levels = Array.isArray(selectedProgramMeta?.targetClassLevels) ? selectedProgramMeta.targetClassLevels : [];
    return new Set(
      levels
        .map((level) => normalizeClassLevelToken(level))
        .filter((level) => Boolean(level)),
    );
  }, [selectedProgramMeta]);
  const filteredAssignmentOptions = useMemo(() => {
    if (!selectedProgramMeta) return assignmentOptions;
    return assignmentOptions.filter((item) => {
      const subjectAllowed =
        allowedSubjectIdsByProgram.size === 0 ||
        allowedSubjectIdsByProgram.has(Number(item.subject?.id));
      const assignmentLevel = normalizeClassLevelToken(item.class?.level || item.class?.name);
      const classLevelAllowed =
        allowedClassLevelsByProgram.size === 0 ||
        (assignmentLevel ? allowedClassLevelsByProgram.has(assignmentLevel) : true);
      return subjectAllowed && classLevelAllowed;
    });
  }, [selectedProgramMeta, allowedSubjectIdsByProgram, allowedClassLevelsByProgram, assignmentOptions]);
  const activeSelectedAssignmentId = useMemo(() => {
    if (filteredAssignmentOptions.length === 0) return null;
    if (selectedAssignmentId && filteredAssignmentOptions.some((item) => item.id === selectedAssignmentId)) {
      return selectedAssignmentId;
    }
    return filteredAssignmentOptions[0].id;
  }, [filteredAssignmentOptions, selectedAssignmentId]);
  const selectedAssignment =
    filteredAssignmentOptions.find((item) => item.id === activeSelectedAssignmentId) || null;
  const selectedAssignmentSemester = normalizeSemester(selectedAssignment?.academicYear?.semester);
  const lockedSemester = selectedProgramMeta?.fixedSemester || null;
  const isSemesterLocked = Boolean(lockedSemester);
  const selectedTypeForQuery = selectedProgramMeta?.baseType || undefined;
  const effectiveSemesterFilter = useMemo<SemesterFilter>(() => {
    if (lockedSemester === 'ODD' || lockedSemester === 'EVEN') return lockedSemester;
    if (semesterFilter === 'ODD' || semesterFilter === 'EVEN') return semesterFilter;
    if (activeYearSemester === 'ODD' || activeYearSemester === 'EVEN') return activeYearSemester;
    if (selectedAssignmentSemester === 'ODD' || selectedAssignmentSemester === 'EVEN') return selectedAssignmentSemester;
    return 'ODD';
  }, [activeYearSemester, lockedSemester, selectedAssignmentSemester, semesterFilter]);
  const selectedSemesterForQuery: 'ODD' | 'EVEN' | undefined =
    effectiveSemesterFilter;

  const packetsQuery = useTeacherExamPacketsQuery({
    enabled: isAuthenticated,
    user,
    subjectId: selectedAssignment?.subject.id,
    academicYearId: selectedAssignment?.academicYear.id,
    semester: selectedSemesterForQuery,
    type: selectedTypeForQuery,
    programCode: selectedProgramCode || undefined,
  });
  const createTypeForEditor = selectedProgramCode || '';
  const createEditorPath = createTypeForEditor
    ? (`/teacher/exams/editor?programCode=${encodeURIComponent(createTypeForEditor)}` as const)
    : ('/teacher/exams/editor' as const);

  const filtered = useMemo(() => {
    const rows = packetsQuery.data || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      const type = normalizeProgramCode(item.programCode || item.type);
      const semester = normalizeSemester(item.semester || undefined);
      if (effectiveTypeFilter !== 'ALL' && type !== effectiveTypeFilter) return false;
      if (semester && semester !== selectedSemesterForQuery) return false;
      if (!semester) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.subject.name.toLowerCase().includes(q) ||
        item.subject.code.toLowerCase().includes(q)
      );
    });
  }, [packetsQuery.data, searchQuery, effectiveTypeFilter, selectedSemesterForQuery]);

  const summary = useMemo(() => {
    const rows = filtered;
    const totalQuestions = rows.reduce((acc, item) => acc + questionCountFromUnknown(item.questions), 0);
    const avgDuration = rows.length
      ? Math.round(rows.reduce((acc, item) => acc + (item.duration || 0), 0) / rows.length)
      : 0;
    return {
      totalPackets: rows.length,
      totalQuestions,
      avgDuration,
    };
  }, [filtered]);

  if (isLoading) return <AppLoadingScreen message="Memuat daftar ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={teacherAssignmentsQuery.isFetching || (packetsQuery.isFetching && !packetsQuery.isLoading)}
          onRefresh={async () => {
            await Promise.all([teacherAssignmentsQuery.refetch(), packetsQuery.refetch()]);
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        {resolvedTitle}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>{resolvedSubtitle}</Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Paket</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.totalPackets}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Jumlah Soal</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.totalQuestions}
            </Text>
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 10,
              padding: 10,
            }}
          >
            <Text style={{ color: '#64748b', fontSize: 11 }}>Durasi Rata2</Text>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20, marginTop: 2 }}>
              {summary.avgDuration || 0}
            </Text>
          </View>
        </View>
      </View>

      <Pressable
        onPress={() => router.push(createEditorPath as never)}
        style={{
          backgroundColor: '#16a34a',
          borderRadius: 10,
          paddingVertical: 10,
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Buat Paket Ujian</Text>
      </Pressable>

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
        <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas dan Mata Pelajaran</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
          {filteredAssignmentOptions.map((item) => {
            const selected = activeSelectedAssignmentId === item.id;
            return (
              <View key={item.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setSelectedAssignmentId(item.id)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#0f172a', fontWeight: '700', fontSize: 11 }}>
                    {item.class.name}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 11 }} numberOfLines={2}>
                    {item.subject.name}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
        {filteredAssignmentOptions.length === 0 ? (
          <Text style={{ color: '#b45309', fontSize: 11, marginTop: 4 }}>
            Tidak ada mapel penugasan yang diizinkan untuk program ini.
          </Text>
        ) : null}
      </View>

      <View style={{ marginBottom: 10 }}>
        <Text style={{ color: '#475569', fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Cari Paket Ujian</Text>
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Cari judul ujian..."
          placeholderTextColor="#94a3b8"
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

      {!lockedProgramCode ? (
        <MobileSelectField
          label="Program Ujian"
          value={effectiveTypeFilter}
          options={typeFilterOptions}
          onChange={(next) => setTypeFilter((next as ExamTypeFilter) || 'ALL')}
          placeholder="Pilih program ujian"
        />
      ) : (
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
              Filter Tetap: {examTypeLabel(lockedProgramCode)}
            </Text>
          </View>
        </View>
      )}

      {isSemesterLocked ? (
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#dbeafe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
              Semester Tetap: {lockedSemester === 'ODD' ? 'Ganjil' : 'Genap'} (sesuai program ujian)
            </Text>
          </View>
        </View>
      ) : (
        <MobileSelectField
          label="Semester Paket"
          value={effectiveSemesterFilter}
          options={semesterFilterOptions}
          onChange={(next) => setSemesterFilter(next === 'EVEN' ? 'EVEN' : 'ODD')}
          placeholder="Pilih semester"
          helperText={`Semester aktif: ${semesterLabel(effectiveSemesterFilter)}`}
        />
      )}

      {teacherAssignmentsQuery.isLoading || packetsQuery.isLoading ? (
        <QueryStateView type="loading" message="Memuat daftar ujian..." />
      ) : null}
      {teacherAssignmentsQuery.isError || packetsQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat daftar ujian guru."
          onRetry={() => {
            teacherAssignmentsQuery.refetch();
            packetsQuery.refetch();
          }}
        />
      ) : null}

      {!teacherAssignmentsQuery.isLoading &&
      !packetsQuery.isLoading &&
      !teacherAssignmentsQuery.isError &&
      !packetsQuery.isError ? (
        filtered.length > 0 ? (
          <View>
            {filtered.map((item) => {
              const type = normalizeProgramCode(item.programCode || item.type);
              const qCount = questionCountFromUnknown(item.questions);
              const parsedQuestions = parsePacketQuestions(item.questions);
              const firstQuestion = parsedQuestions[0] || null;
              const firstQuestionPreview = plainTextFromExamRichText(resolveQuestionHtml(firstQuestion));
              const isPreviewOpen = expandedPacketId === item.id;
              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>{item.title}</Text>
                    <Text
                      style={{
                        color: '#1d4ed8',
                        backgroundColor: '#eff6ff',
                        borderWidth: 1,
                        borderColor: '#bfdbfe',
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {examTypeLabel(type)}
                    </Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                    {item.subject.name} • Semester {item.semester || '-'}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 2 }}>
                    Durasi: {item.duration} menit • Soal: {qCount}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 11, marginBottom: 4 }} numberOfLines={2}>
                    {firstQuestionPreview
                      ? `Preview soal: ${firstQuestionPreview}`
                      : 'Preview soal belum tersedia. Buka pratinjau untuk melihat isi bank soal.'}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 8 }}>
                    Dibuat: {formatDate(item.createdAt)}
                  </Text>
                  <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <Pressable
                        onPress={() => router.push(`/teacher/exams/editor?packetId=${item.id}` as never)}
                        style={{
                          backgroundColor: '#1d4ed8',
                          borderRadius: 8,
                          paddingVertical: 8,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>Edit Paket</Text>
                      </Pressable>
                    </View>
                    <View style={{ flex: 1, paddingHorizontal: 4 }}>
                      <Pressable
                        onPress={() =>
                          router.push(
                            `/teacher/exams-analysis?packetId=${item.id}&title=${encodeURIComponent(item.title)}` as never,
                          )
                        }
                        style={{
                          borderWidth: 1,
                          borderColor: '#a7f3d0',
                          backgroundColor: '#ecfdf5',
                          borderRadius: 8,
                          paddingVertical: 8,
                          alignItems: 'center',
                        }}
                      >
                        <Text style={{ color: '#047857', fontWeight: '700', fontSize: 12 }}>Analisis</Text>
                      </Pressable>
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() =>
                            router.push(
                              `/teacher/exams-submissions?packetId=${item.id}&title=${encodeURIComponent(item.title)}` as never,
                            )
                          }
                          style={{
                            borderWidth: 1,
                            borderColor: '#ddd6fe',
                            backgroundColor: '#f5f3ff',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#6d28d9', fontWeight: '700', fontSize: 12 }}>Submisi</Text>
                        </Pressable>
                      </View>
                      <View style={{ flex: 1, paddingHorizontal: 4 }}>
                        <Pressable
                          onPress={() => setExpandedPacketId((prev) => (prev === item.id ? null : item.id))}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            backgroundColor: '#f8fbff',
                            borderRadius: 8,
                            paddingVertical: 8,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                            {isPreviewOpen ? 'Tutup Pratinjau' : 'Lihat Pratinjau'}
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                  {isPreviewOpen ? (
                    <View
                      style={{
                        marginTop: 10,
                        borderWidth: 1,
                        borderColor: '#dbeafe',
                        backgroundColor: '#f8fbff',
                        borderRadius: 12,
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>
                        Pratinjau Soal Mobile
                      </Text>
                      {parsedQuestions.length > 0 ? (
                        parsedQuestions.slice(0, 2).map((question, questionIndex) => (
                          <View
                            key={`${item.id}-${question.id}`}
                            style={{
                              borderWidth: 1,
                              borderColor: '#dbe7fb',
                              borderRadius: 10,
                              backgroundColor: '#fff',
                              padding: 10,
                              marginBottom: questionIndex === Math.min(parsedQuestions.length, 2) - 1 ? 0 : 8,
                            }}
                          >
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                              <Text style={{ color: '#0f172a', fontWeight: '700' }}>Soal {questionIndex + 1}</Text>
                              <Text style={{ color: '#64748b', fontSize: 11 }}>{resolveQuestionTypeLabel(question)}</Text>
                            </View>
                            <ExamHtmlContent
                              html={resolveQuestionHtml(question)}
                              imageUrl={question.question_image_url || question.image_url}
                              videoUrl={question.question_video_url || question.video_url}
                              videoType={question.question_video_type}
                              minHeight={76}
                            />
                            {Array.isArray(question.options) && question.options.length > 0 ? (
                              <View style={{ marginTop: 10 }}>
                                {question.options.slice(0, 5).map((option, optionIndex) => {
                                  const optionHtml = resolveOptionHtml(option);
                                  return (
                                    <View
                                      key={option.id}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'flex-start',
                                        marginBottom: optionIndex === Math.min(question.options?.length || 0, 5) - 1 ? 0 : 8,
                                      }}
                                    >
                                      <View
                                        style={{
                                          width: 22,
                                          height: 22,
                                          borderRadius: 999,
                                          backgroundColor: '#dbeafe',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          marginRight: 8,
                                          marginTop: 2,
                                        }}
                                      >
                                        <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 11 }}>
                                          {String.fromCharCode(65 + optionIndex)}
                                        </Text>
                                      </View>
                                      <View style={{ flex: 1 }}>
                                        <ExamHtmlContent
                                          html={optionHtml}
                                          imageUrl={option.option_image_url || option.image_url}
                                          minHeight={40}
                                        />
                                      </View>
                                    </View>
                                  );
                                })}
                              </View>
                            ) : (
                              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                                Soal ini tidak memiliki opsi jawaban pilihan ganda.
                              </Text>
                            )}
                          </View>
                        ))
                      ) : (
                        <Text style={{ color: '#64748b', fontSize: 12 }}>
                          Isi soal belum dapat dibaca dari data paket ini.
                        </Text>
                      )}
                      {parsedQuestions.length > 2 ? (
                        <Text style={{ color: '#475569', fontSize: 12, marginTop: 8 }}>
                          + {parsedQuestions.length - 2} soal lain tersedia di paket ini.
                        </Text>
                      ) : null}
                    </View>
                  ) : null}
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
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>Belum ada paket ujian</Text>
            <Text style={{ color: '#64748b' }}>Belum ada data paket sesuai filter saat ini.</Text>
          </View>
        )
      ) : null}

    </ScrollView>
  );
}
