import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Trophy, Users, Video } from 'lucide-react';
import { osisService, type OsisElectionCandidate } from '../../services/osis.service';

const toEmbedUrl = (raw?: string | null) => {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace('/', '').trim();
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes('youtube.com')) {
      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
};

const statusTone = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-amber-100 text-amber-700',
} as const;

export const OsisElectionMonitoringPage = () => {
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['osis-monitoring-periods'],
    queryFn: async () => {
      const response = await osisService.getPeriods();
      return response.data;
    },
  });

  const periods = periodsQuery.data || [];
  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) || periods[0] || null,
    [periods, selectedPeriodId],
  );

  useEffect(() => {
    if (selectedPeriod && selectedPeriod.id !== selectedPeriodId) {
      setSelectedPeriodId(selectedPeriod.id);
    }
  }, [selectedPeriod, selectedPeriodId]);

  const quickCountQuery = useQuery({
    queryKey: ['osis-monitoring-quick-count', selectedPeriod?.id],
    queryFn: async () => {
      if (!selectedPeriod?.id) return null;
      const response = await osisService.getQuickCount(selectedPeriod.id);
      return response.data;
    },
    enabled: Boolean(selectedPeriod?.id),
  });

  const stats = useMemo(() => {
    const totalPeriods = periods.length;
    const activePeriods = periods.filter((period) => period.status === 'PUBLISHED').length;
    const totalCandidates = selectedPeriod?.candidates?.filter((candidate) => candidate.isActive).length || 0;
    const totalVotes = quickCountQuery.data?.totalVotes || selectedPeriod?._count?.votes || 0;
    return { totalPeriods, activePeriods, totalCandidates, totalVotes };
  }, [periods, quickCountQuery.data, selectedPeriod]);

  const quickCountMap = useMemo(() => {
    const entries = quickCountQuery.data?.candidates || [];
    return new Map(entries.map((candidate) => [candidate.id, candidate]));
  }, [quickCountQuery.data?.candidates]);
  const winnerSummary = quickCountQuery.data?.winner || null;

  const candidates = useMemo(
    () =>
      [...(selectedPeriod?.candidates || [])].sort(
        (a: OsisElectionCandidate, b: OsisElectionCandidate) => a.candidateNumber - b.candidateNumber,
      ),
    [selectedPeriod?.candidates],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Monitoring Pemilihan OSIS</h1>
        <p className="mt-1 text-sm text-gray-600">
          Pantau periode pemilihan, kandidat, video orasi, dan quick count OSIS secara read-only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="text-sm font-medium text-blue-700">Total Periode</div>
          <div className="mt-2 text-3xl font-bold text-blue-900">{stats.totalPeriods}</div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
          <div className="text-sm font-medium text-emerald-700">Periode Aktif</div>
          <div className="mt-2 text-3xl font-bold text-emerald-900">{stats.activePeriods}</div>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5">
          <div className="text-sm font-medium text-amber-700">Calon Aktif</div>
          <div className="mt-2 text-3xl font-bold text-amber-900">{stats.totalCandidates}</div>
        </div>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
          <div className="text-sm font-medium text-violet-700">Total Suara</div>
          <div className="mt-2 text-3xl font-bold text-violet-900">{stats.totalVotes}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[320px,1fr]">
        <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Periode Pemilihan</h2>
              <p className="text-sm text-gray-500">Pilih satu periode untuk melihat hasil dan kandidat.</p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {periods.map((period) => (
              <button
                key={period.id}
                type="button"
                onClick={() => setSelectedPeriodId(period.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedPeriod?.id === period.id
                    ? 'border-blue-500 bg-blue-50 shadow-sm'
                    : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900">{period.title}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {new Date(period.startAt).toLocaleString('id-ID')} -{' '}
                      {new Date(period.endAt).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      statusTone[period.status as keyof typeof statusTone] || statusTone.DRAFT
                    }`}
                  >
                    {period.status}
                  </span>
                </div>
              </button>
            ))}
            {periods.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                Belum ada periode pemilihan OSIS.
              </div>
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-violet-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Ringkasan Periode</h2>
                <p className="text-sm text-gray-500">
                  {selectedPeriod
                    ? 'Detail periode dan hasil suara terkini.'
                    : 'Belum ada periode pemilihan yang dipilih.'}
                </p>
              </div>
            </div>

            {selectedPeriod ? (
              <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Judul</div>
                  <div className="mt-2 font-semibold text-gray-900">{selectedPeriod.title}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tahun Ajaran</div>
                  <div className="mt-2 font-semibold text-gray-900">{selectedPeriod.academicYear?.name || '-'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quick Count</div>
                  <div className="mt-2 font-semibold text-gray-900">
                    {selectedPeriod.allowQuickCount ? 'Diaktifkan' : 'Dinonaktifkan'}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pembuat</div>
                  <div className="mt-2 font-semibold text-gray-900">{selectedPeriod.createdBy?.name || '-'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Total Pemilih</div>
                  <div className="mt-2 font-semibold text-gray-900">{quickCountQuery.data?.totalEligibleVoters ?? '-'}</div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Partisipasi Suara</div>
                  <div className="mt-2 font-semibold text-gray-900">
                    {quickCountQuery.data ? `${quickCountQuery.data.turnoutPercentage}%` : '-'}
                  </div>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Belum Memberi Suara</div>
                  <div className="mt-2 font-semibold text-gray-900">{quickCountQuery.data?.remainingVoters ?? '-'}</div>
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Pilih salah satu periode untuk melihat ringkasan.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-emerald-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Kandidat & Quick Count</h2>
                <p className="text-sm text-gray-500">Pantau calon aktif, video orasi, dan suara masuk.</p>
              </div>
            </div>

            {selectedPeriod ? (
              <div className="mt-5 space-y-5">
                {winnerSummary ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-start gap-3">
                      <Trophy className="mt-0.5 h-5 w-5 text-emerald-600" />
                      <div>
                        <div className="text-sm font-semibold text-emerald-900">
                          {selectedPeriod.status === 'CLOSED' ? 'Pemenang Final' : 'Pimpinan Sementara'}
                        </div>
                        <div className="mt-1 text-sm text-emerald-800">
                          No. {winnerSummary.candidateNumber} • {winnerSummary.studentName} • {winnerSummary.className}
                        </div>
                        <div className="mt-1 text-xs text-emerald-700">
                          {winnerSummary.votes} suara • {winnerSummary.percentage}%
                        </div>
                      </div>
                    </div>
                  </div>
                ) : quickCountQuery.data?.hasTie ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Hasil sementara menunjukkan suara imbang pada posisi teratas.
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {candidates.map((candidate) => {
                  const embedUrl = toEmbedUrl(candidate.youtubeUrl);
                  const quickCountItem = quickCountMap.get(candidate.id);
                  return (
                    <article key={candidate.id} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                      <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                              Calon No. {candidate.candidateNumber}
                            </div>
                            <div className="mt-1 text-xl font-bold text-gray-900">{candidate.student.name}</div>
                            <div className="text-sm text-gray-500">
                              {candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}
                            </div>
                          </div>
                          <Trophy className="h-6 w-6 text-amber-500" />
                        </div>
                      </div>

                      {embedUrl ? (
                        <div className="border-b border-gray-100">
                          <iframe
                            title={`Video orasi ${candidate.student.name}`}
                            src={embedUrl}
                            className="aspect-video w-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <div className="border-b border-dashed border-gray-200 bg-gray-50 px-5 py-6 text-sm text-gray-500">
                          <div className="flex items-center gap-2">
                            <Video className="h-4 w-4" />
                            Belum ada video orasi.
                          </div>
                        </div>
                      )}

                      <div className="space-y-4 px-5 py-5">
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Visi</div>
                          <p className="whitespace-pre-line text-sm leading-6 text-gray-700">{candidate.vision || 'Belum diisi.'}</p>
                        </div>
                        <div>
                          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Misi</div>
                          <p className="whitespace-pre-line text-sm leading-6 text-gray-700">{candidate.mission || 'Belum diisi.'}</p>
                        </div>
                        <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                          <div className="font-semibold">
                            #{quickCountItem?.rank || '-'} • {quickCountItem?.votes || 0} suara • {quickCountItem?.percentage || 0}%
                          </div>
                          <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
                            <div
                              className="h-full rounded-full bg-violet-500 transition-all"
                              style={{ width: `${quickCountItem?.percentage || 0}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
                {candidates.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
                    Belum ada kandidat di periode ini.
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Pilih periode untuk melihat kandidat dan hasil suara.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default OsisElectionMonitoringPage;
