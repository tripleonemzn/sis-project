import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../../src/components/AppLoadingScreen';
import { MobileSummaryCard } from '../../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../../src/config/brand';
import { useAuth } from '../../../../src/features/auth/AuthProvider';
import { proctoringApi } from '../../../../src/features/proctoring/proctoringApi';
import { ProctorScheduleStatus } from '../../../../src/features/proctoring/types';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../../src/lib/ui/feedback';

function parseScheduleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function statusLabel(status: ProctorScheduleStatus) {
  if (status === 'NOT_STARTED') return 'Belum Mulai';
  if (status === 'IN_PROGRESS') return 'Mengerjakan';
  if (status === 'COMPLETED') return 'Selesai';
  return 'Waktu Habis';
}

function statusStyle(status: ProctorScheduleStatus) {
  if (status === 'NOT_STARTED') return { text: '#475569', border: '#cbd5e1', bg: '#f1f5f9' };
  if (status === 'IN_PROGRESS') return { text: '#1d4ed8', border: '#93c5fd', bg: '#dbeafe' };
  if (status === 'COMPLETED') return { text: '#166534', border: '#86efac', bg: '#dcfce7' };
  return { text: '#b91c1c', border: '#fca5a5', bg: '#fee2e2' };
}

function formatTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string | null | undefined) {
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

function mergeProctorReportNotes(notes?: string | null, incident?: string | null) {
  return [String(notes || '').trim(), String(incident || '').trim()].filter(Boolean).join('\n\n');
}

function normalizeExamHeading(label?: string | null) {
  const normalized = String(label || '').replace(/^ujian\s+/i, '').trim();
  return normalized ? normalized.toUpperCase() : 'UJIAN';
}

export default function TeacherProctoringDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scheduleId } = useLocalSearchParams<{ scheduleId?: string | string[] }>();
  const parsedScheduleId = useMemo(() => parseScheduleId(scheduleId), [scheduleId]);
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [notes, setNotes] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['mobile-proctoring-detail', parsedScheduleId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!parsedScheduleId,
    queryFn: async () => proctoringApi.getScheduleDetail(Number(parsedScheduleId)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!parsedScheduleId) throw new Error('Jadwal ujian tidak valid.');
      const students = detailQuery.data?.students || [];
      const presentCount =
        Number(detailQuery.data?.schedule?.attendanceSummary?.presentParticipants) ||
        students.filter((item) => !!item.startTime || item.status !== 'NOT_STARTED').length;
      const absentCount = Math.max(
        0,
        (Number(detailQuery.data?.schedule?.attendanceSummary?.expectedParticipants) || students.length) - presentCount,
      );
      await proctoringApi.submitReport(parsedScheduleId, {
        notes: notes.trim(),
        incident: '',
        studentCountPresent: presentCount,
        studentCountAbsent: absentCount,
      });
    },
    onSuccess: async () => {
      notifySuccess('Berita acara berhasil dikirim ke Kurikulum.');
      await detailQuery.refetch();
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengirim berita acara.');
    },
  });

  const students = detailQuery.data?.students || [];
  const latestReport = useMemo(() => {
    const reports = detailQuery.data?.schedule?.proctoringReports || [];
    if (!Array.isArray(reports) || reports.length === 0) return null;
    return [...reports].sort((a, b) => {
      const aTime = new Date(String(a.updatedAt || a.signedAt || 0)).getTime();
      const bTime = new Date(String(b.updatedAt || b.signedAt || 0)).getTime();
      return bTime - aTime;
    })[0] || null;
  }, [detailQuery.data?.schedule?.proctoringReports]);
  const reportSubmitted = Boolean(latestReport?.id);
  const inProgressCount = students.filter((item) => item.status === 'IN_PROGRESS').length;
  const completedCount = students.filter((item) => item.status === 'COMPLETED').length;

  useEffect(() => {
    if (!latestReport?.id) return;
    setNotes(mergeProctorReportNotes(latestReport.notes, latestReport.incident));
  }, [latestReport?.id, latestReport?.notes, latestReport?.incident]);

  const previewExamHeading = normalizeExamHeading(
    detailQuery.data?.schedule?.examLabel ||
      detailQuery.data?.schedule?.packet?.title ||
      detailQuery.data?.schedule?.displayTitle ||
      detailQuery.data?.schedule?.subjectName ||
      detailQuery.data?.schedule?.packet?.subject?.name ||
      '-',
  );
  const previewSubjectName =
    detailQuery.data?.schedule?.subjectName || detailQuery.data?.schedule?.packet?.subject?.name || '-';
  const previewDate = new Date(String(detailQuery.data?.schedule?.startTime || ''));
  const previewWeekday = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { weekday: 'long' });
  const previewDay = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { day: 'numeric' });
  const previewMonth = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { month: 'long' });
  const previewYear = Number.isNaN(previewDate.getTime())
    ? '-'
    : previewDate.toLocaleDateString('id-ID', { year: 'numeric' });
  const previewTimeLabel =
    `${formatTime(detailQuery.data?.schedule?.startTime)} - ${formatTime(detailQuery.data?.schedule?.endTime)} WIB`;
  const previewNarrative =
    `Pada hari ini, ${previewWeekday} tanggal ${previewDay} bulan ${previewMonth} tahun ${previewYear} telah dilaksanakan ${previewExamHeading} Mata Pelajaran ${previewSubjectName} mulai pukul ${formatTime(
      detailQuery.data?.schedule?.startTime,
    )} sampai dengan pukul ${formatTime(detailQuery.data?.schedule?.endTime)} di ruang ${
      detailQuery.data?.schedule?.room || 'Belum ditentukan'
    }.`;
  const expectedParticipants =
    Number(detailQuery.data?.schedule?.attendanceSummary?.expectedParticipants) || students.length;
  const presentParticipants =
    Number(detailQuery.data?.schedule?.attendanceSummary?.presentParticipants) ||
    students.filter((item) => !!item.startTime || item.status !== 'NOT_STARTED').length;
  const absentParticipants = Math.max(
    0,
    Number(detailQuery.data?.schedule?.attendanceSummary?.absentParticipants) ||
      expectedParticipants - presentParticipants,
  );
  const referenceNowMs = detailQuery.data?.schedule?.serverNow
    ? new Date(detailQuery.data.schedule.serverNow).getTime()
    : Date.now();
  const scheduleStartMs = new Date(String(detailQuery.data?.schedule?.startTime || '')).getTime();
  const isScheduleStarted = Number.isFinite(scheduleStartMs) && referenceNowMs >= scheduleStartMs;

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Monitoring Ujian</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
      </ScrollView>
    );
  }

  if (!parsedScheduleId) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <QueryStateView type="error" message="ID jadwal ujian tidak valid." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={detailQuery.isFetching}
          onRefresh={() => {
            void detailQuery.refetch();
          }}
        />
      }
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Pressable
          onPress={() => router.replace('/teacher/proctoring')}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: '#cbd5e1',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            backgroundColor: '#fff',
          }}
        >
          <Feather name="arrow-left" size={18} color="#334155" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark }}>Monitoring Ujian</Text>
          <Text style={{ color: BRAND_COLORS.textMuted }}>Pantau status peserta dan siapkan berita acara untuk Kurikulum.</Text>
        </View>
      </View>

      {detailQuery.isLoading ? <QueryStateView type="loading" message="Memuat detail jadwal..." /> : null}
      {detailQuery.isError ? (
        <QueryStateView
          type="error"
          message="Gagal memuat detail ujian."
          onRetry={() => {
            void detailQuery.refetch();
          }}
        />
      ) : null}

      {!detailQuery.isLoading && !detailQuery.isError && detailQuery.data ? (
        <>
          <View
            style={{
              backgroundColor: '#1e3a8a',
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: '#bfdbfe', fontSize: 12 }}>Jadwal Ujian</Text>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginTop: 3 }}>
              {detailQuery.data.schedule.packet?.title || 'Paket Tidak Ditemukan'}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              {detailQuery.data.schedule.packet?.subject?.name || '-'} • {detailQuery.data.schedule.class?.name || '-'}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              {formatDateTime(detailQuery.data.schedule.startTime)} - {formatTime(detailQuery.data.schedule.endTime)}
            </Text>
            <Text style={{ color: '#dbeafe', fontSize: 12, marginTop: 3 }}>
              Ruangan: {detailQuery.data.schedule.room || 'Belum ditentukan'} • Token:{' '}
              {detailQuery.data.schedule.token || '-'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', marginHorizontal: -4, marginBottom: 10 }}>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Seharusnya"
                value={String(expectedParticipants)}
                subtitle="Peserta kelas"
                iconName="users"
                accentColor="#2563eb"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Mengerjakan"
                value={String(inProgressCount)}
                subtitle="Sedang berlangsung"
                iconName="play-circle"
                accentColor="#0f766e"
              />
            </View>
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              <MobileSummaryCard
                title="Selesai"
                value={String(completedCount)}
                subtitle={`Tidak hadir ${absentParticipants}`}
                iconName="check-circle"
                accentColor="#16a34a"
              />
            </View>
          </View>
          <View
            style={{
              backgroundColor: '#f8fafc',
              borderWidth: 1,
              borderColor: '#dbe7fb',
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              marginBottom: 10,
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <Text style={{ color: '#0f766e', fontWeight: '700' }}>Hadir {presentParticipants}</Text>
            <Text style={{ color: '#b91c1c', fontWeight: '700' }}>Tidak hadir {absentParticipants}</Text>
            <Text style={{ color: '#475569' }}>Belum mulai {Math.max(0, students.filter((item) => item.status === 'NOT_STARTED').length)}</Text>
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Status Peserta</Text>
            {students.length > 0 ? (
              students.map((student) => {
                const style = statusStyle(student.status);
                return (
                  <View
                    key={student.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{student.name}</Text>
                        <Text style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>NIS: {student.nis || '-'}</Text>
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
                          {statusLabel(student.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>
                      Mulai: {formatTime(student.startTime)} • Selesai: {formatTime(student.submitTime)} • Nilai:{' '}
                      {student.score ?? '-'}
                    </Text>
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
                  padding: 12,
                }}
              >
                <Text style={{ color: '#64748b' }}>Belum ada data peserta untuk jadwal ini.</Text>
              </View>
            )}
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
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>Berita Acara</Text>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#f8fafc',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                {reportSubmitted ? 'Berita acara sudah dikirim' : 'Siapkan berita acara sebelum dikirim'}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                {reportSubmitted
                  ? 'Setelah terkirim, berita acara menjadi arsip dan catatan pengawas bersifat read-only dari sisi pengawas.'
                  : 'Buka panel berita acara untuk meninjau preview dokumen, mengisi catatan pengawas, lalu kirim ke Kurikulum.'}
              </Text>
              {latestReport?.documentNumber ? (
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>No. Dokumen: {latestReport.documentNumber}</Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => setIsReportModalOpen(true)}
              style={{
                borderWidth: 1,
                borderColor: reportSubmitted ? '#a7f3d0' : '#bfdbfe',
                backgroundColor: reportSubmitted ? '#ecfdf5' : '#eff6ff',
                borderRadius: 10,
                paddingVertical: 11,
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <Text style={{ color: reportSubmitted ? '#047857' : '#1d4ed8', fontWeight: '700' }}>
                {reportSubmitted ? 'Lihat Berita Acara' : 'Buka Berita Acara'}
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      <Modal
        visible={isReportModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsReportModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.45)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 24,
          }}
        >
          <View
            style={{
              maxHeight: '92%',
              borderRadius: 18,
              backgroundColor: '#fff',
              overflow: 'hidden',
              borderWidth: 1,
              borderColor: '#e2e8f0',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0',
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>Pratinjau Berita Acara</Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                  {reportSubmitted
                    ? 'Berita acara ini sudah dikirim ke Kurikulum dan tampil sebagai arsip pengawas.'
                    : 'Tinjau isi dokumen resmi sebelum dikirim ke Kurikulum.'}
                </Text>
              </View>
              <Pressable
                onPress={() => setIsReportModalOpen(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Feather name="x" size={18} color="#64748b" />
              </Pressable>
            </View>

            <ScrollView
              style={{ backgroundColor: '#fff' }}
              contentContainerStyle={{ padding: 16, gap: 12 }}
              showsVerticalScrollIndicator={false}
            >
              <View
                style={{
                  alignSelf: 'flex-start',
                  borderWidth: 1,
                  borderColor: reportSubmitted ? '#a7f3d0' : '#cbd5e1',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: reportSubmitted ? '#ecfdf5' : '#fff',
                }}
              >
                <Text style={{ color: reportSubmitted ? '#047857' : '#475569', fontSize: 11, fontWeight: '700' }}>
                  {reportSubmitted ? 'ARSIP' : 'DRAFT'}
                </Text>
              </View>

              {reportSubmitted ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#a7f3d0',
                    backgroundColor: '#ecfdf5',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: '#047857', fontWeight: '700' }}>Berita acara sudah terkirim ke Kurikulum.</Text>
                  <Text style={{ color: '#047857', fontSize: 12, marginTop: 4 }}>
                    Dokumen resmi diverifikasi dan dicetak dari sisi Wakasek Kurikulum / sekretaris.
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: '#fff',
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: 17, fontWeight: '800' }}>
                  BERITA ACARA
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 4 }}>
                  {previewExamHeading}
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: 12, fontWeight: '700', marginTop: 2 }}>
                  SMKS KARYA GUNA BHAKTI 2
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                  Tahun Ajaran {detailQuery.data?.schedule?.academicYearName || '-'}
                </Text>
                <View style={{ borderTopWidth: 1, borderTopColor: '#0f172a', marginTop: 12 }} />
                <View style={{ borderTopWidth: 2, borderTopColor: '#0f172a', marginTop: 4 }} />
                <Text style={{ color: '#0f172a', fontSize: 12, lineHeight: 20, marginTop: 12 }}>
                  {previewNarrative}
                </Text>
                <View style={{ marginTop: 12, gap: 6 }}>
                  <Text style={{ color: '#0f172a', fontSize: 12 }}>Jumlah Peserta Seharusnya: {expectedParticipants}</Text>
                  <Text style={{ color: '#0f172a', fontSize: 12 }}>Jumlah Peserta yang tidak hadir: {absentParticipants}</Text>
                  <Text style={{ color: '#0f172a', fontSize: 12 }}>Jumlah Peserta yang hadir: {presentParticipants}</Text>
                </View>
                <Text style={{ color: '#0f172a', fontSize: 12, marginTop: 12, fontWeight: '700' }}>
                  Catatan Pengawas selama Ujian berlangsung.
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Catatan Pengawas selama Ujian berlangsung"
                  style={{
                    borderWidth: 1,
                    borderColor: reportSubmitted ? '#e2e8f0' : '#cbd5e1',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    minHeight: 128,
                    textAlignVertical: 'top',
                    marginTop: 8,
                    color: reportSubmitted ? '#64748b' : '#0f172a',
                    backgroundColor: reportSubmitted ? '#f8fafc' : '#fff',
                    lineHeight: 20,
                    fontSize: 12,
                  }}
                  placeholderTextColor="#94a3b8"
                  multiline
                  editable={!reportSubmitted && isScheduleStarted}
                />
                {!reportSubmitted && !isScheduleStarted ? (
                  <Text style={{ color: '#b45309', fontSize: 12, marginTop: 8 }}>
                    Berita acara baru bisa diisi setelah waktu ujian mulai sesuai jadwal pelaksanaan.
                  </Text>
                ) : null}
                {reportSubmitted ? (
                  <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
                    Catatan tidak bisa diubah lagi karena berita acara sudah masuk arsip setelah dikirim ke Kurikulum.
                  </Text>
                ) : null}
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>Waktu pelaksanaan: {previewTimeLabel}</Text>
              </View>

              <Pressable
                onPress={() => {
                  if (!isScheduleStarted) {
                    Alert.alert('Belum Pelaksanaan Ujian', 'Berita acara baru bisa dikirim setelah ujian dimulai sesuai jadwal pelaksanaan.');
                    return;
                  }
                  Alert.alert('Konfirmasi', 'Kirim berita acara ujian ini ke Kurikulum?', [
                    { text: 'Batal', style: 'cancel' },
                    {
                      text: 'Kirim',
                      onPress: () => {
                        void submitMutation.mutateAsync();
                      },
                    },
                  ]);
                }}
                style={{
                  backgroundColor: reportSubmitted ? '#059669' : !isScheduleStarted ? '#f59e0b' : BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: submitMutation.isPending || reportSubmitted ? 0.6 : 1,
                }}
                disabled={submitMutation.isPending || reportSubmitted}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {submitMutation.isPending
                    ? 'Menyimpan...'
                    : reportSubmitted
                      ? 'Terkirim ke Kurikulum'
                      : !isScheduleStarted
                        ? 'Menunggu Waktu Ujian'
                        : 'Kirim ke Kurikulum'}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
