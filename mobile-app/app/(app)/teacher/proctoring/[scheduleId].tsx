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
import { useIsScreenActive } from '../../../../src/hooks/useIsScreenActive';
import { getStandardPagePadding } from '../../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../../src/lib/ui/feedback';
import { useAppTextScale } from '../../../../src/theme/AppTextScaleProvider';

function parseScheduleId(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return null;
  return parsed;
}

function statusLabel(status: ProctorScheduleStatus) {
  if (status === 'NOT_STARTED') return 'Belum Mulai';
  if (status === 'IN_PROGRESS') return 'Sedang Mengerjakan';
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

const ACTIVE_MONITORING_INTERVAL_MS = 7000;
const IDLE_MONITORING_INTERVAL_MS = 30000;

function romanLevelRank(level: string): number {
  const value = String(level || '').toUpperCase();
  if (value === 'X') return 10;
  if (value === 'XI') return 11;
  if (value === 'XII') return 12;
  return 99;
}

function parseClassName(raw?: string | null) {
  const text = String(raw || '').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  const level = parts[0] || '';
  const tail = parts.slice(1).join(' ');
  const numberMatch = tail.match(/(\d+)\s*$/);
  const roomNumber = numberMatch ? Number(numberMatch[1]) : Number.MAX_SAFE_INTEGER;
  const major = numberMatch ? tail.replace(/\s*\d+\s*$/, '').trim() : tail;
  return {
    levelRank: romanLevelRank(level),
    major: major.toUpperCase(),
    roomNumber,
    original: text,
  };
}

function compareClassName(a?: string | null, b?: string | null) {
  const parsedA = parseClassName(a);
  const parsedB = parseClassName(b);
  if (parsedA.levelRank !== parsedB.levelRank) return parsedA.levelRank - parsedB.levelRank;
  if (parsedA.major !== parsedB.major) return parsedA.major.localeCompare(parsedB.major, 'id');
  if (parsedA.roomNumber !== parsedB.roomNumber) return parsedA.roomNumber - parsedB.roomNumber;
  return parsedA.original.localeCompare(parsedB.original, 'id');
}

export default function TeacherProctoringDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isScreenActive = useIsScreenActive();
  const { scheduleId } = useLocalSearchParams<{ scheduleId?: string | string[] }>();
  const parsedScheduleId = useMemo(() => parseScheduleId(scheduleId), [scheduleId]);
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const { scaleFont, scaleLineHeight } = useAppTextScale();

  const [notes, setNotes] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isExamInfoModalOpen, setIsExamInfoModalOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['mobile-proctoring-detail', parsedScheduleId],
    enabled: isAuthenticated && user?.role === 'TEACHER' && !!parsedScheduleId,
    queryFn: async () => proctoringApi.getScheduleDetail(Number(parsedScheduleId)),
    refetchInterval: (query) => {
      if (!isScreenActive) return false;
      const nextSchedule = (query.state.data as { schedule?: { startTime?: string | null; endTime?: string | null; serverNow?: string | null } } | undefined)?.schedule;
      const startMs = new Date(String(nextSchedule?.startTime || '')).getTime();
      const endMs = new Date(String(nextSchedule?.endTime || '')).getTime();
      const referenceNowMs = nextSchedule?.serverNow ? new Date(nextSchedule.serverNow).getTime() : Date.now();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && referenceNowMs >= startMs && referenceNowMs <= endMs) {
        return ACTIVE_MONITORING_INTERVAL_MS;
      }
      return IDLE_MONITORING_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
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

  const handleRefresh = async () => {
    try {
      await detailQuery.refetch();
      notifySuccess('Data monitoring berhasil diperbarui.');
    } catch (error) {
      notifyApiError(error, 'Gagal memuat ulang data monitoring.');
    }
  };

  const students = detailQuery.data?.students || [];
  const currentUserReport = detailQuery.data?.currentUserProctoringReport || null;
  const latestReport = detailQuery.data?.latestProctoringReport || null;
  const reportSubmitted = Boolean(currentUserReport?.id);
  const reportSubmittedByAnotherUser = Boolean(latestReport?.id && !reportSubmitted);
  const latestReporterName = String(latestReport?.proctor?.name || '').trim() || 'pengawas lain';
  const canSubmitReport = Boolean(detailQuery.data?.canSubmitReport);
  const orderedClassNames = useMemo(() => {
    const sourceClassNames =
      detailQuery.data?.schedule?.classNames?.length
        ? detailQuery.data.schedule.classNames
        : detailQuery.data?.schedule?.class?.name
          ? [detailQuery.data.schedule.class.name]
          : [];
    return [...sourceClassNames].sort(compareClassName);
  }, [detailQuery.data?.schedule?.class?.name, detailQuery.data?.schedule?.classNames]);
  const orderedStudents = useMemo(
    () =>
      [...students].sort((a, b) => {
        const classCompare = compareClassName(a.className, b.className);
        if (classCompare !== 0) return classCompare;
        return String(a.name || '').localeCompare(String(b.name || ''), 'id');
      }),
    [students],
  );
  const inProgressCount = orderedStudents.filter((item) => item.status === 'IN_PROGRESS').length;
  const completedCount = orderedStudents.filter((item) => item.status === 'COMPLETED').length;
  const notStartedCount = orderedStudents.filter((item) => item.status === 'NOT_STARTED').length;
  const blockedCount = orderedStudents.filter((item) => Boolean(item.restriction?.isBlocked)).length;
  const waitingStartCount = orderedStudents.filter(
    (item) => item.status === 'NOT_STARTED' && !item.restriction?.isBlocked,
  ).length;
  const totalViolations = orderedStudents.reduce((acc, item) => acc + Number(item.monitoring?.totalViolations || 0), 0);
  const studentsWithViolations = orderedStudents.filter((item) => Number(item.monitoring?.totalViolations || 0) > 0).length;

  useEffect(() => {
    if (!reportSubmitted) return;
    setNotes(mergeProctorReportNotes(currentUserReport?.notes, currentUserReport?.incident));
  }, [currentUserReport?.id, currentUserReport?.incident, currentUserReport?.notes, reportSubmitted]);

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
    orderedStudents.filter((item) => !!item.startTime || item.status !== 'NOT_STARTED').length;
  const absentParticipants = Math.max(
    0,
    Number(detailQuery.data?.schedule?.attendanceSummary?.absentParticipants) ||
      expectedParticipants - presentParticipants,
  );
  const referenceNowMs = detailQuery.data?.schedule?.serverNow
    ? new Date(detailQuery.data.schedule.serverNow).getTime()
    : Date.now();
  const scheduleStartMs = new Date(String(detailQuery.data?.schedule?.startTime || '')).getTime();
  const scheduleEndMs = new Date(String(detailQuery.data?.schedule?.endTime || '')).getTime();
  const isScheduleStarted = Number.isFinite(scheduleStartMs) && referenceNowMs >= scheduleStartMs;
  const isScheduleRunning =
    Number.isFinite(scheduleStartMs) &&
    Number.isFinite(scheduleEndMs) &&
    referenceNowMs >= scheduleStartMs &&
    referenceNowMs <= scheduleEndMs;
  const serverTimeDriftMinutes = detailQuery.data?.schedule?.serverNow
    ? (() => {
        const serverNowMs = new Date(detailQuery.data.schedule.serverNow || '').getTime();
        if (!Number.isFinite(serverNowMs)) return null;
        const driftMs = Math.abs(Date.now() - serverNowMs);
        return driftMs >= 2 * 60 * 1000 ? Math.round(driftMs / 60000) : null;
      })()
    : null;

  if (isLoading) return <AppLoadingScreen message="Memuat monitoring ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', marginBottom: 8 }}>
          Monitoring Ujian
        </Text>
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
          <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '700', color: BRAND_COLORS.textDark }}>
            Monitoring Ujian
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }}>
            Pantau status peserta, pelanggaran, dan siapkan berita acara untuk Kurikulum.
          </Text>
        </View>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <Pressable
          onPress={() => setIsExamInfoModalOpen(true)}
          style={{
            borderWidth: 1,
            borderColor: '#bae6fd',
            backgroundColor: '#f0f9ff',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Feather name="book-open" size={16} color="#0369a1" />
          <Text style={{ color: '#0369a1', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
            Informasi Ujian
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsReportModalOpen(true)}
          style={{
            borderWidth: 1,
            borderColor: reportSubmitted ? '#a7f3d0' : reportSubmittedByAnotherUser ? '#fcd34d' : '#bfdbfe',
            backgroundColor: reportSubmitted ? '#ecfdf5' : reportSubmittedByAnotherUser ? '#fffbeb' : '#eff6ff',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Feather
            name="file-text"
            size={16}
            color={reportSubmitted ? '#047857' : reportSubmittedByAnotherUser ? '#92400e' : '#1d4ed8'}
          />
          <Text
            style={{
              color: reportSubmitted ? '#047857' : reportSubmittedByAnotherUser ? '#92400e' : '#1d4ed8',
              fontWeight: '700',
              fontSize: scaleFont(12),
              lineHeight: scaleLineHeight(18),
            }}
          >
            {reportSubmitted ? 'Lihat Berita Acara Saya' : reportSubmittedByAnotherUser ? 'Tinjau Berita Acara' : 'Buka Berita Acara'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            void handleRefresh();
          }}
          style={{
            borderWidth: 1,
            borderColor: '#cbd5e1',
            backgroundColor: '#fff',
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Feather name="refresh-cw" size={16} color="#475569" />
          <Text style={{ color: '#334155', fontWeight: '700', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
            Refresh Data
          </Text>
        </Pressable>
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
          {(serverTimeDriftMinutes !== null || (isScheduleRunning && waitingStartCount > 0)) ? (
            <View
              style={{
                backgroundColor: '#fef3c7',
                borderWidth: 1,
                borderColor: '#fcd34d',
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: '#92400e', fontWeight: '700' }}>Peringatan Sinkronisasi Waktu</Text>
              <Text style={{ color: '#92400e', fontSize: scaleFont(12), marginTop: 4, lineHeight: scaleLineHeight(18) }}>
                {serverTimeDriftMinutes !== null
                  ? `Jam perangkat pengawas berbeda sekitar ${serverTimeDriftMinutes} menit dari server. Aktifkan sinkronisasi waktu otomatis agar monitoring akurat.`
                  : 'Jika siswa melapor tombol mulai tidak muncul, cek jam perangkat siswa dan pastikan sinkronisasi waktu otomatis aktif.'}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title="Seharusnya"
                value={String(expectedParticipants)}
                subtitle="Peserta kelas"
                iconName="users"
                accentColor="#2563eb"
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title="Sedang Mengerjakan"
                value={String(inProgressCount)}
                subtitle="Sesi berlangsung"
                iconName="play-circle"
                accentColor="#0f766e"
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title="Selesai"
                value={String(completedCount)}
                subtitle={`Tidak hadir ${absentParticipants}`}
                iconName="check-circle"
                accentColor="#16a34a"
              />
            </View>
            <View style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <MobileSummaryCard
                title="Pelanggaran"
                value={String(totalViolations)}
                subtitle={`${studentsWithViolations} peserta terdampak`}
                iconName="alert-triangle"
                accentColor="#dc2626"
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
            <Text style={{ color: '#475569' }}>Belum mulai {Math.max(0, notStartedCount)}</Text>
            <Text style={{ color: '#92400e', fontWeight: '700' }}>Diblokir {blockedCount}</Text>
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
            {orderedStudents.length > 0 ? (
              orderedStudents.map((student) => {
                const style = statusStyle(student.status);
                const totalStudentViolations = Number(student.monitoring?.totalViolations || 0);
                const restrictionBlocked = Boolean(student.restriction?.isBlocked);
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
                        <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
                          NIS: {student.nis || '-'}
                        </Text>
                        <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
                          Kelas: {student.className || '-'}
                        </Text>
                      </View>
                      <View
                        style={{
                          borderWidth: 1,
                          borderColor: restrictionBlocked ? '#fcd34d' : style.border,
                          backgroundColor: restrictionBlocked ? '#fef3c7' : style.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                        }}
                      >
                        <Text style={{ color: restrictionBlocked ? '#92400e' : style.text, fontWeight: '700', fontSize: scaleFont(11) }}>
                          {restrictionBlocked ? student.restriction?.statusLabel || 'Diblokir' : statusLabel(student.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 6 }}>
                      Mulai: {formatTime(student.startTime)} • Selesai: {formatTime(student.submitTime)} • Nilai:{' '}
                      {student.score ?? '-'}
                    </Text>
                    {restrictionBlocked ? (
                      <View
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: '#fcd34d',
                          backgroundColor: '#fffbeb',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          gap: 4,
                        }}
                      >
                        <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
                          {student.restriction?.statusLabel || 'Diblokir'}
                        </Text>
                        <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          {student.restriction?.reason || 'Akses ujian ditutup.'}
                        </Text>
                      </View>
                    ) : student.status === 'IN_PROGRESS' || totalStudentViolations > 0 || student.answeredCount || student.monitoring ? (
                      <View
                        style={{
                          marginTop: 8,
                          borderWidth: 1,
                          borderColor: totalStudentViolations > 0 ? '#fecaca' : '#dbeafe',
                          backgroundColor: totalStudentViolations > 0 ? '#fef2f2' : '#f8fafc',
                          borderRadius: 10,
                          paddingHorizontal: 10,
                          paddingVertical: 8,
                          gap: 4,
                        }}
                      >
                        <Text style={{ color: '#334155', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>
                          Progres: {student.answeredCount || 0} dari {student.totalQuestions || 0} soal
                        </Text>
                        {student.status === 'IN_PROGRESS' ? (
                          <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
                            Soal aktif: {student.monitoring?.currentQuestionNumber || ((student.monitoring?.currentQuestionIndex || 0) + 1)}
                          </Text>
                        ) : null}
                        <Text
                          style={{
                            color: totalStudentViolations > 0 ? '#b91c1c' : '#475569',
                            fontSize: scaleFont(12),
                            fontWeight: '700',
                          }}
                        >
                          Pelanggaran: {totalStudentViolations} (tab {student.monitoring?.tabSwitchCount || 0}, fullscreen{' '}
                          {student.monitoring?.fullscreenExitCount || 0}, app {student.monitoring?.appSwitchCount || 0})
                        </Text>
                        {student.monitoring?.lastViolationType || student.monitoring?.lastViolationAt ? (
                          <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }}>
                            Terakhir: {student.monitoring?.lastViolationType || '-'} • {formatDateTime(student.monitoring?.lastViolationAt)}
                          </Text>
                        ) : null}
                        {student.monitoring?.lastSyncAt ? (
                          <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }}>
                            Sinkron terakhir: {formatDateTime(student.monitoring.lastSyncAt)}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
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

        </>
      ) : null}

      <Modal
        visible={isExamInfoModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsExamInfoModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 24,
          }}
        >
          <View
            style={{
              maxHeight: '88%',
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(16), lineHeight: scaleLineHeight(22) }}>
                  Informasi Ujian
                </Text>
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 4, lineHeight: scaleLineHeight(18) }}>
                  Ringkasan jadwal dan konteks ujian yang sedang dipantau pengawas.
                </Text>
              </View>
              <Pressable
                onPress={() => setIsExamInfoModalOpen(false)}
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
                  borderWidth: 1,
                  borderColor: '#bae6fd',
                  backgroundColor: '#f0f9ff',
                  borderRadius: 14,
                  padding: 14,
                }}
              >
                <Text style={{ color: '#0369a1', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700', letterSpacing: 0.8 }}>
                  PANTAU UJIAN
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', marginTop: 6 }}>
                  {detailQuery.data?.schedule?.displayTitle || detailQuery.data?.schedule?.packet?.title || 'Paket Tidak Ditemukan'}
                </Text>
                <Text style={{ color: '#475569', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                  {orderedClassNames.join(' • ') || '-'}
                </Text>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  padding: 12,
                  backgroundColor: '#fff',
                  gap: 10,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="book-open" size={16} color="#94a3b8" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>Mata Pelajaran</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), fontWeight: '700', marginTop: 2 }}>
                      {detailQuery.data?.schedule?.subjectName || detailQuery.data?.schedule?.packet?.subject?.name || '-'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <Feather name="user" size={16} color="#94a3b8" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>Guru Pengampu</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), fontWeight: '700', marginTop: 2 }}>
                      {detailQuery.data?.schedule?.teacherNames?.join(', ') || '-'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="clock" size={16} color="#94a3b8" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>Waktu Pelaksanaan</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), fontWeight: '700', marginTop: 2 }}>
                      {formatDateTime(detailQuery.data?.schedule?.startTime)} - {formatTime(detailQuery.data?.schedule?.endTime)}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="map-pin" size={16} color="#94a3b8" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>Ruangan</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), fontWeight: '700', marginTop: 2 }}>
                      {detailQuery.data?.schedule?.room || 'Belum ditentukan'}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="hash" size={16} color="#94a3b8" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700' }}>Token Ujian</Text>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(20), fontWeight: '700', marginTop: 2 }}>
                      {detailQuery.data?.schedule?.token || '-'}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isReportModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsReportModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
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
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: scaleFont(16), lineHeight: scaleLineHeight(22) }}>
                  Pratinjau Berita Acara
                </Text>
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), marginTop: 4, lineHeight: scaleLineHeight(18) }}>
                  {reportSubmitted
                    ? 'Berita acara akun ini sudah dikirim ke Kurikulum dan tampil sebagai arsip pengawas.'
                    : reportSubmittedByAnotherUser
                      ? `Sudah ada berita acara yang dikirim oleh ${latestReporterName}. Akun ini belum mengirim berita acara.`
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
                  borderColor: reportSubmitted ? '#a7f3d0' : reportSubmittedByAnotherUser ? '#fcd34d' : '#cbd5e1',
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor: reportSubmitted ? '#ecfdf5' : reportSubmittedByAnotherUser ? '#fffbeb' : '#fff',
                }}
              >
                <Text
                  style={{
                    color: reportSubmitted ? '#047857' : reportSubmittedByAnotherUser ? '#92400e' : '#475569',
                    fontSize: scaleFont(11),
                    fontWeight: '700',
                  }}
                >
                  {reportSubmitted ? 'ARSIP SAYA' : reportSubmittedByAnotherUser ? 'ADA ARSIP' : 'DRAFT'}
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
                  <Text style={{ color: '#047857', fontWeight: '700' }}>Berita acara akun ini sudah terkirim ke Kurikulum.</Text>
                  <Text style={{ color: '#047857', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                    Dokumen resmi diverifikasi dan dicetak dari sisi Wakasek Kurikulum / sekretaris.
                  </Text>
                </View>
              ) : reportSubmittedByAnotherUser ? (
                <View
                  style={{
                    borderWidth: 1,
                    borderColor: '#fcd34d',
                    backgroundColor: '#fffbeb',
                    borderRadius: 10,
                    padding: 10,
                  }}
                >
                  <Text style={{ color: '#92400e', fontWeight: '700' }}>Sudah ada berita acara lain pada jadwal ini.</Text>
                  <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                    Dokumen terakhir tercatat dikirim oleh {latestReporterName}. Status akun ini tetap draft sampai benar-benar mengirim berita acara sendiri.
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
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: scaleFont(17), lineHeight: scaleLineHeight(24), fontWeight: '800' }}>
                  BERITA ACARA
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700', marginTop: 4 }}>
                  {previewExamHeading}
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700', marginTop: 2 }}>
                  SMKS KARYA GUNA BHAKTI 2
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, textAlign: 'center', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), fontWeight: '700', marginTop: 2 }}>
                  Tahun Ajaran {detailQuery.data?.schedule?.academicYearName || '-'}
                </Text>
                <View style={{ borderTopWidth: 1, borderTopColor: '#0f172a', marginTop: 12 }} />
                <View style={{ borderTopWidth: 2, borderTopColor: '#0f172a', marginTop: 4 }} />
                <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(20), marginTop: 12 }}>
                  {previewNarrative}
                </Text>
                <View style={{ marginTop: 12, gap: 6 }}>
                  <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>Jumlah Peserta Seharusnya: {expectedParticipants}</Text>
                  <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>Jumlah Peserta yang tidak hadir: {absentParticipants}</Text>
                  <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }}>Jumlah Peserta yang hadir: {presentParticipants}</Text>
                </View>
                <Text style={{ color: '#0f172a', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 12, fontWeight: '700' }}>
                  Catatan Pengawas selama Ujian berlangsung.
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Catatan Pengawas selama Ujian berlangsung"
                  style={{
                    borderWidth: 1,
                    borderColor: reportSubmitted || !canSubmitReport ? '#e2e8f0' : '#cbd5e1',
                    borderRadius: 14,
                    paddingHorizontal: 14,
                    paddingVertical: 14,
                    minHeight: 128,
                    textAlignVertical: 'top',
                    marginTop: 8,
                    color: reportSubmitted || !canSubmitReport ? '#64748b' : '#0f172a',
                    backgroundColor: reportSubmitted || !canSubmitReport ? '#f8fafc' : '#fff',
                    lineHeight: scaleLineHeight(20),
                    fontSize: scaleFont(12),
                  }}
                  placeholderTextColor="#94a3b8"
                  multiline
                  editable={!reportSubmitted && isScheduleStarted && canSubmitReport}
                />
                {!reportSubmitted && !isScheduleStarted ? (
                  <Text style={{ color: '#b45309', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 8 }}>
                    Berita acara baru bisa diisi setelah waktu ujian mulai sesuai jadwal pelaksanaan.
                  </Text>
                ) : null}
                {!reportSubmitted && !canSubmitReport ? (
                  <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 8 }}>
                    Akun ini hanya dapat memantau. Pengiriman berita acara dibatasi untuk pengawas ruang atau admin.
                  </Text>
                ) : null}
                {reportSubmitted ? (
                  <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 8 }}>
                    Catatan tidak bisa diubah lagi karena berita acara sudah masuk arsip setelah dikirim ke Kurikulum.
                  </Text>
                ) : null}
                <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 8 }}>
                  Waktu pelaksanaan: {previewTimeLabel}
                </Text>
              </View>

              <Pressable
                onPress={() => {
                  if (!canSubmitReport) {
                    Alert.alert('Akses Terbatas', 'Hanya pengawas ruang atau admin yang dapat mengirim berita acara dari akun ini.');
                    return;
                  }
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
                  backgroundColor: reportSubmitted ? '#059669' : !canSubmitReport ? '#64748b' : !isScheduleStarted ? '#f59e0b' : BRAND_COLORS.blue,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: 'center',
                  opacity: submitMutation.isPending || reportSubmitted || !canSubmitReport ? 0.6 : 1,
                }}
                disabled={submitMutation.isPending || reportSubmitted || !canSubmitReport}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>
                  {submitMutation.isPending
                    ? 'Menyimpan...'
                    : reportSubmitted
                      ? 'Terkirim oleh Akun Ini'
                      : !canSubmitReport
                        ? 'Khusus Pengawas / Admin'
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
