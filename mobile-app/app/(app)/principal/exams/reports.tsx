import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../../src/features/principal/principalApi';
import { PrincipalProctorReportRow } from '../../../../src/features/principal/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function SummaryCard({ title, value, subtitle, accent }: { title: string; value: number; subtitle: string; accent: string }) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: accent,
        borderRadius: 12,
        padding: 12,
        flex: 1,
      }}
    >
      <Text style={{ color: '#64748b', fontSize: 11 }}>{title}</Text>
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 22, marginTop: 6 }}>{value}</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{subtitle}</Text>
    </View>
  );
}

export default function PrincipalExamReportsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedDate, setSelectedDate] = useState(todayInput());
  const [examTypeFilter, setExamTypeFilter] = useState('ALL');
  const [expandedRowKey, setExpandedRowKey] = useState<string | null>(null);

  const activeYearQuery = useQuery({
    queryKey: ['mobile-principal-exam-reports-active-year'],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: async () => {
      try {
        return await academicYearApi.getActive();
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  const reportsQuery = useQuery({
    queryKey: ['mobile-principal-exam-reports', user?.id, activeYearQuery.data?.id || 'none', selectedDate, examTypeFilter],
    enabled: isAuthenticated && user?.role === 'PRINCIPAL',
    queryFn: () =>
      principalApi.getProctorReports({
        academicYearId: activeYearQuery.data?.id,
        date: selectedDate || undefined,
        examType: examTypeFilter !== 'ALL' ? examTypeFilter : undefined,
      }),
    staleTime: 60 * 1000,
  });

  const rows = useMemo(() => reportsQuery.data?.rows || [], [reportsQuery.data?.rows]);
  const summary = reportsQuery.data?.summary || {
    totalRooms: 0,
    totalExpected: 0,
    totalPresent: 0,
    totalAbsent: 0,
    reportedRooms: 0,
  };
  const examTypes = useMemo(() => {
    const options = new Set<string>();
    rows.forEach((row) => {
      const normalized = String(row.examType || '').trim().toUpperCase();
      if (normalized) options.add(normalized);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  if (isLoading) return <AppLoadingScreen message="Memuat berita acara ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Berita Acara Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role kepala sekolah." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={activeYearQuery.isFetching || reportsQuery.isFetching}
          onRefresh={() => {
            void activeYearQuery.refetch();
            void reportsQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Berita Acara Ujian
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Monitoring ruang aktif, kehadiran peserta, dan catatan pengawas ruang secara real-time.
      </Text>

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
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>Filter Tanggal</Text>
        <TextInput
          value={selectedDate}
          onChangeText={setSelectedDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: BRAND_COLORS.textDark,
            backgroundColor: '#fff',
            marginBottom: 8,
          }}
        />
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Jenis Ujian</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            onPress={() => setExamTypeFilter('ALL')}
            style={{
              borderWidth: 1,
              borderColor: examTypeFilter === 'ALL' ? BRAND_COLORS.blue : '#d5e1f5',
              backgroundColor: examTypeFilter === 'ALL' ? '#e9f1ff' : '#fff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: examTypeFilter === 'ALL' ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
              Semua
            </Text>
          </Pressable>
          {examTypes.map((item) => {
            const active = examTypeFilter === item;
            return (
              <Pressable
                key={item}
                onPress={() => setExamTypeFilter(item)}
                style={{
                  borderWidth: 1,
                  borderColor: active ? BRAND_COLORS.blue : '#d5e1f5',
                  backgroundColor: active ? '#e9f1ff' : '#fff',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                }}
              >
                <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700', fontSize: 12 }}>
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {reportsQuery.isLoading ? <QueryStateView type="loading" message="Memuat berita acara pengawas..." /> : null}
      {reportsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat berita acara pengawas." onRetry={() => reportsQuery.refetch()} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <SummaryCard title="Ruang Aktif" value={summary.totalRooms} subtitle="Total ruang pada filter" accent="#bfdbfe" />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <SummaryCard title="Sudah Melapor" value={summary.reportedRooms} subtitle="Ruang yang sudah submit" accent="#bbf7d0" />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <SummaryCard title="Peserta Hadir" value={summary.totalPresent} subtitle="Peserta tercatat hadir" accent="#d5e1f5" />
        </View>
        <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
          <SummaryCard title="Tidak Hadir" value={summary.totalAbsent} subtitle="Perlu validasi lanjutan" accent="#fecaca" />
        </View>
      </View>

      {rows.length > 0 ? (
        rows.map((row: PrincipalProctorReportRow, index) => {
          const key = `${row.room || '-'}-${row.startTime}-${index}`;
          const expanded = expandedRowKey === key;
          return (
            <View
              key={key}
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.room || 'Ruang belum ditentukan'}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                {formatDate(row.startTime)} • {formatTime(row.startTime)} - {formatTime(row.endTime)}
                {row.sessionLabel ? ` • ${row.sessionLabel}` : ''}
                {row.examType ? ` • ${row.examType}` : ''}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                Kelas: {row.classNames.length > 0 ? row.classNames.join(', ') : '-'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 8 }}>
                Hadir {row.presentParticipants}/{row.totalParticipants} • Tidak hadir {row.absentParticipants}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                Pengawas: {row.report?.proctor?.name || 'Belum submit'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                Catatan: {row.report?.notes || row.report?.incident || '-'}
              </Text>

              {Array.isArray(row.absentStudents) && row.absentStudents.length > 0 ? (
                <Pressable
                  onPress={() => setExpandedRowKey(expanded ? null : key)}
                  style={{
                    marginTop: 10,
                    borderWidth: 1,
                    borderColor: '#fecaca',
                    borderRadius: 10,
                    paddingVertical: 10,
                    alignItems: 'center',
                    backgroundColor: '#fff1f2',
                  }}
                >
                  <Text style={{ color: '#be123c', fontWeight: '700' }}>
                    {expanded ? 'Sembunyikan Daftar Tidak Hadir' : `Lihat ${row.absentStudents.length} Siswa Tidak Hadir`}
                  </Text>
                </Pressable>
              ) : null}

              {expanded && Array.isArray(row.absentStudents) ? (
                <View style={{ marginTop: 10 }}>
                  {row.absentStudents.map((student, studentIndex) => (
                    <View
                      key={`${student.id}-${studentIndex}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#fecaca',
                        borderRadius: 10,
                        padding: 10,
                        marginBottom: 8,
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 3 }}>
                        {student.className || '-'} • {student.nis || '-'}
                      </Text>
                      <Text style={{ color: '#be123c', fontSize: 12, marginTop: 4 }}>
                        {student.absentReason || 'Tanpa keterangan'}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })
      ) : !reportsQuery.isLoading && !reportsQuery.isError ? (
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: '#cbd5e1',
            borderRadius: 10,
            padding: 14,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada berita acara pada filter saat ini.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}
