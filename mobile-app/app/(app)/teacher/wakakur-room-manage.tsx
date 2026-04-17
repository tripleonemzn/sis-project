import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { adminApi } from '../../../src/features/admin/adminApi';
import { examApi } from '../../../src/features/exams/examApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type StudentLite = {
  id: number;
  name: string;
  username?: string | null;
  studentClass?: {
    name?: string | null;
  } | null;
  class?: {
    name?: string | null;
  } | null;
};

function parseSittingId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatDateTimeInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - timezoneOffsetMs).toISOString().slice(0, 16);
}

function toIsoString(value: string): string | undefined {
  const normalized = String(value || '').trim();
  if (!normalized) return undefined;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function studentClassName(student?: StudentLite | null): string {
  return String(student?.studentClass?.name || student?.class?.name || '').trim();
}

function roomClassName(student?: StudentLite | null): string {
  const className = studentClassName(student);
  return className || '-';
}

function compareStudents(a: StudentLite, b: StudentLite) {
  const classCompare = roomClassName(a).localeCompare(roomClassName(b), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
  if (classCompare !== 0) return classCompare;
  return String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' });
}

export default function TeacherWakakurRoomManageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sittingId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const sittingId = useMemo(() => parseSittingId(params.sittingId), [params.sittingId]);

  const [roomSearch, setRoomSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [roomName, setRoomName] = useState('');
  const [proctorId, setProctorId] = useState<number | null>(null);
  const [sessionLabel, setSessionLabel] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [studentDirectory, setStudentDirectory] = useState<Record<number, StudentLite>>({});

  const isAllowed = user?.role === 'TEACHER';

  const detailQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-detail', sittingId],
    enabled: isAuthenticated && isAllowed && Boolean(sittingId),
    queryFn: () => examApi.getExamSittingDetail(sittingId!),
  });

  const classesQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-classes'],
    enabled: isAuthenticated && isAllowed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const result = await adminApi.listClasses({ page: 1, limit: 300 });
      return result.items || [];
    },
  });

  const roomsQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-rooms'],
    enabled: isAuthenticated && isAllowed,
    staleTime: 5 * 60 * 1000,
    queryFn: () => examApi.getExamEligibleRooms(),
  });

  const teachersQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-teachers'],
    enabled: isAuthenticated && isAllowed,
    staleTime: 5 * 60 * 1000,
    queryFn: () => adminApi.listUsers({ role: 'TEACHER' }),
  });

  const assignedIdsQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-assigned-students', detailQuery.data?.academicYearId, detailQuery.data?.examType],
    enabled:
      isAuthenticated &&
      isAllowed &&
      Boolean(detailQuery.data?.academicYearId) &&
      Boolean(detailQuery.data?.examType),
    queryFn: () =>
      examApi.getExamSittingAssignedStudentIds({
        academicYearId: detailQuery.data?.academicYearId,
        examType: detailQuery.data?.examType || undefined,
        programCode: detailQuery.data?.examType || undefined,
      }),
  });

  const classStudentsQuery = useQuery({
    queryKey: ['mobile-wakakur-room-manage-class-students', selectedClassId],
    enabled: isAuthenticated && isAllowed && Boolean(selectedClassId),
    queryFn: async () => {
      const rows = await examApi.getStudentsByClass(Number(selectedClassId));
      return rows.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
    },
  });

  useEffect(() => {
    const detail = detailQuery.data;
    if (!detail) return;

    setRoomName(String(detail.roomName || '').trim());
    setProctorId(detail.proctorId ?? null);
    setSessionLabel(String(detail.sessionLabel || '').trim());
    setStartAt(formatDateTimeInput(detail.startTime));
    setEndAt(formatDateTimeInput(detail.endTime));

    const students = Array.isArray(detail.students) ? detail.students : [];
    const ids = students.map((student) => Number(student.id)).filter((id) => Number.isFinite(id) && id > 0);
    setSelectedStudentIds(ids);
    setStudentDirectory(
      students.reduce<Record<number, StudentLite>>((acc, student) => {
        acc[student.id] = {
          id: student.id,
          name: student.name,
          username: student.username,
          studentClass: student.studentClass,
          class: student.class,
        };
        return acc;
      }, {}),
    );
  }, [detailQuery.data]);

  useEffect(() => {
    const rows = classStudentsQuery.data || [];
    if (!rows.length) return;
    setStudentDirectory((prev) => {
      const next = { ...prev };
      rows.forEach((student) => {
        next[student.id] = {
          id: student.id,
          name: student.name,
          username: student.username,
          studentClass: student.studentClass,
          class: student.class,
        };
      });
      return next;
    });
  }, [classStudentsQuery.data]);

  const occupiedStudentIds = useMemo(() => {
    const allAssigned = new Set((assignedIdsQuery.data || []).map((id) => Number(id)));
    selectedStudentIds.forEach((id) => allAssigned.delete(id));
    return allAssigned;
  }, [assignedIdsQuery.data, selectedStudentIds]);

  const classes = useMemo(() => {
    const rows = classesQuery.data || [];
    return [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { numeric: true, sensitivity: 'base' }));
  }, [classesQuery.data]);

  const rooms = useMemo(() => {
    const keyword = roomSearch.trim().toLowerCase();
    const rows = roomsQuery.data || [];
    const filtered = keyword
      ? rows.filter((room) => {
          const haystack = `${room.name || ''} ${room.category?.name || ''} ${room.location || ''}`.toLowerCase();
          return haystack.includes(keyword);
        })
      : rows;
    return [...filtered].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
  }, [roomsQuery.data, roomSearch]);

  const teachers = useMemo(() => {
    const keyword = teacherSearch.trim().toLowerCase();
    const rows = teachersQuery.data || [];
    const filtered = keyword
      ? rows.filter((teacher) => {
          const haystack = `${teacher.name || ''} ${teacher.username || ''}`.toLowerCase();
          return haystack.includes(keyword);
        })
      : rows;
    return filtered.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'id', { sensitivity: 'base' }));
  }, [teacherSearch, teachersQuery.data]);

  const selectedStudents = useMemo(() => {
    const rows = selectedStudentIds
      .map((id) => studentDirectory[id])
      .filter((row): row is StudentLite => Boolean(row));
    return rows.sort(compareStudents);
  }, [selectedStudentIds, studentDirectory]);

  const saveSettingMutation = useMutation({
    mutationFn: async () => {
      if (!sittingId) throw new Error('Sitting tidak valid.');
      if (!roomName.trim()) throw new Error('Ruang ujian wajib dipilih.');

      return examApi.updateExamSitting(sittingId, {
        roomName: roomName.trim(),
        examType: String(detailQuery.data?.examType || '').trim().toUpperCase(),
        programCode: String(detailQuery.data?.examType || '').trim().toUpperCase(),
        academicYearId: detailQuery.data?.academicYearId,
        semester: (detailQuery.data?.semester as 'ODD' | 'EVEN' | null) || undefined,
        sessionId: detailQuery.data?.sessionId ?? null,
        sessionLabel: sessionLabel.trim() || null,
        startTime: toIsoString(startAt),
        endTime: toIsoString(endAt),
        proctorId,
      });
    },
    onSuccess: async () => {
      notifySuccess('Pengaturan ruang ujian berhasil diperbarui.');
      await Promise.all([
        detailQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal memperbarui pengaturan ruang ujian.');
    },
  });

  const saveStudentsMutation = useMutation({
    mutationFn: async () => {
      if (!sittingId) throw new Error('Sitting tidak valid.');
      return examApi.updateExamSittingStudents(sittingId, selectedStudentIds);
    },
    onSuccess: async () => {
      notifySuccess('Komposisi siswa ruang ujian berhasil diperbarui.');
      await Promise.all([
        detailQuery.refetch(),
        assignedIdsQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal memperbarui komposisi siswa.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!sittingId) throw new Error('Sitting tidak valid.');
      return examApi.deleteExamSitting(sittingId);
    },
    onSuccess: async () => {
      notifySuccess('Ruang ujian berhasil dihapus.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] }),
        queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-sittings'] }),
      ]);
      router.back();
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menghapus ruang ujian.');
    },
  });

  const toggleStudent = (student: StudentLite) => {
    const studentId = Number(student.id);
    if (!studentId || Number.isNaN(studentId)) return;

    setSelectedStudentIds((prev) => {
      if (prev.includes(studentId)) {
        return prev.filter((id) => id !== studentId);
      }
      if (occupiedStudentIds.has(studentId)) {
        return prev;
      }
      return [...prev, studentId];
    });

    setStudentDirectory((prev) => ({
      ...prev,
      [studentId]: student,
    }));
  };

  const removeSelectedStudent = (studentId: number) => {
    setSelectedStudentIds((prev) => prev.filter((id) => id !== studentId));
  };

  const askDelete = () => {
    Alert.alert('Hapus Ruang Ujian', 'Ruang ujian ini akan dihapus permanen. Lanjutkan?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  if (isLoading) return <AppLoadingScreen message="Memuat ruang ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!isAllowed) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>
          Kelola Ruang Ujian
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!sittingId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>
          Kelola Ruang Ujian
        </Text>
        <QueryStateView type="error" message="Parameter ruang ujian tidak valid." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            detailQuery.isFetching ||
            classesQuery.isFetching ||
            roomsQuery.isFetching ||
            teachersQuery.isFetching ||
            assignedIdsQuery.isFetching ||
            classStudentsQuery.isFetching
          }
          onRefresh={() => {
            void detailQuery.refetch();
            void classesQuery.refetch();
            void roomsQuery.refetch();
            void teachersQuery.refetch();
            void assignedIdsQuery.refetch();
            if (selectedClassId) {
              void classStudentsQuery.refetch();
            }
          }}
        />
      }
    >
      <Text
        style={{
          fontSize: scaleFont(20),
          lineHeight: scaleLineHeight(28),
          fontWeight: '700',
          color: BRAND_COLORS.textDark,
          marginBottom: 6,
        }}
      >
        Kelola Ruang Ujian
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
        Atur ruang, pengawas, jam sesi, dan komposisi siswa secara penuh.
      </Text>

      {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat detail ruang ujian..." /> : null}
      {detailQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat detail ruang ujian." onRetry={() => detailQuery.refetch()} />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
        <>
          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              {detailQuery.data.roomName} • {String(detailQuery.data.examType || '-')}
            </Text>
            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
              Siswa terpasang: {selectedStudentIds.length} • Session: {detailQuery.data.sessionLabel || '-'}
            </Text>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pengaturan Ruang</Text>

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Cari Ruang
            </Text>
            <TextInput
              value={roomSearch}
              onChangeText={setRoomSearch}
              placeholder="Cari nama ruang..."
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                marginBottom: 8,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
              {rooms.slice(0, 40).map((room) => {
                const selected = String(roomName || '').trim().toLowerCase() === String(room.name || '').trim().toLowerCase();
                return (
                  <View key={room.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setRoomName(String(room.name || '').trim())}
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
                        {room.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}
                      >
                        {room.category?.name || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Cari Pengawas
            </Text>
            <TextInput
              value={teacherSearch}
              onChangeText={setTeacherSearch}
              placeholder="Cari nama/username guru..."
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                marginBottom: 8,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
              {teachers.slice(0, 24).map((teacher) => {
                const selected = Number(proctorId || 0) === Number(teacher.id);
                return (
                  <View key={teacher.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setProctorId(teacher.id)}
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
                        {teacher.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}
                      >
                        {teacher.username || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Label Sesi
            </Text>
            <TextInput
              value={sessionLabel}
              onChangeText={setSessionLabel}
              placeholder="Contoh: SESI 1"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                marginBottom: 8,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Jam Mulai (YYYY-MM-DDTHH:mm)
            </Text>
            <TextInput
              value={startAt}
              onChangeText={setStartAt}
              placeholder="2026-03-09T07:00"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                marginBottom: 8,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Jam Selesai (YYYY-MM-DDTHH:mm)
            </Text>
            <TextInput
              value={endAt}
              onChangeText={setEndAt}
              placeholder="2026-03-09T12:00"
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 9,
                color: BRAND_COLORS.textDark,
                marginBottom: 8,
                fontSize: scaleFont(13),
                lineHeight: scaleLineHeight(20),
              }}
            />

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => saveSettingMutation.mutate()}
                disabled={saveSettingMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  backgroundColor: saveSettingMutation.isPending ? '#93c5fd' : '#2563eb',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {saveSettingMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </Text>
              </Pressable>

              <Pressable
                onPress={askDelete}
                disabled={deleteMutation.isPending}
                style={{
                  flex: 1,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#fecaca',
                  backgroundColor: '#fff1f2',
                  paddingVertical: 10,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>
                  {deleteMutation.isPending ? 'Menghapus...' : 'Hapus Ruang'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Komposisi Siswa</Text>

            <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginBottom: 4 }}>
              Pilih Kelas
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
              {classes.map((classItem) => {
                const selected = Number(selectedClassId || 0) === Number(classItem.id);
                return (
                  <View key={classItem.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setSelectedClassId(classItem.id)}
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
                        {classItem.name}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {selectedClassId ? (
              classStudentsQuery.isLoading ? (
                <QueryStateView type="loading" message="Memuat siswa kelas..." />
              ) : classStudentsQuery.isError ? (
                <QueryStateView type="error" message="Gagal memuat siswa kelas." onRetry={() => classStudentsQuery.refetch()} />
              ) : (
                <View style={{ marginBottom: 10 }}>
                  {(classStudentsQuery.data || []).map((student) => {
                    const selected = selectedStudentIds.includes(student.id);
                    const isOccupied = occupiedStudentIds.has(student.id);
                    return (
                      <Pressable
                        key={student.id}
                        onPress={() => toggleStudent(student)}
                        style={{
                          borderWidth: 1,
                          borderColor: selected ? '#93c5fd' : isOccupied ? '#fecaca' : '#dbe7fb',
                          backgroundColor: selected ? '#eff6ff' : isOccupied ? '#fff1f2' : '#fff',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                          marginBottom: 6,
                          opacity: isOccupied && !selected ? 0.75 : 1,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          {studentClassName(student) || '-'}
                          {isOccupied && !selected ? ' • Sedang dipakai ruang lain' : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>Pilih kelas untuk menampilkan daftar siswa.</Text>
            )}

            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Siswa Terpilih ({selectedStudents.length})</Text>
            {selectedStudents.length > 0 ? (
              selectedStudents.map((student) => (
                <View
                  key={student.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 10,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                    marginBottom: 6,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                      {studentClassName(student) || '-'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => removeSelectedStudent(student.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#fecaca',
                      backgroundColor: '#fff1f2',
                      borderRadius: 8,
                      paddingHorizontal: 8,
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={{ color: '#be123c', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                      Hapus
                    </Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>Belum ada siswa dipilih.</Text>
            )}

            <Pressable
              onPress={() => saveStudentsMutation.mutate()}
              disabled={saveStudentsMutation.isPending}
              style={{
                borderRadius: 10,
                backgroundColor: saveStudentsMutation.isPending ? '#93c5fd' : '#16a34a',
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveStudentsMutation.isPending ? 'Menyimpan...' : 'Simpan Komposisi Siswa'}
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.back()}
            style={{
              backgroundColor: BRAND_COLORS.blue,
              borderRadius: 10,
              paddingVertical: 12,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali</Text>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}
