import { useMemo, useState } from 'react';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import {
  studentExtracurricularApi,
  type StudentExtracurricular,
  type StudentExtracurricularSummary,
} from '../../../src/features/student/studentExtracurricularApi';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { BRAND_COLORS } from '../../../src/config/brand';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';

function formatShortDate(raw?: string | null) {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatAttendanceStatus(status?: string | null) {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'PRESENT') return 'Hadir';
  if (normalized === 'PERMIT') return 'Izin';
  if (normalized === 'SICK') return 'Sakit';
  if (normalized === 'ABSENT') return 'Alfa';
  return normalized || '-';
}

function getOsisActionLabel(requestStatus?: string | null) {
  return requestStatus === 'REJECTED' ? 'Ajukan Ulang OSIS' : 'Ajukan OSIS';
}

function EmptyState(props: { message: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#cbd5e1',
        borderRadius: 14,
        backgroundColor: '#f8fafc',
        paddingHorizontal: 14,
        paddingVertical: 16,
      }}
    >
      <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13, lineHeight: 20 }}>{props.message}</Text>
    </View>
  );
}

type SelectionModalProps = {
  visible: boolean;
  title: string;
  description: string;
  search: string;
  onSearchChange: (value: string) => void;
  onClose: () => void;
  options: StudentExtracurricular[];
  loading: boolean;
  submitLabel: string;
  submitting: boolean;
  emptyMessage: string;
  onSelect: (option: StudentExtracurricular) => void;
};

type RegularConfirmationModalProps = {
  visible: boolean;
  option: StudentExtracurricular | null;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

function SelectionModal(props: SelectionModalProps) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.55)',
          justifyContent: 'center',
          paddingHorizontal: 16,
          paddingVertical: 24,
        }}
      >
        <View
          style={{
            maxHeight: '86%',
            backgroundColor: '#fff',
            borderRadius: 24,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: '#e2e8f0',
              flexDirection: 'row',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: BRAND_COLORS.textDark }}>{props.title}</Text>
              <Text style={{ marginTop: 4, color: BRAND_COLORS.textMuted, fontSize: 13, lineHeight: 18 }}>
                {props.description}
              </Text>
            </View>
            <Pressable
              onPress={props.onClose}
              style={{
                width: 40,
                height: 40,
                borderRadius: 999,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 18, color: '#475569' }}>x</Text>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
            <TextInput
              value={props.search}
              onChangeText={props.onSearchChange}
              placeholder="Cari nama kegiatan..."
              placeholderTextColor="#94a3b8"
              style={{
                borderWidth: 1,
                borderColor: '#d6e2f7',
                borderRadius: 999,
                backgroundColor: '#f8fbff',
                paddingHorizontal: 14,
                paddingVertical: 11,
                color: BRAND_COLORS.textDark,
              }}
            />
          </View>

          <ScrollView
            style={{ maxHeight: 520 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 18, gap: 12 }}
          >
            {props.loading ? (
              <QueryStateView type="loading" message="Memuat pilihan..." />
            ) : props.options.length === 0 ? (
              <EmptyState message={props.emptyMessage} />
            ) : (
              props.options.map((option) => (
                <View
                  key={option.id}
                  style={{
                    borderWidth: 1,
                    borderColor: '#d6e2f7',
                    borderRadius: 16,
                    backgroundColor: '#fff',
                    padding: 14,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 16 }}>
                      {option.name}
                    </Text>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        backgroundColor: option.category === 'OSIS' ? '#fef3c7' : '#dbeafe',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '700',
                          color: option.category === 'OSIS' ? '#b45309' : '#1d4ed8',
                        }}
                      >
                        {option.category === 'OSIS' ? 'OSIS' : 'EKSKUL'}
                      </Text>
                    </View>
                  </View>

                  <Text style={{ color: '#64748b', fontSize: 12 }}>
                    Pembina:{' '}
                    {(option.tutorAssignments || [])
                      .map((assignment) => assignment.tutor?.name)
                      .filter(Boolean)
                      .join(', ') || '-'}
                  </Text>

                  {option.description ? (
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13 }}>{option.description}</Text>
                  ) : null}

                  <Pressable
                    onPress={() => props.onSelect(option)}
                    disabled={props.submitting}
                    style={{
                      marginTop: 4,
                      borderRadius: 12,
                      backgroundColor: props.submitting
                        ? '#94a3b8'
                        : option.category === 'OSIS'
                          ? '#f59e0b'
                          : BRAND_COLORS.blue,
                      alignItems: 'center',
                      paddingVertical: 11,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>
                      {props.submitting ? 'Memproses...' : props.submitLabel}
                    </Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function RegularConfirmationModal(props: RegularConfirmationModalProps) {
  const selectedName = props.option?.name || 'ekskul ini';

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.5)',
          justifyContent: 'center',
          paddingHorizontal: 22,
        }}
      >
        <View
          style={{
            backgroundColor: BRAND_COLORS.white,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: '#c7d7f7',
            paddingHorizontal: 16,
            paddingVertical: 16,
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: 0.24,
            shadowRadius: 18,
            elevation: 14,
          }}
        >
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: '#eff6ff',
              borderWidth: 1,
              borderColor: '#bfdbfe',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 10,
            }}
          >
            <Feather name="award" size={18} color={BRAND_COLORS.blue} />
          </View>
          <Text style={{ color: BRAND_COLORS.textDark, fontSize: 22, fontWeight: '700', marginBottom: 6 }}>
            Konfirmasi Pilihan Ekskul
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
            Ekskul reguler hanya bisa dipilih 1 kali pada tahun ajaran aktif. Pastikan Anda benar-benar yakin memilih{' '}
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>{selectedName}</Text>.
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 14 }}>
            Setelah disimpan, pilihan ini tidak bisa diganti langsung dari menu ini.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              disabled={props.submitting}
              onPress={props.onClose}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.white,
                opacity: props.submitting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '700' }}>Periksa Lagi</Text>
            </Pressable>
            <Pressable
              disabled={props.submitting}
              onPress={props.onConfirm}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: BRAND_COLORS.blue,
                borderRadius: 12,
                paddingVertical: 11,
                alignItems: 'center',
                backgroundColor: BRAND_COLORS.blue,
                opacity: props.submitting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: BRAND_COLORS.white, fontWeight: '700' }}>
                {props.submitting ? 'Memproses...' : `Ya, Pilih ${selectedName}`}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function StudentExtracurricularScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [regularModalOpen, setRegularModalOpen] = useState(false);
  const [osisModalOpen, setOsisModalOpen] = useState(false);
  const [regularSearch, setRegularSearch] = useState('');
  const [osisSearch, setOsisSearch] = useState('');
  const [regularConfirmationOption, setRegularConfirmationOption] = useState<StudentExtracurricular | null>(null);

  const summaryQuery = useQuery({
    queryKey: ['mobile-student-extracurricular-summary', user?.id],
    queryFn: () => studentExtracurricularApi.getSummary(),
    enabled: isAuthenticated && user?.role === 'STUDENT',
  });

  const regularOptionsQuery = useQuery({
    queryKey: ['mobile-student-regular-options', regularSearch],
    queryFn: () => studentExtracurricularApi.listExtracurriculars('EXTRACURRICULAR'),
    enabled:
      isAuthenticated &&
      user?.role === 'STUDENT' &&
      regularModalOpen &&
      Boolean(summaryQuery.data?.actions.canChooseRegular),
  });

  const osisOptionsQuery = useQuery({
    queryKey: ['mobile-student-osis-options', osisSearch],
    queryFn: () => studentExtracurricularApi.listExtracurriculars('OSIS'),
    enabled:
      isAuthenticated &&
      user?.role === 'STUDENT' &&
      osisModalOpen &&
      Boolean(summaryQuery.data?.actions.canRequestOsis),
  });

  const enrollMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      return studentExtracurricularApi.enroll(ekskulId, summaryQuery.data?.academicYear?.id);
    },
    onSuccess: async () => {
      notifySuccess('Pendaftaran ekskul reguler berhasil.');
      setRegularConfirmationOption(null);
      setRegularModalOpen(false);
      setRegularSearch('');
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-extracurricular-summary', user?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-regular-options'],
      });
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mendaftar ekskul reguler.');
    },
  });

  const osisJoinMutation = useMutation({
    mutationFn: async (ekskulId: number) => {
      return studentExtracurricularApi.requestOsisJoin(ekskulId, summaryQuery.data?.academicYear?.id);
    },
    onSuccess: async () => {
      notifySuccess('Pengajuan OSIS berhasil dikirim.');
      setOsisModalOpen(false);
      setOsisSearch('');
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-extracurricular-summary', user?.id],
      });
      await queryClient.invalidateQueries({
        queryKey: ['mobile-student-osis-options'],
      });
    },
    onError: (error: unknown) => {
      notifyApiError(error, 'Gagal mengirim pengajuan OSIS.');
    },
  });

  const regularOptions = useMemo(() => {
    const items = regularOptionsQuery.data || [];
    const q = regularSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q),
    );
  }, [regularOptionsQuery.data, regularSearch]);

  const osisOptions = useMemo(() => {
    const items = osisOptionsQuery.data || [];
    const q = osisSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        String(item.description || '').toLowerCase().includes(q),
    );
  }, [osisOptionsQuery.data, osisSearch]);

  const summary = summaryQuery.data as StudentExtracurricularSummary | null;
  const regularEnrollment = summary?.regularEnrollment || null;
  const osisMembership = summary?.osisStatus?.membership || null;
  const osisRequest = summary?.osisStatus?.request || null;
  const canChooseRegular = Boolean(summary?.actions.canChooseRegular);
  const canRequestOsis = Boolean(summary?.actions.canRequestOsis);

  const handleRegularSelect = (option: StudentExtracurricular) => {
    setRegularConfirmationOption(option);
  };

  const confirmRegularSelection = () => {
    if (!regularConfirmationOption || enrollMutation.isPending) return;
    enrollMutation.mutate(regularConfirmationOption.id);
  };

  const attendanceCards = [
    { label: 'Hadir', value: regularEnrollment?.attendanceSummary.presentCount || 0, color: '#047857', bg: '#ecfdf5' },
    { label: 'Izin', value: regularEnrollment?.attendanceSummary.permitCount || 0, color: '#b45309', bg: '#fffbeb' },
    { label: 'Sakit', value: regularEnrollment?.attendanceSummary.sickCount || 0, color: '#0369a1', bg: '#f0f9ff' },
    { label: 'Alfa', value: regularEnrollment?.attendanceSummary.absentCount || 0, color: '#be123c', bg: '#fff1f2' },
  ];

  if (isLoading) return <AppLoadingScreen message="Memuat ekstrakurikuler..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'STUDENT') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Ekstrakurikuler</Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role siswa." />
      </ScrollView>
    );
  }

  if (summaryQuery.isLoading) return <AppLoadingScreen message="Memuat ringkasan ekstrakurikuler..." />;

  if (summaryQuery.isError || !summary) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <QueryStateView
          type="error"
          message="Gagal memuat ringkasan ekstrakurikuler siswa."
          onRetry={() => summaryQuery.refetch()}
        />
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pagePadding}
        refreshControl={
          <RefreshControl
            refreshing={summaryQuery.isFetching && !summaryQuery.isLoading}
            onRefresh={() => {
              void summaryQuery.refetch();
            }}
          />
        }
      >
        <Text style={{ fontSize: 24, fontWeight: '700', marginBottom: 6, color: BRAND_COLORS.textDark }}>
          Ekstrakurikuler
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
          Ringkasan ekskul reguler, status OSIS, absensi, dan nilai Anda pada tahun ajaran aktif.
        </Text>

        <View
          style={{
            backgroundColor: '#fef3c7',
            borderWidth: 1,
            borderColor: '#fcd34d',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: '#92400e', fontWeight: '700', marginBottom: 4 }}>Rule Siswa</Text>
          <Text style={{ color: '#92400e', fontSize: 12, lineHeight: 18 }}>
            OSIS hanya bisa diajukan sebelum ekskul reguler dipilih. Jika OSIS sudah diajukan lebih dulu, Anda tetap
            boleh memilih 1 ekskul reguler. Setelah ekskul reguler dipilih, tombol pilihan akan dikunci.
          </Text>
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
            Ekskul Reguler Saya
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 12 }}>
            Ringkasan ekskul reguler yang aktif pada tahun ajaran {summary.academicYear?.name || '-'}.
          </Text>

          {regularEnrollment ? (
            <>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  backgroundColor: '#eff6ff',
                  borderRadius: 14,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>
                  PILIHAN AKTIF
                </Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 20 }}>
                  {regularEnrollment.ekskul.name}
                </Text>
                <Text style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
                  Pembina:{' '}
                  {(regularEnrollment.ekskul.tutors || [])
                    .map((item) => item.name)
                    .filter(Boolean)
                    .join(', ') || '-'}
                </Text>
                {regularEnrollment.ekskul.description ? (
                  <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13, marginTop: 6 }}>
                    {regularEnrollment.ekskul.description}
                  </Text>
                ) : null}
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 8 }}>
                  Nilai & Catatan Pembina
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12 }}>Predikat / Nilai</Text>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18, marginTop: 2 }}>
                  {regularEnrollment.grade || '-'}
                </Text>
                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 10 }}>Deskripsi</Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13, marginTop: 4 }}>
                  {regularEnrollment.description || 'Belum ada catatan nilai dari pembina.'}
                </Text>
              </View>

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', marginBottom: 10 }}>
                  Rekap Absensi Ekskul
                </Text>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {attendanceCards.map((item) => (
                    <View
                      key={item.label}
                      style={{
                        minWidth: '47%',
                        borderRadius: 14,
                        backgroundColor: item.bg,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                      }}
                    >
                      <Text style={{ color: item.color, fontSize: 11, fontWeight: '700' }}>{item.label}</Text>
                      <Text style={{ color: item.color, fontSize: 22, fontWeight: '700', marginTop: 2 }}>{item.value}</Text>
                    </View>
                  ))}
                </View>

                <Text style={{ color: '#64748b', fontSize: 12, marginTop: 10 }}>
                  Total sesi terekam: {regularEnrollment.attendanceSummary.totalSessions}
                </Text>

                <View style={{ marginTop: 10, gap: 8 }}>
                  <Text style={{ color: '#64748b', fontSize: 12, fontWeight: '700' }}>Aktivitas Terakhir</Text>
                  {regularEnrollment.attendanceSummary.latestRecords.length > 0 ? (
                    regularEnrollment.attendanceSummary.latestRecords.map((record, index) => (
                      <View
                        key={`${record.weekKey || 'week'}-${record.sessionIndex}-${index}`}
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 12,
                          backgroundColor: '#fff',
                          padding: 10,
                        }}
                      >
                        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 13 }}>
                          {record.weekKey || 'Minggu tidak diketahui'} • Sesi {record.sessionIndex}
                        </Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginTop: 4 }}>
                          Status: {formatAttendanceStatus(record.status)}
                          {record.note ? ` • Catatan: ${record.note}` : ''}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13 }}>
                      Belum ada absensi ekskul yang direkam oleh pembina.
                    </Text>
                  )}
                </View>
              </View>
            </>
          ) : (
            <EmptyState message={`Anda belum memiliki ekskul reguler aktif pada tahun ajaran ${summary.academicYear?.name || '-'}.`} />
          )}
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
            Status OSIS Saya
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 12 }}>
            Status pengajuan atau keanggotaan OSIS pada tahun ajaran aktif.
          </Text>

          {osisMembership ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#a7f3d0',
                backgroundColor: '#ecfdf5',
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text style={{ color: '#047857', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>STATUS AKTIF</Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                {osisMembership.position?.name || 'Pengurus OSIS'}
              </Text>
              <Text style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
                Divisi: {osisMembership.division?.name || osisMembership.position?.division?.name || '-'}
              </Text>
            </View>
          ) : osisRequest ? (
            <View
              style={{
                borderWidth: 1,
                borderColor: osisRequest.status === 'PENDING' ? '#fcd34d' : '#fecaca',
                backgroundColor: osisRequest.status === 'PENDING' ? '#fffbeb' : '#fef2f2',
                borderRadius: 14,
                padding: 12,
              }}
            >
              <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 12, marginBottom: 4 }}>
                {osisRequest.status === 'PENDING'
                  ? 'MENUNGGU PROSES'
                  : osisRequest.status === 'REJECTED'
                    ? 'DITOLAK'
                    : 'RIWAYAT PENGAJUAN'}
              </Text>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18 }}>
                {osisRequest.ekskul?.name || 'OSIS'}
              </Text>
              <Text style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
                Diajukan pada {formatShortDate(osisRequest.requestedAt)}
              </Text>
              {osisRequest.note ? (
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13, marginTop: 6 }}>
                  Catatan pembina: {osisRequest.note}
                </Text>
              ) : null}
            </View>
          ) : (
            <EmptyState message={`Anda belum mengajukan OSIS pada tahun ajaran ${summary.academicYear?.name || '-'}.`} />
          )}
        </View>

        <View
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#d6e2f7',
            borderRadius: 16,
            padding: 14,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700', fontSize: 18, marginBottom: 4 }}>
            Aksi Yang Tersedia
          </Text>
          <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 12, marginBottom: 12 }}>
            Tombol hanya muncul jika masih sesuai dengan rule ekstrakurikuler siswa.
          </Text>

          {canChooseRegular || canRequestOsis ? (
            <View style={{ gap: 10 }}>
              {canChooseRegular ? (
                <Pressable
                  onPress={() => setRegularModalOpen(true)}
                  style={{
                    borderRadius: 14,
                    backgroundColor: BRAND_COLORS.blue,
                    alignItems: 'center',
                    paddingVertical: 13,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Pilih Ekskul Reguler</Text>
                </Pressable>
              ) : null}

              {canRequestOsis ? (
                <Pressable
                  onPress={() => setOsisModalOpen(true)}
                  style={{
                    borderRadius: 14,
                    backgroundColor: '#f59e0b',
                    alignItems: 'center',
                    paddingVertical: 13,
                  }}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>
                    {getOsisActionLabel(osisRequest?.status)}
                  </Text>
                </Pressable>
              ) : null}

              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                  padding: 12,
                }}
              >
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: 13 }}>
                  {canChooseRegular && canRequestOsis
                    ? 'Anda masih bisa mengajukan OSIS atau memilih 1 ekskul reguler.'
                    : canChooseRegular
                      ? 'OSIS Anda sudah aktif atau sedang diproses. Anda masih bisa memilih 1 ekskul reguler.'
                      : 'Saat ini hanya pengajuan OSIS yang masih tersedia.'}
                </Text>
              </View>
            </View>
          ) : (
            <EmptyState
              message={
                regularEnrollment
                  ? 'Pilihan ekstrakurikuler Anda sudah terkunci. Tidak ada tombol pilihan tambahan yang ditampilkan.'
                  : 'Tidak ada aksi pilihan yang tersedia saat ini.'
              }
            />
          )}
        </View>
      </ScrollView>

      <SelectionModal
        visible={regularModalOpen}
        title="Pilih Ekskul Reguler"
        description="Modal ini hanya menampilkan ekskul reguler yang masih bisa dipilih untuk tahun ajaran aktif."
        search={regularSearch}
        onSearchChange={setRegularSearch}
        onClose={() => {
          setRegularModalOpen(false);
          setRegularSearch('');
          setRegularConfirmationOption(null);
        }}
        options={regularOptions}
        loading={regularOptionsQuery.isLoading}
        submitLabel="Pilih"
        submitting={enrollMutation.isPending}
        emptyMessage="Tidak ada ekskul reguler yang tersedia."
        onSelect={handleRegularSelect}
      />

      <SelectionModal
        visible={osisModalOpen}
        title={getOsisActionLabel(osisRequest?.status)}
        description="OSIS diproses sebagai organisasi siswa. Pembina OSIS akan menempatkan Anda ke divisi dan jabatan yang sesuai."
        search={osisSearch}
        onSearchChange={setOsisSearch}
        onClose={() => {
          setOsisModalOpen(false);
          setOsisSearch('');
        }}
        options={osisOptions}
        loading={osisOptionsQuery.isLoading}
        submitLabel={getOsisActionLabel(osisRequest?.status)}
        submitting={osisJoinMutation.isPending}
        emptyMessage="Tidak ada item OSIS yang tersedia."
        onSelect={(option) => osisJoinMutation.mutate(option.id)}
      />

      <RegularConfirmationModal
        visible={Boolean(regularConfirmationOption)}
        option={regularConfirmationOption}
        submitting={enrollMutation.isPending}
        onClose={() => {
          if (enrollMutation.isPending) return;
          setRegularConfirmationOption(null);
        }}
        onConfirm={confirmRegularSelection}
      />
    </>
  );
}
