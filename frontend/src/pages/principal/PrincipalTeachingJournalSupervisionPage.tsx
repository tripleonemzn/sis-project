import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileClock,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import UnderlineTabBar from '../../components/navigation/UnderlineTabBar';
import {
  JOURNAL_STATUS_LABELS,
  teachingJournalService,
  type TeachingJournalMonitoringAggregate,
  type TeachingJournalMonitoringClassRow,
  type TeachingJournalMonitoringIssueRow,
  type TeachingJournalMonitoringTeacherRow,
} from '../../services/teachingJournal.service';

type RangeTab = 'WEEK' | 'RECENT' | 'CUSTOM';
type ViewTab = 'PRIORITY' | 'CLASSES' | 'ISSUES';

const RANGE_TABS = [
  { id: 'WEEK', label: 'Minggu Ini', icon: CalendarDays },
  { id: 'RECENT', label: '30 Hari', icon: FileClock },
  { id: 'CUSTOM', label: 'Rentang Manual', icon: BarChart3 },
];

const VIEW_TABS = [
  { id: 'PRIORITY', label: 'Prioritas Guru', icon: ShieldCheck },
  { id: 'CLASSES', label: 'Kelas Perhatian', icon: Users },
  { id: 'ISSUES', label: 'Temuan Supervisi', icon: AlertTriangle },
];

const EMPTY_SUMMARY: TeachingJournalMonitoringAggregate = {
  expectedSessions: 0,
  journalFilled: 0,
  submittedSessions: 0,
  reviewedSessions: 0,
  draftSessions: 0,
  missingSessions: 0,
  attendanceRecorded: 0,
  attendanceMismatch: 0,
  referenceLinkedSessions: 0,
  referenceFields: {},
  latestJournalAt: null,
  submittedAndReviewed: 0,
  complianceRate: 0,
  fillRate: 0,
  attendanceRate: 0,
  coverageRate: 0,
};

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

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map((item) => Number(item));
  return new Date(year, (month || 1) - 1, day || 1);
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

function resolveRange(tab: RangeTab, startDate: string, endDate: string) {
  if (tab === 'CUSTOM') return { startDate, endDate };
  const today = new Date();
  if (tab === 'RECENT') {
    return {
      startDate: toIsoDateLocal(addDays(today, -29)),
      endDate: toIsoDateLocal(today),
    };
  }
  const week = getWeekRange(today);
  return {
    startDate: toIsoDateLocal(week.start),
    endDate: toIsoDateLocal(week.end),
  };
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return parseIsoDate(value).toLocaleDateString('id-ID', {
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

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1).replace('.', ',')}%`;
}

function statusClass(rate: number) {
  if (rate >= 90) return 'border-emerald-100 bg-emerald-50 text-emerald-700';
  if (rate >= 70) return 'border-amber-100 bg-amber-50 text-amber-700';
  return 'border-rose-100 bg-rose-50 text-rose-700';
}

function supervisionTone(row: TeachingJournalMonitoringAggregate) {
  if (row.complianceRate < 70 || row.missingSessions >= 3 || row.attendanceMismatch >= 3) {
    return {
      label: 'Prioritas Tinggi',
      className: 'border-rose-100 bg-rose-50 text-rose-700',
    };
  }
  if (row.complianceRate < 90 || row.coverageRate < 70 || row.missingSessions > 0 || row.attendanceMismatch > 0) {
    return {
      label: 'Perlu Dipantau',
      className: 'border-amber-100 bg-amber-50 text-amber-700',
    };
  }
  return {
    label: 'Terkendali',
    className: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  };
}

function issueBadgeClass(label: string) {
  if (label.toLowerCase().includes('presensi')) return 'border-amber-100 bg-amber-50 text-amber-700';
  if (label.toLowerCase().includes('referensi')) return 'border-blue-100 bg-blue-50 text-blue-700';
  return 'border-rose-100 bg-rose-50 text-rose-700';
}

function formatIssuePeriod(row: TeachingJournalMonitoringIssueRow) {
  return row.periodLabel || `Jam ke ${row.period}`;
}

function formatIssueScheduleDetail(row: TeachingJournalMonitoringIssueRow) {
  const details = [
    row.timeRange || null,
    Number(row.jpCount || 0) > 1 ? `${row.jpCount} JP` : null,
    row.room ? `Ruang ${row.room}` : null,
  ].filter(Boolean);
  return details.length ? details.join(' • ') : '-';
}

function SummaryCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: string;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs opacity-80">{helper}</p>
    </div>
  );
}

function RateCell({ row }: { row: TeachingJournalMonitoringAggregate }) {
  return (
    <div className="min-w-[150px]">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-gray-700">Kepatuhan</span>
        <span className={`rounded-full border px-2 py-0.5 font-bold ${statusClass(row.complianceRate)}`}>
          {formatPercent(row.complianceRate)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-blue-600"
          style={{ width: `${Math.min(100, Math.max(0, row.complianceRate))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">Coverage referensi {formatPercent(row.coverageRate)}</p>
    </div>
  );
}

export default function PrincipalTeachingJournalSupervisionPage() {
  const [rangeTab, setRangeTab] = useState<RangeTab>('WEEK');
  const [viewTab, setViewTab] = useState<ViewTab>('PRIORITY');
  const [customStartDate, setCustomStartDate] = useState(() => toIsoDateLocal(addDays(new Date(), -6)));
  const [customEndDate, setCustomEndDate] = useState(() => toIsoDateLocal(new Date()));
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const range = useMemo(() => resolveRange(rangeTab, customStartDate, customEndDate), [customEndDate, customStartDate, rangeTab]);

  const supervisionQuery = useQuery({
    queryKey: ['principal-teaching-journal-supervision', range.startDate, range.endDate, search],
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      teachingJournalService.getMonitoring({
        startDate: range.startDate,
        endDate: range.endDate,
        search: search || undefined,
        issueLimit: 80,
      }),
  });

  const data = supervisionQuery.data;
  const summary = data?.summary || EMPTY_SUMMARY;
  const teacherRows = data?.teacherRows || [];
  const classRows = data?.classRows || [];
  const issueRows = data?.issueRows || [];

  const priorityTeacherRows = useMemo(() => {
    return [...teacherRows].sort((left, right) => {
      const leftPriority = left.missingSessions * 3 + left.attendanceMismatch * 2 + Math.max(0, 90 - left.complianceRate);
      const rightPriority = right.missingSessions * 3 + right.attendanceMismatch * 2 + Math.max(0, 90 - right.complianceRate);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.teacher.name.localeCompare(right.teacher.name, 'id-ID');
    });
  }, [teacherRows]);

  const priorityClassRows = useMemo(() => {
    return [...classRows].sort((left, right) => {
      const leftPriority = left.missingSessions * 3 + left.attendanceMismatch * 2 + Math.max(0, 90 - left.complianceRate);
      const rightPriority = right.missingSessions * 3 + right.attendanceMismatch * 2 + Math.max(0, 90 - right.complianceRate);
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return left.class.name.localeCompare(right.class.name, 'id-ID', { numeric: true });
    });
  }, [classRows]);

  const teacherNeedsAttention = priorityTeacherRows.filter((row) => supervisionTone(row).label !== 'Terkendali').length;
  const classNeedsAttention = priorityClassRows.filter((row) => supervisionTone(row).label !== 'Terkendali').length;
  const activeRowsCount = viewTab === 'PRIORITY' ? priorityTeacherRows.length : viewTab === 'CLASSES' ? priorityClassRows.length : issueRows.length;

  const applySearch = () => setSearch(searchInput.trim());

  const renderPriorityRows = (rows: TeachingJournalMonitoringTeacherRow[]) => (
    <table className="w-full min-w-[1120px] text-left">
      <thead className="bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Guru</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Sesi & Jurnal</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Presensi</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Perangkat Ajar</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status Supervisi</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kinerja</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, index) => {
          const tone = supervisionTone(row);
          return (
            <tr key={row.teacher.id} className="hover:bg-gray-50">
              <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
              <td className="px-5 py-4">
                <p className="text-sm font-semibold text-gray-900">{row.teacher.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">@{row.teacher.username || '-'}</p>
              </td>
              <td className="px-5 py-4 text-sm text-gray-700">
                <p>{row.submittedAndReviewed}/{row.expectedSessions} terkirim/review</p>
                <p className="text-xs text-gray-500">Draft {row.draftSessions} • Belum {row.missingSessions}</p>
              </td>
              <td className="px-5 py-4 text-sm text-gray-700">
                <p>{row.attendanceRecorded}/{row.expectedSessions} sesi</p>
                <p className="text-xs text-amber-600">Mismatch {row.attendanceMismatch}</p>
              </td>
              <td className="px-5 py-4 text-sm text-gray-700">
                <p>{row.referenceLinkedSessions} jurnal berreferensi</p>
                <p className="text-xs text-gray-500">Coverage {formatPercent(row.coverageRate)}</p>
              </td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.className}`}>
                  {tone.label}
                </span>
              </td>
              <td className="px-5 py-4">
                <RateCell row={row} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderClassRows = (rows: TeachingJournalMonitoringClassRow[]) => (
    <table className="w-full min-w-[980px] text-left">
      <thead className="bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kelas</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Sesi</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Jurnal</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Presensi</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status Supervisi</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kinerja</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, index) => {
          const tone = supervisionTone(row);
          return (
            <tr key={row.class.id} className="hover:bg-gray-50">
              <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
              <td className="px-5 py-4">
                <p className="text-sm font-semibold text-gray-900">{row.class.name}</p>
                <p className="mt-0.5 text-xs text-gray-500">{row.class.major?.name || row.class.level || '-'}</p>
              </td>
              <td className="px-5 py-4 text-sm text-gray-700">{row.expectedSessions} sesi</td>
              <td className="px-5 py-4 text-sm text-gray-700">
                <p>Terkirim {row.submittedAndReviewed}</p>
                <p className="text-xs text-gray-500">Draft {row.draftSessions} • Belum {row.missingSessions}</p>
              </td>
              <td className="px-5 py-4 text-sm text-gray-700">
                <p>{row.attendanceRecorded}/{row.expectedSessions}</p>
                <p className="text-xs text-amber-600">Mismatch {row.attendanceMismatch}</p>
              </td>
              <td className="px-5 py-4">
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone.className}`}>
                  {tone.label}
                </span>
              </td>
              <td className="px-5 py-4">
                <RateCell row={row} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  const renderIssueRows = (rows: TeachingJournalMonitoringIssueRow[]) => (
    <table className="w-full min-w-[1100px] text-left">
      <thead className="bg-gray-50">
        <tr className="border-b border-gray-200">
          <th className="w-14 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">No</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Tanggal</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Guru</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Kelas/Mapel</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Temuan</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map((row, index) => (
          <tr key={row.sessionKey} className="hover:bg-gray-50">
            <td className="px-5 py-4 text-sm text-gray-500">{index + 1}</td>
            <td className="px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">{formatDate(row.date)}</p>
              <p className="text-xs text-gray-500">{formatIssuePeriod(row)} • {formatIssueScheduleDetail(row)}</p>
            </td>
            <td className="px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">{row.teacher.name}</p>
              <p className="text-xs text-gray-500">@{row.teacher.username || '-'}</p>
            </td>
            <td className="px-5 py-4">
              <p className="text-sm font-semibold text-gray-900">{row.class.name}</p>
              <p className="text-xs text-gray-500">{row.subject.name}</p>
            </td>
            <td className="px-5 py-4 text-sm text-gray-700">
              <p>{JOURNAL_STATUS_LABELS[row.journalStatus]}</p>
              <p className="text-xs text-gray-500">Presensi {row.attendanceStatus === 'RECORDED' ? 'ada' : 'belum ada'} • Ref {row.referenceCount}</p>
            </td>
            <td className="px-5 py-4">
              <div className="flex flex-wrap gap-1.5">
                {row.issueLabels.map((label) => (
                  <span key={label} className={`rounded-full border px-2 py-1 text-xs font-semibold ${issueBadgeClass(label)}`}>
                    {label}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Update: {formatDateTime(row.updatedAt)}</p>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supervisi Jurnal Mengajar</h1>
          <p className="text-sm text-gray-500">
            Ringkasan eksekutif untuk menentukan prioritas supervisi guru berdasarkan jurnal, presensi mapel, dan perangkat ajar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => supervisionQuery.refetch()}
          disabled={supervisionQuery.isFetching}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${supervisionQuery.isFetching ? 'animate-spin' : ''}`} />
          Muat Ulang
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Sesi" value={`${summary.expectedSessions}`} helper={`${formatDate(range.startDate)} - ${formatDate(range.endDate)}`} tone="border-slate-200 bg-slate-50 text-slate-700" />
        <SummaryCard label="Kepatuhan" value={formatPercent(summary.complianceRate)} helper={`${summary.submittedAndReviewed} jurnal terkirim`} tone="border-blue-100 bg-blue-50 text-blue-700" />
        <SummaryCard label="Butuh Supervisi" value={`${teacherNeedsAttention}`} helper={`${classNeedsAttention} kelas perlu perhatian`} tone="border-rose-100 bg-rose-50 text-rose-700" />
        <SummaryCard label="Mismatch Presensi" value={`${summary.attendanceMismatch}`} helper={`${formatPercent(summary.attendanceRate)} presensi tercatat`} tone="border-amber-100 bg-amber-50 text-amber-700" />
        <SummaryCard label="Coverage" value={formatPercent(summary.coverageRate)} helper={`${summary.referenceLinkedSessions} jurnal berreferensi`} tone="border-emerald-100 bg-emerald-50 text-emerald-700" />
      </div>

      <section className="rounded-lg border border-blue-100 bg-blue-50 px-5 py-4 text-sm text-blue-800">
        <p className="font-semibold">Acuan supervisi:</p>
        <p className="mt-1">
          Prioritaskan guru dengan jurnal belum diisi, presensi tidak sinkron, atau coverage perangkat ajar rendah. Data ini hanya snapshot monitoring aktif dan tidak mengubah data jurnal/presensi.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
          <UnderlineTabBar
            items={RANGE_TABS}
            activeId={rangeTab}
            onChange={(value) => setRangeTab(value as RangeTab)}
            className="border-b-0"
            innerClassName="pb-0"
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {rangeTab === 'CUSTOM' ? (
              <>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span>Dari</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <span>Sampai</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </label>
              </>
            ) : null}
            <form
              className="flex w-full gap-2 lg:w-96"
              onSubmit={(event) => {
                event.preventDefault();
                applySearch();
              }}
            >
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Cari guru, kelas, mapel..."
                  className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Cari
              </button>
            </form>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-section-title text-gray-900">Tabel Supervisi</h2>
            <p className="mt-1 text-sm text-gray-500">
              Data mengikuti tahun ajaran aktif dan dapat dipakai sebagai bahan tindak lanjut supervisi.
            </p>
          </div>
          <UnderlineTabBar
            items={VIEW_TABS}
            activeId={viewTab}
            onChange={(value) => setViewTab(value as ViewTab)}
            className="border-b-0"
            innerClassName="pb-0"
          />
        </div>

        {supervisionQuery.isLoading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-gray-500">
            <Loader2 className="mb-3 h-9 w-9 animate-spin text-blue-600" />
            <p>Memuat supervisi jurnal mengajar...</p>
          </div>
        ) : supervisionQuery.isError ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <p className="text-sm font-semibold text-gray-900">Gagal memuat supervisi jurnal.</p>
            <p className="mt-1 text-sm text-gray-500">Silakan muat ulang halaman.</p>
            <button
              type="button"
              onClick={() => supervisionQuery.refetch()}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Coba Lagi
            </button>
          </div>
        ) : activeRowsCount === 0 ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center px-5 text-center">
            <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
            <p className="text-sm font-semibold text-gray-900">Tidak ada data pada filter ini</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Coba ubah rentang tanggal atau kata kunci pencarian.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {viewTab === 'PRIORITY' ? renderPriorityRows(priorityTeacherRows) : null}
            {viewTab === 'CLASSES' ? renderClassRows(priorityClassRows) : null}
            {viewTab === 'ISSUES' ? renderIssueRows(issueRows) : null}
          </div>
        )}
      </section>
    </div>
  );
}
