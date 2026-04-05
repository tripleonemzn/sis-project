import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../../src/components/MobileSelectField';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { proctoringApi } from '../../../../src/features/proctoring/proctoringApi';
import { ProctorScheduleSummary } from '../../../../src/features/proctoring/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

type TimeFilter = 'TODAY' | 'UPCOMING' | 'HISTORY';
type ModeFilter = 'PROCTOR' | 'AUTHOR';
type ProctorRoomGroup = {
  key: string;
  roomName: string;
  startTime: string;
  endTime: string;
  sessionLabel: string | null;
  title: string;
  subjectName: string;
  classNames: string[];
  totalActiveParticipants: number;
  scheduleIds: number[];
};

function normalizeExamType(raw?: string | null) {
  const value = String(raw || '').toUpperCase();
  if (value === 'QUIZ') return 'FORMATIF';
  return value || '-';
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

function scheduleStatusLabel(schedule: ProctorScheduleSummary) {
  const now = Date.now();
  const start = new Date(schedule.startTime).getTime();
  const end = new Date(schedule.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Tidak Valid';
  if (now < start) return 'Akan Datang';
  if (now >= start && now <= end) return 'Sedang Berlangsung';
  return 'Selesai';
}

function scheduleStatusStyle(status: string) {
  if (status === 'Sedang Berlangsung') return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  if (status === 'Akan Datang') return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  return { text: '#475569', border: '#cbd5e1', bg: '#f1f5f9' };
}

function matchTimeFilter(schedule: ProctorScheduleSummary, filter: TimeFilter) {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const examDate = new Date(schedule.startTime);
  if (Number.isNaN(examDate.getTime())) return false;

  if (filter === 'TODAY') return examDate >= todayStart && examDate <= todayEnd;
  if (filter === 'UPCOMING') return examDate > todayEnd;
  return examDate < todayStart;
}

export default function TeacherProctoringScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('PROCTOR');
  const [search, setSearch] = useState('');
  const modeFilterOptions = useMemo(
    () => [
      { value: 'PROCTOR', label: 'Sebagai Pengawas' },
      { value: 'AUTHOR', label: 'Sebagai Penulis' },
    ],
    [],
  );
  const timeFilterOptions = useMemo(
    () => [
      { value: 'TODAY', label: 'Hari Ini' },
      { value: 'UPCOMING', label: 'Akan Datang' },
      { value: 'HISTORY', label: 'Riwayat' },
    ],
    [],
  );

  const scheduleQuery = useQuery({
    queryKey: ['mobile-proctoring-schedules', modeFilter],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: async () =>
      proctoringApi.getSchedules({
        mode: modeFilter === 'AUTHOR' ? 'author' : 'proctor',
      }),
  });

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (scheduleQuery.data || [])
      .filter((item) => item.packet !== null)
      .filter((item) => matchTimeFilter(item, timeFilter))
      .filter((item) => {
        if (!query) return true;
        const type = normalizeExamType(item.packet?.type);
        const values = [
          item.packet?.title || '',
          item.packet?.subject?.name || '',
          item.class?.name || '',
          item.room || '',
          type,
        ];
        return values.some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [scheduleQuery.data, search, timeFilter]);

  const groupedRows = useMemo<ProctorRoomGroup[]>(() => {
    const map = new Map<string, ProctorRoomGroup>();

    filteredRows.forEach((schedule) => {
      const roomName = schedule.room || 'Ruangan belum ditentukan';
      const subjectName = schedule.packet?.subject?.name || '-';
      const title = schedule.packet?.title || `Ujian ${subjectName}`;
      const sessionLabel = String(schedule.sessionLabel || '').trim() || null;
      const key = `${roomName}::${schedule.startTime}::${schedule.endTime}::${subjectName}::${sessionLabel || '__NO_SESSION__'}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          roomName,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          sessionLabel,
          title,
          subjectName,
          classNames: [],
          totalActiveParticipants: 0,
          scheduleIds: [],
        });
      }

      const group = map.get(key)!;
      const resolvedClassNames =
        Array.isArray(schedule.classNames) && schedule.classNames.length > 0
          ? schedule.classNames
          : [schedule.class?.name || '-'];
      resolvedClassNames.forEach((className) => {
        if (!group.classNames.includes(className)) {
          group.classNames.push(className);
        }
      });

      const resolvedParticipantCount = Number.isFinite(Number(schedule.participantCount))
        ? Number(schedule.participantCount)
        : Number(schedule._count?.sessions || 0);
      group.totalActiveParticipants = Math.max(group.totalActiveParticipants, resolvedParticipantCount);
      group.scheduleIds.push(schedule.id);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
  }, [filteredRows]);

  const summary = useMemo(() => {
    const all = scheduleQuery.data || [];
    const activeNow = all.filter((item) => scheduleStatusLabel(item) === 'Sedang Berlangsung').length;
    const groupedAll = new Map<string, number>();
    all.forEach((item) => {
      const roomName = item.room || 'Ruangan belum ditentukan';
      const subjectName = item.packet?.subject?.name || '-';
      const sessionLabel = String(item.sessionLabel || '').trim() || null;
      const key = `${roomName}::${item.startTime}::${item.endTime}::${subjectName}::${sessionLabel || '__NO_SESSION__'}`;
      const resolvedParticipantCount = Number.isFinite(Number(item.participantCount))
        ? Number(item.participantCount)
        : Number(item._count?.sessions || 0);
      groupedAll.set(key, Math.max(groupedAll.get(key) || 0, resolvedParticipantCount));
    });
    const totalParticipants = Array.from(groupedAll.values()).reduce((acc, count) => acc + count, 0);
    return {
      total: all.length,
      activeNow,
      totalParticipants,
    };
  }, [scheduleQuery.data]);

  if (isLoading) return <AppLoadingScreen message="Memuat jadwal mengawas..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Jadwal Mengawas</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={scheduleQuery.isFetching}
          onRefresh={() => {
            void scheduleQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Jadwal Mengawas</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau jadwal ujian yang ditugaskan kepada Anda sebagai pengawas atau penulis soal.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Total Jadwal"
            value={String(summary.total)}
            subtitle="Semua jadwal aktif"
            iconName="calendar"
            accentColor="#2563eb"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Sedang Jalan"
            value={String(summary.activeNow)}
            subtitle="Sesi aktif saat ini"
            iconName="play-circle"
            accentColor="#16a34a"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Peserta Aktif"
            value={String(summary.totalParticipants)}
            subtitle="Total sesi siswa"
            iconName="users"
            accentColor="#0f766e"
          />
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
        <MobileSelectField
          label="Mode Akses"
          value={modeFilter}
          options={modeFilterOptions}
          onChange={(next) => setModeFilter((next as ModeFilter) || 'PROCTOR')}
          placeholder="Pilih mode akses"
        />
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
        <MobileSelectField
          label="Waktu"
          value={timeFilter}
          options={timeFilterOptions}
          onChange={(next) => setTimeFilter((next as TimeFilter) || 'TODAY')}
          placeholder="Pilih rentang waktu"
        />
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          backgroundColor: '#fff',
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 10,
          paddingVertical: 10,
          marginBottom: 10,
        }}
      >
        <Feather name="search" size={16} color="#64748b" />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Cari judul ujian, mapel, kelas, ruangan..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {scheduleQuery.isLoading ? <QueryStateView type="loading" message="Memuat jadwal ujian..." /> : null}
      {scheduleQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat jadwal mengawas."
          onRetry={() => {
            void scheduleQuery.refetch();
          }}
        />
      ) : null}

      {!scheduleQuery.isLoading && !scheduleQuery.isError ? (
        groupedRows.length > 0 ? (
          groupedRows.map((group) => {
            const primaryScheduleId = group.scheduleIds[0];
            const status = scheduleStatusLabel({
              id: primaryScheduleId || 0,
              startTime: group.startTime,
              endTime: group.endTime,
              room: group.roomName,
              proctorId: null,
              sessionLabel: group.sessionLabel,
              classNames: group.classNames,
              participantCount: group.totalActiveParticipants,
              packet: {
                title: group.title,
                subject: { name: group.subjectName },
                duration: 0,
              },
              class: group.classNames[0] ? { name: group.classNames[0] } : null,
            });
            const statusStyle = scheduleStatusStyle(status);
            return (
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
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      {group.title}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      {group.subjectName}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: statusStyle.border,
                      backgroundColor: statusStyle.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: statusStyle.text, fontWeight: '700', fontSize: 11 }}>{status}</Text>
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: '#334155', fontSize: 12 }}>
                    Peserta aktif: {group.totalActiveParticipants}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                    Mulai: {formatDateTime(group.startTime)}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                    Selesai: {formatDateTime(group.endTime)}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                    Ruangan: {group.roomName}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                    {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                    Kelas / Rombel: {group.classNames.join(', ') || '-'}
                  </Text>
                </View>

                <Pressable
                  onPress={() => {
                    if (!primaryScheduleId) return;
                    router.push(`/teacher/proctoring/${primaryScheduleId}` as never);
                  }}
                  style={{
                    marginTop: 10,
                    backgroundColor: BRAND_COLORS.blue,
                    borderRadius: 8,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Pantau Ujian</Text>
                </Pressable>
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
              backgroundColor: '#fff',
              padding: 14,
            }}
          >
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
              Tidak ada jadwal ujian
            </Text>
            <Text style={{ color: '#64748b' }}>
              Belum ada jadwal sesuai mode, waktu, dan pencarian yang dipilih.
            </Text>
          </View>
        )
      ) : null}

    </ScrollView>
  );
}
