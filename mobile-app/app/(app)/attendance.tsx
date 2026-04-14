import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { StudentAttendanceHistory, StudentAttendanceStatus } from '../../src/features/attendance/types';
import { useStudentAttendanceQuery } from '../../src/features/attendance/useStudentAttendanceQuery';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';

const STATUS_LABELS: Record<StudentAttendanceStatus, string> = {
  PRESENT: 'Hadir',
  SICK: 'Sakit',
  PERMISSION: 'Izin',
  ABSENT: 'Alpha',
  ALPHA: 'Alpha',
  LATE: 'Terlambat',
};

const STATUS_COLORS: Record<StudentAttendanceStatus, string> = {
  PRESENT: '#15803d',
  SICK: '#1d4ed8',
  PERMISSION: '#a16207',
  ABSENT: '#b91c1c',
  ALPHA: '#b91c1c',
  LATE: '#c2410c',
};

function toMonthYear(date: Date) {
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function AttendanceCard({ item }: { item: StudentAttendanceHistory }) {
  const status = item.status;
  const color = STATUS_COLORS[status] || '#334155';
  const note = item.note || item.notes || '-';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        borderRadius: 10,
        padding: 12,
        backgroundColor: '#fff',
        marginBottom: 8,
      }}
    >
      <Text style={{ fontWeight: '700', color: '#0f172a', marginBottom: 4 }}>
        {new Date(item.date).toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </Text>
      <Text style={{ color, fontWeight: '700', marginBottom: 4 }}>{STATUS_LABELS[status] || status}</Text>
      <Text style={{ fontSize: 12, color: '#475569', marginBottom: 3 }}>
        Masuk: {item.checkInTime || '-'} | Pulang: {item.checkOutTime || '-'}
      </Text>
      <Text style={{ fontSize: 12, color: '#64748b' }}>Catatan: {note}</Text>
    </View>
  );
}

export default function AttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const { month, year } = toMonthYear(cursorDate);
  const pageContentPadding = getStandardPagePadding(insets);
  const attendanceQuery = useStudentAttendanceQuery({
    enabled: isAuthenticated,
    user,
    month,
    year,
  });
  const records = useMemo(() => attendanceQuery.data?.records || [], [attendanceQuery.data?.records]);
  const stats = useMemo(() => {
    const result = { present: 0, sick: 0, permission: 0, absent: 0, late: 0 };
    for (const item of records) {
      if (item.status === 'PRESENT') result.present += 1;
      if (item.status === 'SICK') result.sick += 1;
      if (item.status === 'PERMISSION') result.permission += 1;
      if (item.status === 'ABSENT' || item.status === 'ALPHA') result.absent += 1;
      if (item.status === 'LATE') result.late += 1;
    }
    return result;
  }, [records]);

  if (isLoading) return <AppLoadingScreen message="Memuat absensi..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 8 }}>Absensi</Text>
        <QueryStateView type="error" message="Fitur absensi mobile saat ini tersedia untuk role siswa." />
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

  const moveMonth = (offset: number) => {
    setCursorDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={attendanceQuery.isFetching && !attendanceQuery.isLoading}
          onRefresh={() => attendanceQuery.refetch()}
        />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 6 }}>Absensi Saya</Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>Riwayat kehadiran bulanan.</Text>

      <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
        <Pressable
          onPress={() => moveMonth(-1)}
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#334155', fontWeight: '600' }}>Bulan Sebelumnya</Text>
        </Pressable>
        <Pressable
          onPress={() => moveMonth(1)}
          style={{
            flex: 1,
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingVertical: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#334155', fontWeight: '600' }}>Bulan Berikutnya</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight: '600', color: '#0f172a', marginBottom: 10 }}>
        {cursorDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[
          { label: 'Hadir', value: stats.present },
          { label: 'Sakit', value: stats.sick },
          { label: 'Izin', value: stats.permission },
          { label: 'Alpha', value: stats.absent },
          { label: 'Telat', value: stats.late },
        ].map((s) => (
          <View key={s.label} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 10,
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>{s.label}</Text>
              <Text style={{ fontWeight: '700', color: '#0f172a' }}>{s.value}</Text>
            </View>
          </View>
        ))}
      </View>

      {attendanceQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat absensi..." /> : null}
      {attendanceQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat riwayat absensi."
          onRetry={() => attendanceQuery.refetch()}
        />
      ) : null}

      {attendanceQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={attendanceQuery.data.cachedAt} /> : null}

      {!attendanceQuery.isLoading && !attendanceQuery.isError ? (
        records.length > 0 ? (
          <View>
            {records.map((item) => (
              <AttendanceCard key={item.id} item={item} />
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
            <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada data absensi</Text>
            <Text style={{ color: '#64748b' }}>Tidak ditemukan riwayat kehadiran untuk periode ini.</Text>
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
