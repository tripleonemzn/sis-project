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
import { adminApi, type AdminExamQuestionType } from '../admin/adminApi';
import { useAuth } from '../auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../teacherAssignments/useTeacherAssignmentsQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';

const QUESTION_TYPE_OPTIONS: Array<{ label: string; value: '' | AdminExamQuestionType }> = [
  { label: 'Semua Tipe Soal', value: '' },
  { label: 'Pilihan Ganda', value: 'MULTIPLE_CHOICE' },
  { label: 'PG Kompleks', value: 'COMPLEX_MULTIPLE_CHOICE' },
  { label: 'Benar / Salah', value: 'TRUE_FALSE' },
  { label: 'Esai', value: 'ESSAY' },
];

const SEMESTER_OPTIONS = [
  { label: 'Semua Semester', value: '' },
  { label: 'Semester Ganjil', value: 'ODD' },
  { label: 'Semester Genap', value: 'EVEN' },
];

function getQuestionTypeLabel(value?: string | null) {
  return QUESTION_TYPE_OPTIONS.find((item) => item.value === value)?.label || value || '-';
}

function resolveQuestionMediaProps(mediaUrl?: string | null, mediaType?: string | null) {
  const normalizedUrl = String(mediaUrl || '').trim();
  const normalizedType = String(mediaType || '').trim().toLowerCase();
  if (!normalizedUrl) {
    return {
      imageUrl: null,
      videoUrl: null,
      videoType: null as 'upload' | 'youtube' | null,
    };
  }

  if (normalizedType.includes('youtube')) {
    return { imageUrl: null, videoUrl: normalizedUrl, videoType: 'youtube' as const };
  }
  if (normalizedType.includes('video') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(normalizedUrl)) {
    return { imageUrl: null, videoUrl: normalizedUrl, videoType: 'upload' as const };
  }
  return { imageUrl: normalizedUrl, videoUrl: null, videoType: null as 'upload' | 'youtube' | null };
}

export function TeacherQuestionBankModuleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets, { bottom: 120 });
  const teacherAssignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });

  const [subjectId, setSubjectId] = useState('');
  const [academicYearId, setAcademicYearId] = useState('');
  const [semester, setSemester] = useState('');
  const [type, setType] = useState<'' | AdminExamQuestionType>('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedQuestionId, setExpandedQuestionId] = useState<number | null>(null);

  const subjectOptions = useMemo(() => {
    const uniqueSubjects = new Map<number, { label: string; value: string }>();
    (teacherAssignmentsQuery.data?.assignments || []).forEach((assignment) => {
      if (!uniqueSubjects.has(assignment.subject.id)) {
        uniqueSubjects.set(assignment.subject.id, {
          value: String(assignment.subject.id),
          label: `${assignment.subject.code} - ${assignment.subject.name}`,
        });
      }
    });
    return [{ value: '', label: 'Semua Mapel' }, ...Array.from(uniqueSubjects.values())];
  }, [teacherAssignmentsQuery.data?.assignments]);

  const academicYearsQuery = useQuery({
    queryKey: ['mobile-teacher-question-bank-years', teacherAssignmentsQuery.data?.activeYear?.id],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!teacherAssignmentsQuery.data?.activeYear?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const activeYear = teacherAssignmentsQuery.data?.activeYear;
      try {
        const years = await adminApi.listAcademicYears({ page: 1, limit: 100 });
        if (years.items.length > 0) return years.items;
      } catch {
        // Fallback handled below
      }
      return activeYear ? [activeYear] : [];
    },
  });

  const effectiveAcademicYearId = academicYearId || String(teacherAssignmentsQuery.data?.activeYear?.id || '');
  const academicYearOptions = useMemo(() => {
    const items = academicYearsQuery.data || [];
    if (items.length === 0) return [{ value: '', label: 'Tahun Ajaran Aktif' }];
    return items.map((year) => ({ value: String(year.id), label: year.name }));
  }, [academicYearsQuery.data]);

  const questionsQuery = useQuery({
    queryKey: ['mobile-teacher-question-bank', user?.id, page, subjectId, effectiveAcademicYearId, semester, type, search],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () =>
      adminApi.listExamQuestions({
        page,
        limit: 20,
        subjectId: subjectId ? Number(subjectId) : undefined,
        academicYearId: effectiveAcademicYearId ? Number(effectiveAcademicYearId) : undefined,
        semester: semester === 'ODD' || semester === 'EVEN' ? semester : undefined,
        type: type || undefined,
        search: search.trim() || undefined,
      }),
  });

  const questionItems = questionsQuery.data?.items || [];
  const pagination = questionsQuery.data?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 };
  const totalPages = Math.max(1, Number(pagination.totalPages || 1));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  if (isLoading || teacherAssignmentsQuery.isLoading) return <AppLoadingScreen message="Memuat bank soal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={questionsQuery.isFetching && !questionsQuery.isLoading}
          onRefresh={() => {
            void teacherAssignmentsQuery.refetch();
            void questionsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: '#0f172a' }}>Bank Soal</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Daftar butir soal mengikuti konsep web: filter mapel, tahun ajaran, semester, tipe, lalu buka pratinjau soal yang sebenarnya.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Pressable
          onPress={() => router.push('/teacher/exams' as never)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#bfdbfe',
            backgroundColor: '#eff6ff',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Buka Program Ujian</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/teacher/exams/editor' as never)}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#fff',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#334155', fontWeight: '700', fontSize: 12 }}>Buat Paket Baru</Text>
        </Pressable>
      </View>

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d6e0f2',
          borderRadius: 16,
          padding: 14,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: BRAND_COLORS.textDark, fontSize: 16, fontWeight: '700' }}>Filter Bank Soal</Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: 10 }}>
          Gunakan dropdown seperti di web agar pemilihan filter lebih jelas.
        </Text>

        <MobileSelectField
          label="Mapel"
          value={subjectId}
          options={subjectOptions}
          onChange={(next) => {
            setSubjectId(next);
            setPage(1);
          }}
          placeholder="Pilih mapel"
        />
        <MobileSelectField
          label="Tahun Ajaran"
          value={effectiveAcademicYearId}
          options={academicYearOptions}
          onChange={(next) => {
            setAcademicYearId(next);
            setPage(1);
          }}
          placeholder="Pilih tahun ajaran"
        />
        <MobileSelectField
          label="Semester"
          value={semester}
          options={SEMESTER_OPTIONS}
          onChange={(next) => {
            setSemester(next);
            setPage(1);
          }}
          placeholder="Pilih semester"
        />
        <MobileSelectField
          label="Tipe Soal"
          value={type}
          options={QUESTION_TYPE_OPTIONS}
          onChange={(next) => {
            setType((next as '' | AdminExamQuestionType) || '');
            setPage(1);
          }}
          placeholder="Pilih tipe soal"
        />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
          <TextInput
            value={searchDraft}
            onChangeText={setSearchDraft}
            placeholder="Cari isi soal..."
            placeholderTextColor="#94a3b8"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: '#d5e0f5',
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              color: '#0f172a',
              backgroundColor: '#fff',
            }}
          />
          <Pressable
            onPress={() => {
              setSearch(searchDraft.trim());
              setPage(1);
            }}
            style={{
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 10,
              paddingHorizontal: 14,
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Cari</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Total Soal</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
            {String(pagination.total || 0)}
          </Text>
        </View>
        <View
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            borderRadius: 14,
            padding: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>Halaman</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700', marginTop: 4 }}>
            {currentPage}/{totalPages}
          </Text>
        </View>
      </View>

      {questionsQuery.isLoading ? <QueryStateView type="loading" message="Memuat bank soal..." /> : null}
      {questionsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat bank soal." onRetry={() => questionsQuery.refetch()} />
      ) : null}

      {!questionsQuery.isLoading && !questionsQuery.isError ? (
        questionItems.length > 0 ? (
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#d6e0f2',
              borderRadius: 16,
              padding: 14,
              marginBottom: 12,
            }}
          >
            {questionItems.map((item, index) => {
              const previewText = plainTextFromExamRichText(item.content);
              const isPreviewOpen = expandedQuestionId === item.id;
              const mediaProps = resolveQuestionMediaProps(item.mediaUrl, item.mediaType);
              const questionOptions = Array.isArray(item.options) ? item.options : [];

              return (
                <View
                  key={`teacher-question-bank-${item.id}`}
                  style={{
                    paddingBottom: index === questionItems.length - 1 ? 0 : 12,
                    marginBottom: index === questionItems.length - 1 ? 0 : 12,
                    borderBottomWidth: index === questionItems.length - 1 ? 0 : 1,
                    borderBottomColor: '#eef3ff',
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>
                      #{item.id} • {getQuestionTypeLabel(item.type)}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>{item.points ? `${item.points} poin` : '-'}</Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    {item.bank?.subject?.code || '-'} {item.bank?.subject?.name || '-'} • {item.bank?.academicYear?.name || '-'} •{' '}
                    {item.bank?.semester === 'EVEN' ? 'Genap' : item.bank?.semester === 'ODD' ? 'Ganjil' : '-'}
                  </Text>
                  <Text style={{ color: '#475569', fontSize: 12, marginTop: 6 }}>
                    {previewText.slice(0, 180) || '-'}
                    {previewText.length > 180 ? '...' : ''}
                  </Text>
                  <Pressable
                    onPress={() => setExpandedQuestionId((prev) => (prev === item.id ? null : item.id))}
                    style={{
                      marginTop: 8,
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      backgroundColor: '#f8fbff',
                      borderRadius: 999,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontSize: 12, fontWeight: '700' }}>
                      {isPreviewOpen ? 'Tutup Pratinjau' : 'Lihat Soal'}
                    </Text>
                  </Pressable>

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
                      <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pratinjau Soal</Text>
                      <ExamHtmlContent
                        html={item.content}
                        imageUrl={mediaProps.imageUrl}
                        videoUrl={mediaProps.videoUrl}
                        videoType={mediaProps.videoType}
                        minHeight={72}
                      />

                      {questionOptions.length > 0 ? (
                        <View style={{ marginTop: 10 }}>
                          {questionOptions.map((option, optionIndex) => (
                            <View
                              key={`${item.id}-${option.id || optionIndex}`}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                marginBottom: optionIndex === questionOptions.length - 1 ? 0 : 8,
                              }}
                            >
                              <View
                                style={{
                                  width: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  backgroundColor: option.isCorrect ? '#dcfce7' : '#dbeafe',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  marginRight: 8,
                                  marginTop: 2,
                                }}
                              >
                                <Text
                                  style={{
                                    color: option.isCorrect ? '#166534' : '#1d4ed8',
                                    fontWeight: '700',
                                    fontSize: 11,
                                  }}
                                >
                                  {String.fromCharCode(65 + optionIndex)}
                                </Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <ExamHtmlContent html={option.content} minHeight={36} />
                              </View>
                            </View>
                          ))}
                        </View>
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
            <Text style={{ color: '#334155', textAlign: 'center' }}>Belum ada soal yang cocok dengan filter ini.</Text>
          </View>
        )
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={currentPage <= 1}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            backgroundColor: '#fff',
            opacity: currentPage <= 1 ? 0.5 : 1,
          }}
        >
          <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>Sebelumnya</Text>
        </Pressable>
        <Pressable
          onPress={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={currentPage >= totalPages}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
            backgroundColor: '#fff',
            opacity: currentPage >= totalPages ? 0.5 : 1,
          }}
        >
          <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>Berikutnya</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

export default TeacherQuestionBankModuleScreen;
