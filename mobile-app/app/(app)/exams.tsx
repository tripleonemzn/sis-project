import { useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../src/components/QueryStateView';
import { OfflineCacheNotice } from '../../src/components/OfflineCacheNotice';
import { useAuth } from '../../src/features/auth/AuthProvider';
import { StudentExamItem } from '../../src/features/exams/types';
import { useStudentExamsQuery } from '../../src/features/exams/useStudentExamsQuery';
import { getStandardPagePadding } from '../../src/lib/ui/pageLayout';
import { examApi, ExamProgramItem } from '../../src/features/exams/examApi';

type StatusFilter = 'ALL' | 'OPEN' | 'UPCOMING' | 'MISSED' | 'COMPLETED';
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

function normalizeStatus(raw: string, hasSubmitted: boolean): 'OPEN' | 'UPCOMING' | 'MISSED' | 'COMPLETED' {
  if (hasSubmitted) return 'COMPLETED';
  const value = String(raw || '').toUpperCase();
  if (value.includes('OPEN') || value.includes('IN_PROGRESS')) return 'OPEN';
  if (value.includes('UPCOMING')) return 'UPCOMING';
  if (value.includes('MISSED') || value.includes('TIMEOUT')) return 'MISSED';
  if (value.includes('COMPLETED')) return 'COMPLETED';
  return 'UPCOMING';
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

function statusStyle(status: 'OPEN' | 'UPCOMING' | 'MISSED' | 'COMPLETED') {
  if (status === 'OPEN') return { bg: '#dcfce7', border: '#86efac', text: '#166534', label: 'Berlangsung' };
  if (status === 'COMPLETED') return { bg: '#dbeafe', border: '#93c5fd', text: '#1d4ed8', label: 'Selesai' };
  if (status === 'MISSED') return { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b', label: 'Terlewat' };
  return { bg: '#fef3c7', border: '#fcd34d', text: '#92400e', label: 'Akan Datang' };
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
  const isCandidateMode = user?.role === 'CALON_SISWA';
  const isApplicantMode = user?.role === 'UMUM';
  const applicantVerificationLocked =
    isApplicantMode && String(user?.verificationStatus || 'PENDING').toUpperCase() !== 'VERIFIED';
  const examsQuery = useStudentExamsQuery({ enabled: isAuthenticated && !applicantVerificationLocked, user });
  const pageContentPadding = getStandardPagePadding(insets);
  const lockedProgramCode = normalizeProgramCode(Array.isArray(params.programCode) ? params.programCode[0] : params.programCode);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | string>(lockedProgramCode || 'ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

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

  const effectiveTypeFilter = useMemo(() => {
    if (lockedProgramCode) return lockedProgramCode;
    if (typeFilter === 'ALL') return 'ALL';
    const allowed = new Set(activePrograms.map((program) => normalizeProgramCode(program.code)));
    return allowed.has(typeFilter) ? typeFilter : 'ALL';
  }, [lockedProgramCode, typeFilter, activePrograms]);

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

  const filtered = useMemo(() => {
    const rows = examsQuery.data?.exams || [];
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((item) => {
      const type = normalizeProgramCode(item.packet.programCode || item.packet.type);
      const status = normalizeStatus(item.status, item.has_submitted);
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
          refreshing={examsQuery.isFetching && !examsQuery.isLoading}
          onRefresh={() => examsQuery.refetch()}
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

      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder={isApplicantMode ? 'Cari judul tes / lowongan...' : 'Cari judul ujian / mapel...'}
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

      {!lockedProgramCode ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
          {(['ALL', ...activePrograms.map((program) => normalizeProgramCode(program.code))] as Array<'ALL' | string>).map((item) => {
            const selected = effectiveTypeFilter === item;
            return (
              <View key={item} style={{ paddingHorizontal: 4, marginBottom: 8 }}>
                <Pressable
                  onPress={() => setTypeFilter(item)}
                  style={{
                    borderWidth: 1,
                    borderColor: selected ? '#1d4ed8' : '#cbd5e1',
                    backgroundColor: selected ? '#eff6ff' : '#fff',
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    alignItems: 'center',
                  }}
                >
                  <Text style={{ color: selected ? '#1d4ed8' : '#334155', fontSize: 11, fontWeight: '700' }}>
                    {item === 'ALL' ? 'Semua' : examTypeLabel(item)}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ marginBottom: 10 }}>
          <View
            style={{
              alignSelf: 'flex-start',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              backgroundColor: '#eff6ff',
              borderRadius: 999,
              paddingHorizontal: 12,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12 }}>
              Filter Tetap: {examTypeLabel(lockedProgramCode)}
            </Text>
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 }}>
        {(['ALL', 'OPEN', 'UPCOMING', 'COMPLETED', 'MISSED'] as StatusFilter[]).map((item) => {
          const selectedStatus = statusFilter === item;
          return (
            <View key={item} style={{ width: '20%', paddingHorizontal: 4, marginBottom: 8 }}>
              <Pressable
                onPress={() => setStatusFilter(item)}
                style={{
                  borderWidth: 1,
                  borderColor: selectedStatus ? '#1d4ed8' : '#cbd5e1',
                  backgroundColor: selectedStatus ? '#eff6ff' : '#fff',
                  borderRadius: 8,
                  paddingVertical: 8,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: selectedStatus ? '#1d4ed8' : '#334155', fontSize: 10, fontWeight: '700' }}>
                  {item === 'ALL'
                    ? 'Semua'
                    : item === 'OPEN'
                      ? 'Buka'
                      : item === 'UPCOMING'
                        ? 'Akan Datang'
                        : item === 'COMPLETED'
                          ? 'Selesai'
                          : 'Terlewat'}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

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
              const status = normalizeStatus(item.status, item.has_submitted);
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
                      {style.label}
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
                      if (status === 'OPEN' && !item.isBlocked) {
                        router.push(`/exams/${item.id}/take` as never);
                        return;
                      }
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
                              ? isApplicantMode
                                ? 'Tes BKK belum dimulai. Silakan tunggu jadwal mulai.'
                                : 'Ujian belum dimulai. Silakan tunggu jadwal mulai.'
                              : isApplicantMode
                                ? 'Tes BKK tidak dapat dikerjakan dari mobile untuk status ini.'
                                : 'Ujian tidak dapat dikerjakan dari mobile untuk status ini.',
                      );
                    }}
                    style={{
                      backgroundColor: status === 'OPEN' && !item.isBlocked ? '#1d4ed8' : '#cbd5e1',
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {status === 'OPEN' && !item.isBlocked
                        ? isApplicantMode
                          ? 'Mulai Tes BKK'
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
    </ScrollView>
  );
}
