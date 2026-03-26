import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, CheckCircle2, ExternalLink, Trophy, Vote } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { osisService } from '../../services/osis.service';

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

export const StudentOsisElectionPage = () => {
  const queryClient = useQueryClient();
  const electionQuery = useQuery({
    queryKey: ['student-osis-active-election'],
    queryFn: async () => {
      const response = await osisService.getActiveElection();
      return response.data;
    },
  });

  const voteMutation = useMutation({
    mutationFn: async (candidateId: number) => {
      const election = electionQuery.data;
      if (!election) throw new Error('Belum ada pemilihan aktif');
      return osisService.submitVote({ electionId: election.id, candidateId });
    },
    onSuccess: async () => {
      toast.success('Suara Anda berhasil dikirim');
      await queryClient.invalidateQueries({ queryKey: ['student-osis-active-election'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Gagal mengirim suara');
    },
  });

  const election = electionQuery.data;
  const myVoteCandidateId = election?.myVote?.candidateId || null;
  const quickCount = election?.quickCount;

  const selectedCandidate = useMemo(
    () => election?.candidates.find((candidate) => candidate.id === myVoteCandidateId) || null,
    [election?.candidates, myVoteCandidateId],
  );

  if (electionQuery.isLoading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Memuat data pemilihan OSIS...</div>;
  }

  if (!election) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Pemilihan OSIS</h1>
          <p className="mt-1 text-sm text-gray-600">Pantau calon ketua OSIS dan gunakan hak pilih Anda saat periode dibuka.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          Belum ada pemilihan OSIS aktif saat ini.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pemilihan OSIS</h1>
        <p className="mt-1 text-sm text-gray-600">
          {election.title} • {new Date(election.startAt).toLocaleString('id-ID')} -{' '}
          {new Date(election.endAt).toLocaleString('id-ID')}
        </p>
        {election.description ? <p className="mt-3 text-sm text-gray-600">{election.description}</p> : null}
      </div>

      {election.status === 'CLOSED' ? (
        quickCount?.winner ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-semibold text-emerald-900">Hasil akhir pemilihan</div>
                <div className="text-sm text-emerald-700">
                  Pemenang: No. {quickCount.winner.candidateNumber} • {quickCount.winner.studentName}
                </div>
                <div className="text-xs text-emerald-700">
                  {quickCount.winner.votes} suara • {quickCount.winner.percentage}%
                </div>
              </div>
            </div>
          </div>
        ) : quickCount?.hasTie ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
            Pemilihan sudah ditutup. Hasil akhir menunjukkan suara imbang pada posisi teratas.
          </div>
        ) : null
      ) : selectedCandidate ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div>
              <div className="font-semibold text-emerald-900">Anda sudah memberikan suara</div>
              <div className="text-sm text-emerald-700">
                Pilihan Anda: No. {selectedCandidate.candidateNumber} • {selectedCandidate.student.name}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          Anda belum memberikan suara. Pilih satu calon ketua OSIS sebelum periode berakhir.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr,0.75fr]">
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {election.candidates.map((candidate) => {
            const embedUrl = toEmbedUrl(candidate.youtubeUrl);
            const isSelected = candidate.id === myVoteCandidateId;
            return (
              <article key={candidate.id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${isSelected ? 'border-emerald-400 ring-2 ring-emerald-100' : 'border-gray-200'}`}>
                <div className="border-b border-gray-100 bg-gray-50 px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                        Calon No. {candidate.candidateNumber}
                      </div>
                      <h2 className="mt-1 text-xl font-bold text-gray-900">{candidate.student.name}</h2>
                      <div className="text-sm text-gray-500">{candidate.student.studentClass?.name || '-'} • {candidate.student.nis || '-'}</div>
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
                ) : null}

                <div className="space-y-4 px-5 py-5">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Visi</div>
                    <p className="text-sm leading-6 text-gray-700 whitespace-pre-line">{candidate.vision || 'Belum diisi.'}</p>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Misi</div>
                    <p className="text-sm leading-6 text-gray-700 whitespace-pre-line">{candidate.mission || 'Belum diisi.'}</p>
                  </div>
                  {candidate.youtubeUrl ? (
                    <a
                      href={candidate.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Buka tautan video orasi
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => voteMutation.mutate(candidate.id)}
                    disabled={election.status === 'CLOSED' || Boolean(myVoteCandidateId) || voteMutation.isPending}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm ${
                      election.status === 'CLOSED'
                        ? isSelected
                          ? 'bg-emerald-600'
                          : 'cursor-not-allowed bg-gray-300'
                        : myVoteCandidateId
                        ? isSelected
                          ? 'bg-emerald-600'
                          : 'cursor-not-allowed bg-gray-300'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    <Vote className="h-4 w-4" />
                    {election.status === 'CLOSED'
                      ? isSelected
                        ? 'Pilihan Anda'
                        : 'Pemilihan Ditutup'
                      : isSelected
                        ? 'Suara Terkirim'
                        : myVoteCandidateId
                          ? 'Pemilihan Selesai'
                          : 'Pilih Kandidat Ini'}
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="space-y-5">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-violet-600" />
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Quick Count</h2>
                <p className="text-sm text-gray-500">
                  {election.allowQuickCount ? 'Hasil sementara pemilihan OSIS.' : 'Quick count dinonaktifkan untuk siswa.'}
                </p>
              </div>
            </div>

            {election.allowQuickCount && quickCount ? (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="rounded-xl bg-violet-50 px-4 py-3 text-sm text-violet-800">
                    Total suara masuk: <span className="font-semibold">{quickCount.totalVotes}</span>
                  </div>
                  <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    Partisipasi suara saat ini: <span className="font-semibold">{quickCount.turnoutPercentage}%</span>{' '}
                    dari total {quickCount.totalEligibleVoters} pemilih
                  </div>
                  <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    Belum memberi suara: <span className="font-semibold">{quickCount.remainingVoters}</span>
                  </div>
                </div>
                {quickCount.candidates.map((candidate) => (
                  <div key={candidate.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-800">
                        #{candidate.rank} • No. {candidate.candidateNumber} • {candidate.studentName}
                      </span>
                      <span className="text-gray-600">{candidate.percentage}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className="h-full rounded-full bg-violet-500 transition-all"
                        style={{ width: `${candidate.percentage}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{candidate.votes} suara</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 px-4 py-6 text-sm text-gray-500">
                Quick count belum dapat ditampilkan.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

export default StudentOsisElectionPage;
