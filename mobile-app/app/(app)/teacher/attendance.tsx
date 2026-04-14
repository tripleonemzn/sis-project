import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { useTeacherAssignmentsQuery } from '../../../src/features/teacherAssignments/useTeacherAssignmentsQuery';
import { teacherAssignmentApi } from '../../../src/features/teacherAssignments/teacherAssignmentApi';
import {
  buildTeacherAssignmentOptionLabel,
  filterRegularTeacherAssignments,
} from '../../../src/features/teacherAssignments/utils';
import { attendanceApi } from '../../../src/features/attendance/attendanceApi';
import { TeacherAttendanceStatus } from '../../../src/features/attendance/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type StatusConfig = {
  value: TeacherAttendanceStatus;
  label: string;
  shortLabel: string;
  iconName: React.ComponentProps<typeof Feather>['name'];
  bg: string;
  border: string;
  text: string;
};

const STATUS_OPTIONS: StatusConfig[] = [
  { value: 'PRESENT', label: 'Hadir', shortLabel: 'H', iconName: 'check', bg: '#dcfce7', border: '#86efac', text: '#166534' },
  { value: 'SICK', label: 'Sakit', shortLabel: 'S', iconName: 'activity', bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8' },
  { value: 'PERMISSION', label: 'Izin', shortLabel: 'I', iconName: 'file-text', bg: '#ffedd5', border: '#fdba74', text: '#9a3412' },
  { value: 'ABSENT', label: 'Alpha', shortLabel: 'A', iconName: 'x', bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  { value: 'LATE', label: 'Telat', shortLabel: 'T', iconName: 'clock', bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
];

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLongDate(date: Date) {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function TeacherAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string }>();
  const initialAssignmentId = params.assignmentId ? Number(params.assignmentId) : null;
  const { isAuthenticated, isLoading, user } = useAuth();
  const pageContentPadding = getStandardPagePadding(insets);
  const assignmentsQuery = useTeacherAssignmentsQuery({ enabled: isAuthenticated, user });
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<number | null>(
    Number.isFinite(initialAssignmentId || NaN) ? initialAssignmentId : null,
  );
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [draftOverrides, setDraftOverrides] = useState<Record<number, TeacherAttendanceStatus>>({});
  const [search, setSearch] = useState('');

  const assignments = useMemo(
    () => filterRegularTeacherAssignments(assignmentsQuery.data?.assignments || []),
    [assignmentsQuery.data?.assignments],
  );
  const effectiveSelectedAssignmentId = selectedAssignmentId ?? assignments[0]?.id ?? null;
  const selectedAssignment = assignments.find((item) => item.id === effectiveSelectedAssignmentId) || null;
  const assignmentOptions = useMemo(
    () =>
      assignments.map((item) => ({
        value: String(item.id),
        label: buildTeacherAssignmentOptionLabel(item),
      })),
    [assignments],
  );
  const selectedDateIso = toIsoDateLocal(selectedDate);

  const detailQuery = useQuery({
    queryKey: ['mobile-teacher-assignment-detail', effectiveSelectedAssignmentId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!effectiveSelectedAssignmentId,
    queryFn: () => teacherAssignmentApi.getById(effectiveSelectedAssignmentId!),
  });

  const attendanceQuery = useQuery({
    queryKey: ['mobile-teacher-subject-attendance', effectiveSelectedAssignmentId, selectedDateIso],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!selectedAssignment,
    queryFn: () =>
      attendanceApi.getSubjectAttendance({
        date: selectedDateIso,
        classId: selectedAssignment!.class.id,
        subjectId: selectedAssignment!.subject.id,
        academicYearId: selectedAssignment!.academicYear.id,
      }),
  });

  const students = useMemo(() => detailQuery.data?.class.students || [], [detailQuery.data?.class.students]);
  const draft = useMemo(() => {
    const nextDraft: Record<number, TeacherAttendanceStatus> = {};
    for (const student of students) {
      nextDraft[student.id] = 'PRESENT';
    }
    for (const record of attendanceQuery.data?.records || []) {
      nextDraft[record.studentId] = record.status;
    }
    for (const [studentId, status] of Object.entries(draftOverrides)) {
      nextDraft[Number(studentId)] = status;
    }
    return nextDraft;
  }, [students, attendanceQuery.data?.records, draftOverrides]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAssignment) throw new Error('Assignment belum dipilih.');
      const students = detailQuery.data?.class.students || [];
      const records = students.map((student) => ({
        studentId: student.id,
        status: draft[student.id] || 'PRESENT',
        note: null,
      }));
      return attendanceApi.saveSubjectAttendance({
        date: selectedDateIso,
        classId: selectedAssignment.class.id,
        subjectId: selectedAssignment.subject.id,
        academicYearId: selectedAssignment.academicYear.id,
        records,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['mobile-teacher-subject-attendance', effectiveSelectedAssignmentId, selectedDateIso],
      });
      Alert.alert('Sukses', 'Presensi mapel berhasil disimpan.');
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      const msg = normalized.response?.data?.message || normalized.message || 'Gagal menyimpan presensi.';
      Alert.alert('Gagal', msg);
    },
  });

  const stats = useMemo(() => {
    const students = detailQuery.data?.class.students || [];
    const result = { present: 0, sick: 0, permission: 0, absent: 0, late: 0, total: students.length };
    for (const student of students) {
      const status = draft[student.id] || 'PRESENT';
      if (status === 'PRESENT') result.present += 1;
      if (status === 'SICK') result.sick += 1;
      if (status === 'PERMISSION') result.permission += 1;
      if (status === 'ABSENT') result.absent += 1;
      if (status === 'LATE') result.late += 1;
    }
    return result;
  }, [detailQuery.data?.class.students, draft]);

  const searchNormalized = search.trim().toLowerCase();

  const filteredStudents = useMemo(() => {
    if (!searchNormalized) return students;
    return students.filter((student) => {
      const haystacks = [student.name || '', student.nis || '', student.nisn || ''];
      return haystacks.some((value) => value.toLowerCase().includes(searchNormalized));
    });
  }, [students, searchNormalized]);

  const handleStatusChange = (studentId: number, status: TeacherAttendanceStatus) => {
    setDraftOverrides((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  const markAll = (status: TeacherAttendanceStatus) => {
    if (!students.length) return;
    setDraftOverrides((prev) => {
      const next = { ...prev };
      for (const student of students) {
        next[student.id] = status;
      }
      return next;
    });
  };

  const shiftDate = (offset: number) => {
    setDraftOverrides({});
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + offset));
  };

  if (isLoading) return <AppLoadingScreen message="Memuat presensi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Presensi Siswa</Text>
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={
            assignmentsQuery.isFetching ||
            detailQuery.isFetching ||
            (attendanceQuery.isFetching && !attendanceQuery.isLoading)
          }
          onRefresh={async () => {
            await Promise.all([assignmentsQuery.refetch(), detailQuery.refetch(), attendanceQuery.refetch()]);
          }}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Presensi Siswa</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        Isi kehadiran per mapel untuk kelas yang Anda ampu.
      </Text>

      {assignmentsQuery.isLoading ? <QueryStateView type="loading" message="Memuat assignment guru..." /> : null}
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
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Pilih Kelas & Mapel</Text>
              <MobileSelectField
                value={effectiveSelectedAssignmentId ? String(effectiveSelectedAssignmentId) : ''}
                options={assignmentOptions}
                onChange={(next) => {
                  setSelectedAssignmentId(next ? Number(next) : null);
                  setDraftOverrides({});
                }}
                placeholder="Pilih kelas & mapel"
              />
            </View>

            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 8 }}>Tanggal Presensi</Text>
              <Text style={{ color: '#334155', marginBottom: 8 }}>{formatLongDate(selectedDate)}</Text>
              <View style={{ flexDirection: 'row', marginHorizontal: -4 }}>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => shiftDate(-1)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '600' }}>-1 Hari</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => {
                      setDraftOverrides({});
                      setSelectedDate(new Date());
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#bfdbfe',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                      backgroundColor: '#eff6ff',
                    }}
                  >
                    <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Hari Ini</Text>
                  </Pressable>
                </View>
                <View style={{ flex: 1, paddingHorizontal: 4 }}>
                  <Pressable
                    onPress={() => shiftDate(1)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '600' }}>+1 Hari</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat daftar siswa..." /> : null}
            {detailQuery.isError ? (
              <QueryStateView type="error" message="Gagal memuat detail assignment." onRetry={() => detailQuery.refetch()} />
            ) : null}
            {attendanceQuery.isLoading ? <QueryStateView type="loading" message="Memuat presensi pada tanggal terpilih..." /> : null}
            {attendanceQuery.isError ? (
              <QueryStateView
                type="error"
                message="Gagal memuat data presensi mapel."
                onRetry={() => attendanceQuery.refetch()}
              />
            ) : null}

            {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
              <>
                <View
                  style={{
                    backgroundColor: '#1e3a8a',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 12,
                  }}
                >
                  <Text style={{ color: '#bfdbfe', fontSize: 12, marginBottom: 6 }}>
                    {detailQuery.data.subject.name} • {detailQuery.data.class.name}
                  </Text>
                  <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                    {[
                      { label: 'Hadir', value: stats.present },
                      { label: 'Sakit', value: stats.sick },
                      { label: 'Izin', value: stats.permission },
                      { label: 'Alpha', value: stats.absent },
                      { label: 'Telat', value: stats.late },
                    ].map((item) => (
                      <View key={item.label} style={{ width: '20%', paddingHorizontal: 3 }}>
                        <View
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.12)',
                            borderRadius: 8,
                            paddingVertical: 7,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ color: '#bfdbfe', fontSize: 10 }} numberOfLines={1}>
                            {item.label}
                          </Text>
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{item.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>

                {students.length > 0 ? (
                  <View>
                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 999,
                        paddingHorizontal: 12,
                        marginBottom: 10,
                      }}
                    >
                      <TextInput
                        value={search}
                        onChangeText={setSearch}
                        placeholder="Cari siswa (nama / NIS / NISN)"
                        placeholderTextColor="#94a3b8"
                        style={{
                          paddingVertical: 10,
                          color: '#0f172a',
                        }}
                      />
                    </View>

                    <View style={{ flexDirection: 'row', marginHorizontal: -3, marginBottom: 10 }}>
                      {STATUS_OPTIONS.map((statusOption) => (
                        <View key={statusOption.value} style={{ width: '20%', paddingHorizontal: 3 }}>
                          <Pressable
                            onPress={() => markAll(statusOption.value)}
                            style={{
                              backgroundColor: statusOption.bg,
                              borderWidth: 1,
                              borderColor: statusOption.border,
                              borderRadius: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 4,
                              alignItems: 'center',
                              minHeight: 44,
                              justifyContent: 'center',
                            }}
                          >
                            <Text
                              style={{ color: statusOption.text, fontWeight: '700', fontSize: 10, textAlign: 'center' }}
                              numberOfLines={2}
                            >
                              Semua {statusOption.label}
                            </Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>

                    <View
                      style={{
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#eef4ff',
                          borderBottomWidth: 1,
                          borderBottomColor: '#dbe7fb',
                          paddingHorizontal: 10,
                          paddingVertical: 9,
                        }}
                      >
                        <Text style={{ color: '#334155', fontSize: 12, fontWeight: '700' }}>
                          Daftar Presensi Kelas ({filteredStudents.length}/{students.length})
                        </Text>
                      </View>

                      {filteredStudents.length > 0 ? (
                        filteredStudents.map((student, index) => (
                          <View
                            key={student.id}
                            style={{
                              paddingHorizontal: 10,
                              paddingVertical: 9,
                              borderBottomWidth: index === filteredStudents.length - 1 ? 0 : 1,
                              borderBottomColor: '#eef2ff',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 7 }}>
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
                                <Text style={{ color: '#334155', fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontWeight: '700', color: '#0f172a' }} numberOfLines={1}>
                                  {student.name}
                                </Text>
                                <Text style={{ color: '#64748b', fontSize: 11 }} numberOfLines={1}>
                                  NIS: {student.nis || '-'} • NISN: {student.nisn || '-'}
                                </Text>
                              </View>
                            </View>

                            <View style={{ flexDirection: 'row', marginHorizontal: -3 }}>
                              {STATUS_OPTIONS.map((option) => {
                                const selected = (draft[student.id] || 'PRESENT') === option.value;
                                return (
                                  <View key={option.value} style={{ width: '20%', paddingHorizontal: 3 }}>
                                    <Pressable
                                      accessibilityLabel={option.label}
                                      onPress={() => handleStatusChange(student.id, option.value)}
                                      style={{
                                        borderWidth: 1,
                                        borderColor: selected ? option.border : '#cbd5e1',
                                        backgroundColor: selected ? option.bg : '#fff',
                                        borderRadius: 12,
                                        minHeight: 46,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        paddingVertical: 5,
                                      }}
                                    >
                                      <Feather
                                        name={option.iconName}
                                        size={14}
                                        color={selected ? option.text : '#64748b'}
                                      />
                                      <Text
                                        style={{
                                          color: selected ? option.text : '#64748b',
                                          fontSize: 8,
                                          fontWeight: '700',
                                          marginTop: 3,
                                        }}
                                        numberOfLines={1}
                                      >
                                        {option.label}
                                      </Text>
                                    </Pressable>
                                  </View>
                                );
                              })}
                            </View>
                          </View>
                        ))
                      ) : (
                        <View style={{ padding: 14 }}>
                          <Text style={{ color: '#64748b' }}>Tidak ada siswa yang cocok dengan pencarian.</Text>
                        </View>
                      )}
                    </View>
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
                    <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada siswa aktif</Text>
                    <Text style={{ color: '#64748b' }}>Kelas ini belum memiliki data siswa aktif.</Text>
                  </View>
                )}
              </>
            ) : null}

            <Pressable
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !selectedAssignment || !detailQuery.data}
              style={{
                marginTop: 16,
                backgroundColor: saveMutation.isPending ? '#93c5fd' : '#1d4ed8',
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Presensi'}
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
            <Text style={{ color: '#64748b' }}>Guru belum memiliki penugasan mapel pada tahun ajaran aktif.</Text>
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
