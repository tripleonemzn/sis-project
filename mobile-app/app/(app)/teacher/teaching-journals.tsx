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
  type TeachingJournalProjectedReferenceOption,
  type TeachingJournalReference,
  type TeachingJournalReferenceProjectionRequest,
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
type JournalReferenceField = 'competency' | 'learningObjective' | 'materialScope' | 'indicator';

type FormState = {
  teachingMode: TeachingJournalMode;
  deliveryStatus: TeachingJournalDeliveryStatus;
  notes: string;
  obstacles: string;
  followUpPlan: string;
  references: Record<JournalReferenceField, TeachingJournalReference | null>;
};

type JournalReferenceOption = TeachingJournalProjectedReferenceOption & {
  field: JournalReferenceField;
  optionKey: string;
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

const JOURNAL_REFERENCE_FIELDS: Array<{ field: JournalReferenceField; label: string; placeholder: string }> = [
  { field: 'competency', label: 'Capaian/Kompetensi', placeholder: 'Pilih capaian/kompetensi' },
  { field: 'learningObjective', label: 'Tujuan Pembelajaran', placeholder: 'Pilih tujuan pembelajaran' },
  { field: 'materialScope', label: 'Materi', placeholder: 'Pilih materi ajar' },
  { field: 'indicator', label: 'Indikator', placeholder: 'Pilih indikator ketercapaian' },
];

const JOURNAL_REFERENCE_PROGRAM_CODES = ['CP', 'ATP', 'PROTA', 'KKTP'];

const JOURNAL_REFERENCE_REQUEST_CONFIGS: Array<{
  field: JournalReferenceField;
  requestKey: string;
  sourceProgramCode: string;
  candidates: string[];
}> = [
  {
    field: 'competency',
    requestKey: 'journal:competency:cp',
    sourceProgramCode: 'CP',
    candidates: ['capaian_pembelajaran', 'kompetensi', 'elemen'],
  },
  {
    field: 'learningObjective',
    requestKey: 'journal:learningObjective:atp',
    sourceProgramCode: 'ATP',
    candidates: ['tujuan_pembelajaran'],
  },
  {
    field: 'learningObjective',
    requestKey: 'journal:learningObjective:prota',
    sourceProgramCode: 'PROTA',
    candidates: ['tujuan_pembelajaran'],
  },
  {
    field: 'materialScope',
    requestKey: 'journal:materialScope:atp',
    sourceProgramCode: 'ATP',
    candidates: ['materi_pokok', 'konten_materi'],
  },
  {
    field: 'materialScope',
    requestKey: 'journal:materialScope:cp',
    sourceProgramCode: 'CP',
    candidates: ['konten_materi', 'materi_pokok'],
  },
  {
    field: 'indicator',
    requestKey: 'journal:indicator:kktp',
    sourceProgramCode: 'KKTP',
    candidates: ['indikator_ketercapaian', 'indikator_ketercapaian_tp', 'iktp', 'indikator'],
  },
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

function createEmptyReferenceMap(): Record<JournalReferenceField, TeachingJournalReference | null> {
  return {
    competency: null,
    learningObjective: null,
    materialScope: null,
    indicator: null,
  };
}

function normalizeReferenceToken(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function splitReferenceLines(value: unknown) {
  return String(value || '')
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function fieldFromRequestKey(requestKey: string): JournalReferenceField | null {
  const normalized = requestKey.toLowerCase();
  if (normalized.includes(':competency:')) return 'competency';
  if (normalized.includes(':learningobjective:')) return 'learningObjective';
  if (normalized.includes(':materialscope:')) return 'materialScope';
  if (normalized.includes(':indicator:')) return 'indicator';
  return null;
}

function fieldFromSavedReference(reference: TeachingJournalReference): JournalReferenceField | null {
  const snapshotField = String(reference.snapshot?.journal_reference_field || '').trim() as JournalReferenceField;
  if (JOURNAL_REFERENCE_FIELDS.some((item) => item.field === snapshotField)) return snapshotField;

  const tokenField = fieldFromRequestKey(String(reference.selectionToken || '').toLowerCase());
  if (tokenField) return tokenField;

  const sourceProgram = String(reference.sourceProgramCode || '').trim().toUpperCase();
  const identity = normalizeReferenceToken(reference.sourceFieldIdentity);
  if (sourceProgram === 'CP' && ['capaian_pembelajaran', 'kompetensi', 'elemen'].includes(identity)) return 'competency';
  if (['ATP', 'PROTA'].includes(sourceProgram) && identity === 'tujuan_pembelajaran') return 'learningObjective';
  if (['ATP', 'CP'].includes(sourceProgram) && ['materi_pokok', 'konten_materi'].includes(identity)) return 'materialScope';
  if (sourceProgram === 'KKTP' && identity.includes('indikator')) return 'indicator';
  return null;
}

function buildReferenceMap(references?: TeachingJournalReference[] | null) {
  const map = createEmptyReferenceMap();
  (references || []).forEach((reference) => {
    const field = fieldFromSavedReference(reference);
    if (!field || map[field]) return;
    map[field] = reference;
  });
  return map;
}

function expandJournalReferenceOption(option: TeachingJournalProjectedReferenceOption): JournalReferenceOption[] {
  const field = fieldFromRequestKey(option.requestKey);
  if (!field) return [];
  const lines = splitReferenceLines(option.value);
  if (lines.length <= 1) {
    return [
      {
        ...option,
        field,
        value: String(option.value || '').trim(),
        label: String(option.value || option.label || '').trim(),
        optionKey: `${option.requestKey}::${option.selectValue}`,
      },
    ];
  }

  return lines.map((line, index) => {
    const lineSnapshot = Object.entries(option.snapshot || {}).reduce<Record<string, string>>((acc, [key, rawValue]) => {
      const valueLines = splitReferenceLines(rawValue);
      acc[key] = valueLines.length === lines.length ? valueLines[index] || '' : String(rawValue || '').trim();
      return acc;
    }, {});
    return {
      ...option,
      field,
      value: line,
      label: line,
      snapshot: lineSnapshot,
      isAggregate: false,
      lineCount: 1,
      optionKey: `${option.requestKey}::${option.selectValue}::line-${index}`,
    };
  });
}

function createJournalReferenceFromOption(option: JournalReferenceOption): TeachingJournalReference {
  return {
    sourceProgramCode: option.sourceProgramCode,
    sourceEntryId: option.sourceEntryId,
    sourceFieldIdentity: option.sourceFieldIdentity || null,
    selectionToken: option.optionKey,
    value: String(option.value || '').trim(),
    label: String(option.label || option.value || '').trim(),
    snapshot: {
      ...(option.snapshot || {}),
      journal_reference_field: option.field,
      source_entry_title: option.sourceEntryTitle || '',
    },
  };
}

function formatReferenceOptionLabel(option: JournalReferenceOption) {
  const source = String(option.sourceProgramCode || '').trim();
  const value = String(option.value || option.label || '').trim();
  return source ? `${value} (${source})` : value;
}

function createInitialForm(session?: TeachingJournalSession | null): FormState {
  return {
    teachingMode: session?.journal?.teachingMode || 'REGULAR',
    deliveryStatus: session?.journal?.deliveryStatus || 'COMPLETED',
    notes: session?.journal?.notes || '',
    obstacles: session?.journal?.obstacles || '',
    followUpPlan: session?.journal?.followUpPlan || '',
    references: buildReferenceMap(session?.journal?.references),
  };
}

function statusColor(status: TeachingJournalSessionStatus) {
  if (status === 'SUBMITTED') return { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' };
  if (status === 'REVIEWED') return { bg: '#dbeafe', border: '#bfdbfe', text: '#1d4ed8' };
  if (status === 'DRAFT') return { bg: '#fef3c7', border: '#fde68a', text: '#92400e' };
  return { bg: '#fee2e2', border: '#fecaca', text: '#991b1b' };
}

function formatSessionPeriod(session: TeachingJournalSession) {
  return session.periodLabel || `Jam ke ${session.period}`;
}

function formatSessionScheduleDetail(session: TeachingJournalSession) {
  const details = [
    session.timeRange || null,
    Number(session.jpCount || 0) > 1 ? `${session.jpCount} JP` : null,
    session.room ? `Ruang ${session.room}` : null,
  ].filter(Boolean);
  return details.length ? details.join(' • ') : '-';
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
              {session.class.name} • {formatSessionPeriod(session)}
            </Text>
            <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 1 }}>
              {formatSessionScheduleDetail(session)}
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
  const selectedAcademicYearId = Number(sessionsQuery.data?.meta?.academicYear?.id || selectedSession?.journal?.academicYearId || 0);
  const selectedReferenceContext = useMemo(() => {
    if (!selectedSession) return null;
    return {
      subjectId: Number(selectedSession.subject?.id || 0),
      classLevel: String(selectedSession.class?.level || selectedSession.class?.name || '').trim(),
      programKeahlian: String(selectedSession.class?.major?.name || selectedSession.class?.major?.code || '').trim(),
    };
  }, [selectedSession]);
  const referenceRequests = useMemo<TeachingJournalReferenceProjectionRequest[]>(() => {
    if (!selectedReferenceContext?.subjectId) return [];
    return JOURNAL_REFERENCE_REQUEST_CONFIGS.map((request) => ({
      requestKey: `${request.requestKey}:subject-${selectedReferenceContext.subjectId}`,
      sourceProgramCode: request.sourceProgramCode,
      candidates: request.candidates,
      matchBySubject: true,
      matchByClassLevel: Boolean(selectedReferenceContext.classLevel),
      matchByMajor: Boolean(selectedReferenceContext.programKeahlian),
      matchByActiveSemester: false,
      context: {
        subjectId: selectedReferenceContext.subjectId,
        classLevel: selectedReferenceContext.classLevel,
        programKeahlian: selectedReferenceContext.programKeahlian,
      },
    }));
  }, [selectedReferenceContext]);
  const referencesQuery = useQuery({
    queryKey: [
      'mobile-teaching-journal-resource-references',
      selectedAcademicYearId,
      selectedReferenceContext?.subjectId || 0,
      selectedReferenceContext?.classLevel || '',
      selectedReferenceContext?.programKeahlian || '',
    ],
    enabled: Boolean(selectedSession && selectedAcademicYearId > 0 && referenceRequests.length > 0),
    staleTime: 2 * 60 * 1000,
    queryFn: () =>
      teachingJournalApi.getReferenceEntries({
        academicYearId: selectedAcademicYearId || undefined,
        programCodes: JOURNAL_REFERENCE_PROGRAM_CODES,
        limitPerProgram: 200,
        includeRows: false,
        referenceRequests,
      }),
  });
  const referenceOptionsByField = useMemo<Record<JournalReferenceField, JournalReferenceOption[]>>(() => {
    const map: Record<JournalReferenceField, JournalReferenceOption[]> = {
      competency: [],
      learningObjective: [],
      materialScope: [],
      indicator: [],
    };
    const pushedKeys = new Set<string>();
    (referencesQuery.data?.programs || []).forEach((program) => {
      (program.options || []).forEach((rawOption) => {
        expandJournalReferenceOption(rawOption).forEach((option) => {
          const value = String(option.value || '').trim();
          if (!value) return;
          const dedupeKey = `${option.field}::${option.sourceProgramCode}::${value}`.toLowerCase();
          if (pushedKeys.has(dedupeKey)) return;
          pushedKeys.add(dedupeKey);
          map[option.field].push(option);
        });
      });
    });
    return map;
  }, [referencesQuery.data?.programs]);
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
      const references = Object.values(formState.references).filter((reference): reference is TeachingJournalReference =>
        Boolean(reference?.sourceProgramCode && reference.value),
      );
      return teachingJournalApi.upsertEntry({
        id: selectedSession.journal?.id,
        academicYearId: selectedAcademicYearId || undefined,
        scheduleEntryId: selectedSession.scheduleEntryId,
        journalDate: selectedSession.date,
        teachingMode: formState.teachingMode,
        deliveryStatus: formState.deliveryStatus,
        status: nextStatus,
        notes: formState.notes,
        obstacles: formState.obstacles,
        followUpPlan: formState.followUpPlan,
        references,
      });
    },
    onSuccess: async (_, nextStatus) => {
      await queryClient.invalidateQueries({ queryKey: ['mobile-teaching-journal-sessions'] });
      notifySuccess(nextStatus === 'SUBMITTED' ? 'Jurnal berhasil dikirim.' : 'Draft jurnal berhasil disimpan.');
      setSelectedSession(null);
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan jurnal mengajar.'),
  });

  const reviewed = selectedSession?.journalStatus === 'REVIEWED';

  const updateReferenceField = (field: JournalReferenceField, optionKey: string) => {
    if (!optionKey) {
      setFormState((prev) => ({
        ...prev,
        references: {
          ...prev.references,
          [field]: null,
        },
      }));
      return;
    }
    if (optionKey === '__CURRENT__') return;
    const selectedOption = referenceOptionsByField[field].find((option) => option.optionKey === optionKey);
    if (!selectedOption) return;
    setFormState((prev) => ({
      ...prev,
      references: {
        ...prev.references,
        [field]: createJournalReferenceFromOption(selectedOption),
      },
    }));
  };

  const buildReferenceSelectOptions = (field: JournalReferenceField) => {
    const selectedReference = formState.references[field];
    const rawOptions = referenceOptionsByField[field] || [];
    const matchedOption = rawOptions.find(
      (option) =>
        String(option.value || '').trim() === String(selectedReference?.value || '').trim() &&
        String(option.sourceProgramCode || '').trim() === String(selectedReference?.sourceProgramCode || '').trim(),
    );
    const hasSavedOnlyValue = Boolean(selectedReference?.value && !matchedOption);
    const options = [
      { value: '', label: rawOptions.length > 0 ? 'Kosongkan pilihan' : 'Referensi belum tersedia' },
      ...(hasSavedOnlyValue
        ? [{ value: '__CURRENT__', label: `Nilai tersimpan: ${String(selectedReference?.value || '').slice(0, 90)}` }]
        : []),
      ...rawOptions.map((option) => ({
        value: option.optionKey,
        label: formatReferenceOptionLabel(option),
      })),
    ];
    return {
      value: matchedOption?.optionKey || (hasSavedOnlyValue ? '__CURRENT__' : ''),
      options,
      disabled: reviewed || (rawOptions.length === 0 && !hasSavedOnlyValue),
    };
  };

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
                  {selectedSession ? `${formatDate(selectedSession.date)} • ${selectedSession.class.name} • ${formatSessionPeriod(selectedSession)}` : '-'}
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

              <View style={{ borderWidth: 1, borderColor: '#bfdbfe', backgroundColor: '#eff6ff', borderRadius: 14, padding: 12, marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Feather name="link-2" size={16} color={BRAND_COLORS.blue} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: BRAND_COLORS.textDark, fontSize: scaleFont(13), lineHeight: scaleLineHeight(18), fontWeight: '800' }}>
                      Referensi Perangkat Ajar
                    </Text>
                    <Text style={{ color: '#64748b', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginTop: 2 }}>
                      Opsional, dipakai untuk memantau coverage materi sesuai CP/ATP/KKTP.
                    </Text>
                  </View>
                </View>
                {referencesQuery.isError ? (
                  <Text style={{ color: '#92400e', fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginBottom: 8 }}>
                    Referensi perangkat ajar belum bisa dimuat. Jurnal tetap bisa disimpan secara manual.
                  </Text>
                ) : null}
                {referencesQuery.isFetching ? (
                  <Text style={{ color: BRAND_COLORS.blue, fontSize: scaleFont(11), lineHeight: scaleLineHeight(16), marginBottom: 8, fontWeight: '700' }}>
                    Memuat referensi perangkat ajar...
                  </Text>
                ) : null}
                {JOURNAL_REFERENCE_FIELDS.map((item) => {
                  const select = buildReferenceSelectOptions(item.field);
                  return (
                    <MobileSelectField
                      key={item.field}
                      label={item.label}
                      value={select.value}
                      options={select.options}
                      onChange={(value) => updateReferenceField(item.field, value)}
                      placeholder={item.placeholder}
                      helperText={select.disabled && !reviewed ? 'Referensi belum tersedia untuk sesi ini.' : undefined}
                      disabled={select.disabled}
                      maxHeight={180}
                    />
                  );
                })}
              </View>

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
