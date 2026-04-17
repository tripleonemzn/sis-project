import { useMemo, useState } from 'react';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import { Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { studentInternshipApi } from '../../../src/features/student/studentInternshipApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { ENV } from '../../../src/config/env';
import { openWebModuleRoute } from '../../../src/lib/navigation/webModuleRoute';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type InternshipTab = 'OVERVIEW' | 'JOURNAL' | 'ATTENDANCE' | 'REPORT';

function toIsoDateOnly(input?: string | null) {
  if (!input) return '';
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function formatDate(input?: string | null) {
  if (!input) return '-';
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return '-';
  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function resolvePublicUrl(pathOrUrl?: string | null) {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  const apiOrigin = ENV.API_BASE_URL.replace(/\/api\/?$/, '');
  return `${apiOrigin}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export default function StudentInternshipScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { scaleFont, fontSizes } = useAppTextScale();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const initialTab = String(params.tab || '').toUpperCase();
  const [tab, setTab] = useState<InternshipTab>(
    initialTab === 'JOURNAL' || initialTab === 'ATTENDANCE' || initialTab === 'REPORT'
      ? (initialTab as InternshipTab)
      : 'OVERVIEW',
  );

  const overviewQuery = useQuery({
    queryKey: ['mobile-student-internship-overview', user?.id],
    queryFn: () => studentInternshipApi.getMyInternship(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const internshipId = overviewQuery.data?.internship?.id || null;

  const journalsQuery = useQuery({
    queryKey: ['mobile-student-internship-journals', internshipId],
    queryFn: () => studentInternshipApi.listJournals(Number(internshipId)),
    enabled: Boolean(internshipId),
  });

  const attendancesQuery = useQuery({
    queryKey: ['mobile-student-internship-attendances', internshipId],
    queryFn: () => studentInternshipApi.listAttendances(Number(internshipId)),
    enabled: Boolean(internshipId),
  });

  const internship = overviewQuery.data?.internship || null;
  const isEligible = Boolean(overviewQuery.data?.isEligible);

  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [mentorName, setMentorName] = useState('');
  const [mentorPhone, setMentorPhone] = useState('');
  const [mentorEmail, setMentorEmail] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reportTitle, setReportTitle] = useState('');

  const [journalDate, setJournalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [journalActivity, setJournalActivity] = useState('');
  const [journalFile, setJournalFile] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);

  const [attendanceDate, setAttendanceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attendanceStatus, setAttendanceStatus] = useState('PRESENT');
  const [attendanceNote, setAttendanceNote] = useState('');
  const [attendanceFile, setAttendanceFile] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);

  const [reportFile, setReportFile] = useState<{ uri: string; name?: string; mimeType?: string } | null>(null);

  const syncFormFromInternship = () => {
    setCompanyName(internship?.companyName || '');
    setCompanyAddress(internship?.companyAddress || '');
    setMentorName(internship?.mentorName || '');
    setMentorPhone(internship?.mentorPhone || '');
    setMentorEmail(internship?.mentorEmail || '');
    setStartDate(toIsoDateOnly(internship?.startDate));
    setEndDate(toIsoDateOnly(internship?.endDate));
    setReportTitle(internship?.reportTitle || '');
  };

  const applyMutation = useMutation({
    mutationFn: () =>
      studentInternshipApi.apply({
        companyName,
        companyAddress,
        mentorName,
        mentorPhone,
        mentorEmail,
        startDate,
        endDate,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-internship-overview', user?.id] });
      notifySuccess('Pengajuan PKL berhasil dikirim.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal mengajukan PKL.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      studentInternshipApi.updateMyInternship({
        companyName,
        companyAddress,
        mentorName,
        mentorPhone,
        mentorEmail,
        startDate,
        endDate,
        reportTitle,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-internship-overview', user?.id] });
      notifySuccess('Data PKL berhasil diperbarui.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal memperbarui data PKL.');
    },
  });

  const createJournalMutation = useMutation({
    mutationFn: async () => {
      if (!internshipId) throw new Error('Data PKL belum tersedia.');
      let imageUrl: string | undefined;
      if (journalFile) {
        const uploaded = await studentInternshipApi.uploadInternshipFile(journalFile);
        imageUrl = uploaded || undefined;
      }
      return studentInternshipApi.createJournal({
        internshipId,
        date: journalDate,
        activity: journalActivity,
        imageUrl,
      });
    },
    onSuccess: async () => {
      setJournalActivity('');
      setJournalFile(null);
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-internship-journals', internshipId] });
      notifySuccess('Jurnal PKL berhasil ditambahkan.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan jurnal PKL.');
    },
  });

  const createAttendanceMutation = useMutation({
    mutationFn: async () => {
      if (!internshipId) throw new Error('Data PKL belum tersedia.');
      let proofUrl: string | undefined;
      if (attendanceFile) {
        const uploaded = await studentInternshipApi.uploadInternshipFile(attendanceFile);
        proofUrl = uploaded || undefined;
      }
      return studentInternshipApi.createAttendance({
        internshipId,
        date: attendanceDate,
        status: attendanceStatus,
        note: attendanceNote,
        proofUrl,
      });
    },
    onSuccess: async () => {
      setAttendanceNote('');
      setAttendanceFile(null);
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-internship-attendances', internshipId] });
      notifySuccess('Absensi PKL berhasil dicatat.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan absensi PKL.');
    },
  });

  const submitReportMutation = useMutation({
    mutationFn: async () => {
      if (!internshipId) throw new Error('Data PKL belum tersedia.');
      if (!reportFile) throw new Error('Pilih file laporan terlebih dahulu.');
      const uploaded = await studentInternshipApi.uploadInternshipFile(reportFile);
      if (!uploaded) throw new Error('Upload file laporan gagal.');
      return studentInternshipApi.submitReport({
        internshipId,
        reportUrl: uploaded,
      });
    },
    onSuccess: async () => {
      setReportFile(null);
      await queryClient.invalidateQueries({ queryKey: ['mobile-student-internship-overview', user?.id] });
      notifySuccess('Laporan PKL berhasil dikirim.');
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal mengirim laporan PKL.');
    },
  });

  const canSubmitApply =
    companyName.trim().length > 0 &&
    companyAddress.trim().length > 0 &&
    mentorName.trim().length > 0;

  const sortedJournals = useMemo(() => {
    const rows = journalsQuery.data || [];
    return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [journalsQuery.data]);

  const sortedAttendances = useMemo(() => {
    const rows = attendancesQuery.data || [];
    return [...rows].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendancesQuery.data]);

  if (isLoading) return <AppLoadingScreen message="Memuat modul PKL..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;
  if (user?.role !== 'STUDENT') return <Redirect href="/home" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={overviewQuery.isFetching && !overviewQuery.isLoading}
          onRefresh={() => {
            void overviewQuery.refetch();
            if (internshipId) {
              void journalsQuery.refetch();
              void attendancesQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ fontSize: scaleFont(20), fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 6 }}>PKL (Prakerin)</Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola pengajuan, jurnal, absensi, dan laporan PKL langsung dari mobile.
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
        {[
          { key: 'OVERVIEW', label: 'Ringkasan' },
          { key: 'JOURNAL', label: 'Jurnal' },
          { key: 'ATTENDANCE', label: 'Absensi' },
          { key: 'REPORT', label: 'Laporan' },
        ].map((item) => (
          <View key={item.key} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
            <Pressable
              onPress={() => setTab(item.key as InternshipTab)}
              style={{
                borderWidth: 1,
                borderColor: tab === item.key ? BRAND_COLORS.blue : '#d6e2f7',
                backgroundColor: tab === item.key ? '#eff6ff' : '#fff',
                borderRadius: 10,
                paddingVertical: 9,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: tab === item.key ? BRAND_COLORS.navy : BRAND_COLORS.textMuted, fontWeight: '700' }}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        ))}
      </View>

      {overviewQuery.isLoading ? <QueryStateView type="loading" message="Mengambil data PKL..." /> : null}
      {overviewQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat data PKL." onRetry={() => overviewQuery.refetch()} />
      ) : null}

      {!overviewQuery.isLoading && !overviewQuery.isError ? (
        <>
          {tab === 'OVERVIEW' ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              {!isEligible ? (
                <Text style={{ color: '#991b1b', fontWeight: '700' }}>
                  Anda belum memenuhi syarat PKL (kelas XI/XII).
                </Text>
              ) : null}

              {internship ? (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Status PKL</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
                    {internship.status || '-'}
                  </Text>

                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Perusahaan</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 6 }}>
                    {internship.companyName || '-'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 8 }}>
                    {internship.companyAddress || '-'}
                  </Text>

                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Mentor: <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>{internship.mentorName || '-'}</Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 2 }}>
                    Periode:{' '}
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                      {formatDate(internship.startDate)} - {formatDate(internship.endDate)}
                    </Text>
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 10 }}>
                    Nilai Akhir:{' '}
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '600' }}>
                      {internship.finalGrade ?? '-'}
                    </Text>
                  </Text>

                  <Pressable
                    onPress={syncFormFromInternship}
                    style={{
                      borderWidth: 1,
                      borderColor: '#cbd5e1',
                      backgroundColor: '#f8fbff',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>Isi Form dari Data Saat Ini</Text>
                  </Pressable>
                </>
              ) : (
                <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 10 }}>
                  Belum ada data PKL. Silakan ajukan terlebih dahulu.
                </Text>
              )}

              <TextInput
                value={companyName}
                onChangeText={setCompanyName}
                placeholder="Nama Perusahaan"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={companyAddress}
                onChangeText={setCompanyAddress}
                placeholder="Alamat Perusahaan"
                placeholderTextColor="#94a3b8"
                multiline
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  minHeight: 76,
                  textAlignVertical: 'top',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={mentorName}
                onChangeText={setMentorName}
                placeholder="Nama Mentor"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={mentorPhone}
                onChangeText={setMentorPhone}
                placeholder="No. HP Mentor"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={mentorEmail}
                onChangeText={setMentorEmail}
                placeholder="Email Mentor"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={startDate}
                onChangeText={setStartDate}
                placeholder="Tanggal Mulai (YYYY-MM-DD)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={endDate}
                onChangeText={setEndDate}
                placeholder="Tanggal Selesai (YYYY-MM-DD)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 8,
                }}
              />
              <TextInput
                value={reportTitle}
                onChangeText={setReportTitle}
                placeholder="Judul Laporan PKL (opsional)"
                placeholderTextColor="#94a3b8"
                style={{
                  borderWidth: 1,
                  borderColor: '#d6e2f7',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: BRAND_COLORS.textDark,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                }}
              />

              {!internship ? (
                <Pressable
                  onPress={() => applyMutation.mutate()}
                  disabled={applyMutation.isPending || !canSubmitApply || !isEligible}
                  style={{
                    backgroundColor: applyMutation.isPending || !canSubmitApply || !isEligible ? '#93c5fd' : BRAND_COLORS.blue,
                    borderRadius: 10,
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {applyMutation.isPending ? 'Memproses...' : 'Ajukan PKL'}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending || !canSubmitApply}
                  style={{
                    backgroundColor: updateMutation.isPending || !canSubmitApply ? '#93c5fd' : '#1e3a8a',
                    borderRadius: 10,
                    alignItems: 'center',
                    paddingVertical: 12,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {updateMutation.isPending ? 'Menyimpan...' : 'Perbarui Data PKL'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {tab === 'JOURNAL' ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              {!internshipId ? (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Ajukan PKL terlebih dahulu sebelum membuat jurnal.</Text>
              ) : (
                <>
                  <TextInput
                    value={journalDate}
                    onChangeText={setJournalDate}
                    placeholder="Tanggal (YYYY-MM-DD)"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: '#fff',
                      marginBottom: 8,
                    }}
                  />
                  <TextInput
                    value={journalActivity}
                    onChangeText={setJournalActivity}
                    placeholder="Aktivitas harian PKL"
                    placeholderTextColor="#94a3b8"
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: '#fff',
                      minHeight: 82,
                      textAlignVertical: 'top',
                      marginBottom: 8,
                    }}
                  />
                  <Pressable
                    onPress={async () => {
                      const result = await DocumentPicker.getDocumentAsync({
                        multiple: false,
                        copyToCacheDirectory: true,
                      });
                      if (result.canceled || result.assets.length === 0) return;
                      const asset = result.assets[0];
                      setJournalFile({
                        uri: asset.uri,
                        name: asset.name,
                        mimeType: asset.mimeType || undefined,
                      });
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      backgroundColor: '#f8fbff',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>
                      {journalFile ? `Lampiran: ${journalFile.name || 'file-terpilih'}` : 'Pilih Lampiran (opsional)'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => createJournalMutation.mutate()}
                    disabled={createJournalMutation.isPending || journalActivity.trim().length === 0}
                    style={{
                      backgroundColor:
                        createJournalMutation.isPending || journalActivity.trim().length === 0
                          ? '#93c5fd'
                          : BRAND_COLORS.blue,
                      borderRadius: 10,
                      alignItems: 'center',
                      paddingVertical: 11,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {createJournalMutation.isPending ? 'Menyimpan...' : 'Tambah Jurnal'}
                    </Text>
                  </Pressable>

                  {journalsQuery.isLoading ? <QueryStateView type="loading" message="Memuat jurnal PKL..." /> : null}
                  {journalsQuery.isError ? (
                    <QueryStateView type="error" message="Gagal memuat jurnal PKL." onRetry={() => journalsQuery.refetch()} />
                  ) : null}
                  {!journalsQuery.isLoading && !journalsQuery.isError ? (
                    sortedJournals.length > 0 ? (
                      sortedJournals.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatDate(item.date)}</Text>
                          <Text style={{ color: '#334155', marginTop: 4 }}>{item.activity}</Text>
                          <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 4 }}>
                            Status: {item.status || '-'} {item.feedback ? `| Feedback: ${item.feedback}` : ''}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada jurnal PKL.</Text>
                    )
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {tab === 'ATTENDANCE' ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              {!internshipId ? (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Ajukan PKL terlebih dahulu sebelum isi absensi.</Text>
              ) : (
                <>
                  <TextInput
                    value={attendanceDate}
                    onChangeText={setAttendanceDate}
                    placeholder="Tanggal (YYYY-MM-DD)"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: fontSizes.body,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: '#fff',
                      marginBottom: 8,
                    }}
                  />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 8 }}>
                    {['PRESENT', 'SICK', 'PERMISSION', 'ABSENT', 'LATE'].map((status) => (
                      <View key={status} style={{ width: '33.3333%', paddingHorizontal: 4, marginBottom: 8 }}>
                        <Pressable
                          onPress={() => setAttendanceStatus(status)}
                          style={{
                            borderWidth: 1,
                            borderColor: attendanceStatus === status ? BRAND_COLORS.blue : '#d6e2f7',
                            backgroundColor: attendanceStatus === status ? '#eff6ff' : '#fff',
                            borderRadius: 9,
                            paddingVertical: 8,
                            alignItems: 'center',
                          }}
                        >
                          <Text
                            style={{
                              color: attendanceStatus === status ? BRAND_COLORS.navy : BRAND_COLORS.textMuted,
                              fontWeight: '700',
                              fontSize: scaleFont(11),
                            }}
                          >
                            {status}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  <TextInput
                    value={attendanceNote}
                    onChangeText={setAttendanceNote}
                    placeholder="Catatan absensi (opsional)"
                    placeholderTextColor="#94a3b8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      borderRadius: 10,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      fontSize: fontSizes.body,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: '#fff',
                      marginBottom: 8,
                    }}
                  />
                  <Pressable
                    onPress={async () => {
                      const result = await DocumentPicker.getDocumentAsync({
                        multiple: false,
                        copyToCacheDirectory: true,
                      });
                      if (result.canceled || result.assets.length === 0) return;
                      const asset = result.assets[0];
                      setAttendanceFile({
                        uri: asset.uri,
                        name: asset.name,
                        mimeType: asset.mimeType || undefined,
                      });
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      backgroundColor: '#f8fbff',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>
                      {attendanceFile ? `Bukti: ${attendanceFile.name || 'file-terpilih'}` : 'Pilih Bukti (opsional)'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => createAttendanceMutation.mutate()}
                    disabled={createAttendanceMutation.isPending}
                    style={{
                      backgroundColor: createAttendanceMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                      borderRadius: 10,
                      alignItems: 'center',
                      paddingVertical: 11,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {createAttendanceMutation.isPending ? 'Menyimpan...' : 'Simpan Absensi'}
                    </Text>
                  </Pressable>

                  {attendancesQuery.isLoading ? <QueryStateView type="loading" message="Memuat absensi PKL..." /> : null}
                  {attendancesQuery.isError ? (
                    <QueryStateView
                      type="error"
                      message="Gagal memuat absensi PKL."
                      onRetry={() => attendancesQuery.refetch()}
                    />
                  ) : null}
                  {!attendancesQuery.isLoading && !attendancesQuery.isError ? (
                    sortedAttendances.length > 0 ? (
                      sortedAttendances.map((item) => (
                        <View
                          key={item.id}
                          style={{
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 8,
                            backgroundColor: '#fff',
                          }}
                        >
                          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{formatDate(item.date)}</Text>
                          <Text style={{ color: '#334155', marginTop: 4 }}>Status: {item.status}</Text>
                          <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 2 }}>
                            Catatan: {item.note || '-'}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada absensi PKL.</Text>
                    )
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {tab === 'REPORT' ? (
            <View
              style={{
                backgroundColor: '#fff',
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
              }}
            >
              {!internshipId ? (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Ajukan PKL terlebih dahulu sebelum upload laporan.</Text>
              ) : (
                <>
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12) }}>Laporan Saat Ini</Text>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                    {internship?.reportTitle || 'Belum ada judul laporan'}
                  </Text>
                  <Text style={{ color: '#475569', marginBottom: 8 }}>
                    File: {internship?.reportUrl ? 'Sudah diunggah' : 'Belum ada file laporan'}
                  </Text>
                  {internship?.reportUrl ? (
                    <Pressable
                      onPress={() => {
                        const url = resolvePublicUrl(internship.reportUrl);
                        if (!url) return;
                        openWebModuleRoute(router, {
                          moduleKey: 'student-pkl-report',
                          webPath: url,
                          label: 'Laporan PKL',
                        });
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        backgroundColor: '#f8fbff',
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: 'center',
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: '#334155', fontWeight: '700' }}>Lihat File Laporan Saat Ini</Text>
                    </Pressable>
                  ) : null}

                  <Pressable
                    onPress={async () => {
                      const result = await DocumentPicker.getDocumentAsync({
                        multiple: false,
                        copyToCacheDirectory: true,
                      });
                      if (result.canceled || result.assets.length === 0) return;
                      const asset = result.assets[0];
                      setReportFile({
                        uri: asset.uri,
                        name: asset.name,
                        mimeType: asset.mimeType || undefined,
                      });
                    }}
                    style={{
                      borderWidth: 1,
                      borderColor: '#d6e2f7',
                      backgroundColor: '#f8fbff',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <Text style={{ color: '#334155', fontWeight: '700' }}>
                      {reportFile ? `File baru: ${reportFile.name || 'file-terpilih'}` : 'Pilih File Laporan'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => submitReportMutation.mutate()}
                    disabled={submitReportMutation.isPending || !reportFile}
                    style={{
                      backgroundColor: submitReportMutation.isPending || !reportFile ? '#93c5fd' : BRAND_COLORS.blue,
                      borderRadius: 10,
                      alignItems: 'center',
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {submitReportMutation.isPending ? 'Mengunggah...' : 'Kirim Laporan PKL'}
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          ) : null}
        </>
      ) : null}

      <Pressable
        onPress={() => router.replace('/home')}
        style={{
          backgroundColor: '#1e3a8a',
          borderRadius: 10,
          alignItems: 'center',
          paddingVertical: 12,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
      </Pressable>
    </ScrollView>
  );
}
