import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { tutorApi } from '../../../src/features/tutor/tutorApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

type ReportType = 'SBTS' | 'SAS' | 'SAT';
type SemesterType = 'ODD' | 'EVEN';

function getExistingGrade(
  row: Awaited<ReturnType<typeof tutorApi.listMembers>>[number],
  reportType: ReportType,
  semester: SemesterType,
) {
  if (reportType === 'SAS') {
    return { grade: row.gradeSas || '', description: row.descSas || '' };
  }

  if (reportType === 'SAT') {
    return { grade: row.gradeSat || '', description: row.descSat || '' };
  }

  if (semester === 'EVEN') {
    return { grade: row.gradeSbtsEven || '', description: row.descSbtsEven || '' };
  }

  return { grade: row.gradeSbtsOdd || '', description: row.descSbtsOdd || '' };
}

export default function TutorMembersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ ekskulId?: string; academicYearId?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(null);
  const [reportType, setReportType] = useState<ReportType>('SBTS');
  const [semester, setSemester] = useState<SemesterType>('ODD');
  const [gradeMap, setGradeMap] = useState<Record<number, string>>({});
  const [descriptionMap, setDescriptionMap] = useState<Record<number, string>>({});

  const activeYearQuery = useQuery({
    queryKey: ['mobile-tutor-members-active-year'],
    enabled: isAuthenticated && user?.role === 'EXTRACURRICULAR_TUTOR',
    queryFn: () => adminApi.getActiveAcademicYear(),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['mobile-tutor-members-assignments', user?.id, activeYearQuery.data?.id],
    enabled: isAuthenticated && user?.role === 'EXTRACURRICULAR_TUTOR',
    queryFn: () => tutorApi.listAssignments(activeYearQuery.data?.id),
  });

  const assignments = assignmentsQuery.data || [];

  useEffect(() => {
    if (!assignments.length) {
      setSelectedAssignmentId(null);
      return;
    }

    const queryEkskulId = Number(params.ekskulId || 0);
    const queryAcademicYearId = Number(params.academicYearId || 0);

    if (queryEkskulId && queryAcademicYearId) {
      const found = assignments.find(
        (item) => Number(item.ekskulId) === queryEkskulId && Number(item.academicYearId) === queryAcademicYearId,
      );
      if (found) {
        setSelectedAssignmentId(found.id);
        return;
      }
    }

    if (selectedAssignmentId && assignments.some((item) => item.id === selectedAssignmentId)) return;
    setSelectedAssignmentId(assignments[0].id);
  }, [assignments, params.ekskulId, params.academicYearId, selectedAssignmentId]);

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId) || null;

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
        reportType,
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

  if (isLoading) return <AppLoadingScreen message="Memuat anggota ekskul..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'EXTRACURRICULAR_TUTOR') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>Anggota & Nilai</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role pembina ekstrakurikuler." />
      </ScrollView>
    );
  }

  const members = membersQuery.data || [];
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
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>Anggota & Nilai Ekskul</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Input nilai ekstrakurikuler sesuai jenis rapor dan semester.
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
                  onPress={() => setSelectedAssignmentId(item.id)}
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

        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Jenis Penilaian</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 8 }}>
          {(['SBTS', 'SAS', 'SAT'] as ReportType[]).map((item) => {
            const selected = reportType === item;
            return (
              <View key={item} style={{ width: '33.3333%', paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setReportType(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: selected ? '#e9f1ff' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>{item}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Semester</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          {(['ODD', 'EVEN'] as SemesterType[]).map((item) => {
            const selected = semester === item;
            return (
              <View key={item} style={{ width: '50%', paddingHorizontal: 4 }}>
                <Pressable
                  onPress={() => setSemester(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? BRAND_COLORS.blue : '#d6e2f7',
                    backgroundColor: selected ? '#e9f1ff' : '#fff',
                    borderRadius: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
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
            const existing = getExistingGrade(item, reportType, semester);
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
                  disabled={saveMutation.isPending || !String(currentGrade || '').trim()}
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
                      saveMutation.isPending || !String(currentGrade || '').trim()
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
