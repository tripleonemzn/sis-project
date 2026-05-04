import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
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
import { AppLoadingScreen } from '../../../src/components/AppLoadingScreen';
import { MobileMenuTabBar } from '../../../src/components/MobileMenuTabBar';
import { MobileSelectField } from '../../../src/components/MobileSelectField';
import { QueryStateView } from '../../../src/components/QueryStateView';
import { BRAND_COLORS } from '../../../src/config/brand';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { teachingJournalApi } from '../../../src/features/teachingJournals/teachingJournalApi';
import {
  DELIVERY_STATUS_LABELS,
  JOURNAL_STATUS_LABELS,
  TEACHING_MODE_LABELS,
  type TeachingJournalDeliveryStatus,
  type TeachingJournalMode,
  type TeachingJournalSession,
  type TeachingJournalSessionStatus,
  type TeachingJournalStatus,
} from '../../../src/features/teachingJournals/types';
import { notifyApiError, notifySuccess } from '../../../src/lib/ui/feedback';
import { getStandardPagePadding } from '../../../src/lib/ui/pageLayout';
import {
  buildResponsivePageContentStyle,
  useResponsiveLayout,
} from '../../../src/lib/ui/useResponsiveLayout';
import { useAppTextScale } from '../../../src/theme/AppTextScaleProvider';

type RangeTab = 'TODAY' | 'WEEK' | 'RECENT';
type StatusFilter = 'ALL' | TeachingJournalSessionStatus;

type FormState = {
  teachingMode: TeachingJournalMode;
  deliveryStatus: TeachingJournalDeliveryStatus;
  notes: string;
  obstacles: string;
  followUpPlan: string;
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'MISSING', label: JOURNAL_STATUS_LABELS.MISSING },
  { value: 'DRAFT', label: JOURNAL_STATUS_LABELS.DRAFT },
  { value: 'SUBMITTED', label: JOURNAL_STATUS_LABELS.SUBMITTED },
  { value: 'REVIEWED', label: JOURNAL_STATUS_LABELS.REVIEWED },
];

const DELIVERY_OPTIONS: TeachingJournalDeliveryStatus[] = [
  'COMPLETED',
  'PARTIAL',
  'NOT_DELIVERED',
  'RESCHEDULED',
];

const MODE_OPTIONS: TeachingJournalMode[] = [
  'REGULAR',
  'SUBSTITUTE',
  'ENRICHMENT',
  'REMEDIAL',
  'ASSESSMENT',
];

function toIsoDateLocal(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function getWeekRange(anchor: Date) {
  const day = anchor.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = addDays(anchor, diffToMonday);
  return {
    start,
    end: addDays(start, 5),
  };
}

function resolveRange(tab: RangeTab, anchor: Date) {
  if (tab === 'TODAY') {
    const date = toIsoDateLocal(anchor);
    return { startDate: date, endDate: date };
  }
  if (tab === 'RECENT') {
    return {
      startDate: toIsoDateLocal(addDays(anchor, -29)),
      endDate: toIsoDateLocal(anchor),
    };
  }
  const week = getWeekRange(anchor);
  return {
    startDate: toIsoDateLocal(week.start),
    endDate: toIsoDateLocal(week.end),
  };
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Date(year, (month || 1) - 1, day || 1);
}

function formatDate(value: string) {
  return parseIsoDate(value).toLocaleDateString('id-ID', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createInitialForm(session?: TeachingJournalSession | null): FormState {
  return {
    teachingMode: session?.journal?.teachingMode || 'REGULAR',
    deliveryStatus: session?.journal?.deliveryStatus || 'COMPLETED',
    notes: session?.journal?.notes || '',
    obstacles: session?.journal?.obstacles || '',
    followUpPlan: session?.journal?.followUpPlan || '',
  };
}

function statusColor(status: TeachingJournalSessionStatus) {
  if (status === 'SUBMITTED') return { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' };
  if (status === 'REVIEWED') return { bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8' };
  if (status === 'DRAFT') return { bg: '#fef3c7', border: '#fde68a', text: '#92400e' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 96,
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 12,
        padding: 10,
        backgroundColor: '#fff',
      }}
    >
      <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(14), fontWeight: '700' }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color, fontSize: scaleFont(20), lineHeight: scaleLineHeight(26), fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  );
}

function SessionRow({ session, onPress }: { session: TeachingJournalSession; onPress: () => void }) {
  const { scaleFont, scaleLineHeight } = useAppTextScale();
  const colors = statusColor(session.journalStatus);
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: '#e2e8f0',
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: scaleFont(14), lineHeight: scaleLineHeight(20) }}>
              {session.subject.name}
            </Text>
            <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
              {session.class.name} • Jam {session.period} • {session.room || '-'}
            </Text>
          </View>
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg,
              borderRadius: 999,
              paddingHorizontal: 9,
              paddingVertical: 5,
            }}
          >
            <Text style={{ color: colors.text, fontSize: scaleFont(11), lineHeight: scaleLineHeight(14), fontWeight: '800' }}>
              {JOURNAL_STATUS_LABELS[session.journalStatus]}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ padding: 12, gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
          <Text style={{ color: '#475569', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), flex: 1 }}>
            {formatDate(session.date)}
          </Text>
          <Text style={{ color: session.attendance.status === 'RECORDED' ? '#166534' : '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
            {session.attendance.status === 'RECORDED' ? 'Sudah Presensi' : 'Belum Presensi'}
          </Text>
        </View>
        {session.journal?.submittedAt ? (
          <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16) }}>
            Dikirim: {formatDateTime(session.journal.submittedAt)}
          </Text>
        ) : null}
        <Pressable
          onPress={onPress}
          style={{
            alignSelf: 'flex-start',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            backgroundColor: BRAND_COLORS.blue,
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 9,
          }}
        >
          <Feather name="edit-3" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: scaleFont(12), lineHeight: scaleLineHeight(16) }}>
            {session.journal ? 'Edit Jurnal' : 'Isi Jurnal'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function TeacherTeachingJournalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading, user } = useAuth();
  const { scaleFont, scaleLineHeight, fontSizes } = useAppTextScale();
  const pageContentPadding = getStandardPagePadding(insets, { horizontal: layout.pageHorizontal });
  const pageContentStyle = buildResponsivePageContentStyle(pageContentPadding, layout);
  const [rangeTab, setRangeTab] = useState<RangeTab>('WEEK');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selectedSession, setSelectedSession] = useState<TeachingJournalSession | null>(null);
  const [formState, setFormState] = useState<FormState>(() => createInitialForm());
  const range = useMemo(() => resolveRange(rangeTab, anchorDate), [rangeTab, anchorDate]);

  const sessionsQuery = useQuery({
    queryKey: ['mobile-teaching-journal-sessions', user?.id, range.startDate, range.endDate, statusFilter],
    enabled: isAuthenticated && user?.role === 'TEACHER',
    queryFn: () =>
      teachingJournalApi.listSessions({
        startDate: range.startDate,
        endDate: range.endDate,
        journalStatus: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    staleTime: 60 * 1000,
  });

  const sessions = useMemo(() => sessionsQuery.data?.sessions || [], [sessionsQuery.data?.sessions]);
  const summary = useMemo(() => {
    return sessions.reduce(
      (acc, session) => {
        acc.total += 1;
        if (session.journalStatus === 'MISSING') acc.missing += 1;
        if (session.journalStatus === 'DRAFT') acc.draft += 1;
        if (session.journalStatus === 'SUBMITTED' || session.journalStatus === 'REVIEWED') acc.submitted += 1;
        return acc;
      },
      { total: 0, missing: 0, draft: 0, submitted: 0 },
    );
  }, [sessions]);

  const saveMutation = useMutation({
    mutationFn: async (nextStatus: TeachingJournalStatus) => {
      if (!selectedSession) throw new Error('Sesi jurnal belum dipilih.');
      return teachingJournalApi.upsertEntry({
        id: selectedSession.journal?.id,
        scheduleEntryId: selectedSession.scheduleEntryId,
        journalDate: selectedSession.date,
        teachingMode: formState.teachingMode,
        deliveryStatus: formState.deliveryStatus,
        status: nextStatus,
        notes: formState.notes,
        obstacles: formState.obstacles,
        followUpPlan: formState.followUpPlan,
      });
    },
    onSuccess: async (_, nextStatus) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teaching-journal-sessions'] });
      notifySuccess(nextStatus === 'SUBMITTED' ? 'Jurnal berhasil dikirim.' : 'Draft jurnal berhasil disimpan.');
      setSelectedSession(null);
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan jurnal mengajar.'),
  });

  if (isLoading) return <AppLoadingScreen message="Memuat jurnal..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER') {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pageContentStyle}>
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '800', marginBottom: 8 }}>
          Jurnal Mengajar
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus untuk role guru." />
        <Pressable
          onPress={() => router.replace('/home')}
          style={{ marginTop: 16, backgroundColor: BRAND_COLORS.blue, paddingVertical: 12, borderRadius: 10, alignItems: 'center' }}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Kembali ke Home</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const reviewed = selectedSession?.journalStatus === 'REVIEWED';

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: '#f8fafc' }}
        contentContainerStyle={pageContentStyle}
        refreshControl={
          <RefreshControl
            refreshing={sessionsQuery.isFetching && !sessionsQuery.isLoading}
            onRefresh={() => sessionsQuery.refetch()}
          />
        }
      >
        <Text style={{ fontSize: scaleFont(20), lineHeight: scaleLineHeight(28), fontWeight: '800', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
          Jurnal Mengajar
        </Text>
        <Text style={{ color: BRAND_COLORS.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20), marginBottom: 14 }}>
          Catat realisasi pembelajaran per sesi jadwal mengajar aktif.
        </Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <SummaryPill label="Sesi" value={summary.total} color={BRAND_COLORS.textDark} />
          <SummaryPill label="Belum" value={summary.missing} color="#b91c1c" />
          <SummaryPill label="Draft" value={summary.draft} color="#92400e" />
          <SummaryPill label="Terkirim" value={summary.submitted} color="#166534" />
        </View>

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
          <MobileMenuTabBar
            items={[
              { key: 'TODAY', label: 'Hari Ini', iconName: 'calendar' },
              { key: 'WEEK', label: 'Minggu Ini', iconName: 'clock' },
              { key: 'RECENT', label: '30 Hari', iconName: 'archive' },
            ]}
            activeKey={rangeTab}
            onChange={(next) => setRangeTab(next as RangeTab)}
            layout={layout.prefersSplitPane ? 'fill' : 'scroll'}
            minTabWidth={116}
            maxTabWidth={142}
            compact
          />
          <View style={{ flexDirection: layout.prefersSplitPane ? 'row' : 'column', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <MobileSelectField
                label="Status"
                value={statusFilter}
                options={STATUS_OPTIONS}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(16), fontWeight: '700', marginBottom: 6 }}>
                Tanggal Acuan
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable
                  onPress={() => setAnchorDate((prev) => addDays(prev, -1))}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>-1</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAnchorDate(new Date())}
                  style={{ flex: 1.6, borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#eff6ff' }}
                >
                  <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800' }}>Hari Ini</Text>
                </Pressable>
                <Pressable
                  onPress={() => setAnchorDate((prev) => addDays(prev, 1))}
                  style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingVertical: 10, alignItems: 'center', backgroundColor: '#fff' }}
                >
                  <Text style={{ color: '#334155', fontWeight: '700' }}>+1</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
            {formatDate(range.startDate)} sampai {formatDate(range.endDate)}
          </Text>
        </View>

        {sessionsQuery.isLoading ? <QueryStateView type="loading" message="Memuat sesi jurnal..." /> : null}
        {sessionsQuery.isError ? (
          <QueryStateView type="error" message="Gagal memuat jurnal mengajar." onRetry={() => sessionsQuery.refetch()} />
        ) : null}

        {!sessionsQuery.isLoading && !sessionsQuery.isError ? (
          sessions.length > 0 ? (
            sessions.map((session) => (
              <SessionRow
                key={session.sessionKey}
                session={session}
                onPress={() => {
                  setSelectedSession(session);
                  setFormState(createInitialForm(session));
                }}
              />
            ))
          ) : (
            <View
              style={{
                borderWidth: 1,
                borderColor: '#cbd5e1',
                borderStyle: 'dashed',
                borderRadius: 12,
                padding: 18,
                backgroundColor: '#fff',
              }}
            >
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', marginBottom: 4 }}>Belum ada sesi</Text>
              <Text style={{ color: BRAND_COLORS.textMuted, fontSize: fontSizes.body, lineHeight: scaleLineHeight(20) }}>
                Sesi jurnal muncul dari jadwal mengajar aktif dan otomatis melewati hari libur akademik.
              </Text>
            </View>
          )
        ) : null}
      </ScrollView>

      <Modal
        visible={!!selectedSession}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedSession(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.28)',
            justifyContent: 'center',
            paddingHorizontal: 16,
            paddingVertical: 28,
          }}
        >
          <View
            style={{
              maxHeight: '92%',
              borderRadius: 18,
              borderWidth: 1,
              borderColor: '#c7d7f7',
              backgroundColor: '#fff',
              overflow: 'hidden',
            }}
          >
            <View style={{ padding: 15, borderBottomWidth: 1, borderBottomColor: '#e2e8f0', flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(17), lineHeight: scaleLineHeight(24), fontWeight: '800' }}>
                  Jurnal Mengajar
                </Text>
                <Text style={{ color: BRAND_COLORS.textMuted, fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), marginTop: 2 }}>
                  {selectedSession ? `${formatDate(selectedSession.date)} • ${selectedSession.class.name}` : '-'}
                </Text>
              </View>
              <Pressable
                onPress={() => setSelectedSession(null)}
                style={{ width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' }}
              >
                <Feather name="x" size={18} color="#475569" />
              </Pressable>
            </View>

            <ScrollView style={{ padding: 15 }} keyboardShouldPersistTaps="handled">
              {selectedSession?.attendance.status === 'MISSING' ? (
                <View style={{ borderWidth: 1, borderColor: '#fde68a', backgroundColor: '#fffbeb', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                  <Text style={{ color: '#92400e', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
                    Presensi mapel sesi ini belum ditemukan.
                  </Text>
                </View>
              ) : null}

              {reviewed ? (
                <View style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 12, padding: 10, marginBottom: 12 }}>
                  <Text style={{ color: '#1d4ed8', fontSize: scaleFont(12), lineHeight: scaleLineHeight(18), fontWeight: '700' }}>
                    Jurnal ini sudah direview.
                  </Text>
                </View>
              ) : null}

              <MobileSelectField
                label="Mode Mengajar"
                value={formState.teachingMode}
                options={MODE_OPTIONS.map((item) => ({ value: item, label: TEACHING_MODE_LABELS[item] }))}
                onChange={(value) => setFormState((prev) => ({ ...prev, teachingMode: value as TeachingJournalMode }))}
                disabled={reviewed}
              />
              <MobileSelectField
                label="Status Pelaksanaan"
                value={formState.deliveryStatus}
                options={DELIVERY_OPTIONS.map((item) => ({ value: item, label: DELIVERY_STATUS_LABELS[item] }))}
                onChange={(value) => setFormState((prev) => ({ ...prev, deliveryStatus: value as TeachingJournalDeliveryStatus }))}
                disabled={reviewed}
              />

              {[
                {
                  key: 'notes',
                  label: 'Realisasi Materi',
                  placeholder: 'Tuliskan materi yang benar-benar diajarkan pada sesi ini.',
                  minHeight: 110,
                },
                {
                  key: 'obstacles',
                  label: 'Hambatan',
                  placeholder: 'Opsional: kendala kelas, waktu, media, kehadiran, atau kondisi lain.',
                  minHeight: 78,
                },
                {
                  key: 'followUpPlan',
                  label: 'Tindak Lanjut',
                  placeholder: 'Opsional: rencana pertemuan berikutnya, penguatan, remedial, atau tugas.',
                  minHeight: 78,
                },
              ].map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <Text style={{ color: '#64748b', fontSize: scaleFont(12), lineHeight: scaleLineHeight(16), fontWeight: '700', marginBottom: 6 }}>
                    {field.label}
                  </Text>
                  <TextInput
                    multiline
                    editable={!reviewed}
                    value={String(formState[field.key as keyof FormState] || '')}
                    onChangeText={(value) => setFormState((prev) => ({ ...prev, [field.key]: value }))}
                    placeholder={field.placeholder}
                    placeholderTextColor="#94a3b8"
                    textAlignVertical="top"
                    style={{
                      minHeight: field.minHeight,
                      borderWidth: 1,
                      borderColor: '#dbe7fb',
                      borderRadius: 12,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      color: BRAND_COLORS.textDark,
                      backgroundColor: reviewed ? '#f8fafc' : '#fff',
                      fontSize: fontSizes.body,
                      lineHeight: scaleLineHeight(20),
                    }}
                  />
                </View>
              ))}
            </ScrollView>

            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#e2e8f0', gap: 8 }}>
              <Pressable
                onPress={() => saveMutation.mutate('SUBMITTED')}
                disabled={reviewed || saveMutation.isPending}
                style={{
                  backgroundColor: reviewed || saveMutation.isPending ? '#93c5fd' : BRAND_COLORS.blue,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <Feather name="send" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800' }}>Kirim Jurnal</Text>
              </Pressable>
              <Pressable
                onPress={() => saveMutation.mutate('DRAFT')}
                disabled={reviewed || saveMutation.isPending}
                style={{
                  borderWidth: 1,
                  borderColor: '#bfdbfe',
                  backgroundColor: '#eff6ff',
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: BRAND_COLORS.blue, fontWeight: '800' }}>Simpan Draft</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
