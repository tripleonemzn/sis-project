import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../../src/components/OfflineCacheNotice';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { StudentAttendanceStatus } from '../../../src/features/attendance/types';
import { useParentChildrenQuery } from '../../../src/features/parent/useParentChildrenQuery';
import { useParentChildAttendanceQuery } from '../../../src/features/parent/useParentChildAttendanceQuery';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

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

export default function ParentAttendanceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ childId?: string }>();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { scaleFont } = useAppTextScale();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [manualSelectedChildId, setManualSelectedChildId] = useState<number | null>(null);
  const { month, year } = toMonthYear(cursorDate);

  const childrenQuery = useParentChildrenQuery({ enabled: isAuthenticated, user });
  const children = useMemo(() => childrenQuery.data?.children ?? [], [childrenQuery.data?.children]);
  const selectedChildId = useMemo(() => {
    if (!children.length) return null;
    if (manualSelectedChildId && children.some((child) => child.id === manualSelectedChildId)) {
      return manualSelectedChildId;
    }
    const queryChildId = params.childId ? Number(params.childId) : null;
    const validQueryChildId =
      queryChildId && children.some((child) => child.id === queryChildId) ? queryChildId : null;
    return validQueryChildId ?? children[0].id;
  }, [children, manualSelectedChildId, params.childId]);

  const attendanceQuery = useParentChildAttendanceQuery({
    enabled: isAuthenticated,
    user,
    childId: selectedChildId,
    month,
    year,
  });

  const selectedChild = children.find((child) => child.id === selectedChildId) || null;
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

  if (isLoading) return <AppLoadingScreen message="Memuat absensi anak..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PARENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 8 }}>Absensi Anak</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role orang tua." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{
            marginTop: 16,
            backgroundColor: BRAND_COLORS.blue,
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
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
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={(childrenQuery.isFetching || attendanceQuery.isFetching) && !childrenQuery.isLoading}
          onRefresh={() => {
            void childrenQuery.refetch();
            void attendanceQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>Absensi Anak</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Pantau kehadiran harian anak berdasarkan periode bulan.
      </Text>

      {childrenQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data anak..." /> : null}
      {childrenQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data anak." onRetry={() => childrenQuery.refetch()} />
      ) : null}

      {!childrenQuery.isLoading && !childrenQuery.isError ? (
        children.length > 0 ? (
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Pilih Anak</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {children.map((child) => {
                const selected = selectedChildId === child.id;
                return (
                  <View key={child.id} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
                    <Pressable
                      onPress={() => setManualSelectedChildId(child.id)}
                      style={{
                        borderWidth: 1,
                        borderColor: selected ? BRAND_COLORS.blue : '#d5e1f5',
                        backgroundColor: selected ? '#e9f1ff' : '#fff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                      }}
                    >
                      <Text numberOfLines={1} style={{ color: selected ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                        {child.name}
                      </Text>
                      <Text numberOfLines={1} style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 2 }}>
                        {child.studentClass?.name || '-'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null
      ) : null}

      {selectedChild ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(16) }}>{selectedChild.name}</Text>
          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 2 }}>
            {selectedChild.studentClass?.name || '-'} • {selectedChild.nisn || '-'}
          </Text>
        </View>
      ) : null}

      {selectedChild ? (
        <>
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
                  <Text style={{ fontSize: scaleFont(11), color: '#64748b', marginBottom: 2 }}>{s.label}</Text>
                  <Text style={{ fontWeight: '700', color: '#0f172a' }}>{s.value}</Text>
                </View>
              </View>
            ))}
          </View>

          {attendanceQuery.isLoading ? <QueryStateView type="loading" message="Mengambil riwayat absensi..." /> : null}
          {attendanceQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat riwayat absensi anak." onRetry={() => attendanceQuery.refetch()} />
          ) : null}
          {attendanceQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={attendanceQuery.data.cachedAt} /> : null}

          {!attendanceQuery.isLoading && !attendanceQuery.isError ? (
            records.length > 0 ? (
              <View>
                {records.map((item) => {
                  const status = item.status;
                  const color = STATUS_COLORS[status] || '#334155';
                  const note = item.note || item.notes || '-';
                  return (
                    <View
                      key={item.id}
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
                      <Text style={{ fontSize: scaleFont(12), color: '#475569', marginBottom: 3 }}>
                        Masuk: {item.checkInTime || '-'} | Pulang: {item.checkOutTime || '-'}
                      </Text>
                      <Text style={{ fontSize: scaleFont(12), color: '#64748b' }}>Catatan: {note}</Text>
                    </View>
                  );
                })}
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
          <Text style={{ fontWeight: '700', marginBottom: 4, color: '#0f172a' }}>Belum ada anak terhubung</Text>
          <Text style={{ color: '#64748b' }}>Hubungkan data siswa ke akun orang tua melalui admin untuk melihat absensi.</Text>
        </View>
      )}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          marginTop: 18,
          backgroundColor: BRAND_COLORS.blue,
          paddingVertical: 12,
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
