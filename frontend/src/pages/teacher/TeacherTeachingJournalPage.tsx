import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  BookOpenCheck,
  CalendarDays,
  Clock3,
  Edit3,
  FileClock,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Send,
  X,
} from 'lucide-react';
import UnderlineTabBar from '../../components/navigation/UnderlineTabBar';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import {
  DELIVERY_STATUS_LABELS,
  JOURNAL_STATUS_LABELS,
  TEACHING_MODE_LABELS,
  teachingJournalService,
  type TeachingJournalDeliveryStatus,
  type TeachingJournalMode,
  type TeachingJournalReference,
  type TeachingJournalSession,
  type TeachingJournalSessionStatus,
  type TeachingJournalStatus,
} from '../../services/teachingJournal.service';
import {
  teachingResourceProgramService,
  type TeachingResourceProjectedReferenceOption,
  type TeachingResourceReferenceProjectionRequest,
} from '../../services/teachingResourceProgram.service';

type RangeTab = 'TODAY' | 'WEEK' | 'RECENT';
type StatusFilter = 'ALL' | TeachingJournalSessionStatus;
type JournalReferenceField = 'competency' | 'learningObjective' | 'materialScope' | 'indicator';

type JournalFormState = {
  teachingMode: TeachingJournalMode;
  deliveryStatus: TeachingJournalDeliveryStatus;
  notes: string;
  obstacles: string;
  followUpPlan: string;
  references: Record<JournalReferenceField, TeachingJournalReference | null>;
};

type JournalReferenceOption = TeachingResourceProjectedReferenceOption & {
  field: JournalReferenceField;
  optionKey: string;
};

const RANGE_TABS = [
  { id: 'TODAY', label: 'Hari Ini', icon: CalendarDays },
  { id: 'WEEK', label: 'Minggu Ini', icon: FileClock },
  { id: 'RECENT', label: '30 Hari', icon: Clock3 },
];

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

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Date(year, (month || 1) - 1, day || 1);
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

function resolveRange(tab: RangeTab, anchorDate: string) {
  const anchor = parseIsoDate(anchorDate);
  if (tab === 'TODAY') {
    return { startDate: anchorDate, endDate: anchorDate };
  }
  if (tab === 'RECENT') {
    return {
      startDate: toIsoDateLocal(addDays(anchor, -29)),
      endDate: anchorDate,
    };
  }
  const week = getWeekRange(anchor);
  return {
    startDate: toIsoDateLocal(week.start),
    endDate: toIsoDateLocal(week.end),
  };
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

function getErrorMessage(error: unknown, fallback: string) {
  const maybe = error as { response?: { data?: { message?: string } }; message?: string };
  return maybe.response?.data?.message || maybe.message || fallback;
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

  const selectionToken = String(reference.selectionToken || '').toLowerCase();
  const tokenField = fieldFromRequestKey(selectionToken);
  if (tokenField) return tokenField;

  const sourceProgram = String(reference.sourceProgramCode || '').trim().toUpperCase();
  const identity = normalizeReferenceToken(reference.sourceFieldIdentity);
  if (sourceProgram === 'CP' && ['capaian_pembelajaran', 'kompetensi', 'elemen'].includes(identity)) return 'competency';
  if (['ATP', 'PROTA'].includes(sourceProgram) && identity === 'tujuan_pembelajaran') return 'learningObjective';
  if (['ATP', 'CP'].includes(sourceProgram) && ['materi_pokok', 'konten_materi'].includes(identity)) return 'materialScope';
  if (sourceProgram === 'KKTP' && identity.includes('indikator')) return 'indicator';
  return null;
}

function buildReferenceMap(references?: TeachingJournalReference[] | null): Record<JournalReferenceField, TeachingJournalReference | null> {
  const map = createEmptyReferenceMap();
  (references || []).forEach((reference) => {
    const field = fieldFromSavedReference(reference);
    if (!field || map[field]) return;
    map[field] = reference;
  });
  return map;
}

function expandJournalReferenceOption(option: TeachingResourceProjectedReferenceOption): JournalReferenceOption[] {
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

function filterReferenceOptions(options: JournalReferenceOption[], search: string) {
  const keyword = search.trim().toLowerCase();
  if (!keyword) return options;
  return options.filter((option) =>
    [
      option.value,
      option.label,
      option.sourceProgramCode,
      option.sourceEntryTitle,
      option.sourceFieldKey,
      option.sourceFieldIdentity,
    ]
      .filter(Boolean)
      .some((item) => String(item).toLowerCase().includes(keyword)),
  );
}

function statusClass(status: TeachingJournalSessionStatus) {
  if (status === 'SUBMITTED') return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (status === 'REVIEWED') return 'border-blue-100 bg-blue-50 text-blue-700';
  if (status === 'DRAFT') return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-rose-100 bg-rose-50 text-rose-700';
}

function attendanceClass(status: 'RECORDED' | 'MISSING') {
  return status === 'RECORDED'
    ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
    : 'border-slate-200 bg-slate-50 text-slate-600';
}

function emptyFormState(session?: TeachingJournalSession | null): JournalFormState {
  return {
    teachingMode: session?.journal?.teachingMode || 'REGULAR',
    deliveryStatus: session?.journal?.deliveryStatus || 'COMPLETED',
    notes: session?.journal?.notes || '',
    obstacles: session?.journal?.obstacles || '',
    followUpPlan: session?.journal?.followUpPlan || '',
    references: buildReferenceMap(session?.journal?.references),
  };
}

export const TeacherTeachingJournalPage = () => {
  const queryClient = useQueryClient();
  const [rangeTab, setRangeTab] = useState<RangeTab>('WEEK');
  const [anchorDate, setAnchorDate] = useState(() => toIsoDateLocal(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [referenceSearch, setReferenceSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<TeachingJournalSession | null>(null);
  const [formState, setFormState] = useState<JournalFormState>(() => emptyFormState());
  const { data: activeAcademicYear, isLoading: isLoadingActiveYear } = useActiveAcademicYear();
  const activeAcademicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0) || null;
  const range = useMemo(() => resolveRange(rangeTab, anchorDate), [rangeTab, anchorDate]);

  const sessionsQuery = useQuery({
    queryKey: [
      'teaching-journal-sessions',
      activeAcademicYearId,
      range.startDate,
      range.endDate,
      statusFilter,
    ],
    queryFn: () =>
      teachingJournalService.listSessions({
        academicYearId: activeAcademicYearId || undefined,
        startDate: range.startDate,
        endDate: range.endDate,
        journalStatus: statusFilter === 'ALL' ? undefined : statusFilter,
      }),
    enabled: !!activeAcademicYearId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sessions = useMemo(() => sessionsQuery.data?.sessions || [], [sessionsQuery.data?.sessions]);
  const filteredSessions = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return sessions;
    return sessions.filter((session) => {
      const haystacks = [
        session.class?.name || '',
        session.subject?.name || '',
        session.subject?.code || '',
        session.room || '',
        session.journal?.notes || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(keyword));
    });
  }, [search, sessions]);

  const summary = useMemo(() => {
    return sessions.reduce(
      (acc, session) => {
        acc.total += 1;
        if (session.journalStatus === 'MISSING') acc.missing += 1;
        if (session.journalStatus === 'DRAFT') acc.draft += 1;
        if (session.journalStatus === 'SUBMITTED') acc.submitted += 1;
        if (session.journalStatus === 'REVIEWED') acc.reviewed += 1;
        if (session.attendance.status === 'RECORDED') acc.attendanceRecorded += 1;
        return acc;
      },
      {
        total: 0,
        missing: 0,
        draft: 0,
        submitted: 0,
        reviewed: 0,
        attendanceRecorded: 0,
      },
    );
  }, [sessions]);

  const selectedReferenceContext = useMemo(() => {
    if (!selectedSession) return null;
    return {
      subjectId: Number(selectedSession.subject?.id || 0),
      classLevel: String(selectedSession.class?.level || selectedSession.class?.name || '').trim(),
      programKeahlian: String(selectedSession.class?.major?.name || selectedSession.class?.major?.code || '').trim(),
    };
  }, [selectedSession]);

  const referenceRequests = useMemo<TeachingResourceReferenceProjectionRequest[]>(() => {
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
      'teaching-journal-resource-references',
      activeAcademicYearId,
      selectedReferenceContext?.subjectId || 0,
      selectedReferenceContext?.classLevel || '',
      selectedReferenceContext?.programKeahlian || '',
    ],
    enabled: Boolean(selectedSession && activeAcademicYearId && referenceRequests.length > 0),
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      teachingResourceProgramService.getReferenceEntries({
        academicYearId: activeAcademicYearId || undefined,
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
    (referencesQuery.data?.data?.programs || []).forEach((program) => {
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
  }, [referencesQuery.data?.data?.programs]);

  const saveMutation = useMutation({
    mutationFn: async (nextStatus: TeachingJournalStatus) => {
      if (!selectedSession) throw new Error('Sesi jurnal belum dipilih.');
      const references = Object.values(formState.references).filter((reference): reference is TeachingJournalReference =>
        Boolean(reference?.sourceProgramCode && reference.value),
      );
      return teachingJournalService.upsertEntry({
        id: selectedSession.journal?.id,
        academicYearId: activeAcademicYearId || undefined,
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
      await queryClient.invalidateQueries({ queryKey: ['teaching-journal-sessions'] });
      toast.success(nextStatus === 'SUBMITTED' ? 'Jurnal berhasil dikirim.' : 'Draft jurnal berhasil disimpan.');
      setSelectedSession(null);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan jurnal mengajar.'));
    },
  });

  const openForm = (session: TeachingJournalSession) => {
    setSelectedSession(session);
    setFormState(emptyFormState(session));
    setReferenceSearch('');
  };

  const isLoading = isLoadingActiveYear || (!!activeAcademicYearId && sessionsQuery.isLoading);
  const isReviewed = selectedSession?.journalStatus === 'REVIEWED';
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

  const renderReferenceSelect = (config: (typeof JOURNAL_REFERENCE_FIELDS)[number]) => {
    const selectedReference = formState.references[config.field];
    const rawOptions = referenceOptionsByField[config.field] || [];
    const filteredOptions = filterReferenceOptions(rawOptions, referenceSearch);
    const matchedOption = rawOptions.find(
      (option) =>
        String(option.value || '').trim() === String(selectedReference?.value || '').trim() &&
        String(option.sourceProgramCode || '').trim() === String(selectedReference?.sourceProgramCode || '').trim(),
    );
    const hasSavedOnlyValue = Boolean(selectedReference?.value && !matchedOption);
    const selectedValue = matchedOption?.optionKey || (hasSavedOnlyValue ? '__CURRENT__' : '');
    const disabled = isReviewed || (rawOptions.length === 0 && !hasSavedOnlyValue);
    const visibleOptions =
      matchedOption && !filteredOptions.some((option) => option.optionKey === matchedOption.optionKey)
        ? [matchedOption, ...filteredOptions]
        : filteredOptions;

    return (
      <label key={config.field} className="block">
        <span className="text-sm font-semibold text-gray-700">{config.label}</span>
        <select
          value={selectedValue}
          onChange={(event) => updateReferenceField(config.field, event.target.value)}
          disabled={disabled}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">
            {referencesQuery.isFetching
              ? 'Memuat referensi...'
              : rawOptions.length > 0
                ? config.placeholder
                : 'Referensi belum tersedia'}
          </option>
          {hasSavedOnlyValue ? (
            <option value="__CURRENT__">
              {`Nilai tersimpan: ${String(selectedReference?.value || '').slice(0, 120)}`}
            </option>
          ) : null}
          {visibleOptions.map((option) => (
            <option key={option.optionKey} value={option.optionKey}>
              {formatReferenceOptionLabel(option)}
            </option>
          ))}
        </select>
      </label>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jurnal Mengajar</h1>
          <p className="text-sm text-gray-500">
            Catat realisasi pembelajaran per sesi jadwal mengajar aktif.
          </p>
        </div>
        <button
          type="button"
          onClick={() => sessionsQuery.refetch()}
          disabled={sessionsQuery.isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${sessionsQuery.isFetching ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      {!isLoadingActiveYear && !activeAcademicYearId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tahun ajaran aktif belum tersedia. Jurnal mengajar mengikuti tahun ajaran aktif dari header aplikasi.
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        {[
          { label: 'Sesi', value: summary.total, tone: 'bg-slate-50 text-slate-700 border-slate-200' },
          { label: 'Belum', value: summary.missing, tone: 'bg-rose-50 text-rose-700 border-rose-100' },
          { label: 'Draft', value: summary.draft, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
          { label: 'Terkirim', value: summary.submitted + summary.reviewed, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
          { label: 'Presensi', value: summary.attendanceRecorded, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
        ].map((item) => (
          <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-wider">{item.label}</p>
            <p className="mt-1 text-2xl font-bold">{item.value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <UnderlineTabBar
            items={RANGE_TABS}
            activeId={rangeTab}
            onChange={(value) => setRangeTab(value as RangeTab)}
            className="border-b-0"
            innerClassName="pb-0"
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span>Tanggal</span>
              <input
                type="date"
                value={anchorDate}
                onChange={(event) => setAnchorDate(event.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-section-title text-gray-900">Daftar Sesi Jurnal</h2>
            <p className="mt-1 text-sm text-gray-500">
              Rentang {formatDate(range.startDate)} sampai {formatDate(range.endDate)}.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari kelas, mapel, ruang..."
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-gray-500">
            <Loader2 className="mb-3 h-9 w-9 animate-spin text-blue-600" />
            <p>Memuat sesi jurnal mengajar...</p>
          </div>
        ) : sessionsQuery.isError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <p className="text-sm font-semibold text-gray-900">Gagal memuat jurnal mengajar.</p>
            <p className="mt-1 text-sm text-gray-500">{getErrorMessage(sessionsQuery.error, 'Silakan muat ulang halaman.')}</p>
            <button
              type="button"
              onClick={() => sessionsQuery.refetch()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
              <BookOpenCheck className="h-7 w-7 text-slate-400" />
            </div>
            <p className="text-sm font-semibold text-gray-900">Belum ada sesi pada rentang ini</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Sesi jurnal muncul dari jadwal mengajar aktif dan otomatis melewati hari libur akademik.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left">
              <thead className="bg-gray-50">
                <tr className="border-b border-gray-200">
                  <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kelas</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Mata Pelajaran</th>
                  <th className="w-24 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Jam</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Presensi</th>
                  <th className="w-40 px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSessions.map((session, index) => (
                  <tr key={session.sessionKey} className="hover:bg-gray-50">
                    <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{formatDate(session.date)}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{session.dayOfWeek}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">{session.class.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{session.class.major?.name || session.class.level || '-'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-gray-900">{session.subject.name}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-500">{session.subject.code || '-'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-gray-900">Jam {session.period}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{session.room || '-'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(session.journalStatus)}`}>
                        {JOURNAL_STATUS_LABELS[session.journalStatus]}
                      </span>
                      {session.journal?.submittedAt ? (
                        <p className="mt-1 text-xs text-gray-500">Kirim: {formatDateTime(session.journal.submittedAt)}</p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${attendanceClass(session.attendance.status)}`}>
                        {session.attendance.status === 'RECORDED' ? 'Sudah Presensi' : 'Belum Presensi'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => openForm(session)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          {session.journal ? 'Edit Jurnal' : 'Isi Jurnal'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedSession ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 px-4 py-10 backdrop-blur-[2px]">
          <div className="flex max-h-[calc(100vh-7rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Jurnal Mengajar</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {formatDate(selectedSession.date)} • {selectedSession.class.name} • {selectedSession.subject.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {selectedSession.attendance.status === 'MISSING' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Presensi mapel untuk sesi ini belum ditemukan. Jurnal tetap bisa disimpan, tetapi kurikulum nanti akan melihatnya sebagai mismatch.
                </div>
              ) : null}

              {isReviewed ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                  Jurnal ini sudah direview. Perubahan lanjutan sebaiknya menunggu arahan kurikulum atau kepala sekolah.
                </div>
              ) : null}

              <section className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
                        <Link2 className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Referensi Perangkat Ajar</h3>
                        <p className="text-xs text-gray-500">
                          Opsional, dipakai untuk memantau coverage materi sesuai CP/ATP/KKTP.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="relative w-full lg:w-72">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={referenceSearch}
                      onChange={(event) => setReferenceSearch(event.target.value)}
                      disabled={isReviewed}
                      placeholder="Cari referensi..."
                      className="w-full rounded-lg border border-blue-100 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                    />
                  </div>
                </div>
                {referencesQuery.isError ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Referensi perangkat ajar belum bisa dimuat. Jurnal tetap bisa disimpan secara manual.
                  </p>
                ) : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {JOURNAL_REFERENCE_FIELDS.map((item) => renderReferenceSelect(item))}
                </div>
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Mode Mengajar</span>
                  <select
                    value={formState.teachingMode}
                    onChange={(event) => setFormState((prev) => ({ ...prev, teachingMode: event.target.value as TeachingJournalMode }))}
                    disabled={isReviewed}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  >
                    {MODE_OPTIONS.map((item) => (
                      <option key={item} value={item}>{TEACHING_MODE_LABELS[item]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-sm font-semibold text-gray-700">Status Pelaksanaan</span>
                  <select
                    value={formState.deliveryStatus}
                    onChange={(event) => setFormState((prev) => ({ ...prev, deliveryStatus: event.target.value as TeachingJournalDeliveryStatus }))}
                    disabled={isReviewed}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                  >
                    {DELIVERY_OPTIONS.map((item) => (
                      <option key={item} value={item}>{DELIVERY_STATUS_LABELS[item]}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Realisasi Materi</span>
                <textarea
                  value={formState.notes}
                  onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))}
                  disabled={isReviewed}
                  rows={5}
                  placeholder="Tuliskan materi yang benar-benar diajarkan pada sesi ini."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Hambatan</span>
                <textarea
                  value={formState.obstacles}
                  onChange={(event) => setFormState((prev) => ({ ...prev, obstacles: event.target.value }))}
                  disabled={isReviewed}
                  rows={3}
                  placeholder="Opsional: kendala kelas, waktu, media, kehadiran, atau kondisi lain."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-700">Tindak Lanjut</span>
                <textarea
                  value={formState.followUpPlan}
                  onChange={(event) => setFormState((prev) => ({ ...prev, followUpPlan: event.target.value }))}
                  disabled={isReviewed}
                  rows={3}
                  placeholder="Opsional: rencana pertemuan berikutnya, penguatan, remedial, atau tugas."
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50"
                />
              </label>
            </div>

            <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <X className="h-4 w-4" />
                Tutup
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate('DRAFT')}
                disabled={isReviewed || saveMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Simpan Draft
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate('SUBMITTED')}
                disabled={isReviewed || saveMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Kirim Jurnal
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default TeacherTeachingJournalPage;
