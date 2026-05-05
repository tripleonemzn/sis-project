import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Search, ShieldAlert } from 'lucide-react';
import { gradeService, type HomeroomRemedialMonitoringData, type HomeroomRemedialMonitoringItem } from '../../services/grade.service';

type SemesterType = 'ODD' | 'EVEN';

type HomeroomRemedialMonitoringPanelProps = {
  classId: number;
  semester: SemesterType;
  programCode?: string;
  programLabel?: string;
};

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(2);
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getToneClass(tone: string) {
  if (tone === 'green') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (tone === 'red') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (tone === 'blue') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

function getSummaryValue(data: HomeroomRemedialMonitoringData | undefined, key: keyof HomeroomRemedialMonitoringData['summary']) {
  return Number(data?.summary?.[key] || 0);
}

function RemedialDetailList({ items }: { items: HomeroomRemedialMonitoringItem[] }) {
  if (!items.length) return <span className="text-xs text-gray-500">Tidak ada remedial.</span>;

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={`${item.scoreEntryId}-${item.subject.id}`} className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">
              {item.subject.name}
            </span>
            <span className="text-[11px] text-gray-500">{item.sourceLabel}</span>
            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getToneClass(item.progress.tone)}`}>
              {item.progress.label}
            </span>
          </div>
          <div className="mt-1 grid gap-1 text-xs text-gray-600 md:grid-cols-3">
            <span>Nilai: {formatScore(item.currentEffectiveScore)} / KKM {formatScore(item.kkm)}</span>
            <span>Percobaan: {item.attemptCount || 0}</span>
            <span>Tenggat: {formatDateTime(item.latestAttempt?.activityDueAt)}</span>
          </div>
          <p className="mt-1 text-xs text-gray-500">{item.progress.description}</p>
        </div>
      ))}
    </div>
  );
}

export function HomeroomRemedialMonitoringPanel({
  classId,
  semester,
  programCode,
  programLabel,
}: HomeroomRemedialMonitoringPanelProps) {
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim();
  const query = useQuery({
    queryKey: ['homeroom-remedial-monitoring', classId, semester, programCode, normalizedSearch],
    queryFn: () =>
      gradeService.getHomeroomRemedialMonitoring({
        classId,
        semester,
        publicationCode: programCode,
        search: normalizedSearch || undefined,
      }),
    enabled: classId > 0,
    staleTime: 60_000,
  });

  const rows = query.data?.rows || [];
  const subjectSummary = useMemo(() => (query.data?.subjects || []).slice(0, 6), [query.data?.subjects]);
  const titleProgram = programLabel || programCode || 'program ini';

  if (query.isLoading) {
    return (
      <div className="flex min-h-[260px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Gagal memuat monitoring remedial. Silakan buka ulang halaman ini.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="grid gap-3 md:grid-cols-5">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-blue-700">Mapel Remedial</p>
          <p className="mt-2 text-2xl font-bold text-blue-950">{getSummaryValue(query.data, 'subjectsWithRemedial')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">Siswa Remedial</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{getSummaryValue(query.data, 'studentsWithRemedial')}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-700">Selesai</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">{getSummaryValue(query.data, 'finishedItems')}</p>
        </div>
        <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-amber-700">Belum Selesai</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{getSummaryValue(query.data, 'unfinishedItems')}</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-rose-700">Ditahan Wali</p>
          <p className="mt-2 text-2xl font-bold text-rose-900">{getSummaryValue(query.data, 'blockedItems')}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Monitoring Remedial {titleProgram}</h2>
            <p className="text-sm text-gray-500">
              Pantau mapel yang perlu remedial, progres siswa, tenggat, dan nilai yang masih ditahan wali kelas.
            </p>
          </div>
          <div className="relative w-full lg:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari siswa..."
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {subjectSummary.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-3">
            {subjectSummary.map((item) => (
              <span key={item.subject.id} className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700">
                {item.subject.name}: {item.unfinishedItems} belum selesai
              </span>
            ))}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-12 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Siswa</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Ringkasan</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="min-w-[360px] px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Detail Remedial</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                    Tidak ada remedial aktif untuk filter ini.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const hasBlocked = row.summary.blockedItems > 0;
                  const isFinished = row.summary.unfinishedItems === 0 && row.summary.finishedItems > 0;
                  return (
                    <tr key={row.student.id} className="align-top hover:bg-gray-50/70">
                      <td className="px-4 py-4 text-gray-500">{index + 1}</td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-gray-900">{row.student.name}</p>
                        <p className="text-xs text-gray-500">NIS: {row.student.nis || '-'}</p>
                        <p className="text-xs text-gray-500">NISN: {row.student.nisn || '-'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-gray-600">
                          <p>{row.summary.subjectCount} mapel remedial</p>
                          <p>{row.summary.finishedItems} selesai • {row.summary.unfinishedItems} belum selesai</p>
                          <p>{row.summary.expiredItems} tenggat berakhir</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-2">
                          {isFinished ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Selesai
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                              <Clock3 className="h-3.5 w-3.5" />
                              Perlu Dipantau
                            </span>
                          )}
                          {hasBlocked ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Ada yang ditahan wali
                            </span>
                          ) : null}
                          {row.summary.expiredItems > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              Ada tenggat berakhir
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <RemedialDetailList items={row.items} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
