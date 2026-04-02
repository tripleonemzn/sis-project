import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { MobileTabChip } from '../../src/components/MobileTabChip';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { DayOfWeek, ScheduleEntry } from '../../src/features/schedule/types';
import { useScheduleQuery } from '../../src/features/schedule/useScheduleQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';

const DAY_ORDER: DayOfWeek[] = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
];

const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Senin',
  TUESDAY: 'Selasa',
  WEDNESDAY: 'Rabu',
  THURSDAY: 'Kamis',
  FRIDAY: 'Jumat',
  SATURDAY: 'Sabtu',
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

function ScheduleCard({ item }: { item: ScheduleEntry }) {
  const displayHour = typeof item.teachingHour === 'number' ? item.teachingHour : item.period;
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
        <Text style={{ fontSize: 12, color: '#334155' }}>Jam ke-{displayHour}</Text>
      </View>
      <Text style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
        {item.teacherAssignment.subject.code}
      </Text>
      <Text style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>
        Guru: {item.teacherAssignment.teacher.name}
      </Text>
      <Text style={{ fontSize: 12, color: '#475569' }}>
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
  const pageContentPadding = getStandardPagePadding(insets);
  const entries = useMemo(() => scheduleQuery.data?.entries || [], [scheduleQuery.data?.entries]);
  const availableDays = useMemo(
    () => DAY_ORDER.filter((day) => entries.some((entry) => entry.dayOfWeek === day)),
    [entries],
  );
  const dayTabs = availableDays.length > 0 ? availableDays : DAY_ORDER;
  const effectiveActiveDay = dayTabs.includes(activeDay) ? activeDay : dayTabs[0];

  if (isLoading) return <AppLoadingScreen message="Memuat jadwal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  const dayEntries = entries
    .filter((entry) => entry.dayOfWeek === effectiveActiveDay && entry.teachingHour !== null)
    .sort((a, b) => {
      const aHour = typeof a.teachingHour === 'number' ? a.teachingHour : a.period;
      const bHour = typeof b.teachingHour === 'number' ? b.teachingHour : b.period;
      return aHour - bHour;
    });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl refreshing={scheduleQuery.isFetching && !scheduleQuery.isLoading} onRefresh={() => scheduleQuery.refetch()} />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>Jadwal</Text>
      <Text style={{ color: '#64748b', marginBottom: 16 }}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', paddingRight: 4 }}>
              {dayTabs.map((day) => (
                <View key={day} style={{ marginRight: 8 }}>
                  <MobileTabChip
                    active={effectiveActiveDay === day}
                    label={getDayLabel(day)}
                    onPress={() => setActiveDay(day)}
                    compact
                    minWidth={92}
                  />
                </View>
              ))}
            </View>
          </ScrollView>

          {dayEntries.length > 0 ? (
            <View>
              {dayEntries.map((entry) => (
                <ScheduleCard key={entry.id} item={entry} />
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
                <Text style={{ color: '#64748b' }}>
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
        <Text style={{ color: '#fff', fontWeight: '600' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
