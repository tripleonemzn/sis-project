import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileTabChip } from '../../../src/components/MobileTabChip';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  AdminSubject,
  AdminSubjectCategory,
  AdminTeacherAssignment,
  AdminTeachingLoadTeacher,
  adminApi,
} from '../../../src/features/admin/adminApi';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type CurriculumSection = 'OVERVIEW' | 'CATEGORIES' | 'SUBJECTS' | 'ASSIGNMENTS' | 'LOAD';

function hasCurriculumDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

const SectionChip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
  <MobileTabChip active={active} label={label} onPress={onPress} compact stacked useAutoIcon minWidth={102} />
);

function SummaryCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 4 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>
    </View>
  );
}

export default function TeacherWakakurCurriculumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [section, setSection] = useState<CurriculumSection>('OVERVIEW');
  const [search, setSearch] = useState('');
  const openCurriculumCrud = (target: 'subject-categories' | 'subjects' | 'teacher-assignments' | 'schedule' | 'teaching-load') => {
    if (target === 'subject-categories' || target === 'subjects') {
      router.push(`/admin/master-data?section=${target}` as never);
      return;
    }
    router.push(`/admin/academic?section=${target}` as never);
  };

  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakakur-curriculum-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const curriculumQuery = useQuery({
    queryKey: ['mobile-wakakur-curriculum-data', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed && !!activeYearQuery.data?.id,
    queryFn: async () => {
      const [categories, subjectsResult, assignmentsResult, teachingLoad] = await Promise.all([
        adminApi.listSubjectCategories(),
        adminApi.listSubjects({ page: 1, limit: 300 }),
        adminApi.listTeacherAssignments({
          academicYearId: Number(activeYearQuery.data?.id),
          page: 1,
          limit: 600,
        }),
        adminApi.getTeachingLoadSummary({
          academicYearId: Number(activeYearQuery.data?.id),
        }),
      ]);

      return {
        categories,
        subjects: subjectsResult.items,
        subjectTotal: subjectsResult.pagination.total,
        assignments: assignmentsResult.items,
        assignmentTotal: assignmentsResult.pagination.total,
        teachingLoad,
      };
    },
  });

  const normalizedSearch = search.trim().toLowerCase();
  const categories = useMemo(() => curriculumQuery.data?.categories || [], [curriculumQuery.data?.categories]);
  const subjects = useMemo(() => curriculumQuery.data?.subjects || [], [curriculumQuery.data?.subjects]);
  const assignments = useMemo(() => curriculumQuery.data?.assignments || [], [curriculumQuery.data?.assignments]);
  const teachingLoad = useMemo(
    () => curriculumQuery.data?.teachingLoad || [],
    [curriculumQuery.data?.teachingLoad],
  );

  const filteredCategories = useMemo(() => {
    if (!normalizedSearch) return categories;
    return categories.filter((item) => {
      const haystacks = [item.code || '', item.name || '', item.description || ''];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [categories, normalizedSearch]);

  const filteredSubjects = useMemo(() => {
    if (!normalizedSearch) return subjects;
    return subjects.filter((item) => {
      const haystacks = [item.code || '', item.name || '', item.category?.name || ''];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [subjects, normalizedSearch]);

  const filteredAssignments = useMemo(() => {
    if (!normalizedSearch) return assignments;
    return assignments.filter((item) => {
      const haystacks = [
        item.teacher?.name || '',
        item.teacher?.username || '',
        item.subject?.name || '',
        item.subject?.code || '',
        item.class?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [assignments, normalizedSearch]);

  const filteredTeachingLoad = useMemo(() => {
    if (!normalizedSearch) return teachingLoad;
    return teachingLoad.filter((item) => {
      const detailText = item.details.map((detail) => `${detail.subjectCode} ${detail.subjectName}`).join(' ');
      const haystacks = [item.teacherName || '', item.teacherUsername || '', detailText];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [teachingLoad, normalizedSearch]);

  const subjectPerCategory = useMemo(() => {
    const counts = new Map<number, number>();
    for (const subject of subjects) {
      const categoryId = subject.category?.id;
      if (!categoryId) continue;
      counts.set(categoryId, (counts.get(categoryId) || 0) + 1);
    }
    return counts;
  }, [subjects]);

  const assignmentPerClass = useMemo(() => {
    const classMap = new Map<string, { className: string; total: number }>();
    for (const assignment of assignments) {
      const className = assignment.class?.name || '-';
      const key = `${assignment.class?.id || className}`;
      const current = classMap.get(key);
      if (current) {
        current.total += 1;
      } else {
        classMap.set(key, { className, total: 1 });
      }
    }
    return Array.from(classMap.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [assignments]);

  const topTeachersByLoad = useMemo(
    () => [...filteredTeachingLoad].sort((a, b) => b.totalHours - a.totalHours).slice(0, 8),
    [filteredTeachingLoad],
  );

  if (isLoading) return <AppLoadingScreen message="Memuat modul kurikulum..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Kelola Kurikulum</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
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

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8, color: BRAND_COLORS.textDark }}>
          Kelola Kurikulum
        </Text>
        <QueryStateView
          type="error"
          message="Akses modul ini membutuhkan tugas tambahan Wakasek Kurikulum atau Sekretaris Kurikulum."
        />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || curriculumQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void curriculumQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e0f2',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Feather name="arrow-left" size={18} color={BRAND_COLORS.textDark} />
        </Pressable>
        <Text style={{ marginLeft: 10, color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700' }}>
          Kelola Kurikulum
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Ringkasan kurikulum, assignment guru, dan beban jam mengajar.
      </Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <SummaryCard
          title="Kategori Mapel"
          value={String(filteredCategories.length)}
          subtitle="Kategori aktif"
        />
        <SummaryCard
          title="Mata Pelajaran"
          value={String(curriculumQuery.data?.subjectTotal || 0)}
          subtitle="Total mapel"
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <SummaryCard
          title="Assignment Guru"
          value={String(curriculumQuery.data?.assignmentTotal || 0)}
          subtitle="Tahun aktif"
        />
        <SummaryCard
          title="Rekap Guru"
          value={String(teachingLoad.length)}
          subtitle="Guru terjadwal"
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#d5e0f5',
          borderRadius: 999,
          paddingHorizontal: 12,
          marginBottom: 12,
        }}
      >
        <Feather name="search" size={16} color={BRAND_COLORS.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari kategori, mapel, assignment, atau guru"
          placeholderTextColor="#94a3b8"
          style={{ flex: 1, color: BRAND_COLORS.textDark, paddingVertical: 10, paddingHorizontal: 10 }}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <SectionChip active={section === 'OVERVIEW'} label="Ringkasan" onPress={() => setSection('OVERVIEW')} />
        <SectionChip active={section === 'CATEGORIES'} label="Kategori" onPress={() => setSection('CATEGORIES')} />
        <SectionChip active={section === 'SUBJECTS'} label="Mapel" onPress={() => setSection('SUBJECTS')} />
        <SectionChip active={section === 'ASSIGNMENTS'} label="Assignment" onPress={() => setSection('ASSIGNMENTS')} />
        <SectionChip active={section === 'LOAD'} label="Jam Mengajar" onPress={() => setSection('LOAD')} />
      </View>

      {curriculumQuery.isLoading ? <QueryStateView type="loading" message="Memuat data kurikulum..." /> : null}
      {curriculumQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data kurikulum." onRetry={() => curriculumQuery.refetch()} />
      ) : null}

      {!curriculumQuery.isLoading && !curriculumQuery.isError ? (
        <>
          {section === 'OVERVIEW' ? (
            <>
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Aksi Cepat</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {[
                    { label: 'Kategori Mapel', onPress: () => setSection('CATEGORIES') },
                    { label: 'Mata Pelajaran', onPress: () => setSection('SUBJECTS') },
                    { label: 'Data KKM', onPress: () => router.push('/teacher/report-subjects' as never) },
                    { label: 'Assignment Guru', onPress: () => setSection('ASSIGNMENTS') },
                    { label: 'Jadwal Pelajaran', onPress: () => router.push('/schedule' as never) },
                    { label: 'Rekap Jam Mengajar', onPress: () => setSection('LOAD') },
                    { label: 'Kelola Kategori (CRUD)', onPress: () => openCurriculumCrud('subject-categories') },
                    { label: 'Kelola Mapel (CRUD)', onPress: () => openCurriculumCrud('subjects') },
                    { label: 'Kelola Assignment (CRUD)', onPress: () => openCurriculumCrud('teacher-assignments') },
                    { label: 'Kelola Jadwal (CRUD)', onPress: () => openCurriculumCrud('schedule') },
                  ].map((item) => (
                    <View key={item.label} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                      <Pressable
                        onPress={item.onPress}
                        style={{
                          borderWidth: 1,
                          borderColor: '#d5e1f5',
                          borderRadius: 10,
                          backgroundColor: '#f8fbff',
                          paddingVertical: 9,
                          paddingHorizontal: 8,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>{item.label}</Text>
                      </Pressable>
                    </View>
                  ))}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Distribusi Assignment per Kelas
                </Text>
                {assignmentPerClass.length > 0 ? (
                  assignmentPerClass.map((item) => (
                    <View
                      key={item.className}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#eef3ff',
                        paddingVertical: 8,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{item.className}</Text>
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>{item.total}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data assignment.</Text>
                )}
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Top Guru Berdasarkan Jam Mengajar
                </Text>
                {topTeachersByLoad.length > 0 ? (
                  topTeachersByLoad.map((item) => (
                    <View
                      key={item.teacherId}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#eef3ff',
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.teacherName}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        @{item.teacherUsername} • Kelas: {item.totalClasses} • Mapel: {item.totalSubjects}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 2 }}>
                        {item.totalHours} jam ({item.totalSessions} sesi)
                      </Text>
                    </View>
                  ))
                ) : (
                  <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data rekap jam mengajar.</Text>
                )}
              </View>
            </>
          ) : null}

          {section === 'CATEGORIES' ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                Kategori Mata Pelajaran
              </Text>
              <Pressable
                onPress={() => openCurriculumCrud('subject-categories')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Kelola Kategori (Tambah/Edit/Hapus)</Text>
              </Pressable>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((item: AdminSubjectCategory) => (
                  <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {item.code} - {item.name}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      Mapel: {subjectPerCategory.get(item.id) || item._count?.subjects || 0}
                    </Text>
                    {item.description ? (
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>{item.description}</Text>
                    ) : null}
                  </View>
                ))
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada kategori sesuai pencarian.</Text>
              )}
            </View>
          ) : null}

          {section === 'SUBJECTS' ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Mata Pelajaran</Text>
              <Pressable
                onPress={() => openCurriculumCrud('subjects')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Kelola Mapel (Tambah/Edit/Hapus)</Text>
              </Pressable>
              {filteredSubjects.length > 0 ? (
                filteredSubjects.map((item: AdminSubject) => {
                  const kkmX = item.kkms?.find((k) => k.classLevel === 'X')?.kkm ?? '-';
                  const kkmXI = item.kkms?.find((k) => k.classLevel === 'XI')?.kkm ?? '-';
                  const kkmXII = item.kkms?.find((k) => k.classLevel === 'XII')?.kkm ?? '-';
                  return (
                    <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {item.code} - {item.name}
                      </Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Kategori: {item.category?.name || '-'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        KKM X/XI/XII: {kkmX} / {kkmXI} / {kkmXII}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada mapel sesuai pencarian.</Text>
              )}
            </View>
          ) : null}

          {section === 'ASSIGNMENTS' ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Assignment Guru</Text>
              <Pressable
                onPress={() => openCurriculumCrud('teacher-assignments')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Kelola Assignment (Tambah/Hapus)</Text>
              </Pressable>
              {filteredAssignments.length > 0 ? (
                filteredAssignments.map((item: AdminTeacherAssignment) => (
                  <View key={item.id} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {item.subject?.code || '-'} - {item.subject?.name || '-'}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {item.class?.name || '-'} • {item.teacher?.name || '-'}
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                      Sesi terjadwal: {item._count?.scheduleEntries || 0}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada assignment sesuai pencarian.</Text>
              )}
            </View>
          ) : null}

          {section === 'LOAD' ? (
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
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                Rekap Jam Mengajar
              </Text>
              <Pressable
                onPress={() => openCurriculumCrud('teaching-load')}
                style={{
                  borderWidth: 1,
                  borderColor: '#93c5fd',
                  borderRadius: 8,
                  backgroundColor: '#eff6ff',
                  paddingVertical: 8,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Buka Modul Jam Mengajar</Text>
              </Pressable>
              {filteredTeachingLoad.length > 0 ? (
                filteredTeachingLoad.map((item: AdminTeachingLoadTeacher) => (
                  <View key={item.teacherId} style={{ borderTopWidth: 1, borderTopColor: '#eef3ff', paddingVertical: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.teacherName}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      @{item.teacherUsername} • Kelas: {item.totalClasses} • Mapel: {item.totalSubjects}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', marginTop: 2 }}>
                      {item.totalHours} jam ({item.totalSessions} sesi)
                    </Text>
                    {item.details.slice(0, 2).map((detail) => (
                      <Text key={`${item.teacherId}-${detail.subjectId}`} style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        {detail.subjectCode} - {detail.subjectName}: {detail.hours} jam
                      </Text>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Tidak ada data rekap sesuai pencarian.</Text>
              )}
            </View>
          ) : null}
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 4,
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
