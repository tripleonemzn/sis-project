import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { DayOfWeek, ScheduleEntry } from '../../src/features/schedule/types';
import { useScheduleQuery } from '../../src/features/schedule/useScheduleQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { useAppTextScale } from '../../src/theme/AppTextScaleProvider';

const DAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];
const DEFAULT_WEEKDAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
};

type ScheduleBlock = {
  key: string;
  periodStart: number;
  periodEnd: number;
  jpCount: number;
  timeRange: string | null;
  entries: ScheduleEntry[];
  entry: ScheduleEntry;
};

function getDayLabel(day: string) {
  const normalized = String(day || '').trim().toUpperCase() as DayOfWeek;
  if (DAY_LABELS[normalized]) return DAY_LABELS[normalized];
  return String(day || '')
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Hari';
}

function getTeachingHourValue(entry: ScheduleEntry) {
  return typeof entry.teachingHour === 'number' ? entry.teachingHour : entry.period;
}

function formatPeriodRange(start: number, end: number) {
  return start === end ? `Jam ke-${start}` : `Jam ke-${start}-${end}`;
}

function extractPeriodTimeBoundary(rawValue?: string | null, side: 'start' | 'end' = 'start') {
  if (!rawValue) return null;
  const parts = String(rawValue)
    .split('-')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!parts.length) return rawValue.trim() || null;
  return side === 'start' ? parts[0] : parts[parts.length - 1];
}

function buildScheduleBlockTimeRange(entries: ScheduleEntry[]) {
  const first = entries[0];
  const last = entries[entries.length - 1] || first;
  if (!first || !last) return null;

  const start = extractPeriodTimeBoundary(first.periodTime, 'start');
  const end = extractPeriodTimeBoundary(last.periodTime, 'end');
  if (start && end) return `${start} - ${end}`;
  return start || end || null;
}

function buildScheduleBlocks(entries: ScheduleEntry[]) {
  const sortedEntries = [...entries]
    .filter((entry) => entry.teachingHour !== null)
    .sort((a, b) => {
      const aHour = getTeachingHourValue(a);
      const bHour = getTeachingHourValue(b);
      if (aHour === bHour) return a.period - b.period;
      return aHour - bHour;
    });

  const blocks: ScheduleBlock[] = [];
  let activeEntries: ScheduleEntry[] = [];

  const createBlock = (blockEntries: ScheduleEntry[]): ScheduleBlock | null => {
    const first = blockEntries[0];
    const last = blockEntries[blockEntries.length - 1] || first;
    if (!first || !last) return null;
    return {
      key: `block:${blockEntries.map((entry) => entry.id).join('-')}`,
      periodStart: getTeachingHourValue(first),
      periodEnd: getTeachingHourValue(last),
      jpCount: blockEntries.length,
      timeRange: buildScheduleBlockTimeRange(blockEntries),
      entries: blockEntries,
      entry: first,
    };
  };

  sortedEntries.forEach((entry) => {
    const previous = activeEntries[activeEntries.length - 1] || null;
    const isSameBlock =
      previous &&
      getTeachingHourValue(entry) === getTeachingHourValue(previous) + 1 &&
      entry.teacherAssignment.subject.id === previous.teacherAssignment.subject.id &&
      entry.teacherAssignment.teacher.id === previous.teacherAssignment.teacher.id &&
      entry.teacherAssignment.class.id === previous.teacherAssignment.class.id &&
      String(entry.room || '').trim() === String(previous.room || '').trim();

    if (isSameBlock) {
      activeEntries.push(entry);
      return;
    }

    const block = createBlock(activeEntries);
    if (block) blocks.push(block);
    activeEntries = [entry];
  });

  const finalBlock = createBlock(activeEntries);
  if (finalBlock) blocks.push(finalBlock);
  return blocks;
}

function ScheduleCard({ block }: { block: ScheduleBlock }) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const item = block.entry;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        padding: 12,
        backgroundColor: '#fff',
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ fontWeight: '700', color: '#0f172a' }}>{item.teacherAssignment.subject.name}</Text>
        <Text style={{ fontSize: scaleFont(12), color: '#334155' }}>{formatPeriodRange(block.periodStart, block.periodEnd)}</Text>
      </View>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#475569', marginBottom: 4 }}>
        {item.teacherAssignment.subject.code} • {block.jpCount} JP{block.timeRange ? ` • ${block.timeRange}` : ''}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#475569', marginBottom: 4 }}>
        Guru: {item.teacherAssignment.teacher.name}
      </Text>
      <Text style={{ fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), color: '#475569' }}>
        Kelas: {item.teacherAssignment.class.name} {item.room ? `| Ruang: ${item.room}` : ''}
      </Text>
    </View>
  );
}

export default function ScheduleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const scheduleQuery = useScheduleQuery({ enabled: isAuthenticated, user });
  const [activeDay, setActiveDay] = useState<DayOfWeek>('MONDAY');
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets);
  const entries = useMemo(() => scheduleQuery.data?.entries || [], [scheduleQuery.data?.entries]);
  const dayTabs = useMemo(() => {
    const availableDays = DAY_ORDER.filter((day) =>
      entries.some((entry) => entry.dayOfWeek === day && entry.teachingHour !== null),
    );
    return availableDays.length > 0 ? availableDays : DEFAULT_WEEKDAYS;
  }, [entries]);
  const effectiveActiveDay = dayTabs.includes(activeDay) ? activeDay : dayTabs[0] || 'MONDAY';
  const dayTabWidth = `${100 / Math.max(dayTabs.length, 1)}%` as `${number}%`;

  if (isLoading) return <AppLoadingScreen message="Memuat jadwal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  const dayEntries = entries.filter((entry) => entry.dayOfWeek === effectiveActiveDay && entry.teachingHour !== null);
  const dayScheduleBlocks = buildScheduleBlocks(dayEntries);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl refreshing={scheduleQuery.isFetching && !scheduleQuery.isLoading} onRefresh={() => scheduleQuery.refetch()} />
      }
    >
      <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 6 }}>Jadwal</Text>
      <Text style={{ color: '#64748b', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 16 }}>
        Jadwal pembelajaran aktif
      </Text>

      {scheduleQuery.isLoading ? (
        <QueryStateView type="loading" message="Mengambil jadwal..." />
      ) : null}

      {scheduleQuery.isError ? (
        <View style={{ marginBottom: 14 }}>
          <QueryStateView type="error" message="Gagal memuat data jadwal." onRetry={() => scheduleQuery.refetch()} />
        </View>
      ) : null}

      {scheduleQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={scheduleQuery.data.cachedAt} /> : null}

      {!scheduleQuery.isLoading && !scheduleQuery.isError ? (
        <>
          <View style={{ flexDirection: 'row', marginHorizontal: -3, marginBottom: 12 }}>
            {dayTabs.map((day) => {
              const active = effectiveActiveDay === day;
              return (
                <View key={day} style={{ width: dayTabWidth, paddingHorizontal: 3 }}>
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveDay(day)}
                    style={({ pressed }) => ({
                      borderWidth: 1,
                      borderColor: active ? '#bfdbfe' : '#e2e8f0',
                      backgroundColor: active ? '#f8fbff' : '#fff',
                      borderRadius: 12,
                      minHeight: 62,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                      paddingVertical: 7,
                      opacity: pressed ? 0.88 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 9,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: active ? 'rgba(37, 99, 235, 0.14)' : 'rgba(148, 163, 184, 0.12)',
                        marginBottom: 4,
                      }}
                    >
                      <Feather name="calendar" size={12} color={active ? '#2563eb' : '#64748b'} />
                    </View>
                    <Text
                      numberOfLines={1}
                      style={{
                        textAlign: 'center',
                        fontSize: scaleFont(10),
                        lineHeight: scaleLineHeight(12),
                        fontWeight: active ? '700' : '600',
                        color: active ? '#1d4ed8' : '#334155',
                      }}
                    >
                      {getDayLabel(day)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          {dayScheduleBlocks.length > 0 ? (
            <View>
              {dayScheduleBlocks.map((block) => (
                <ScheduleCard key={block.key} block={block} />
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
              <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>
                Tidak ada jadwal
              </Text>
                <Text style={{ color: '#64748b', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                Belum ada entri jadwal untuk hari {DAY_LABELS[effectiveActiveDay]}.
              </Text>
            </View>
          )}
        </>
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
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: fontSizes.label }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
