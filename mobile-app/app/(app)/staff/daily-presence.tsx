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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import MobileSelectField from '../../../src/components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../../src/components/MobileSummaryCard';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { attendanceApi } from '../../../src/features/attendance/attendanceApi';
import type { DailyPresenceEventType } from '../../../src/features/attendance/types';
import { staffApi } from '../../../src/features/staff/staffApi';
import { resolveStaffDivision } from '../../../src/features/staff/staffRole';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { useAppTheme } from '../../../src/theme/AppThemeProvider';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type PresenceModalState = {
  checkpoint: DailyPresenceEventType;
} | null;

function getCheckpointCopy(checkpoint: DailyPresenceEventType) {
  return checkpoint === 'CHECK_IN'
    ? {
        title: 'Bantu Absen Masuk',
        submit: 'Simpan Absen Masuk',
        placeholder: 'Contoh: HP rusak, kamera bermasalah, atau kendala teknis lain.',
      }
    : {
        title: 'Bantu Absen Pulang',
        submit: 'Simpan Absen Pulang',
        placeholder: 'Contoh: baterai habis, HP tertinggal, atau validasi petugas pulang.',
      };
}

function getSourceLabel(value?: string | null) {
  if (value === 'ASSISTED_SCAN') return 'Dibantu Petugas';
  if (value === 'SELF_SCAN') return 'Scan Mandiri';
  if (value === 'MANUAL_ADJUSTMENT') return 'Koreksi Manual';
  if (value === 'LEGACY_DAILY') return 'Manual Lama';
  return '-';
}

function getEventTypeLabel(value: DailyPresenceEventType) {
  return value === 'CHECK_IN' ? 'Masuk' : 'Pulang';
}

function formatTodayLabel(dateKey?: string | null) {
  const date = dateKey ? new Date(dateKey) : new Date();
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function StaffDailyPresenceScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { colors } = useAppTheme();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [modalState, setModalState] = useState<PresenceModalState>(null);
  const [reason, setReason] = useState('');
  const [gateLabel, setGateLabel] = useState('');

  const canAccess = resolveStaffDivision(user) === 'ADMINISTRATION';

  const studentsQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-students'],
    enabled: isAuthenticated && canAccess,
    queryFn: () => staffApi.listStudents(),
    staleTime: 5 * 60 * 1000,
  });

  const overviewQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-overview'],
    enabled: isAuthenticated && canAccess,
    queryFn: () => attendanceApi.getDailyPresenceOverview({ limit: 12 }),
    staleTime: 60 * 1000,
  });

  const selectedStudentQuery = useQuery({
    queryKey: ['mobile-staff-daily-presence-student', selectedStudentId],
    enabled: isAuthenticated && canAccess && Boolean(selectedStudentId),
    queryFn: () => attendanceApi.getStudentDailyPresence({ studentId: Number(selectedStudentId) }),
    staleTime: 30 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: {
      studentId: number;
      checkpoint: DailyPresenceEventType;
      reason: string;
      gateLabel?: string | null;
    }) => attendanceApi.saveAssistedDailyPresence(payload),
    onSuccess: (_, variables) => {
      notifySuccess(
        variables.checkpoint === 'CHECK_IN'
          ? 'Absen masuk berhasil dibantu petugas.'
          : 'Absen pulang berhasil dibantu petugas.',
      );
      setModalState(null);
      setReason('');
      setGateLabel('');
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-overview'] });
      void queryClient.invalidateQueries({ queryKey: ['mobile-staff-daily-presence-student', selectedStudentId] });
    },
    onError: (error) => {
      notifyApiError(error, 'Gagal menyimpan presensi harian.');
    },
  });

  const students = useMemo(
    () => (studentsQuery.data || []).filter((item) => item.studentClass),
    [studentsQuery.data],
  );

  const filteredStudents = useMemo(() => {
    const normalized = studentSearch.trim().toLowerCase();
    const rows = !normalized
      ? students
      : students.filter((student) => {
          const haystack = [
            student.name,
            student.username,
            student.nis,
            student.nisn,
            student.studentClass?.name,
            student.studentClass?.major?.name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(normalized);
        });
    return rows.slice(0, 150);
  }, [studentSearch, students]);

  const selectedStudent = useMemo(
    () => students.find((item) => String(item.id) === String(selectedStudentId)) || null,
    [selectedStudentId, students],
  );

  const modalCopy = modalState ? getCheckpointCopy(modalState.checkpoint) : null;
  const canSubmitModal = Boolean(selectedStudentId) && reason.trim().length >= 3 && !saveMutation.isPending;

  const handleRefresh = () => {
    void overviewQuery.refetch();
    if (selectedStudentId) {
      void selectedStudentQuery.refetch();
    }
  };

  if (isLoading) {
    return <AppLoadingScreen message="Memuat presensi harian..." />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/welcome" />;
  }

  if (!canAccess) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: scaleFont(22), lineHeight: scaleLineHeight(30), fontWeight: '700', color: colors.text, marginBottom: 8 }}>
          Presensi Harian
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk staff administrasi." />
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
            refreshing={
              (overviewQuery.isFetching && !overviewQuery.isLoading) ||
              (selectedStudentQuery.isFetching && !selectedStudentQuery.isLoading)
            }
            onRefresh={handleRefresh}
          />
        }
      >
        <Text style={{ fontSize: scaleFont(22), lineHeight: scaleLineHeight(30), fontWeight: '700', color: colors.text, marginBottom: 6 }}>
          Presensi Harian
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 12 }}>
          Bantu catat absen masuk atau pulang siswa yang mengalami kendala perangkat pada hari ini.
        </Text>

        <View
          style={{
            borderWidth: 1,
            borderColor: '#dbeafe',
            backgroundColor: '#eff6ff',
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 14,
          }}
        >
          <Text style={{ color: '#1d4ed8', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
            Tahun ajaran operasional mengikuti header aktif. Wave pertama ini fokus pada bantuan petugas administrasi agar kejadian HP rusak atau kamera bermasalah tetap tercatat rapi.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 12 }}>
          {[
            {
              title: 'Tanggal Operasional',
              value: formatTodayLabel(overviewQuery.data?.date),
              subtitle: overviewQuery.data?.academicYear.name || '-',
              iconName: 'calendar',
              accentColor: '#334155',
            },
            {
              title: 'Sudah Masuk',
              value: String(overviewQuery.data?.summary.checkInCount || 0),
              subtitle: 'Siswa sudah punya jam masuk hari ini.',
              iconName: 'log-in',
              accentColor: '#15803d',
            },
            {
              title: 'Sudah Pulang',
              value: String(overviewQuery.data?.summary.checkOutCount || 0),
              subtitle: 'Siswa sudah punya jam pulang hari ini.',
              iconName: 'log-out',
              accentColor: '#0369a1',
            },
            {
              title: 'Bantuan Petugas',
              value: String(overviewQuery.data?.summary.assistedEventCount || 0),
              subtitle: `${overviewQuery.data?.summary.openDayCount || 0} siswa belum punya jam pulang.`,
              iconName: 'shield',
              accentColor: '#b45309',
            },
          ].map((item) => (
            <View key={item.title} style={{ width: '50%', paddingHorizontal: 4, marginBottom: 8 }}>
              <SummaryCard
                title={item.title}
                value={item.value}
                subtitle={item.subtitle}
                iconName={item.iconName as any}
                accentColor={item.accentColor}
              />
            </View>
          ))}
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
            Cari Siswa
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
            Pilih siswa yang membutuhkan bantuan absen masuk atau pulang hari ini.
          </Text>

          <View style={{ marginTop: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Cari siswa</Text>
            <TextInput
              value={studentSearch}
              onChangeText={setStudentSearch}
              placeholder="Nama, username, NIS, NISN, atau kelas"
              placeholderTextColor={colors.textSoft}
              style={{
                borderWidth: 1,
                borderColor: colors.borderSoft,
                backgroundColor: colors.surface,
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 11,
                color: colors.text,
                fontSize: fontSizes.bodyCompact,
              }}
            />
          </View>

          <View style={{ marginTop: 14 }}>
            <MobileSelectField
              label="Siswa terpilih"
              value={selectedStudentId}
              options={filteredStudents.map((student) => ({
                value: String(student.id),
                label: `${student.name} • ${student.studentClass?.name || '-'} • ${student.nisn || student.username}`,
              }))}
              onChange={setSelectedStudentId}
              placeholder="Pilih siswa"
              helperText="Menampilkan maksimal 150 hasil teratas agar dropdown tetap ringan."
            />
          </View>

          <View
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderColor: colors.borderSoft,
              borderStyle: 'dashed',
              borderRadius: 14,
              padding: 12,
              backgroundColor: colors.surfaceMuted,
            }}
          >
            {!selectedStudentId ? (
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                Pilih siswa terlebih dahulu untuk melihat status presensi hari ini.
              </Text>
            ) : selectedStudentQuery.isLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Feather name="loader" size={16} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, marginLeft: 8, fontSize: fontSizes.body }}>Memuat status presensi siswa...</Text>
              </View>
            ) : selectedStudentQuery.isError ? (
              <Text style={{ color: '#b91c1c', fontSize: fontSizes.body }}>Status presensi siswa tidak berhasil dimuat.</Text>
            ) : (
              <View>
                <Text style={{ fontWeight: '700', color: colors.text, fontSize: fontSizes.bodyCompact }}>
                  {selectedStudentQuery.data?.student.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 4 }}>
                  {selectedStudentQuery.data?.student.class?.name || '-'} • NISN: {selectedStudentQuery.data?.student.nisn || '-'}
                </Text>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#86efac',
                      backgroundColor: '#f0fdf4',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: '#15803d', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Masuk</Text>
                    <Text style={{ color: '#14532d', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                      {selectedStudentQuery.data?.presence.checkInTime || '-'}
                    </Text>
                    <Text style={{ color: '#15803d', fontSize: fontSizes.caption, marginTop: 4 }}>
                      {getSourceLabel(selectedStudentQuery.data?.presence.checkInSource)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flex: 1,
                      borderWidth: 1,
                      borderColor: '#7dd3fc',
                      backgroundColor: '#f0f9ff',
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, fontWeight: '700' }}>Jam Pulang</Text>
                    <Text style={{ color: '#0c4a6e', fontSize: scaleFont(18), fontWeight: '700', marginTop: 6 }}>
                      {selectedStudentQuery.data?.presence.checkOutTime || '-'}
                    </Text>
                    <Text style={{ color: '#0369a1', fontSize: fontSizes.caption, marginTop: 4 }}>
                      {getSourceLabel(selectedStudentQuery.data?.presence.checkOutSource)}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: colors.borderSoft,
                    backgroundColor: colors.surface,
                    borderRadius: 12,
                    padding: 12,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>Status harian</Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, marginTop: 6 }}>
                    {selectedStudentQuery.data?.presence.status || 'Belum tercatat'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, lineHeight: scaleLineHeight(18), marginTop: 6 }}>
                    Catatan harian: {selectedStudentQuery.data?.presence.note || '-'}
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable
                    onPress={() => {
                      setReason('');
                      setGateLabel('');
                      setModalState({ checkpoint: 'CHECK_IN' });
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: '#15803d',
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Masuk</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setReason('');
                      setGateLabel('');
                      setModalState({ checkpoint: 'CHECK_OUT' });
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: '#0369a1',
                      borderRadius: 12,
                      paddingVertical: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Bantu Absen Pulang</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>

        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 16,
            padding: 14,
          }}
        >
          <Text style={{ fontSize: scaleFont(18), lineHeight: scaleLineHeight(24), fontWeight: '700', color: colors.text }}>
            Log Bantuan Hari Ini
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 4 }}>
            Jejak audit presensi yang dibantu petugas pada hari operasional ini.
          </Text>

          {overviewQuery.isLoading ? (
            <View style={{ marginTop: 14 }}>
              <QueryStateView type="loading" message="Memuat log bantuan..." />
            </View>
          ) : overviewQuery.isError ? (
            <View style={{ marginTop: 14 }}>
              <QueryStateView type="error" message="Gagal memuat log bantuan." onRetry={() => overviewQuery.refetch()} />
            </View>
          ) : !overviewQuery.data?.recentEvents.length ? (
            <View
              style={{
                marginTop: 14,
                borderWidth: 1,
                borderColor: colors.borderSoft,
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 14,
                backgroundColor: colors.surfaceMuted,
              }}
            >
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.body }}>
                Belum ada log presensi pada hari ini.
              </Text>
            </View>
          ) : (
            <View style={{ marginTop: 14, gap: 10 }}>
              {overviewQuery.data.recentEvents.map((event) => (
                <View
                  key={event.id}
                  style={{
                    borderWidth: 1,
                    borderColor: colors.borderSoft,
                    backgroundColor: colors.surface,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSizes.label }}>
                      {event.student?.name || '-'}
                    </Text>
                    <View
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        backgroundColor: event.eventType === 'CHECK_IN' ? '#dcfce7' : '#e0f2fe',
                      }}
                    >
                      <Text
                        style={{
                          color: event.eventType === 'CHECK_IN' ? '#166534' : '#075985',
                          fontSize: fontSizes.caption,
                          fontWeight: '700',
                        }}
                      >
                        {getEventTypeLabel(event.eventType)}
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                    {event.class?.name || '-'} • {event.student?.nisn || event.student?.nis || '-'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 6 }}>
                    {event.recordedTime || '-'} • {getSourceLabel(event.source)}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginTop: 8 }}>
                    {event.reason || '-'}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 6 }}>
                    Petugas: {event.actor?.name || '-'}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal visible={Boolean(modalState && modalCopy)} transparent animationType="fade" onRequestClose={() => setModalState(null)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.18)',
            paddingHorizontal: 18,
            paddingVertical: 28,
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              maxHeight: '78%',
              backgroundColor: colors.surface,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.borderSoft,
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: colors.text, fontWeight: '700', fontSize: scaleFont(18) }}>
                  {modalCopy?.title}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4 }}>
                  {selectedStudent?.name || '-'} • {selectedStudent?.studentClass?.name || '-'}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  if (saveMutation.isPending) return;
                  setModalState(null);
                }}
                style={{ padding: 4 }}
              >
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}>
              <View
                style={{
                  borderWidth: 1,
                  borderColor: '#dbeafe',
                  backgroundColor: '#eff6ff',
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  marginBottom: 14,
                }}
              >
                <Text style={{ color: '#1d4ed8', fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                  Bantuan petugas wajib menyimpan alasan agar audit tetap rapi. Popup ini tidak tertutup hanya karena area luar disentuh.
                </Text>
              </View>

              <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Alasan bantuan</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                multiline
                textAlignVertical="top"
                placeholder={modalCopy?.placeholder}
                placeholderTextColor={colors.textSoft}
                style={{
                  minHeight: 120,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  color: colors.text,
                  fontSize: fontSizes.bodyCompact,
                  marginBottom: 14,
                  backgroundColor: colors.surface,
                }}
              />

              <Text style={{ color: colors.textMuted, fontSize: fontSizes.label, marginBottom: 6 }}>Titik / Gate (opsional)</Text>
              <TextInput
                value={gateLabel}
                onChangeText={setGateLabel}
                placeholder="Contoh: Gerbang Utama / Pos Satpam"
                placeholderTextColor={colors.textSoft}
                style={{
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  borderRadius: 12,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  color: colors.text,
                  fontSize: fontSizes.bodyCompact,
                  backgroundColor: colors.surface,
                }}
              />
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 8,
                paddingHorizontal: 16,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: colors.borderSoft,
              }}
            >
              <Pressable
                onPress={() => {
                  if (saveMutation.isPending) return;
                  setModalState(null);
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.borderSoft,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>Batal</Text>
              </Pressable>
              <Pressable
                disabled={!canSubmitModal}
                onPress={() => {
                  if (!modalState || !selectedStudentId) return;
                  saveMutation.mutate({
                    studentId: Number(selectedStudentId),
                    checkpoint: modalState.checkpoint,
                    reason: reason.trim(),
                    gateLabel: gateLabel.trim() || null,
                  });
                }}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 11,
                  borderRadius: 12,
                  backgroundColor: canSubmitModal ? '#2563eb' : '#93c5fd',
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                {saveMutation.isPending ? <Feather name="loader" size={16} color="#fff" /> : null}
                <Text style={{ color: '#fff', fontWeight: '700', marginLeft: saveMutation.isPending ? 8 : 0 }}>
                  {modalCopy?.submit}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
