import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSelectField } from '../../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { academicYearApi } from '../../../../src/features/academicYear/academicYearApi';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { principalApi } from '../../../../src/features/principal/principalApi';
import { PrincipalProctorReportRow } from '../../../../src/features/principal/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { scaleWithAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDayLabel(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function getSafeDateKey(value?: string | null) {
  if (!value) return '__no_date__';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '__no_date__';
  return date.toISOString().slice(0, 10);
}

function CompactStatChip({
  label,
  value,
  bg,
  border,
  text,
}: {
  label: string;
  value: string;
  bg: string;
  border: string;
  text: string;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 13,
        paddingVertical: 6,
      }}
    >
      <Text style={{ color: text, fontSize: scaleWithAppTextScale(13), fontWeight: '700' }}>
        {label} {value}
      </Text>
    </View>
  );
}

type PrincipalReportTimeGroup = {
  timeKey: string;
  startTime: string;
  endTime: string;
  periodNumber: number | null;
  sessionLabel: string | null;
  rows: PrincipalProctorReportRow[];
};

type PrincipalReportDayGroup = {
  dateKey: string;
  dateLabel: string;
  timeGroups: PrincipalReportTimeGroup[];
  roomCount: number;
  rowCount: number;
  reportedRowCount: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
};

export default function PrincipalExamReportsScreen() {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [selectedDate, setSelectedDate] = useState(todayInput());
  const [examTypeFilter, setExamTypeFilter] = useState('ALL');
  const [expandedDayKey, setExpandedDayKey] = useState<string | null>(null);
  const [expandedTimeGroupKey, setExpandedTimeGroupKey] = useState<string | null>(null);
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
  const examTypes = useMemo(() => {
    const options = new Set<string>();
    rows.forEach((row) => {
      const normalized = String(row.examType || '').trim().toUpperCase();
      if (normalized) options.add(normalized);
    });
    return Array.from(options).sort((a, b) => a.localeCompare(b));
  }, [rows]);
  const examTypeOptions = useMemo(
    () => [{ value: 'ALL', label: 'Semua Jenis Ujian' }, ...examTypes.map((item) => ({ value: item, label: item }))],
    [examTypes],
  );
  const groupedReportDays = useMemo<PrincipalReportDayGroup[]>(() => {
    const grouped = new Map<
      string,
      {
        dateKey: string;
        dateLabel: string;
        timeGroups: Map<
          string,
          {
            timeKey: string;
            startTime: string;
            endTime: string;
            periodNumber: number | null;
            sessionLabel: string | null;
            rows: PrincipalProctorReportRow[];
          }
        >;
      }
    >();

    rows.forEach((row) => {
      const dateKey = getSafeDateKey(row.startTime || row.endTime);
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          dateKey,
          dateLabel: formatDayLabel(row.startTime || row.endTime),
          timeGroups: new Map(),
        });
      }
      const dayGroup = grouped.get(dateKey)!;
      const periodNumber = Number.isFinite(Number(row.periodNumber)) ? Number(row.periodNumber) : null;
      const sessionLabel = typeof row.sessionLabel === 'string' && row.sessionLabel.trim() ? row.sessionLabel.trim() : null;
      const timeKey = [row.startTime, row.endTime, periodNumber ?? '', sessionLabel ?? ''].join('|');
      if (!dayGroup.timeGroups.has(timeKey)) {
        dayGroup.timeGroups.set(timeKey, {
          timeKey,
          startTime: row.startTime,
          endTime: row.endTime,
          periodNumber,
          sessionLabel,
          rows: [],
        });
      }
      dayGroup.timeGroups.get(timeKey)?.rows.push(row);
    });

    return Array.from(grouped.values())
      .sort((left, right) => left.dateKey.localeCompare(right.dateKey))
      .map((day) => {
        const timeGroups = Array.from(day.timeGroups.values())
          .map((group) => ({
            ...group,
            rows: [...group.rows].sort((left, right) =>
              String(left.room || '').localeCompare(String(right.room || ''), 'id', { sensitivity: 'base' }),
            ),
          }))
          .sort((left, right) => {
            const leftTime = new Date(left.startTime).getTime();
            const rightTime = new Date(right.startTime).getTime();
            if (leftTime !== rightTime) return leftTime - rightTime;
            return Number(left.periodNumber || 0) - Number(right.periodNumber || 0);
          });
        return {
          dateKey: day.dateKey,
          dateLabel: day.dateLabel,
          timeGroups,
          roomCount: new Set(
            timeGroups.flatMap((group) => group.rows.map((row) => String(row.room || '').trim()).filter(Boolean)),
          ).size,
          rowCount: timeGroups.reduce((sum, group) => sum + group.rows.length, 0),
          reportedRowCount: timeGroups.reduce((sum, group) => sum + group.rows.filter((row) => Boolean(row.report)).length, 0),
          totalExpected: timeGroups.reduce(
            (sum, group) => sum + group.rows.reduce((inner, row) => inner + Number(row.expectedParticipants || 0), 0),
            0,
          ),
          totalPresent: timeGroups.reduce(
            (sum, group) => sum + group.rows.reduce((inner, row) => inner + Number(row.presentParticipants || 0), 0),
            0,
          ),
          totalAbsent: timeGroups.reduce(
            (sum, group) => sum + group.rows.reduce((inner, row) => inner + Number(row.absentParticipants || 0), 0),
            0,
          ),
        };
      });
  }, [rows]);

  useEffect(() => {
    if (groupedReportDays.length === 0) {
      if (expandedDayKey !== null) setExpandedDayKey(null);
      if (expandedTimeGroupKey !== null) setExpandedTimeGroupKey(null);
      return;
    }
    const validDayKeys = new Set(groupedReportDays.map((day) => day.dateKey));
    if (expandedDayKey && !validDayKeys.has(expandedDayKey)) {
      setExpandedDayKey(null);
    }
    const timeKeyExists = groupedReportDays.some((day) =>
      day.timeGroups.some((group) => `${day.dateKey}::${group.timeKey}` === expandedTimeGroupKey),
    );
    if (!timeKeyExists && expandedTimeGroupKey !== null) {
      setExpandedTimeGroupKey(null);
    }
  }, [expandedDayKey, expandedTimeGroupKey, groupedReportDays]);

  if (isLoading) return <AppLoadingScreen message="Memuat berita acara ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'PRINCIPAL') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', marginBottom: 8 }}>Berita Acara Ujian</Text>
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
      <Text style={{ fontSize: scaleWithAppTextScale(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
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
        <MobileSelectField
          label="Jenis Ujian"
          value={examTypeFilter}
          options={examTypeOptions}
          onChange={(next) => setExamTypeFilter(next || 'ALL')}
          placeholder="Pilih jenis ujian"
        />
      </View>

      {reportsQuery.isLoading ? <QueryStateView type="loading" message="Memuat berita acara pengawas..." /> : null}
      {reportsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat berita acara pengawas." onRetry={() => reportsQuery.refetch()} />
      ) : null}

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
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12) }}>
          Ringkasan utama dipindahkan ke header jam agar kehadiran dan laporan ruang lebih mudah dibaca per pelaksanaan slot ujian.
        </Text>
      </View>

      {groupedReportDays.length > 0 ? (
        groupedReportDays.map((day) => (
          <View
            key={day.dateKey}
            style={{
              backgroundColor: '#fff',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 12,
            }}
          >
            <Pressable
              onPress={() => setExpandedDayKey((previous) => (previous === day.dateKey ? null : day.dateKey))}
              style={{
                padding: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0',
                backgroundColor: '#f8fafc',
                gap: 10,
              }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(15) }}>
                    {day.dateLabel}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                    {day.timeGroups.length} kelompok jam • {day.roomCount} ruang aktif • {day.reportedRowCount}/{day.rowCount} laporan masuk
                  </Text>
                </View>
                <Text style={{ color: '#2563eb', fontWeight: '700' }}>{expandedDayKey === day.dateKey ? 'Tutup Hari' : 'Buka Hari'}</Text>
              </View>
            </Pressable>

            {expandedDayKey === day.dateKey ? (
              <View style={{ padding: 12, gap: 10 }}>
                {day.timeGroups.map((group) => {
                  const roomCount = new Set(
                    group.rows.map((row) => String(row.room || '').trim()).filter(Boolean),
                  ).size;
                  const expectedCount = group.rows.reduce(
                    (sum, row) => sum + Number(row.expectedParticipants || 0),
                    0,
                  );
                  const presentCount = group.rows.reduce(
                    (sum, row) => sum + Number(row.presentParticipants || 0),
                    0,
                  );
                  const absentCount = group.rows.reduce(
                    (sum, row) => sum + Number(row.absentParticipants || 0),
                    0,
                  );
                  const reportedCount = group.rows.filter((row) => Boolean(row.report)).length;

                  return (
                    <View
                      key={`${day.dateKey}-${group.timeKey}`}
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe2ea',
                        borderRadius: 12,
                        overflow: 'hidden',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Pressable
                        onPress={() =>
                          setExpandedTimeGroupKey((previous) =>
                            previous === `${day.dateKey}::${group.timeKey}` ? null : `${day.dateKey}::${group.timeKey}`,
                          )
                        }
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                          borderBottomWidth: 1,
                          borderBottomColor: '#e2e8f0',
                          backgroundColor: '#f8fafc',
                          flexDirection: 'row',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 12,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleWithAppTextScale(14) }}>
                            {formatTime(group.startTime)} - {formatTime(group.endTime)} WIB
                            {group.periodNumber ? ` • Jam Ke-${group.periodNumber}` : ''}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                            {group.sessionLabel ? `Sesi ${group.sessionLabel}` : 'Tanpa sesi'} • {reportedCount}/{group.rows.length} laporan masuk
                          </Text>
                        </View>
                        <View style={{ maxWidth: '46%', alignItems: 'flex-end', gap: 8 }}>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' }}>
                            <CompactStatChip label="Ruang" value={String(roomCount)} bg="#ffffff" border="#cbd5e1" text="#475569" />
                            <CompactStatChip label="Peserta" value={String(expectedCount)} bg="#ffffff" border="#cbd5e1" text="#475569" />
                            <CompactStatChip label="Hadir" value={String(presentCount)} bg="#ecfdf5" border="#a7f3d0" text="#047857" />
                            <CompactStatChip label="Tidak Hadir" value={String(absentCount)} bg="#fff1f2" border="#fecdd3" text="#be123c" />
                          </View>
                          <Text style={{ color: '#2563eb', fontWeight: '700' }}>
                            {expandedTimeGroupKey === `${day.dateKey}::${group.timeKey}` ? 'Tutup Jam' : 'Buka Jam'}
                          </Text>
                        </View>
                      </Pressable>

                      {expandedTimeGroupKey === `${day.dateKey}::${group.timeKey}` ? (
                        <View style={{ padding: 12, gap: 10 }}>
                          {group.rows.map((row, index) => {
                          const key = `${day.dateKey}-${group.timeKey}-${row.room || '-'}-${index}`;
                          const expanded = expandedRowKey === key;
                          return (
                            <View
                              key={key}
                              style={{
                                borderWidth: 1,
                                borderColor: '#e2e8f0',
                                borderRadius: 12,
                                padding: 12,
                                backgroundColor: '#fff',
                              }}
                            >
                              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{row.room || 'Ruang belum ditentukan'}</Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                                {row.subjectName || 'Mata Pelajaran'} • {row.classNames.length > 0 ? row.classNames.join(', ') : '-'}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                                {row.examType || '-'} {row.sessionLabel ? `• ${row.sessionLabel}` : ''}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 8 }}>
                                Hadir {row.presentParticipants}/{row.totalParticipants} • Tidak hadir {row.absentParticipants}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                                Pengawas: {row.report?.proctor?.name || 'Belum submit'}
                              </Text>
                              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
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
                                      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleWithAppTextScale(12), marginTop: 3 }}>
                                        {student.className || '-'} • {student.nis || '-'}
                                      </Text>
                                      <Text style={{ color: '#be123c', fontSize: scaleWithAppTextScale(12), marginTop: 4 }}>
                                        {student.absentReason || 'Tanpa keterangan'}
                                      </Text>
                                    </View>
                                  ))}
                                </View>
                              ) : null}
                            </View>
                          );
                        })}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ))
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
