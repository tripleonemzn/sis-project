import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi, AdminUser } from '../../../src/features/admin/adminApi';
import { useExaminerSchemesQuery } from '../../../src/features/examiner/useExaminerSchemesQuery';
import { useExaminerAssessmentsQuery } from '../../../src/features/examiner/useExaminerAssessmentsQuery';
import { examinerApi } from '../../../src/features/examiner/examinerApi';
import { ExaminerSchemeCriteria } from '../../../src/features/examiner/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { scaleWithAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type ScoreMap = Record<number, Record<string, number>>;
type StudentClassWithLevel = NonNullable<AdminUser['studentClass']> & { level?: string | null };

function parseSchemeId(raw?: string | string[]) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeKey(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function isGradeTwelve(studentClass: AdminUser['studentClass'] | null | undefined) {
  const classWithLevel = studentClass as StudentClassWithLevel | null | undefined;
  const level = normalizeKey(classWithLevel?.level || '');
  const className = normalizeKey(studentClass?.name);
  return level === 'XII' || level === '12' || className.startsWith('XII') || className.startsWith('12');
}

function criteriaKey(criteria: ExaminerSchemeCriteria) {
  if (criteria.id !== undefined && criteria.id !== null) return String(criteria.id);
  return `${criteria.group || 'Umum'}::${criteria.name}`;
}

function toFiniteScore(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickExistingScore(source: Record<string, unknown>, criteria: ExaminerSchemeCriteria) {
  const groupName = String(criteria.group || 'Umum').trim() || 'Umum';
  const candidateKeys = [
    criteriaKey(criteria),
    `${groupName}::${criteria.name}`,
    criteria.name,
    ...(Array.isArray(criteria.aliases) ? criteria.aliases : []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  const inspectedKeys = new Set<string>();
  for (const key of candidateKeys) {
    if (inspectedKeys.has(key)) continue;
    inspectedKeys.add(key);
    const parsed = toFiniteScore(source[key]);
    if (parsed !== null) return parsed;
  }

  const normalizedTargets = new Set(candidateKeys.map((item) => normalizeKey(item)));
  for (const [rawKey, rawValue] of Object.entries(source)) {
    if (!normalizedTargets.has(normalizeKey(rawKey))) continue;
    const parsed = toFiniteScore(rawValue);
    if (parsed !== null) return parsed;
  }

  return 0;
}

export default function ExaminerAssessmentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ schemeId?: string | string[] }>();
  const schemeId = parseSchemeId(params.schemeId);
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 140 });

  const [search, setSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string>('ALL');
  const [allScores, setAllScores] = useState<ScoreMap>({});
  const [changedStudentIds, setChangedStudentIds] = useState<Set<number>>(new Set());

  const isExaminer = user?.role === 'EXAMINER';

  const schemesQuery = useExaminerSchemesQuery({ enabled: isAuthenticated, user });

  const schemeDetailQuery = useQuery({
    queryKey: ['mobile-examiner-scheme-detail', schemeId],
    enabled: isAuthenticated && isExaminer && !!schemeId,
    queryFn: async () => examinerApi.getSchemeDetail(Number(schemeId)),
  });

  const selectedSchemeAcademicYearId = useMemo(() => {
    const value = Number(
      schemeDetailQuery.data?.academicYearId || schemeDetailQuery.data?.academicYear?.id || 0,
    );
    if (!Number.isFinite(value) || value <= 0) return undefined;
    return value;
  }, [schemeDetailQuery.data?.academicYearId, schemeDetailQuery.data?.academicYear?.id]);

  const assessmentsQuery = useExaminerAssessmentsQuery({
    enabled: isAuthenticated && !!schemeId,
    user,
    academicYearId: selectedSchemeAcademicYearId,
  });

  const studentsQuery = useQuery({
    queryKey: ['mobile-examiner-assessment-students', schemeId],
    enabled: isAuthenticated && isExaminer && !!schemeId,
    queryFn: async () => adminApi.listUsers({ role: 'STUDENT' }),
  });

  const criteria = useMemo(() => {
    const rows = schemeDetailQuery.data?.criteria;
    return Array.isArray(rows) ? rows : [];
  }, [schemeDetailQuery.data?.criteria]);

  const groupedCriteria = useMemo(() => {
    const groups = new Map<string, ExaminerSchemeCriteria[]>();
    for (const item of criteria) {
      const groupName = (item.group || 'Umum').trim() || 'Umum';
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName)!.push(item);
    }
    return Array.from(groups.entries());
  }, [criteria]);

  const targetMajorId =
    user?.examinerMajor?.id || schemeDetailQuery.data?.majorId || schemeDetailQuery.data?.major?.id || null;

  const students = useMemo(() => {
    const rows = studentsQuery.data || [];
    return rows.filter((student) => {
      if (!student.studentClass) return false;
      if (!isGradeTwelve(student.studentClass)) return false;
      if (targetMajorId) {
        const studentMajorId = student.studentClass?.major?.id || null;
        if (!studentMajorId || Number(studentMajorId) !== Number(targetMajorId)) return false;
      }
      return true;
    });
  }, [studentsQuery.data, targetMajorId]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const student of students) {
      const classId = student.studentClass?.id;
      const className = student.studentClass?.name;
      if (!classId || !className) continue;
      map.set(String(classId), className);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      if (selectedClassId !== 'ALL' && String(student.studentClass?.id || '') !== selectedClassId) return false;
      if (!query) return true;
      const haystacks = [
        student.name || '',
        student.nis || '',
        student.nisn || '',
        student.studentClass?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [students, search, selectedClassId]);

  useEffect(() => {
    const timerId = setTimeout(() => {
      setAllScores({});
      setChangedStudentIds(new Set());
    }, 0);
    return () => clearTimeout(timerId);
  }, [schemeId]);

  useEffect(() => {
    if (!schemeId || !schemeDetailQuery.data) return;
    if (assessmentsQuery.isLoading) return;
    if (changedStudentIds.size > 0) return;

    const existingAssessments = assessmentsQuery.data?.assessments || [];
    const subjectId = Number(schemeDetailQuery.data.subjectId || schemeDetailQuery.data.subject?.id || 0);
    const academicYearId = Number(
      schemeDetailQuery.data.academicYearId || schemeDetailQuery.data.academicYear?.id || 0,
    );
    const seededScores: ScoreMap = {};

    for (const assessment of existingAssessments) {
      if (subjectId > 0 && Number(assessment.subjectId) !== subjectId) continue;
      if (academicYearId > 0 && Number(assessment.academicYearId) !== academicYearId) continue;
      const source =
        assessment.scores && typeof assessment.scores === 'object'
          ? (assessment.scores as Record<string, unknown>)
          : {};
      const studentScore: Record<string, number> = {};
      for (const item of criteria) {
        studentScore[criteriaKey(item)] = pickExistingScore(source, item);
      }
      seededScores[assessment.studentId] = studentScore;
    }

    const timerId = setTimeout(() => {
      setAllScores(seededScores);
    }, 0);
    return () => clearTimeout(timerId);
  }, [
    schemeId,
    schemeDetailQuery.data,
    assessmentsQuery.data?.assessments,
    assessmentsQuery.isLoading,
    changedStudentIds.size,
    criteria,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!schemeDetailQuery.data) throw new Error('Skema tidak ditemukan.');
      if (!criteria.length) throw new Error('Komponen penilaian belum tersedia.');
      const targetIds = Array.from(changedStudentIds);
      if (!targetIds.length) return 0;

      const subjectId = Number(schemeDetailQuery.data.subjectId || schemeDetailQuery.data.subject?.id || 0);
      const academicYearId = Number(
        schemeDetailQuery.data.academicYearId ||
          schemeDetailQuery.data.academicYear?.id ||
          schemesQuery.data?.activeYear?.id ||
          0,
      );

      if (!subjectId || !academicYearId) {
        throw new Error('Data skema tidak valid. Subject/tahun ajaran belum tersedia.');
      }

      for (const studentId of targetIds) {
        const source = allScores[studentId] || {};
        const cleanScores: Record<string, number> = {};
        let total = 0;

        for (const item of criteria) {
          const key = criteriaKey(item);
          const score = Math.max(0, Math.min(Number(item.maxScore || 0), Number(source[key] || 0)));
          cleanScores[key] = score;
          total += score;
        }

        const maxTotal = criteria.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);
        const finalScore = maxTotal > 0 ? Number(((total / maxTotal) * 100).toFixed(2)) : 0;

        await examinerApi.upsertAssessment({
          studentId,
          subjectId,
          academicYearId,
          criteria,
          scores: cleanScores,
          finalScore,
        });
      }

      return targetIds.length;
    },
    onSuccess: async (savedCount) => {
      if (!savedCount) return;
      setChangedStudentIds(new Set());
      notifySuccess(`Nilai berhasil disimpan untuk ${savedCount} siswa.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-examiner-assessments', user?.id] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-examiner-scheme-detail', schemeId] }),
      ]);
      await assessmentsQuery.refetch();
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal menyimpan nilai UKK.');
    },
  });

  if (isLoading) return <AppLoadingScreen message="Memuat penilaian UKK..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!isExaminer) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Penilaian UKK</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role penguji." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const refreshSelectionPage = () => {
    void schemesQuery.refetch();
  };

  const refreshAssessmentPage = () => {
    void schemeDetailQuery.refetch();
    void studentsQuery.refetch();
    void assessmentsQuery.refetch();
  };

  if (!schemeId) {
    const schemes = schemesQuery.data?.schemes || [];

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pagePadding}
        refreshControl={
          <RefreshControl
            refreshing={schemesQuery.isFetching && !schemesQuery.isLoading}
            onRefresh={refreshSelectionPage}
          />
        }
      >
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Penilaian UKK
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Pilih skema untuk mulai input nilai siswa.
        </Text>

        {schemesQuery.isLoading ? <QueryStateView type="loading" message="Mengambil daftar skema..." /> : null}
        {schemesQuery.isError ? (
          <QueryStateView
            type="error"
            message="Gagal memuat daftar skema."
            onRetry={refreshSelectionPage}
          />
        ) : null}
        {schemesQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={schemesQuery.data.cachedAt} /> : null}

        {!schemesQuery.isLoading && !schemesQuery.isError ? (
          schemes.length > 0 ? (
            <View>
              {schemes.map((scheme) => (
                <Pressable
                  key={scheme.id}
                  onPress={() => router.push(`/examiner/assessment?schemeId=${scheme.id}` as never)}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(16) }}>
                    {scheme.name}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 3 }}>
                    Jurusan: {scheme.major?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
                    Mapel: {scheme.subject?.name || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 8 }}>
                    Mulai Penilaian
                  </Text>
                </Pressable>
              ))}
            </View>
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
                Belum ada skema
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Skema UKK belum tersedia untuk penguji ini pada tahun ajaran aktif.
              </Text>
            </View>
          )
        ) : null}

        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 10,
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

  const selectedScheme = schemeDetailQuery.data;
  const selectedSchemeName = selectedScheme?.name || `Skema #${schemeId}`;
  const subjectName = selectedScheme?.subject?.name || '-';
  const majorName = selectedScheme?.major?.name || '-';
  const maxTotalScore = criteria.reduce((sum, item) => sum + Number(item.maxScore || 0), 0);

  const getScore = (studentId: number, item: ExaminerSchemeCriteria) =>
    Number(allScores[studentId]?.[criteriaKey(item)] || 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={schemeDetailQuery.isFetching || studentsQuery.isFetching || assessmentsQuery.isFetching}
          onRefresh={refreshAssessmentPage}
        />
      }
    >
      <Pressable
        onPress={() => router.replace('/examiner/assessment' as never)}
        style={{
          alignSelf: 'flex-start',
          borderWidth: 1,
          borderColor: '#d5e1f5',
          borderRadius: 999,
          paddingHorizontal: 12,
          paddingVertical: 7,
          backgroundColor: '#fff',
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Feather name="arrow-left" size={14} color={BRAND_COLORS.textMuted} />
        <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: scaleWithAppTextScale(12) }}>Daftar Skema</Text>
      </Pressable>

      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        {selectedSchemeName}
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        {majorName} • {subjectName}
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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Filter Siswa</Text>
        <View
          style={{
            borderRadius: 999,
            borderWidth: 1,
            borderColor: '#d6e2f7',
            paddingHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#fff',
          }}
        >
          <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari nama / NIS / kelas"
            placeholderTextColor="#95a3be"
            style={{
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 8,
              color: BRAND_COLORS.textDark,
            }}
          />
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
          <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <Pressable
              onPress={() => setSelectedClassId('ALL')}
              style={{
                borderWidth: 1,
                borderColor: selectedClassId === 'ALL' ? BRAND_COLORS.blue : '#d6e2f7',
                backgroundColor: selectedClassId === 'ALL' ? '#e9f1ff' : '#fff',
                borderRadius: 9,
                paddingVertical: 8,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: selectedClassId === 'ALL' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                Semua Kelas
              </Text>
            </Pressable>
          </View>
          {classOptions.map((option) => (
            <View key={option.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setSelectedClassId(option.id)}
                style={{
                  borderWidth: 1,
                  borderColor: selectedClassId === option.id ? BRAND_COLORS.blue : '#d6e2f7',
                  backgroundColor: selectedClassId === option.id ? '#e9f1ff' : '#fff',
                  borderRadius: 9,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{ color: selectedClassId === option.id ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}
                >
                  {option.name}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
          Siswa terfilter: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{filteredStudents.length}</Text> • Maks total skor:{' '}
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{maxTotalScore}</Text>
        </Text>
      </View>

      {schemeDetailQuery.isLoading ? <QueryStateView type="loading" message="Memuat detail skema..." /> : null}
      {schemeDetailQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat detail skema." onRetry={refreshAssessmentPage} />
      ) : null}
      {studentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat data siswa..." /> : null}
      {studentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data siswa." onRetry={refreshAssessmentPage} />
      ) : null}
      {assessmentsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={assessmentsQuery.data.cachedAt} /> : null}

      {!schemeDetailQuery.isLoading && !studentsQuery.isLoading && !schemeDetailQuery.isError && !studentsQuery.isError ? (
        criteria.length > 0 ? (
          filteredStudents.length > 0 ? (
            filteredStudents.map((student) => {
              const studentTotal = criteria.reduce((sum, item) => sum + getScore(student.id, item), 0);
              const finalScore = maxTotalScore > 0 ? Number(((studentTotal / maxTotalScore) * 100).toFixed(2)) : 0;
              const isChanged = changedStudentIds.has(student.id);

              return (
                <View
                  key={student.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: isChanged ? '#93c5fd' : '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>{student.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 2 }}>
                    {student.studentClass?.name || '-'} • NIS: {student.nis || '-'}
                  </Text>

                  <View style={{ marginTop: 10 }}>
                    {groupedCriteria.map(([groupName, items]) => (
                      <View key={`${student.id}-${groupName}`} style={{ marginBottom: 10 }}>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginBottom: 6 }}>{groupName}</Text>
                        {items.map((item, index) => (
                          <View
                            key={`${student.id}-${groupName}-${index}`}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              marginBottom: 8,
                              gap: 8,
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.name}</Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(11) }}>
                                Maks: {item.maxScore}
                              </Text>
                            </View>
                            <TextInput
                              value={String(getScore(student.id, item))}
                              keyboardType="numeric"
                              onChangeText={(raw) => {
                                const normalized = raw.replace(',', '.');
                                const parsed = Number(normalized);
                                const safe = Number.isFinite(parsed) ? parsed : 0;
                                const maxScore = Number(item.maxScore || 0);
                                const clamped = Math.max(0, Math.min(maxScore, safe));
                                const key = criteriaKey(item);
                                setAllScores((prev) => ({
                                  ...prev,
                                  [student.id]: {
                                    ...(prev[student.id] || {}),
                                    [key]: clamped,
                                  },
                                }));
                                setChangedStudentIds((prev) => {
                                  const next = new Set(prev);
                                  next.add(student.id);
                                  return next;
                                });
                              }}
                              style={{
                                width: 74,
                                borderWidth: 1,
                                borderColor: '#cbd5e1',
                                borderRadius: 8,
                                paddingVertical: 8,
                                paddingHorizontal: 8,
                                textAlign: 'center',
                                color: BRAND_COLORS.textDark,
                                backgroundColor: '#fff',
                                fontWeight: '700',
                              }}
                            />
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>

                  <View
                    style={{
                      marginTop: 2,
                      borderTopWidth: 1,
                      borderTopColor: '#e2e8f0',
                      paddingTop: 8,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ color: BRAND_COLORS.textMuted }}>
                      Total: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{studentTotal}</Text>
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted }}>
                      Nilai Akhir:{' '}
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{finalScore}</Text>
                    </Text>
                  </View>
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
                Tidak ada siswa
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted }}>
                Tidak ada siswa yang sesuai filter jurusan/kelas/pencarian.
              </Text>
            </View>
          )
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Komponen penilaian kosong
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted }}>
              Skema ini belum memiliki komponen kriteria penilaian.
            </Text>
          </View>
        )
      ) : null}

      <Pressable
        disabled={changedStudentIds.size === 0 || saveMutation.isPending || !criteria.length}
        onPress={() => saveMutation.mutate()}
        style={{
          marginTop: 8,
          backgroundColor: changedStudentIds.size === 0 || saveMutation.isPending || !criteria.length ? '#93c5fd' : BRAND_COLORS.blue,
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <Feather name={saveMutation.isPending ? 'loader' : 'save'} size={16} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '700' }}>
          {saveMutation.isPending
            ? 'Menyimpan Nilai...'
            : `Simpan Nilai (${changedStudentIds.size})`}
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 10,
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
