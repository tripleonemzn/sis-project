import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { filterRegularTeacherAssignments } from '../../../src/features/teacherAssignments/utils';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

function AssignmentCard({
  item,
  onTakeAttendance,
  onViewStudents,
}: {
  item: {
    id: number;
    kkm: number;
    subject: { name: string; code: string };
    class: { id: number; name: string; major: { name: string; code: string } | null; _count?: { students: number } };
    _count?: { scheduleEntries: number };
  };
  onTakeAttendance: (assignmentId: number) => void;
  onViewStudents: (assignmentId: number, classId: number) => void;
}) {
  return (
    <View
      style={{
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#dbeafe',
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: '#0f172a', flex: 1, paddingRight: 8 }}>
          {item.subject.name}
        </Text>
        <Text
          style={{
            fontSize: 11,
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
          Mata Pelajaran
        </Text>
      </View>
      <Text style={{ color: '#334155', fontWeight: '600', marginBottom: 3 }}>Kelas: {item.class.name}</Text>
      <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
        {item.class.major ? `${item.class.major.name} (${item.class.major.code})` : 'Tanpa kompetensi keahlian'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
        <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 6 }}>
          <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 8 }}>
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Siswa</Text>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.class._count?.students ?? 0}</Text>
          </View>
        </View>
        <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 6 }}>
          <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 8 }}>
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>Jadwal</Text>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item._count?.scheduleEntries ?? 0}</Text>
          </View>
        </View>
        <View style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 6 }}>
          <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 8 }}>
            <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 3 }}>KKM</Text>
            <Text style={{ color: '#0f172a', fontWeight: '700' }}>{item.kkm}</Text>
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => onTakeAttendance(item.id)}
            style={{
              backgroundColor: '#1d4ed8',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 12 }}>Isi Presensi</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <Pressable
            onPress={() => onViewStudents(item.id, item.class.id)}
            style={{
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: '#1d4ed8',
              borderRadius: 9,
              alignItems: 'center',
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Lihat Daftar Siswa</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function TeacherClassesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const pageContentPadding = getStandardPagePadding(insets);

  if (isLoading) return <AppLoadingScreen message="Memuat data kelas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Kelas & Mapel</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: '#1d4ed8',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const assignments = filterRegularTeacherAssignments(assignmentsQuery.data?.assignments || []);
  const totalStudents = assignments.reduce((acc, item) => acc + (item.class._count?.students || 0), 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={assignmentsQuery.isFetching && !assignmentsQuery.isLoading}
          onRefresh={() => assignmentsQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Kelas & Mapel</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Daftar kelas ajar aktif {assignmentsQuery.data?.activeYear?.name ? `(${assignmentsQuery.data.activeYear.name})` : ''}.
      </Text>

      <View
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#bfdbfe', fontSize: 12, marginBottom: 8 }}>Ringkasan Mengajar</Text>
        <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 9, padding: 10 }}>
              <Text style={{ color: '#bfdbfe', fontSize: 11, marginBottom: 3 }}>Total Assignment</Text>
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>{assignments.length}</Text>
            </View>
          </View>
          <View style={{ flex: 1, paddingHorizontal: 4 }}>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 9, padding: 10 }}>
              <Text style={{ color: '#bfdbfe', fontSize: 11, marginBottom: 3 }}>Total Siswa</Text>
              <Text style={{ color: '#ffffff', fontSize: 18, fontWeight: '700' }}>{totalStudents}</Text>
            </View>
          </View>
        </View>
      </View>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil assignment guru..." /> : null}
      {assignmentsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat assignment guru." onRetry={() => assignmentsQuery.refetch()} />
      ) : null}
      {assignmentsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={assignmentsQuery.data.cachedAt} /> : null}

      {!assignmentsQuery.isLoading && !assignmentsQuery.isError ? (
        assignments.length > 0 ? (
          <View>
            {assignments.map((item) => (
              <AssignmentCard
                key={item.id}
                item={item}
                onTakeAttendance={(assignmentId) => router.push(`/teacher/attendance?assignmentId=${assignmentId}` as never)}
                onViewStudents={(assignmentId, classId) =>
                  router.push(`/teacher/class-students?assignmentId=${assignmentId}&classId=${classId}` as never)
                }
              />
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada assignment</Text>
            <Text style={{ color: '#64748b' }}>Penugasan mapel untuk guru ini belum tersedia pada tahun ajaran aktif.</Text>
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
  );
}
