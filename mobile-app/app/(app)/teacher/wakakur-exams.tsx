import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
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
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { academicYearApi } from '../../../src/features/academicYear/academicYearApi';
import { AdminUser, adminApi } from '../../../src/features/admin/adminApi';
import { examApi } from '../../../src/features/exams/examApi';
import { ExamDisplayType, TeacherExamSchedule } from '../../../src/features/exams/types';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';

type ExamHubSection = 'JADWAL' | 'RUANG' | 'MENGAWAS';
type ExamTypeFilter = 'ALL' | ExamDisplayType;

function hasCurriculumDuty(userDuties?: string[]) {
  const duties = (userDuties || []).map((item) => item.trim().toUpperCase());
  return duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
}

function normalizeExamType(raw: string | null | undefined): ExamDisplayType {
  const value = String(raw || '').toUpperCase();
  if (value === 'QUIZ') return 'FORMATIF';
  if (value === 'SBTS' || value === 'SAS' || value === 'SAT' || value === 'FORMATIF') return value;
  return 'FORMATIF';
}

function resolveScheduleExamType(schedule: TeacherExamSchedule): ExamDisplayType {
  return normalizeExamType(schedule.examType || schedule.packet?.type);
}

function resolveScheduleSubject(schedule: TeacherExamSchedule) {
  const subjectName = schedule.subject?.name || schedule.packet?.subject?.name || '-';
  const subjectCode = schedule.subject?.code || schedule.packet?.subject?.code || '-';
  return { subjectName, subjectCode };
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function SectionChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function TypeChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        borderWidth: 1,
        borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
        backgroundColor: active ? '#e9f1ff' : '#fff',
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 7,
      }}
    >
      <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
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

export default function TeacherWakakurExamsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [section, setSection] = useState<ExamHubSection>('JADWAL');
  const [examTypeFilter, setExamTypeFilter] = useState<ExamTypeFilter>('ALL');
  const [search, setSearch] = useState('');
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [teacherSearch, setTeacherSearch] = useState('');
  const openExamSessionCrud = () => {
    router.push('/admin/academic?section=exam-sessions' as never);
  };

  const isAllowed = user?.role === 'TEACHER' && hasCurriculumDuty(user?.additionalDuties);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-wakakur-exams-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
  });

  const schedulesQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-schedules', activeYearQuery.data?.id],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => {
      const schedules = await examApi.getTeacherSchedules({
        academicYearId: activeYearQuery.data?.id,
      });
      return schedules;
    },
  });

  const teachersQuery = useQuery({
    queryKey: ['mobile-wakakur-exam-teachers'],
    enabled: isAuthenticated && !!isAllowed,
    queryFn: async () => adminApi.listUsers({ role: 'TEACHER' }),
  });

  const updateProctorMutation = useMutation({
    mutationFn: async (payload: { scheduleId: number; proctorId: number }) =>
      examApi.updateTeacherSchedule(payload.scheduleId, { proctorId: payload.proctorId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] });
      setEditingScheduleId(null);
      setTeacherSearch('');
      Alert.alert('Sukses', 'Pengawas ujian berhasil diperbarui.');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Gagal memperbarui pengawas.';
      Alert.alert('Gagal', msg);
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: async (scheduleId: number) => examApi.deleteTeacherSchedule(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-wakakur-exam-schedules'] });
      Alert.alert('Sukses', 'Jadwal ujian berhasil dihapus.');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Gagal menghapus jadwal ujian.';
      Alert.alert('Gagal', msg);
    },
  });

  const schedules = schedulesQuery.data || [];
  const teachers = useMemo(
    () =>
      (teachersQuery.data || [])
        .map((item: AdminUser) => ({
          id: item.id,
          name: item.name,
          username: item.username,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'id')),
    [teachersQuery.data],
  );

  const filteredSchedules = useMemo(() => {
    const query = search.trim().toLowerCase();
    return schedules
      .filter((item) => {
        if (activeYearQuery.data?.id && item.academicYearId && Number(item.academicYearId) !== Number(activeYearQuery.data.id)) {
          return false;
        }
        const type = resolveScheduleExamType(item);
        if (examTypeFilter !== 'ALL' && type !== examTypeFilter) return false;
        if (!query) return true;
        const subject = resolveScheduleSubject(item);
        const haystacks = [
          item.class?.name || '',
          item.room || '',
          item.proctor?.name || '',
          subject.subjectName,
          subject.subjectCode,
          item.packet?.title || '',
          type,
        ];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [schedules, activeYearQuery.data?.id, examTypeFilter, search]);

  const groupedSchedules = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        subjectName: string;
        subjectCode: string;
        examType: ExamDisplayType;
        startTime: string;
        endTime: string;
        schedules: TeacherExamSchedule[];
      }
    >();

    for (const schedule of filteredSchedules) {
      const subject = resolveScheduleSubject(schedule);
      const examType = resolveScheduleExamType(schedule);
      const key = `${subject.subjectCode}|${schedule.startTime}|${schedule.endTime}|${examType}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          subjectName: subject.subjectName,
          subjectCode: subject.subjectCode,
          examType,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          schedules: [],
        });
      }
      map.get(key)!.schedules.push(schedule);
    }

    return Array.from(map.values());
  }, [filteredSchedules]);

  const roomSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        roomName: string;
        totalSchedules: number;
        classes: Set<string>;
        examTypes: Set<ExamDisplayType>;
        noProctorCount: number;
      }
    >();

    for (const schedule of filteredSchedules) {
      const roomName = (schedule.room || '').trim() || 'Belum Diatur';
      const examType = resolveScheduleExamType(schedule);
      if (!map.has(roomName)) {
        map.set(roomName, {
          roomName,
          totalSchedules: 0,
          classes: new Set<string>(),
          examTypes: new Set<ExamDisplayType>(),
          noProctorCount: 0,
        });
      }

      const row = map.get(roomName)!;
      row.totalSchedules += 1;
      row.classes.add(schedule.class?.name || '-');
      row.examTypes.add(examType);
      if (!schedule.proctorId) row.noProctorCount += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.totalSchedules - a.totalSchedules);
  }, [filteredSchedules]);

  const teacherOptions = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase();
    if (!query) return teachers.slice(0, 14);
    return teachers
      .filter((item) => {
        const haystacks = [item.name || '', item.username || ''];
        return haystacks.some((value) => value.toLowerCase().includes(query));
      })
      .slice(0, 14);
  }, [teachers, teacherSearch]);

  const stats = useMemo(() => {
    const noProctorCount = filteredSchedules.filter((item) => !item.proctorId).length;
    const readyPacketCount = filteredSchedules.filter((item) => !!item.packetId).length;
    const rooms = new Set(filteredSchedules.map((item) => (item.room || '').trim()).filter(Boolean));
    return {
      totalSchedules: filteredSchedules.length,
      noProctorCount,
      readyPacketCount,
      totalRooms: rooms.size,
    };
  }, [filteredSchedules]);

  const handleDeleteSchedule = (scheduleId: number) => {
    Alert.alert('Hapus Jadwal', 'Yakin ingin menghapus jadwal ujian ini?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => deleteScheduleMutation.mutate(scheduleId),
      },
    ]);
  };

  const handleAssignProctor = (scheduleId: number, proctorId: number) => {
    updateProctorMutation.mutate({ scheduleId, proctorId });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat modul ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Kelola Ujian</Text>
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
          Kelola Ujian
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
          refreshing={activeYearQuery.isFetching || schedulesQuery.isFetching || teachersQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void schedulesQuery.refetch();
            void teachersQuery.refetch();
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
          Kelola Ujian
        </Text>
      </View>

      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
        Pengelolaan jadwal ujian, ruang ujian, dan jadwal mengawas.
      </Text>

      {activeYearQuery.data?.name ? (
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
          <Text style={{ color: '#64748b', fontSize: 12 }}>Tahun Ajaran Aktif</Text>
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 3 }}>{activeYearQuery.data.name}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <SummaryCard title="Jadwal Ujian" value={String(stats.totalSchedules)} subtitle="Sesuai filter" />
        <SummaryCard title="Paket Siap" value={String(stats.readyPacketCount)} subtitle="Sudah linked" />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <SummaryCard title="Belum Pengawas" value={String(stats.noProctorCount)} subtitle="Perlu assignment" />
        <SummaryCard title="Ruang Aktif" value={String(stats.totalRooms)} subtitle="Ruang terpakai" />
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
          placeholder="Cari mapel, kelas, ruang, atau pengawas"
          placeholderTextColor="#94a3b8"
          style={{ flex: 1, color: BRAND_COLORS.textDark, paddingVertical: 10, paddingHorizontal: 10 }}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <SectionChip active={section === 'JADWAL'} label="Jadwal Ujian" onPress={() => setSection('JADWAL')} />
        <SectionChip active={section === 'RUANG'} label="Ruang Ujian" onPress={() => setSection('RUANG')} />
        <SectionChip active={section === 'MENGAWAS'} label="Jadwal Mengawas" onPress={() => setSection('MENGAWAS')} />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {(['ALL', 'SBTS', 'SAS', 'SAT', 'FORMATIF'] as ExamTypeFilter[]).map((item) => (
          <TypeChip
            key={item}
            active={examTypeFilter === item}
            label={item === 'ALL' ? 'Semua Tipe' : item}
            onPress={() => setExamTypeFilter(item)}
          />
        ))}
      </View>

      <Pressable
        onPress={openExamSessionCrud}
        style={{
          borderWidth: 1,
          borderColor: '#93c5fd',
          borderRadius: 10,
          backgroundColor: '#eff6ff',
          paddingVertical: 9,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Kelola Sesi Ujian (Tambah/Ubah/Hapus)</Text>
      </Pressable>

      {schedulesQuery.isLoading ? <QueryStateView type="loading" message="Memuat data ujian..." /> : null}
      {schedulesQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data ujian." onRetry={() => schedulesQuery.refetch()} />
      ) : null}

      {!schedulesQuery.isLoading && !schedulesQuery.isError ? (
        <>
          {section === 'JADWAL' ? (
            groupedSchedules.length > 0 ? (
              groupedSchedules.map((group) => (
                <View
                  key={group.key}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16, flex: 1 }}>
                      {group.subjectName} ({group.subjectCode})
                    </Text>
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
                      {group.examType}
                    </Text>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>
                    {formatDateTime(group.startTime)} - {formatDateTime(group.endTime)}
                  </Text>
                  {group.schedules.map((item) => (
                    <View
                      key={item.id}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: '#eef3ff',
                        paddingTop: 8,
                        marginTop: 6,
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{item.class?.name || '-'}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                        Ruang: {item.room || '-'} • Pengawas: {item.proctor?.name || '-'}
                      </Text>
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
                        Packet: {item.packet?.title || '-'}
                      </Text>
                      <Pressable
                        onPress={() => handleDeleteSchedule(item.id)}
                        disabled={deleteScheduleMutation.isPending}
                        style={{
                          marginTop: 8,
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: '#fecaca',
                          backgroundColor: '#fff1f2',
                          borderRadius: 8,
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                        }}
                      >
                        <Text style={{ color: '#be123c', fontWeight: '700', fontSize: 12 }}>
                          {deleteScheduleMutation.isPending ? 'Memproses...' : 'Hapus Jadwal'}
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada jadwal ujian sesuai filter.</Text>
              </View>
            )
          ) : null}

          {section === 'RUANG' ? (
            roomSummary.length > 0 ? (
              roomSummary.map((room) => (
                <View
                  key={room.roomName}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#dbe7fb',
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>{room.roomName}</Text>
                    <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700' }}>{room.totalSchedules} jadwal</Text>
                  </View>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 6 }}>
                    Kelas: {Array.from(room.classes).join(', ')}
                  </Text>
                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    Tipe: {Array.from(room.examTypes).join(', ')} • Belum pengawas: {room.noProctorCount}
                  </Text>
                </View>
              ))
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada data ruang ujian sesuai filter.</Text>
              </View>
            )
          ) : null}

          {section === 'MENGAWAS' ? (
            filteredSchedules.length > 0 ? (
              filteredSchedules.map((item) => {
                const subject = resolveScheduleSubject(item);
                const type = resolveScheduleExamType(item);
                const isEditing = editingScheduleId === item.id;
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
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', flex: 1, paddingRight: 6 }}>
                        {subject.subjectName} ({subject.subjectCode})
                      </Text>
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
                        {type}
                      </Text>
                    </View>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12 }}>
                      {item.class?.name || '-'} • {formatDateTime(item.startTime)}
                    </Text>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 6 }}>
                      Ruang: {item.room || '-'} • Pengawas: {item.proctor?.name || 'Belum ditentukan'}
                    </Text>

                    {!isEditing ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          onPress={() => setEditingScheduleId(item.id)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            backgroundColor: '#eff6ff',
                            borderRadius: 8,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>Ubah Pengawas</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => handleAssignProctor(item.id, user.id)}
                          disabled={updateProctorMutation.isPending}
                          style={{
                            borderWidth: 1,
                            borderColor: '#d5e1f5',
                            backgroundColor: '#fff',
                            borderRadius: 8,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.navy, fontWeight: '700', fontSize: 12 }}>
                            {updateProctorMutation.isPending ? 'Memproses...' : 'Set Saya'}
                          </Text>
                        </Pressable>
                      </View>
                    ) : (
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          backgroundColor: '#f8fbff',
                          borderRadius: 10,
                          padding: 10,
                          marginTop: 4,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                          Pilih Pengawas
                        </Text>
                        <TextInput
                          value={teacherSearch}
                          onChangeText={setTeacherSearch}
                          placeholder="Cari nama guru / username"
                          placeholderTextColor="#94a3b8"
                          style={{
                            borderWidth: 1,
                            borderColor: '#d5e1f5',
                            borderRadius: 8,
                            backgroundColor: '#fff',
                            paddingHorizontal: 10,
                            paddingVertical: 8,
                            color: BRAND_COLORS.textDark,
                            marginBottom: 8,
                          }}
                        />
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3 }}>
                          {teacherOptions.map((teacher) => (
                            <View key={teacher.id} style={{ width: '50%', paddingHorizontal: 3, marginBottom: 6 }}>
                              <Pressable
                                onPress={() => handleAssignProctor(item.id, teacher.id)}
                                disabled={updateProctorMutation.isPending}
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#d5e1f5',
                                  borderRadius: 8,
                                  backgroundColor: '#fff',
                                  paddingVertical: 7,
                                  paddingHorizontal: 8,
                                }}
                              >
                                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 12 }} numberOfLines={1}>
                                  {teacher.name}
                                </Text>
                                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11 }} numberOfLines={1}>
                                  @{teacher.username}
                                </Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                        <Pressable
                          onPress={() => {
                            setEditingScheduleId(null);
                            setTeacherSearch('');
                          }}
                          style={{
                            marginTop: 4,
                            alignSelf: 'flex-start',
                            borderWidth: 1,
                            borderColor: '#d5e1f5',
                            borderRadius: 8,
                            paddingVertical: 7,
                            paddingHorizontal: 10,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>Batal</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              })
            ) : (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderStyle: 'dashed',
                  borderRadius: 10,
                  padding: 16,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada jadwal untuk assignment pengawas.</Text>
              </View>
            )
          ) : null}
        </>
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
