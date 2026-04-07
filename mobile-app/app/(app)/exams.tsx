import { useEffect, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Image, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import MobileDetailModal from '../../src/components/MobileDetailModal';
import { MobileSelectField } from '../../src/components/MobileSelectField';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { resolveStudentExamRuntimeStatus, StudentExamRuntimeStatus } from '../../src/features/exams/status';
import { StudentExamItem } from '../../src/features/exams/types';
import { useStudentExamsQuery } from '../../src/features/exams/useStudentExamsQuery';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { examApi, ExamProgramItem } from '../../src/features/exams/examApi';
import { examCardApi } from '../../src/features/examCards/examCardApi';
import { useIsScreenActive } from '../../src/hooks/useIsScreenActive';

type StatusFilter = 'ALL' | 'OPEN' | 'MAKEUP' | 'UPCOMING' | 'MISSED' | 'COMPLETED';
type ExamLabelMap = Record<string, string>;

function normalizeProgramCode(raw?: string | null): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = date.getDate();
  const month = months[date.getMonth()] || '';
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} ${hour}:${minute}`;
}

function formatExamCurrency(value?: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function statusStyle(status: StudentExamRuntimeStatus) {
  if (status === 'OPEN') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  if (status === 'MAKEUP') return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c', label: 'Susulan' };
  if (status === 'COMPLETED') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8', label: 'Selesai' };
  if (status === 'MISSED') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', label: 'Terlewat' };
  return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Akan Datang' };
}

function placementStatusStyle(startTime?: string | null, endTime?: string | null) {
  const now = Date.now();
  const startMs = startTime ? new Date(startTime).getTime() : Number.NaN;
  const endMs = endTime ? new Date(endTime).getTime() : Number.NaN;

  if (Number.isFinite(startMs) && Number.isFinite(endMs) && startMs <= now && now <= endMs) {
    return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  }
  if (Number.isFinite(endMs) && now > endMs) {
    return { bg: '#e2e8f0', border: '#cbd5e1', text: '#475569', label: 'Selesai' };
  }
  return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8', label: 'Terjadwal' };
}

function resolveExamTypeLabel(type: string, labels: ExamLabelMap): string {
  const normalized = normalizeProgramCode(type);
  const override = labels[normalized];
  if (!override) return normalized || '-';
  const cleaned = String(override).trim();
  return cleaned || normalized || '-';
}

function normalizeSubjectToken(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isGenericSubject(name?: string | null, code?: string | null): boolean {
  const normalizedName = normalizeSubjectToken(name);
  const normalizedCode = normalizeSubjectToken(code);
  if (!normalizedName && !normalizedCode) return true;
  if (['TKAU', 'KONSENTRASI_KEAHLIAN', 'KONSENTRASI', 'KEJURUAN'].includes(normalizedCode)) return true;
  if (normalizedName === 'KONSENTRASI' || normalizedName === 'KEJURUAN') return true;
  if (normalizedName.includes('KONSENTRASI_KEAHLIAN')) return true;
  return false;
}

function resolveSubjectLabel(item: StudentExamItem): { name: string; code: string } {
  const scheduleSubject = item.subject || null;
  const packetSubject = item.packet?.subject || null;
  const usePacket = Boolean(
    scheduleSubject &&
      packetSubject &&
      isGenericSubject(scheduleSubject.name, scheduleSubject.code) &&
      !isGenericSubject(packetSubject.name, packetSubject.code),
  );
  const picked = usePacket ? packetSubject : scheduleSubject || packetSubject;
  let fallbackName = '';
  const title = String(item.packet?.title || '').trim();
  if (title.includes('•')) {
    const parts = title
      .split('•')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      const candidate = parts[1];
      if (candidate && !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
        fallbackName = candidate;
      }
    }
  }
  const pickedIsGeneric = isGenericSubject(picked?.name, picked?.code);
  const useFallbackName = Boolean(fallbackName) && pickedIsGeneric;
  return {
    name: String((useFallbackName ? fallbackName : picked?.name) || fallbackName || 'Mata pelajaran'),
    code: useFallbackName ? '' : String(picked?.code || '').trim(),
  };
}

export default function StudentExamsScreen() {
  const params = useLocalSearchParams<{ programCode?: string | string[] }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const canAccessExams = user?.role === 'STUDENT' || user?.role === 'CALON_SISWA' || user?.role === 'UMUM';
  const isScreenActive = useIsScreenActive();
  const isCandidateMode = user?.role === 'CALON_SISWA';
  const isApplicantMode = user?.role === 'UMUM';
  const applicantVerificationLocked =
    isApplicantMode && String(user?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED';
  const examsQuery = useStudentExamsQuery({ enabled: isAuthenticated && !applicantVerificationLocked, user });
  const pageContentPadding = getStandardPagePadding(insets);
  const lockedProgramCode = normalizeProgramCode(Array.isArray(params.programCode) ? params.programCode[0] : params.programCode);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedExam, setSelectedExam] = useState<StudentExamItem | null>(null);
  const studentExamCardsQuery = useQuery({
    queryKey: ['mobile-student-exam-cards', user?.id || 'anon'],
    enabled:
      isAuthenticated &&
      !isCandidateMode &&
      !isApplicantMode &&
      !applicantVerificationLocked &&
      user?.role === 'STUDENT',
    staleTime: 60_000,
    queryFn: () => examCardApi.getMyCards(),
  });
  const studentExamPlacementsQuery = useQuery({
    queryKey: ['mobile-student-exam-placements', user?.id || 'anon'],
    enabled:
      isAuthenticated &&
      !isCandidateMode &&
      !isApplicantMode &&
      !applicantVerificationLocked &&
      user?.role === 'STUDENT',
    staleTime: 60_000,
    queryFn: () => examApi.getMyExamSittings(),
  });

  const examProgramsQuery = useQuery({
    queryKey: ['mobile-student-exam-programs'],
    enabled: isAuthenticated && canAccessExams && !applicantVerificationLocked,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      examApi.getExamPrograms({
        roleContext: isCandidateMode ? 'candidate' : isApplicantMode ? 'applicant' : 'student',
      }),
  });

  const activePrograms = useMemo(
    () =>
      (examProgramsQuery.data?.programs || [])
        .filter((program: ExamProgramItem) => program.isActive && ((isCandidateMode || isApplicantMode) ? true : program.showOnStudentMenu))
        .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code)),
    [examProgramsQuery.data?.programs, isApplicantMode, isCandidateMode],
  );

  const effectiveTypeFilter = lockedProgramCode || 'ALL';

  const examTypeLabels = useMemo<ExamLabelMap>(() => {
    const map: ExamLabelMap = {};
    const programs = activePrograms;

    programs.forEach((program: ExamProgramItem) => {
      const code = normalizeProgramCode(program?.code);
      const label = String(program?.label || '').trim();
      if (!label) return;
      map[code] = label;
    });

    return map;
  }, [activePrograms]);

  const examTypeLabel = (type: string) => resolveExamTypeLabel(type, examTypeLabels);
  useEffect(() => {
    if (!isScreenActive || !canAccessExams || applicantVerificationLocked) return;
    void examsQuery.refetch();
    if (!isCandidateMode && !isApplicantMode && user?.role === 'STUDENT') {
      void studentExamPlacementsQuery.refetch();
    }
  }, [applicantVerificationLocked, canAccessExams, examsQuery.refetch, isScreenActive]);
  const studentPlacements = useMemo(() => {
    const rows = studentExamPlacementsQuery.data || [];
    return rows
      .filter((item) => {
        const type = normalizeProgramCode(item.examType);
        if (effectiveTypeFilter !== 'ALL' && type !== effectiveTypeFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(String(a.startTime || 0)).getTime() - new Date(String(b.startTime || 0)).getTime());
  }, [effectiveTypeFilter, studentExamPlacementsQuery.data]);
  const statusFilterOptions = useMemo(
    () => [
      { value: 'ALL', label: 'Semua Status' },
      { value: 'OPEN', label: 'Sedang Dibuka' },
      { value: 'MAKEUP', label: 'Susulan' },
      { value: 'UPCOMING', label: 'Akan Datang' },
      { value: 'COMPLETED', label: 'Selesai' },
      { value: 'MISSED', label: 'Terlewat' },
    ],
    [],
  );
  const filtered = useMemo(() => {
    const rows = examsQuery.data?.exams || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
      const status = resolveStudentExamRuntimeStatus(item);
      if (effectiveTypeFilter !== 'ALL' && type !== effectiveTypeFilter) return false;
      if (statusFilter !== 'ALL' && status !== statusFilter) return false;
      if (!q) return true;
      const resolvedSubject = resolveSubjectLabel(item);
      const subjectName = String(resolvedSubject.name || '').toLowerCase();
      const subjectCode = String(resolvedSubject.code || '').toLowerCase();
      const vacancyTitle = String(item.jobVacancy?.title || '').toLowerCase();
      const vacancyCompany = String(
        item.jobVacancy?.industryPartner?.name || item.jobVacancy?.companyName || '',
      ).toLowerCase();
      return (
        String(item.packet?.title || '').toLowerCase().includes(q) ||
        subjectName.includes(q) ||
        subjectCode.includes(q) ||
        vacancyTitle.includes(q) ||
        vacancyCompany.includes(q)
      );
    });
  }, [effectiveTypeFilter, examsQuery.data?.exams, searchQuery, statusFilter]);

  if (isLoading) return <AppLoadingScreen message="Memuat ujian..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (!canAccessExams) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentPadding}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 8 }}>Ujian</Text>
        <QueryStateView type="error" message="Halaman ini hanya tersedia untuk peserta ujian yang aktif." />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pageContentPadding}
      refreshControl={
        <RefreshControl
          refreshing={
            (examsQuery.isFetching && !examsQuery.isLoading) ||
            (!isCandidateMode &&
              !isApplicantMode &&
              studentExamCardsQuery.isFetching &&
              !studentExamCardsQuery.isLoading)
          }
          onRefresh={() => {
            void examsQuery.refetch();
            if (!isCandidateMode && !isApplicantMode) {
              void studentExamCardsQuery.refetch();
              void studentExamPlacementsQuery.refetch();
            }
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6 }}>
        {isCandidateMode ? 'Tes Seleksi' : isApplicantMode ? 'Tes BKK' : 'Ujian'}
      </Text>
      <Text style={{ color: '#64748b', marginBottom: 12 }}>
        {isCandidateMode
          ? 'Lihat jadwal tes yang tersedia untuk calon siswa.'
          : isApplicantMode
            ? 'Lihat jadwal tes rekrutmen yang terhubung dengan lamaran BKK Anda.'
            : 'Lihat jadwal ujian yang tersedia untuk kelas Anda.'}
      </Text>

      {applicantVerificationLocked ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#fde68a',
            backgroundColor: '#fffbeb',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK menunggu verifikasi admin</Text>
          <Text style={{ color: '#92400e' }}>
            Akun pelamar Anda belum diverifikasi. Lengkapi profil pelamar lalu tunggu verifikasi admin sebelum mengikuti Tes BKK.
          </Text>
        </View>
      ) : null}

      {!isCandidateMode && !isApplicantMode ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>Kartu Ujian Digital</Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>
                Kartu ujian akan muncul di sini setelah dipublikasikan oleh Kepala TU.
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                {studentExamCardsQuery.data?.length || 0} kartu
              </Text>
            </View>
          </View>

          {studentExamCardsQuery.isLoading ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>Memuat kartu ujian digital...</Text>
            </View>
          ) : studentExamCardsQuery.isError ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff1f2',
              }}
            >
              <Text style={{ color: '#be123c', fontWeight: '700' }}>Gagal memuat kartu ujian digital.</Text>
              <Pressable
                onPress={() => studentExamCardsQuery.refetch()}
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#fecdd3',
                  backgroundColor: '#fff',
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>Coba Lagi</Text>
              </Pressable>
            </View>
          ) : studentExamCardsQuery.data && studentExamCardsQuery.data.length > 0 ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              {studentExamCardsQuery.data.map((card) => (
                <View
                  key={card.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    borderRadius: 16,
                    backgroundColor: '#f8fbff',
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      borderBottomWidth: 1,
                      borderBottomColor: '#dbe7fb',
                      paddingBottom: 10,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ color: '#2563eb', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }}>
                      {card.payload.schoolName.toUpperCase()}
                    </Text>
                    <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '800', marginTop: 6 }}>
                      {card.payload.headerTitle}
                    </Text>
                    <Text style={{ color: '#64748b', marginTop: 4 }}>{card.payload.headerSubtitle}</Text>
                    <Text style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                      Generate: {formatDateTime(card.generatedAt)}
                    </Text>
                  </View>

                  <View style={{ gap: 10 }}>
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        backgroundColor: '#fff',
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                        IDENTITAS SISWA
                      </Text>
                      <Text style={{ color: '#0f172a', fontWeight: '700', marginTop: 8 }}>
                        {card.payload.student.name}
                      </Text>
                      <Text style={{ color: '#475569', marginTop: 4, fontSize: 12 }}>
                        NIS: {card.payload.student.nis || '-'}
                      </Text>
                      <Text style={{ color: '#475569', marginTop: 2, fontSize: 12 }}>
                        NISN: {card.payload.student.nisn || '-'}
                      </Text>
                      <Text style={{ color: '#475569', marginTop: 2, fontSize: 12 }}>
                        Kelas: {card.payload.student.className || '-'}
                      </Text>
                    </View>

                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: '#dbe7fb',
                        borderRadius: 12,
                        backgroundColor: '#fff',
                        padding: 10,
                      }}
                    >
                      <Text style={{ color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>
                        LEGALITAS
                      </Text>
                      <Text style={{ color: '#0f172a', fontWeight: '700', marginTop: 8 }}>
                        {card.payload.legality.principalName}
                      </Text>
                      <Text style={{ color: '#475569', marginTop: 4, fontSize: 12 }}>
                        {card.payload.legality.signatureLabel}
                      </Text>
                      {card.payload.legality.principalBarcodeDataUrl ? (
                        <Image
                          source={{ uri: card.payload.legality.principalBarcodeDataUrl }}
                          style={{
                            width: 88,
                            height: 88,
                            marginTop: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: '#dbe7fb',
                            backgroundColor: '#fff',
                          }}
                          resizeMode="contain"
                        />
                      ) : null}
                    </View>

                    {card.payload.entries.map((entry) => (
                      <View
                        key={`${card.id}-${entry.sittingId}`}
                        style={{
                          borderWidth: 1,
                          borderColor: '#dbe7fb',
                          borderRadius: 12,
                          backgroundColor: '#fff',
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{entry.roomName}</Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          {entry.sessionLabel || '-'} • Kursi {entry.seatLabel || '-'}
                        </Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          {formatDateTime(entry.startTime || '')} - {formatDateTime(entry.endTime || '')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>
                Belum ada kartu ujian digital yang dipublikasikan untuk akun Anda.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {!isCandidateMode && !isApplicantMode ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbe7fb',
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#0f172a', fontSize: 18, fontWeight: '700' }}>Penempatan Ujian</Text>
              <Text style={{ color: '#64748b', marginTop: 4 }}>
                Ruang, sesi, dan kursi yang ditetapkan Kurikulum akan muncul di sini meski kartu ujian digital belum dipublikasikan.
              </Text>
            </View>
            <View
              style={{
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#bfdbfe',
                backgroundColor: '#eff6ff',
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
                {studentPlacements.length} penempatan
              </Text>
            </View>
          </View>

          {studentExamPlacementsQuery.isLoading ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>Memuat penempatan ujian...</Text>
            </View>
          ) : studentExamPlacementsQuery.isError ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#fecaca',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff1f2',
              }}
            >
              <Text style={{ color: '#be123c', fontWeight: '700' }}>Gagal memuat penempatan ujian.</Text>
              <Pressable
                onPress={() => studentExamPlacementsQuery.refetch()}
                style={{
                  marginTop: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#fecdd3',
                  backgroundColor: '#fff',
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: '#be123c', fontWeight: '700' }}>Coba Lagi</Text>
              </Pressable>
            </View>
          ) : studentPlacements.length > 0 ? (
            <View style={{ marginTop: 12, gap: 10 }}>
              {studentPlacements.map((placement) => {
                const chip = placementStatusStyle(placement.startTime, placement.endTime);
                return (
                  <View
                    key={placement.id}
                    style={{
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      backgroundColor: '#fff',
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#0f172a', fontWeight: '700' }}>{placement.roomName}</Text>
                        <Text style={{ color: '#64748b', marginTop: 4, fontSize: 12 }}>
                          {examTypeLabel(placement.examType)} • {placement.sessionLabel || 'Sesi belum diatur'}
                        </Text>
                      </View>
                      <View
                        style={{
                          alignSelf: 'flex-start',
                          borderWidth: 1,
                          borderColor: chip.border,
                          backgroundColor: chip.bg,
                          borderRadius: 999,
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: chip.text, fontSize: 11, fontWeight: '700' }}>{chip.label}</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 6 }}>
                      Kursi: {placement.seatLabel || 'Menunggu denah dipublikasikan'}
                    </Text>
                    <Text style={{ color: '#334155', fontSize: 12, marginTop: 4 }}>
                      Waktu: {formatDateTime(placement.startTime || '')} - {formatDateTime(placement.endTime || '')}
                    </Text>
                    {placement.proctor?.name ? (
                      <Text style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                        Pengawas: {placement.proctor.name}
                      </Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 12,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: '#64748b' }}>
                Belum ada penempatan ruang ujian yang dipublikasikan untuk akun Anda.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      <Text
        style={{
          color: '#334155',
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 4,
        }}
      >
        Cari Tes
      </Text>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={isApplicantMode ? 'Cari judul tes / lowongan...' : 'Cari judul ujian / mapel...'}
        placeholderTextColor="#94a3b8"
        style={{
          borderWidth: 1,
          borderColor: '#cbd5e1',
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          backgroundColor: '#fff',
          marginBottom: 10,
        }}
      />

      <Text
        style={{
          color: '#334155',
          fontSize: 12,
          fontWeight: '600',
          marginBottom: 4,
        }}
      >
        Filter Jadwal
      </Text>
      <MobileSelectField
        label="Status"
        value={statusFilter}
        options={statusFilterOptions}
        onChange={(next) => setStatusFilter((next as StatusFilter) || 'ALL')}
        placeholder="Pilih status"
        helperText={lockedProgramCode ? `Program tetap: ${examTypeLabel(lockedProgramCode)}` : undefined}
      />

      {examsQuery.isLoading ? <QueryStateView type="loading" message="Mengambil daftar ujian..." /> : null}
      {examsQuery.isError ? (
        <QueryStateView type="error" message="Gagal memuat daftar ujian." onRetry={() => examsQuery.refetch()} />
      ) : null}
      {examsQuery.data?.fromCache ? <OfflineCacheNotice cachedAt={examsQuery.data.cachedAt} /> : null}

      {!examsQuery.isLoading && !examsQuery.isError ? (
        applicantVerificationLocked ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: '#fde68a',
              borderStyle: 'dashed',
              borderRadius: 10,
              padding: 16,
              backgroundColor: '#fff',
            }}
          >
            <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Tes BKK belum tersedia</Text>
            <Text style={{ color: '#64748b' }}>
              Tes BKK akan tampil di sini setelah akun pelamar diverifikasi dan lowongan Anda memiliki jadwal tes aktif.
            </Text>
          </View>
        ) : filtered.length > 0 ? (
          <View>
            {filtered.map((item: StudentExamItem) => {
              const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
              const status = resolveStudentExamRuntimeStatus(item);
              const style = statusStyle(status);
              const resolvedSubject = resolveSubjectLabel(item);
              const subjectName = resolvedSubject.name;
              const subjectCode = resolvedSubject.code;
              const vacancyTitle = String(item.jobVacancy?.title || '').trim();
              const vacancyCompany = String(
                item.jobVacancy?.industryPartner?.name || item.jobVacancy?.companyName || '',
              ).trim();
              return (
                <View
                  key={item.id}
                  style={{
                    backgroundColor: '#fff',
                    borderWidth: 1,
                    borderColor: '#e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ color: '#0f172a', fontWeight: '700', flex: 1, paddingRight: 8 }}>
                      {item.packet.title}
                    </Text>
                    <Text
                      style={{
                        color: style.text,
                        backgroundColor: style.bg,
                        borderColor: style.border,
                        borderWidth: 1,
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        fontSize: 11,
                        fontWeight: '700',
                      }}
                    >
                      {status === 'UPCOMING' && item.makeupMode === 'FORMAL' && item.makeupScheduled
                        ? 'Jadwal Susulan'
                        : style.label}
                    </Text>
                  </View>
                  <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>
                    {isApplicantMode
                      ? `${vacancyTitle || subjectName}${vacancyCompany ? ` • ${vacancyCompany}` : ''} • ${examTypeLabel(type)}`
                      : `${subjectName}${subjectCode ? ` (${subjectCode})` : ''} • ${examTypeLabel(type)}`}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 4 }}>
                    Mulai: {formatDateTime(item.startTime)}
                  </Text>
                  <Text style={{ color: '#334155', fontSize: 12, marginBottom: 6 }}>
                    Selesai: {formatDateTime(item.endTime)} • Durasi: {item.packet.duration} menit
                  </Text>
                  {item.makeupMode === 'FORMAL' && item.makeupStartTime ? (
                    <Text style={{ color: '#c2410c', fontSize: 12, marginBottom: 4 }}>
                      Jadwal susulan: {formatDateTime(item.makeupStartTime)}
                    </Text>
                  ) : null}
                  {item.makeupDeadline ? (
                    <Text style={{ color: '#c2410c', fontSize: 12, marginBottom: 4 }}>
                      {status === 'MAKEUP' ? 'Susulan sampai' : 'Batas susulan'}: {formatDateTime(item.makeupDeadline)}
                    </Text>
                  ) : null}
                  {item.makeupReason ? (
                    <Text style={{ color: '#64748b', fontSize: 12, marginBottom: 6 }}>
                      Alasan susulan: {item.makeupReason}
                    </Text>
                  ) : null}
                  {item.isBlocked ? (
                    <View
                      style={{
                        backgroundColor: '#fee2e2',
                        borderWidth: 1,
                        borderColor: '#fca5a5',
                        borderRadius: 8,
                        padding: 8,
                        marginBottom: 8,
                      }}
                    >
                      <Text style={{ color: '#991b1b', fontSize: 12, fontWeight: '600' }}>
                        Diblokir: {item.blockReason || 'Akses dibatasi wali kelas'}
                      </Text>
                      {item.financeClearance?.hasOutstanding ? (
                        <View
                          style={{
                            marginTop: 8,
                            borderWidth: 1,
                            borderColor: '#fde68a',
                            backgroundColor: '#fffbeb',
                            borderRadius: 8,
                            padding: 8,
                          }}
                        >
                          <Text style={{ color: '#92400e', fontSize: 11, fontWeight: '700' }}>Clearance finance</Text>
                          <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>
                            Outstanding: {formatExamCurrency(item.financeClearance.outstandingAmount)}
                          </Text>
                          <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>
                            Tagihan aktif: {item.financeClearance.outstandingInvoices} • overdue: {item.financeClearance.overdueInvoices}
                          </Text>
                          {!item.financeClearance.blocksExam ? (
                            <Text style={{ color: '#92400e', fontSize: 11, marginTop: 4 }}>
                              Status finance ini tidak menjadi penyebab blokir pada program ujian ini.
                            </Text>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {!item.isBlocked && item.financeClearance?.warningOnly && item.financeClearance.hasOutstanding ? (
                    <View
                      style={{
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: '#fde68a',
                        backgroundColor: '#fffbeb',
                        borderRadius: 8,
                        padding: 8,
                      }}
                    >
                      <Text style={{ color: '#92400e', fontSize: 11, fontWeight: '700' }}>Info finance</Text>
                      <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>
                        Outstanding: {formatExamCurrency(item.financeClearance.outstandingAmount)}
                      </Text>
                      <Text style={{ color: '#92400e', fontSize: 11, marginTop: 2 }}>
                        Tagihan aktif: {item.financeClearance.outstandingInvoices} • overdue: {item.financeClearance.overdueInvoices}
                      </Text>
                      <Text style={{ color: '#92400e', fontSize: 11, marginTop: 4 }}>
                        Program ini hanya memberi peringatan dan tidak memblokir ujian.
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={async () => {
                      if ((status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked) {
                        setSelectedExam(item);
                        return;
                      }
                      const upcomingMessage =
                        item.makeupMode === 'FORMAL' && item.makeupScheduled
                          ? 'Jadwal susulan belum dimulai. Silakan tunggu waktu susulan yang ditetapkan.'
                          : isApplicantMode
                            ? 'Tes BKK belum dimulai. Silakan tunggu jadwal mulai.'
                            : 'Ujian belum dimulai. Silakan tunggu jadwal mulai.';
                      Alert.alert(
                        isApplicantMode ? 'Tes BKK' : 'Ujian Mobile',
                        status === 'COMPLETED'
                          ? isApplicantMode
                            ? 'Tes BKK ini sudah selesai dikerjakan.'
                            : 'Ujian ini sudah selesai dikerjakan.'
                          : status === 'MISSED'
                            ? isApplicantMode
                              ? 'Waktu tes BKK sudah berakhir.'
                              : 'Waktu ujian sudah berakhir.'
                            : status === 'UPCOMING'
                              ? upcomingMessage
                            : status === 'MAKEUP'
                              ? isApplicantMode
                                ? 'Tes BKK susulan tidak tersedia saat ini.'
                                : 'Ujian susulan tidak tersedia saat ini.'
                              : isApplicantMode
                                ? 'Tes BKK tidak dapat dikerjakan dari mobile untuk status ini.'
                                : 'Ujian tidak dapat dikerjakan dari mobile untuk status ini.',
                      );
                    }}
                    style={{
                      backgroundColor: (status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked ? '#1d4ed8' : '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {(status === 'OPEN' || status === 'MAKEUP') && !item.isBlocked
                        ? isApplicantMode
                          ? status === 'MAKEUP'
                            ? 'Mulai Tes Susulan'
                            : 'Mulai Tes BKK'
                          : status === 'MAKEUP'
                            ? 'Mulai Susulan'
                            : 'Mulai Ujian'
                        : isApplicantMode
                          ? 'Detail Tes BKK'
                          : 'Detail Ujian'}
                    </Text>
                  </Pressable>
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
            <Text style={{ color: '#0f172a', fontWeight: '700', marginBottom: 4 }}>
              {isApplicantMode ? 'Tidak ada tes BKK' : 'Tidak ada ujian'}
            </Text>
            <Text style={{ color: '#64748b' }}>
              {isApplicantMode
                ? 'Belum ada tes BKK sesuai filter yang dipilih.'
                : 'Belum ada ujian sesuai filter yang dipilih.'}
            </Text>
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
      <MobileDetailModal
        visible={Boolean(selectedExam)}
        title={isApplicantMode ? 'Mulai Tes BKK?' : 'Mulai Ujian?'}
        subtitle="Pastikan Anda siap sebelum soal dibuka. Setelah mulai, sistem akan memantau pelanggaran selama ujian berlangsung."
        iconName="play-circle"
        accentColor="#2563eb"
        onClose={() => setSelectedExam(null)}
      >
        {selectedExam ? (
          <View>
            <View
              style={{
                borderWidth: 1,
                borderColor: '#dbe7fb',
                borderRadius: 14,
                backgroundColor: '#f8fbff',
                padding: 12,
                marginBottom: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontSize: 17, fontWeight: '800' }}>{selectedExam.packet.title}</Text>
              <Text style={{ color: '#64748b', marginTop: 4, fontSize: 13 }}>
                {resolveSubjectLabel(selectedExam).name}
                {resolveSubjectLabel(selectedExam).code ? ` (${resolveSubjectLabel(selectedExam).code})` : ''}
              </Text>
              <Text style={{ color: '#334155', marginTop: 8, fontSize: 12 }}>
                Mulai: {formatDateTime(selectedExam.startTime)}
              </Text>
              <Text style={{ color: '#334155', marginTop: 4, fontSize: 12 }}>
                Selesai: {formatDateTime(selectedExam.endTime)} • Durasi: {selectedExam.packet.duration} menit
              </Text>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: '#fde68a',
                backgroundColor: '#fffbeb',
                borderRadius: 14,
                padding: 12,
              }}
            >
              {[
                'Pastikan koneksi internet stabil sebelum mulai.',
                'Jangan menekan tombol kembali, Home, atau membuka recent apps.',
                'Perpindahan aplikasi akan dihitung sebagai pelanggaran.',
                'Pelanggaran ke-4 akan mengumpulkan ujian otomatis.',
                'Gambar soal dapat diperbesar tanpa keluar dari ujian.',
              ].map((rule) => (
                <Text key={rule} style={{ color: '#92400e', fontSize: 12, lineHeight: 20, marginBottom: 4 }}>
                  • {rule}
                </Text>
              ))}
            </View>

            <Pressable
              onPress={() => {
                const target = `/exams/${selectedExam.id}/take?ready=1`;
                setSelectedExam(null);
                router.push(target as never);
              }}
              style={{
                marginTop: 14,
                backgroundColor: '#16a34a',
                borderRadius: 12,
                paddingVertical: 12,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>
                {isApplicantMode ? 'Mulai Tes BKK' : 'Mulai Ujian'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </MobileDetailModal>
    </ScrollView>
  );
}
