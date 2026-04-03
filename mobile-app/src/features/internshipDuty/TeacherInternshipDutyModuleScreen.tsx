import { useEffect, useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileDetailModal } from '../../components/MobileDetailModal';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { BRAND_COLORS } from '../../config/brand';
import { mobileLiveQueryOptions } from '../../lib/query/liveQuery';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { useAuth } from '../auth/AuthProvider';
import { internshipDutyApi } from './internshipDutyApi';
import { InternshipAttendanceRow, InternshipJournalRow } from './types';

type ModuleMode = 'GUIDANCE' | 'DEFENSE';
type JournalFilter = 'ALL' | 'PENDING' | 'VERIFIED' | 'REJECTED';

function toText(value?: string | null) {
  if (!value) return '-';
  return String(value);
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

function formatDateTime(value?: string | null) {
  if (!value) return '-';
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

function resolveInternshipStatusLabel(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (!value) return 'Unknown';
  if (value === 'PROPOSED') return 'Diajukan';
  if (value === 'WAITING_ACCEPTANCE_LETTER') return 'Menunggu Surat';
  if (value === 'APPROVED') return 'Disetujui';
  if (value === 'ACTIVE') return 'Aktif PKL';
  if (value === 'REPORT_SUBMITTED') return 'Laporan Masuk';
  if (value === 'DEFENSE_SCHEDULED') return 'Sidang Dijadwalkan';
  if (value === 'DEFENSE_COMPLETED') return 'Sidang Selesai';
  if (value === 'COMPLETED') return 'Selesai';
  if (value === 'REJECTED') return 'Ditolak';
  return value;
}

function resolveInternshipStatusStyle(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (['APPROVED', 'ACTIVE', 'REPORT_SUBMITTED', 'DEFENSE_SCHEDULED'].includes(value)) {
    return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  }
  if (['DEFENSE_COMPLETED', 'COMPLETED'].includes(value)) {
    return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  }
  if (value === 'REJECTED') {
    return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2' };
  }
  return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7' };
}

function resolveJournalStatus(status?: string | null): JournalFilter {
  const value = String(status || '').toUpperCase();
  if (value === 'VERIFIED') return 'VERIFIED';
  if (value === 'REJECTED') return 'REJECTED';
  return 'PENDING';
}

function resolveJournalStatusStyle(status?: string | null) {
  const value = resolveJournalStatus(status);
  if (value === 'VERIFIED') return { text: '#166534', border: '#86efac', bg: '#dcfce7', label: 'Terverifikasi' };
  if (value === 'REJECTED') return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2', label: 'Ditolak' };
  return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7', label: 'Menunggu' };
}

function resolveAttendanceLabel(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (value === 'PRESENT') return 'Hadir';
  if (value === 'SICK') return 'Sakit';
  if (value === 'PERMISSION') return 'Izin';
  if (value === 'ABSENT') return 'Alpa';
  return toText(status);
}

function resolveAttendanceStyle(status?: string | null) {
  const value = String(status || '').toUpperCase();
  if (value === 'PRESENT') return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  if (value === 'SICK') return { text: '#92400e', border: '#fcd34d', bg: '#fef3c7' };
  if (value === 'PERMISSION') return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  return { text: '#991b1b', border: '#fca5a5', bg: '#fee2e2' };
}

function EmptyStateCard({ message }: { message: string }) {
  return (
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
      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>Belum ada data</Text>
      <Text style={{ color: '#64748b' }}>{message}</Text>
    </View>
  );
}

function moduleIcon(mode: ModuleMode): keyof typeof Feather.glyphMap {
  return mode === 'GUIDANCE' ? 'users' : 'clipboard';
}

const getActionErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return err.response?.data?.message || err.message || fallback;
  }
  return fallback;
};

export function TeacherInternshipDutyModuleScreen({
  mode,
  title,
  subtitle,
}: {
  mode: ModuleMode;
  title: string;
  subtitle: string;
}) {
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [search, setSearch] = useState('');
  const [selectedInternshipId, setSelectedInternshipId] = useState<number | null>(null);
  const [journalFilter, setJournalFilter] = useState<JournalFilter>('ALL');
  const [scorePresentation, setScorePresentation] = useState('');
  const [scoreUnderstanding, setScoreUnderstanding] = useState('');
  const [scoreRelevance, setScoreRelevance] = useState('');
  const [scoreSystematics, setScoreSystematics] = useState('');
  const [defenseNotes, setDefenseNotes] = useState('');
  const [summaryDetailVisible, setSummaryDetailVisible] = useState(false);
  const journalFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Status' },
      { value: 'PENDING', label: 'Menunggu' },
      { value: 'VERIFIED', label: 'Terverifikasi' },
      { value: 'REJECTED', label: 'Ditolak' },
    ],
    [],
  );

  const isTeacher = user?.role === 'TEACHER';

  const internshipsQuery = useQuery({
    queryKey: ['mobile-internship-duty', user?.id, mode],
    enabled: isAuthenticated && !!isTeacher,
    queryFn: async () => {
      if (mode === 'GUIDANCE') return internshipDutyApi.listAssignedInternships();
      return internshipDutyApi.listExaminerInternships();
    },
    ...mobileLiveQueryOptions,
  });

  const internshipsFiltered = useMemo(() => {
    const rows = internshipsQuery.data || [];
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => {
      const values = [
        item.student?.name || '',
        item.student?.studentClass?.name || '',
        item.companyName || '',
        item.status || '',
      ];
      return values.some((value) => value.toLowerCase().includes(term));
    });
  }, [internshipsQuery.data, search]);

  useEffect(() => {
    if (!internshipsFiltered.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedInternshipId(null);
      return;
    }
    if (!selectedInternshipId || !internshipsFiltered.some((item) => item.id === selectedInternshipId)) {
      setSelectedInternshipId(internshipsFiltered[0].id);
    }
  }, [internshipsFiltered, selectedInternshipId]);

  const journalsQuery = useQuery({
    queryKey: ['mobile-internship-duty-journals', user?.id, selectedInternshipId],
    enabled: isAuthenticated && !!isTeacher && mode === 'GUIDANCE' && !!selectedInternshipId,
    queryFn: async () => internshipDutyApi.listJournals(Number(selectedInternshipId)),
    ...mobileLiveQueryOptions,
  });

  const attendancesQuery = useQuery({
    queryKey: ['mobile-internship-duty-attendances', user?.id, selectedInternshipId],
    enabled: isAuthenticated && !!isTeacher && mode === 'GUIDANCE' && !!selectedInternshipId,
    queryFn: async () => internshipDutyApi.listAttendances(Number(selectedInternshipId)),
    ...mobileLiveQueryOptions,
  });

  const updateJournalMutation = useMutation({
    mutationFn: async (payload: { id: number; status: 'VERIFIED' | 'REJECTED' }) =>
      internshipDutyApi.approveJournal(payload.id, {
        status: payload.status,
        feedback: payload.status === 'REJECTED' ? 'Perlu revisi jurnal dari aplikasi mobile.' : undefined,
      }),
    onSuccess: () => {
      void journalsQuery.refetch();
      Alert.alert('Berhasil', 'Status jurnal berhasil diperbarui.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat memperbarui status jurnal.'));
    },
  });

  const defenseAveragePreview = useMemo(() => {
    const values = [scorePresentation, scoreUnderstanding, scoreRelevance, scoreSystematics]
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value));
    if (values.length !== 4) return null;
    return values.reduce((sum, value) => sum + value, 0) / 4;
  }, [scorePresentation, scoreUnderstanding, scoreRelevance, scoreSystematics]);

  const gradeDefenseMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInternshipId) throw new Error('Pilih data sidang terlebih dahulu.');
      const toScore = (raw: string, label: string) => {
        const value = Number(raw);
        if (Number.isNaN(value)) throw new Error(`${label} wajib angka.`);
        if (value < 0 || value > 100) throw new Error(`${label} harus 0-100.`);
        return value;
      };
      return internshipDutyApi.gradeDefense(selectedInternshipId, {
        scorePresentation: toScore(scorePresentation, 'Nilai presentasi'),
        scoreUnderstanding: toScore(scoreUnderstanding, 'Nilai pemahaman'),
        scoreRelevance: toScore(scoreRelevance, 'Nilai relevansi'),
        scoreSystematics: toScore(scoreSystematics, 'Nilai sistematika'),
        defenseNotes: defenseNotes.trim() || undefined,
      });
    },
    onSuccess: async (updated) => {
      await internshipsQuery.refetch();
      if (updated) {
        setScorePresentation(typeof updated.scorePresentation === 'number' ? String(updated.scorePresentation) : '');
        setScoreUnderstanding(typeof updated.scoreUnderstanding === 'number' ? String(updated.scoreUnderstanding) : '');
        setScoreRelevance(typeof updated.scoreRelevance === 'number' ? String(updated.scoreRelevance) : '');
        setScoreSystematics(typeof updated.scoreSystematics === 'number' ? String(updated.scoreSystematics) : '');
      }
      Alert.alert('Berhasil', 'Nilai sidang berhasil disimpan.');
    },
    onError: (error: unknown) => {
      Alert.alert('Gagal', getActionErrorMessage(error, 'Tidak dapat menyimpan nilai sidang.'));
    },
  });

  const selectedInternship = useMemo(
    () => internshipsFiltered.find((item) => item.id === selectedInternshipId) || null,
    [internshipsFiltered, selectedInternshipId],
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode !== 'DEFENSE') return;
    setScorePresentation(
      typeof selectedInternship?.scorePresentation === 'number' ? String(selectedInternship.scorePresentation) : '',
    );
    setScoreUnderstanding(
      typeof selectedInternship?.scoreUnderstanding === 'number' ? String(selectedInternship.scoreUnderstanding) : '',
    );
    setScoreRelevance(typeof selectedInternship?.scoreRelevance === 'number' ? String(selectedInternship.scoreRelevance) : '');
    setScoreSystematics(
      typeof selectedInternship?.scoreSystematics === 'number' ? String(selectedInternship.scoreSystematics) : '',
    );
    setDefenseNotes(selectedInternship?.defenseNotes || '');
  }, [mode, selectedInternship?.defenseNotes, selectedInternship?.id, selectedInternship?.scorePresentation, selectedInternship?.scoreRelevance, selectedInternship?.scoreSystematics, selectedInternship?.scoreUnderstanding]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const journalsFiltered = useMemo(() => {
    const rows = journalsQuery.data || [];
    return rows.filter((item) => {
      if (journalFilter === 'ALL') return true;
      return resolveJournalStatus(item.status) === journalFilter;
    });
  }, [journalsQuery.data, journalFilter]);

  const summary = useMemo(() => {
    const rows = internshipsQuery.data || [];
    const active = rows.filter((item) => String(item.status || '').toUpperCase() === 'ACTIVE').length;
    const scheduled = rows.filter((item) => !!item.defenseDate).length;
    const completed = rows.filter((item) => {
      const status = String(item.status || '').toUpperCase();
      return ['COMPLETED', 'DEFENSE_COMPLETED'].includes(status) || typeof item.finalGrade === 'number';
    }).length;

    return {
      total: rows.length,
      active,
      scheduled,
      completed,
      pendingJournals: (journalsQuery.data || []).filter((item) => resolveJournalStatus(item.status) === 'PENDING')
        .length,
      attendanceRows: (attendancesQuery.data || []).length,
    };
  }, [internshipsQuery.data, journalsQuery.data, attendancesQuery.data]);

  const refreshAll = () => {
    void internshipsQuery.refetch();
    if (mode === 'GUIDANCE' && selectedInternshipId) {
      void journalsQuery.refetch();
      void attendancesQuery.refetch();
    }
  };

  const requestJournalUpdate = (item: InternshipJournalRow, status: 'VERIFIED' | 'REJECTED') => {
    Alert.alert(
      'Konfirmasi',
      `Ubah status jurnal menjadi ${status === 'VERIFIED' ? 'Terverifikasi' : 'Ditolak'}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Lanjut',
          onPress: () => {
            void updateJournalMutation.mutateAsync({ id: item.id, status });
          },
        },
      ],
    );
  };

  if (isLoading) return <AppLoadingScreen message={`Memuat ${title.toLowerCase()}...`} />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!isTeacher) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>{title}</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={<RefreshControl refreshing={internshipsQuery.isLoading} onRefresh={refreshAll} />}
    >
      <View
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
          flexDirection: 'row',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 19,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.4)',
            backgroundColor: 'rgba(255,255,255,0.15)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
          }}
        >
          <Feather name={moduleIcon(mode)} size={18} color="#e2e8f0" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>{title}</Text>
          <Text style={{ color: '#dbeafe', marginTop: 2 }}>{subtitle}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
        {[
          {
            key: 'total',
            title: 'Total Siswa PKL',
            value: String(summary.total),
            subtitle: 'Akses sesuai penugasan',
            iconName: 'users' as const,
            accentColor: '#2563eb',
          },
          {
            key: 'middle',
            title: mode === 'GUIDANCE' ? 'Jurnal Menunggu' : 'Sidang Terjadwal',
            value: mode === 'GUIDANCE' ? String(summary.pendingJournals) : String(summary.scheduled),
            subtitle: mode === 'GUIDANCE' ? 'Perlu verifikasi' : 'Siap dipantau',
            iconName: mode === 'GUIDANCE' ? ('clock' as const) : ('calendar' as const),
            accentColor: '#f59e0b',
          },
          {
            key: 'last',
            title: mode === 'GUIDANCE' ? 'Data Absensi' : 'Selesai',
            value: mode === 'GUIDANCE' ? String(summary.attendanceRows) : String(summary.completed),
            subtitle: mode === 'GUIDANCE' ? 'Tersinkron' : 'Sidang selesai',
            iconName: mode === 'GUIDANCE' ? ('check-square' as const) : ('check-circle' as const),
            accentColor: '#16a34a',
          },
        ].map((item) => (
          <View key={item.key} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
            <MobileSummaryCard
              title={item.title}
              value={item.value}
              subtitle={item.subtitle}
              iconName={item.iconName}
              accentColor={item.accentColor}
              onPress={() => setSummaryDetailVisible(true)}
            />
          </View>
        ))}
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
          placeholder="Cari siswa, kelas, perusahaan..."
          style={{ flex: 1, marginLeft: 8, color: '#0f172a' }}
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
        />
      </View>

      {internshipsQuery.isLoading ? <QueryStateView type="loading" message="Memuat data PKL..." /> : null}
      {internshipsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data PKL." onRetry={refreshAll} />
      ) : null}

      {!internshipsQuery.isLoading && !internshipsQuery.isError ? (
        internshipsFiltered.length > 0 ? (
          internshipsFiltered.map((item) => {
            const badge = resolveInternshipStatusStyle(item.status);
            const selected = selectedInternshipId === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  setSelectedInternshipId(item.id);
                }}
                style={{
                  backgroundColor: selected ? '#eff6ff' : '#fff',
                  borderWidth: 1,
                  borderColor: selected ? '#93c5fd' : '#dbe7fb',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 10,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{toText(item.student?.name)}</Text>
                    <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>
                      {toText(item.student?.studentClass?.name)} • {toText(item.companyName)}
                    </Text>
                  </View>
                  <View
                    style={{
                      borderWidth: 1,
                      borderColor: badge.border,
                      backgroundColor: badge.bg,
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                    }}
                  >
                    <Text style={{ color: badge.text, fontWeight: '700', fontSize: 11 }}>
                      {resolveInternshipStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>

                <Text style={{ color: '#334155', fontSize: 12, marginTop: 8 }}>
                  Mentor: {toText(item.mentorName)} • NIS: {toText(item.student?.nis)}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                  Mulai {formatDate(item.startDate)} • Selesai {formatDate(item.endDate)}
                </Text>
                {mode === 'DEFENSE' ? (
                  <Text style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
                    Sidang: {formatDateTime(item.defenseDate)} • Ruang: {toText(item.defenseRoom)}
                  </Text>
                ) : null}
                {mode === 'DEFENSE' ? (
                  <Text style={{ color: '#334155', fontSize: 11, marginTop: 2 }}>
                    Nilai industri: {typeof item.industryScore === 'number' ? item.industryScore.toFixed(2) : '-'} •
                    Nilai sidang: {typeof item.defenseScore === 'number' ? item.defenseScore.toFixed(2) : '-'} • Nilai akhir:{' '}
                    {typeof item.finalGrade === 'number' ? item.finalGrade.toFixed(2) : '-'}
                  </Text>
                ) : null}
              </Pressable>
            );
          })
        ) : (
          <EmptyStateCard
            message={
              mode === 'GUIDANCE'
                ? 'Belum ada siswa PKL yang ditugaskan sebagai bimbingan Anda.'
                : 'Belum ada jadwal sidang PKL untuk akun Anda.'
            }
          />
        )
      ) : null}

      {mode === 'GUIDANCE' && selectedInternship ? (
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
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
            Detail Bimbingan: {toText(selectedInternship.student?.name)}
          </Text>

          <MobileSelectField
            label="Filter Status Jurnal"
            value={journalFilter}
            options={journalFilterOptions}
            onChange={(next) => setJournalFilter((next as JournalFilter) || 'ALL')}
            placeholder="Pilih status jurnal"
          />

          {journalsQuery.isLoading ? <QueryStateView type="loading" message="Memuat jurnal..." /> : null}
          {journalsQuery.isError ? (
            <QueryStateView type="error" message="Gagal memuat jurnal." onRetry={() => void journalsQuery.refetch()} />
          ) : null}

          {!journalsQuery.isLoading && !journalsQuery.isError ? (
            journalsFiltered.length > 0 ? (
              journalsFiltered.map((journal) => {
                const journalBadge = resolveJournalStatusStyle(journal.status);
                const isPending = resolveJournalStatus(journal.status) === 'PENDING';
                return (
                  <View
                    key={journal.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatDate(journal.date)}</Text>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: journalBadge.border,
                          backgroundColor: journalBadge.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: journalBadge.text, fontWeight: '700', fontSize: 11 }}>
                          {journalBadge.label}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>{toText(journal.activity)}</Text>
                    <Text style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                      Dibuat: {formatDateTime(journal.createdAt)}
                    </Text>
                    {journal.feedback ? (
                      <Text style={{ color: '#991b1b', fontSize: 11, marginTop: 4 }}>Catatan: {journal.feedback}</Text>
                    ) : null}
                    {isPending ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Pressable
                          onPress={() => requestJournalUpdate(journal, 'VERIFIED')}
                          disabled={updateJournalMutation.isPending}
                          style={{
                            flex: 1,
                            borderRadius: 8,
                            paddingVertical: 9,
                            alignItems: 'center',
                            backgroundColor: BRAND_COLORS.blue,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700' }}>Verifikasi</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => requestJournalUpdate(journal, 'REJECTED')}
                          disabled={updateJournalMutation.isPending}
                          style={{
                            flex: 1,
                            borderRadius: 8,
                            paddingVertical: 9,
                            alignItems: 'center',
                            borderWidth: 1,
                            borderColor: '#fca5a5',
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Tolak</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })
            ) : (
              <EmptyStateCard message="Belum ada jurnal untuk filter saat ini." />
            )
          ) : null}

          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginTop: 10, marginBottom: 8 }}>
            Absensi PKL
          </Text>

          {attendancesQuery.isLoading ? <QueryStateView type="loading" message="Memuat absensi..." /> : null}
          {attendancesQuery.isError ? (
            <QueryStateView
              type="error"
              message="Gagal memuat absensi."
              onRetry={() => void attendancesQuery.refetch()}
            />
          ) : null}

          {!attendancesQuery.isLoading && !attendancesQuery.isError ? (
            (attendancesQuery.data || []).length > 0 ? (
              (attendancesQuery.data || []).map((attendance: InternshipAttendanceRow) => {
                const style = resolveAttendanceStyle(attendance.status);
                return (
                  <View
                    key={attendance.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatDate(attendance.date)}</Text>
                      <Text style={{ color: '#64748b', marginTop: 2, fontSize: 12 }}>{toText(attendance.note)}</Text>
                    </View>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: style.border,
                        backgroundColor: style.bg,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                      }}
                    >
                      <Text style={{ color: style.text, fontWeight: '700', fontSize: 11 }}>
                        {resolveAttendanceLabel(attendance.status)}
                      </Text>
                    </View>
                  </View>
                );
              })
            ) : (
              <EmptyStateCard message="Belum ada data absensi PKL." />
            )
          ) : null}
        </View>
      ) : null}

      {mode === 'DEFENSE' ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            borderRadius: 10,
            backgroundColor: '#fff',
            padding: 12,
            marginBottom: 10,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 4 }}>
            Input Nilai Sidang
          </Text>
          {selectedInternship ? (
            <>
              <Text style={{ color: '#475569', marginBottom: 10 }}>
                Isi komponen nilai untuk {toText(selectedInternship.student?.name)}.
              </Text>

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Presentasi (0-100)</Text>
              <TextInput
                value={scorePresentation}
                onChangeText={setScorePresentation}
                keyboardType="numeric"
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Pemahaman (0-100)</Text>
              <TextInput
                value={scoreUnderstanding}
                onChangeText={setScoreUnderstanding}
                keyboardType="numeric"
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Relevansi (0-100)</Text>
              <TextInput
                value={scoreRelevance}
                onChangeText={setScoreRelevance}
                keyboardType="numeric"
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Sistematika (0-100)</Text>
              <TextInput
                value={scoreSystematics}
                onChangeText={setScoreSystematics}
                keyboardType="numeric"
                placeholder="0-100"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  marginBottom: 8,
                }}
              />

              <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>Catatan Sidang</Text>
              <TextInput
                value={defenseNotes}
                onChangeText={setDefenseNotes}
                multiline
                textAlignVertical="top"
                placeholder="Catatan penguji (opsional)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: BRAND_COLORS.textDark,
                  minHeight: 84,
                  marginBottom: 8,
                }}
              />

              <Text style={{ color: '#475569', marginBottom: 8 }}>
                Rata-rata komponen: {typeof defenseAveragePreview === 'number' ? defenseAveragePreview.toFixed(2) : '-'}
              </Text>
              <Pressable
                onPress={() => {
                  void gradeDefenseMutation.mutateAsync();
                }}
                disabled={gradeDefenseMutation.isPending}
                style={{
                  borderRadius: 10,
                  backgroundColor: gradeDefenseMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                  paddingVertical: 11,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {gradeDefenseMutation.isPending ? 'Menyimpan Nilai...' : 'Simpan Nilai Sidang'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={{ color: '#475569' }}>Pilih siswa pada daftar sidang di atas untuk input nilai.</Text>
          )}
        </View>
      ) : null}

      <MobileDetailModal
        visible={summaryDetailVisible}
        title={mode === 'GUIDANCE' ? 'Ringkasan Bimbingan PKL' : 'Ringkasan Sidang PKL'}
        subtitle="Detail ringkas penugasan PKL sesuai mode yang sedang diakses."
        iconName={mode === 'GUIDANCE' ? 'users' : 'clipboard'}
        accentColor="#2563eb"
        onClose={() => setSummaryDetailVisible(false)}
      >
        <View style={{ gap: 10 }}>
          {[
            {
              label: 'Total Siswa PKL',
              value: String(summary.total),
              note: 'Data PKL sesuai penugasan guru yang sedang aktif',
            },
            {
              label: mode === 'GUIDANCE' ? 'Jurnal Menunggu' : 'Sidang Terjadwal',
              value: mode === 'GUIDANCE' ? String(summary.pendingJournals) : String(summary.scheduled),
              note: mode === 'GUIDANCE' ? 'Masih menunggu verifikasi jurnal' : 'Siap dipantau di menu sidang',
            },
            {
              label: mode === 'GUIDANCE' ? 'Data Absensi' : 'Sidang Selesai',
              value: mode === 'GUIDANCE' ? String(summary.attendanceRows) : String(summary.completed),
              note: mode === 'GUIDANCE' ? 'Total baris absensi PKL yang tersinkron' : 'Sudah memiliki hasil akhir sidang',
            },
          ].map((item) => (
            <View
              key={item.label}
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#f8fbff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>{item.label}</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>{item.value}</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 11, marginTop: 3 }}>{item.note}</Text>
            </View>
          ))}
          {selectedInternship ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 14,
                paddingHorizontal: 12,
                paddingVertical: 11,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b', fontSize: 11, marginBottom: 4 }}>Data Aktif</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                Siswa: {toText(selectedInternship.student?.name)}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600', marginTop: 2 }}>
                Kelas: {toText(selectedInternship.student?.studentClass?.name)}
              </Text>
            </View>
          ) : null}
        </View>
      </MobileDetailModal>
    </ScrollView>
  );
}
