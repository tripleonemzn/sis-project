import { useEffect, useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../../../src/components/MobileMenuTabBar';
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
  dateKey: string;
  dateLabel: string;
  roomName: string;
  startTime: string;
  endTime: string;
  periodNumber: number | null;
  sessionLabel: string | null;
  title: string;
  subjectName: string;
  classNames: string[];
  totalActiveParticipants: number;
  scheduleIds: number[];
};

function groupSchedulesForDisplay(sourceSchedules: ProctorScheduleSummary[]): ProctorRoomGroup[] {
  const map = new Map<string, ProctorRoomGroup>();

  sourceSchedules.forEach((schedule) => {
    const roomName = schedule.room || 'Ruangan belum ditentukan';
    const subjectName = schedule.subjectName || schedule.packet?.subject?.name || '-';
    const title = schedule.packet?.title || `Ujian ${subjectName}`;
    const sessionLabel = String(schedule.sessionLabel || '').trim() || null;
    const dateKey = formatDayKey(schedule.startTime);
    const key = [
      dateKey,
      roomName,
      schedule.startTime,
      schedule.endTime,
      schedule.periodNumber || 0,
      subjectName,
      sessionLabel || '__NO_SESSION__',
    ].join('::');

    if (!map.has(key)) {
      map.set(key, {
        key,
        dateKey,
        dateLabel: formatDayLabel(schedule.startTime),
        roomName,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        periodNumber: Number.isFinite(Number(schedule.periodNumber)) ? Number(schedule.periodNumber) : null,
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
    group.classNames.sort(compareClassName);
    const resolvedParticipantCount = Number.isFinite(Number(schedule.participantCount))
      ? Number(schedule.participantCount)
      : Number(schedule._count?.sessions || 0);
    group.totalActiveParticipants = Math.max(group.totalActiveParticipants, resolvedParticipantCount);
    group.scheduleIds.push(schedule.id);
  });

  return Array.from(map.values()).sort((a, b) => {
    const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    if (timeDiff !== 0) return timeDiff;
    const periodDiff = Number(a.periodNumber || 0) - Number(b.periodNumber || 0);
    if (periodDiff !== 0) return periodDiff;
    return compareRoomName(a.roomName, b.roomName);
  });
}

function normalizeExamType(raw?: string | null) {
  const value = String(raw || '').toUpperCase();
  if (value === 'QUIZ') return 'FORMATIF';
  return value || '-';
}

function compareRoomName(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
}

function compareClassName(a: string, b: string) {
  return String(a || '').localeCompare(String(b || ''), 'id', {
    numeric: true,
    sensitivity: 'base',
  });
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

function formatDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'invalid-date';
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '-';
  return `${start.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  })} WIB`;
}

function resolveTimeBucket(schedule: Pick<ProctorScheduleSummary, 'startTime'>): TimeFilter {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const examDate = new Date(schedule.startTime);
  if (Number.isNaN(examDate.getTime())) return 'HISTORY';
  if (examDate >= todayStart && examDate <= todayEnd) return 'TODAY';
  if (examDate > todayEnd) return 'UPCOMING';
  return 'HISTORY';
}

function scheduleStatusLabel(schedule: Pick<ProctorScheduleSummary, 'startTime' | 'endTime'>) {
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

export default function TeacherProctoringScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('PROCTOR');
  const [search, setSearch] = useState('');
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);

  const modeFilterOptions = useMemo(
    () => [
      { value: 'PROCTOR', label: 'Sebagai Pengawas' },
      { value: 'AUTHOR', label: 'Sebagai Penulis' },
    ],
    [],
  );

  const timeFilterItems = useMemo(
    () => [
      { key: 'TODAY', label: 'Hari Ini', iconName: 'calendar' as const },
      { key: 'UPCOMING', label: 'Akan Datang', iconName: 'clock' as const },
      { key: 'HISTORY', label: 'Riwayat', iconName: 'archive' as const },
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

  const scheduleCountsByFilter = useMemo(
    () =>
      (scheduleQuery.data || []).reduce<Record<TimeFilter, number>>(
        (acc, schedule) => {
          acc[resolveTimeBucket(schedule)] += 1;
          return acc;
        },
        { TODAY: 0, UPCOMING: 0, HISTORY: 0 },
      ),
    [scheduleQuery.data],
  );

  useEffect(() => {
    if (scheduleQuery.isLoading) return;
    if (timeFilter === 'TODAY' && scheduleCountsByFilter.TODAY === 0 && scheduleCountsByFilter.UPCOMING > 0) {
      setTimeFilter('UPCOMING');
    }
  }, [scheduleCountsByFilter.TODAY, scheduleCountsByFilter.UPCOMING, scheduleQuery.isLoading, timeFilter]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (scheduleQuery.data || [])
      .filter((item) => item.packet !== null)
      .filter((item) => resolveTimeBucket(item) === timeFilter)
      .filter((item) => {
        if (!query) return true;
        const type = normalizeExamType(item.packet?.type);
        const values = [
          item.packet?.title || '',
          item.subjectName || item.packet?.subject?.name || '',
          item.class?.name || '',
          ...(Array.isArray(item.classNames) ? item.classNames : []),
          item.room || '',
          type,
        ];
        return values.some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const timeDiff = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        if (timeDiff !== 0) return timeDiff;
        const periodDiff = Number(a.periodNumber || 0) - Number(b.periodNumber || 0);
        if (periodDiff !== 0) return periodDiff;
        return compareRoomName(a.room || '', b.room || '');
      });
  }, [scheduleQuery.data, search, timeFilter]);

  const groupedRows = useMemo<ProctorRoomGroup[]>(() => {
    return groupSchedulesForDisplay(filteredRows);
  }, [filteredRows]);

  const groupedDays = useMemo(() => {
    const map = new Map<string, { dateKey: string; dateLabel: string; rows: ProctorRoomGroup[] }>();
    groupedRows.forEach((group) => {
      if (!map.has(group.dateKey)) {
        map.set(group.dateKey, {
          dateKey: group.dateKey,
          dateLabel: group.dateLabel,
          rows: [],
        });
      }
      map.get(group.dateKey)!.rows.push(group);
    });
    return Array.from(map.values()).sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  }, [groupedRows]);

  const summary = useMemo(() => {
    const all = (scheduleQuery.data || []).filter((item) => item.packet !== null);
    const groupedAll = groupSchedulesForDisplay(all);
    const activeNow = groupedAll.filter((item) => scheduleStatusLabel(item) === 'Sedang Berlangsung').length;
    const totalParticipants = groupedAll.reduce((acc, item) => acc + item.totalActiveParticipants, 0);
    return {
      total: groupedAll.length,
      activeNow,
      totalParticipants,
      totalDays: new Set(groupedAll.map((item) => item.dateKey)).size,
    };
  }, [scheduleQuery.data]);

  useEffect(() => {
    if (groupedDays.length === 0) {
      setExpandedDayKey(null);
      return;
    }
    setExpandedDayKey((previous) => {
      return previous && groupedDays.some((day) => day.dateKey === previous) ? previous : null;
    });
  }, [groupedDays]);

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
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
        Jadwal Mengawas & Monitoring
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau jadwal ujian yang ditugaskan kepada Anda dengan breakdown per hari.
      </Text>

      <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Slot Ujian"
            value={String(summary.total)}
            subtitle={`${summary.totalDays} hari ujian`}
            iconName="calendar"
            accentColor="#2563eb"
            align="center"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Sedang Berlangsung"
            value={String(summary.activeNow)}
            subtitle="Slot aktif saat ini"
            iconName="play-circle"
            accentColor="#16a34a"
            align="center"
          />
        </View>
        <View style={{ flex: 1, paddingHorizontal: 4 }}>
          <MobileSummaryCard
            title="Peserta Aktif"
            value={String(summary.totalParticipants)}
            subtitle="Total sesi siswa"
            iconName="users"
            accentColor="#0f766e"
            align="center"
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
          paddingVertical: 8,
          paddingHorizontal: 10,
          marginBottom: 10,
        }}
      >
        <MobileMenuTabBar
          items={timeFilterItems}
          activeKey={timeFilter}
          onChange={(next) => setTimeFilter((next as TimeFilter) || 'TODAY')}
          layout="fill"
          contentContainerStyle={{ alignItems: 'stretch' }}
          tabVariant="plain"
          gap={0}
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
        groupedDays.length > 0 ? (
          groupedDays.map((day) => (
            <View
              key={day.dateKey}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                overflow: 'hidden',
                marginBottom: 12,
              }}
            >
              <Pressable
                onPress={() => setExpandedDayKey((previous) => (previous === day.dateKey ? null : day.dateKey))}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#e2e8f0',
                  backgroundColor: '#f8fafc',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>{day.dateLabel}</Text>
                  <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                    {day.rows.length} slot ujian • {new Set(day.rows.map((row) => row.roomName)).size} ruang aktif
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ color: BRAND_COLORS.blue, fontWeight: '700', fontSize: 12, marginRight: 6 }}>
                    {expandedDayKey === day.dateKey ? 'Tutup Hari' : 'Buka Hari'}
                  </Text>
                  <Feather
                    name={expandedDayKey === day.dateKey ? 'chevron-down' : 'chevron-right'}
                    size={16}
                    color={BRAND_COLORS.blue}
                  />
                </View>
              </Pressable>

              {expandedDayKey === day.dateKey
                ? day.rows.map((group, index) => {
                const primaryScheduleId = group.scheduleIds[0];
                const status = scheduleStatusLabel({ startTime: group.startTime, endTime: group.endTime });
                const statusStyle = scheduleStatusStyle(status);

                return (
                  <View
                    key={group.key}
                    style={{
                      padding: 14,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: '#e2e8f0',
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{group.title}</Text>
                        <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>{group.subjectName}</Text>
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
                        {formatTimeRange(group.startTime, group.endTime)}
                        {group.periodNumber ? ` • Jam Ke-${group.periodNumber}` : ''}
                      </Text>
                      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>Ruangan: {group.roomName}</Text>
                      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                        {group.sessionLabel ? `Sesi: ${group.sessionLabel}` : 'Tanpa sesi'}
                      </Text>
                      <Text style={{ color: '#334155', fontSize: 12, marginTop: 2 }}>
                        Peserta aktif: {group.totalActiveParticipants}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>
                      {group.classNames.map((className) => (
                        <View
                          key={`${group.key}-${className}`}
                          style={{
                            borderWidth: 1,
                            borderColor: '#bfdbfe',
                            backgroundColor: '#eff6ff',
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                            marginRight: 6,
                            marginBottom: 6,
                          }}
                        >
                          <Text style={{ color: '#1d4ed8', fontSize: 11 }}>{className}</Text>
                        </View>
                      ))}
                    </View>

                    <Pressable
                      onPress={() => {
                        if (!primaryScheduleId) return;
                        router.push(`/teacher/proctoring/${primaryScheduleId}` as never);
                      }}
                      style={{
                        marginTop: 10,
                        backgroundColor: BRAND_COLORS.blue,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Buka Monitoring</Text>
                    </Pressable>
                  </View>
                );
              })
                : null}
            </View>
          ))
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Tidak ada jadwal ujian</Text>
            <Text style={{ color: '#64748b' }}>
              Belum ada jadwal sesuai mode, waktu, dan pencarian yang dipilih.
            </Text>
          </View>
        )
      ) : null}
    </ScrollView>
  );
}
