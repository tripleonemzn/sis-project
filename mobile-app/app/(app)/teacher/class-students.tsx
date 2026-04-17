import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { teacherAssignmentApi } from '../../../src/features/teacherAssignments/teacherAssignmentApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type StudentRow = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  gender?: string | null;
};

function normalizeGender(value: string | null | undefined) {
  const normalized = (value || '').toUpperCase();
  if (normalized === 'MALE' || normalized === 'L') return 'L';
  if (normalized === 'FEMALE' || normalized === 'P') return 'P';
  return '-';
}

export default function TeacherClassStudentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const params = useLocalSearchParams<{ assignmentId?: string; classId?: string }>();
  const [searchQuery, setSearchQuery] = useState('');

  const assignmentId = Number(params.assignmentId || 0);
  const classId = Number(params.classId || 0);

  const classDetailQuery = useQuery({
    queryKey: ['mobile-class-students-class-detail', classId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && Number.isFinite(classId) && classId > 0,
    queryFn: () => adminApi.getClassById(classId),
  });

  const assignmentDetailQuery = useQuery({
    queryKey: ['mobile-class-students-assignment-detail', assignmentId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && Number.isFinite(assignmentId) && assignmentId > 0,
    queryFn: () => teacherAssignmentApi.getById(assignmentId),
  });

  const students = useMemo<StudentRow[]>(() => {
    const fromClass = classDetailQuery.data?.students || [];
    if (fromClass.length > 0) {
      return fromClass.map((item) => ({
        id: item.id,
        name: item.name,
        nis: item.nis || null,
        nisn: item.nisn || null,
        gender: item.gender || null,
      }));
    }

    const fromAssignment = assignmentDetailQuery.data?.class.students || [];
    return fromAssignment.map((item) => ({
      id: item.id,
      name: item.name,
      nis: item.nis || null,
      nisn: item.nisn || null,
      gender: item.gender || null,
    }));
  }, [classDetailQuery.data?.students, assignmentDetailQuery.data?.class.students]);

  const className =
    classDetailQuery.data?.name ||
    assignmentDetailQuery.data?.class.name ||
    (classId > 0 ? `Kelas #${classId}` : '-');
  const majorName =
    classDetailQuery.data?.major?.name ||
    assignmentDetailQuery.data?.class.major?.name ||
    '-';

  const filteredStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return students;
    return students.filter((item) => {
      const haystacks = [item.name || '', item.nis || '', item.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [students, searchQuery]);

  const summary = useMemo(() => {
    const total = students.length;
    const male = students.filter((item) => normalizeGender(item.gender) === 'L').length;
    const female = students.filter((item) => normalizeGender(item.gender) === 'P').length;
    return { total, male, female };
  }, [students]);

  if (isLoading) return <AppLoadingScreen message="Memuat data siswa kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Daftar Siswa Kelas</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!classId && !assignmentId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>Daftar Siswa Kelas</Text>
        <QueryStateView type="error" message="Parameter kelas tidak ditemukan." />
      </ScrollView>
    );
  }

  const isFetching =
    classDetailQuery.isFetching || assignmentDetailQuery.isFetching;
  const isInitialLoading =
    classDetailQuery.isLoading && assignmentDetailQuery.isLoading;
  const hasError =
    classDetailQuery.isError &&
    assignmentDetailQuery.isError;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isInitialLoading}
          onRefresh={async () => {
            await Promise.all([classDetailQuery.refetch(), assignmentDetailQuery.refetch()]);
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>Daftar Siswa Kelas</Text>
      <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        Data siswa untuk kelas {className} {majorName !== '-' ? `(${majorName})` : ''}.
      </Text>

      <View
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: scaleFont(12), marginBottom: 6 }}>
          Ringkasan Kelas
        </Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
              <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11) }}>Total Siswa</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(14) }}>{summary.total}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
              <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11) }}>Laki-laki</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(14) }}>{summary.male}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: 8 }}>
              <Text style={{ color: '#bfdbfe', fontSize: scaleFont(11) }}>Perempuan</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: scaleFont(14) }}>{summary.female}</Text>
            </View>
          </View>
        </View>
      </View>

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Cari siswa (nama / NIS / NISN)"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: scaleFont(14),
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      />

      {isInitialLoading ? <QueryStateView type="loading" message="Memuat daftar siswa..." /> : null}
      {hasError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat daftar siswa kelas."
          onRetry={() => {
            classDetailQuery.refetch();
            assignmentDetailQuery.refetch();
          }}
        />
      ) : null}

      {!isInitialLoading && !hasError ? (
        filteredStudents.length > 0 ? (
          <View>
            {filteredStudents.map((item, index) => (
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
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 5 }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 999,
                      backgroundColor: '#e2e8f0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8,
                    }}
                  >
                    <Text style={{ color: '#334155', fontSize: scaleFont(11), fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                  <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: scaleFont(14), lineHeight: scaleLineHeight(20), flex: 1 }}>
                    {item.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: scaleFont(11),
                      fontWeight: '700',
                      color: '#1d4ed8',
                      backgroundColor: '#eff6ff',
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                    }}
                  >
                    {normalizeGender(item.gender)}
                  </Text>
                </View>
                <Text style={{ color: '#475569', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                  NIS: {item.nis || '-'} • NISN: {item.nisn || '-'}
                </Text>
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
            <Text style={{ fontWeight: '700', fontSize: scaleFont(14), marginBottom: 4, color: '#0f172a' }}>Data siswa tidak ditemukan</Text>
            <Text style={{ color: '#64748b', fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
              Belum ada data siswa yang sesuai dengan pencarian.
            </Text>
          </View>
        )
      ) : null}

      <Pressable
        onPress={() => router.back()}
        style={{
          marginTop: 12,
          backgroundColor: '#1d4ed8',
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
      </Pressable>
    </ScrollView>
  );
}
