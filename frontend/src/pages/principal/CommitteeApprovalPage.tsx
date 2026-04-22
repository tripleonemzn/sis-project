import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageSquareText, ShieldCheck, Users, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { committeeService } from '../../services/committee.service';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDateTime,
  formatCommitteeMemberMeta,
  getCommitteeStatusTone,
} from '../../features/committee/committeeUi';

export default function CommitteeApprovalPage() {
  const queryClient = useQueryClient();
  const [feedbackById, setFeedbackById] = useState<Record<number, string>>({});

  const queueQuery = useQuery({
    queryKey: ['principal-committee-approvals'],
    queryFn: () => committeeService.list({ scope: 'PENDING_PRINCIPAL' }),
    staleTime: 60_000,
  });

  const decisionMutation = useMutation({
    mutationFn: (payload: { id: number; approved: boolean }) =>
      committeeService.reviewAsPrincipal(payload.id, {
        approved: payload.approved,
        feedback: feedbackById[payload.id] || null,
      }),
    onSuccess: (_, payload) => {
      toast.success(payload.approved ? 'Pengajuan diteruskan ke Kepala TU.' : 'Pengajuan dikembalikan dengan catatan.');
      queryClient.invalidateQueries({ queryKey: ['principal-committee-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      setFeedbackById((current) => ({
        ...current,
        [payload.id]: '',
      }));
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses persetujuan panitia');
    },
  });

  const items = queueQuery.data?.data?.items || [];
  const stats = useMemo(
    () => ({
      total: items.length,
      examScoped: items.filter((item) => Boolean(item.programCode)).length,
      readyRoster: items.filter((item) => item.counts.members > 0).length,
    }),
    [items],
  );

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-amber-50 via-white to-sky-50 p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-semibold text-amber-700">
          <ShieldCheck className="h-4 w-4" />
          Persetujuan Kepala Sekolah
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">Review Pengajuan Kepanitiaan</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Tinjau konteks kegiatan dan susunan panitia yang diusulkan. Setelah disetujui, draft akan diteruskan ke Kepala TU
          untuk finalisasi SK dan aktivasi fitur.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Antrian Review</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
          <div className="text-sm text-sky-700">Terkait Program Ujian</div>
          <div className="mt-2 text-3xl font-bold text-sky-900">{stats.examScoped}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="text-sm text-emerald-700">Sudah Ada Susunan Panitia</div>
          <div className="mt-2 text-3xl font-bold text-emerald-900">{stats.readyRoster}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Daftar Menunggu Persetujuan</h2>
            <p className="mt-1 text-sm text-slate-500">Approval hanya memproses kegiatan pada tahun ajaran aktif.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {queueQuery.isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              Tidak ada pengajuan kepanitiaan yang menunggu review.
            </div>
          ) : (
            items.map((item) => {
              const feedback = feedbackById[item.id] || '';
              const approvingThis = decisionMutation.isPending && decisionMutation.variables?.id === item.id;

              return (
                <article key={`principal-committee-${item.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-slate-900">{item.title}</h3>
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(item.status)}`}>
                          {COMMITTEE_STATUS_LABELS[item.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {item.code} • {item.programLabel || item.programCode || 'Tanpa program ujian khusus'}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>Diajukan {formatCommitteeDateTime(item.updatedAt)}</div>
                      <div>Pengusul: {item.requestedBy.name}</div>
                    </div>
                  </div>

                  {item.description ? <p className="mt-4 text-sm leading-6 text-slate-600">{item.description}</p> : null}

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Anggota Saat Ini</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{item.counts.members}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Usulan Feature Grant</div>
                      <div className="mt-1 text-lg font-bold text-slate-900">{item.counts.grantedFeatures}</div>
                    </div>
                    <div className="rounded-xl border border-white bg-white px-4 py-3">
                      <div className="text-xs uppercase tracking-wide text-slate-500">Pengusul</div>
                      <div className="mt-1 text-sm font-semibold text-slate-900">{item.requestedBy.name}</div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Users className="h-4 w-4 text-slate-500" />
                      Preview Susunan Panitia
                    </div>
                    {item.membersPreview.length === 0 ? (
                      <div className="mt-3 text-sm text-amber-700">
                        Draft ini belum memiliki anggota panitia. Sebaiknya dikembalikan agar pengusul melengkapi susunan panitia
                        terlebih dahulu.
                      </div>
                    ) : (
                      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {item.membersPreview.map((member) => (
                          <div
                            key={`principal-committee-member-${item.id}-${member.id}`}
                            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                          >
                            <div className="text-sm font-semibold text-slate-900">{member.memberLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatCommitteeMemberMeta(member.memberTypeLabel, member.memberDetail)}
                            </div>
                            <div className="mt-2 text-xs font-medium text-slate-700">{member.assignmentRole}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <label htmlFor={`committee-feedback-${item.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                      Catatan Kepala Sekolah
                    </label>
                    <textarea
                      id={`committee-feedback-${item.id}`}
                      name={`committee-feedback-${item.id}`}
                      rows={4}
                      value={feedback}
                      onChange={(event) =>
                        setFeedbackById((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
                      placeholder="Tambahkan catatan approval atau alasan revisi bila diperlukan."
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => decisionMutation.mutate({ id: item.id, approved: true })}
                      disabled={approvingThis}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      {approvingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Setujui & Teruskan ke TU
                    </button>
                    <button
                      type="button"
                      onClick={() => decisionMutation.mutate({ id: item.id, approved: false })}
                      disabled={approvingThis}
                      className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
                    >
                      <XCircle className="h-4 w-4" />
                      Tolak / Kembalikan
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <MessageSquareText className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold">Prinsip Review</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Pastikan konteks kegiatan jelas dan memang operasional pada tahun ajaran aktif.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Review bukan hanya judul kegiatan, tetapi juga kelengkapan susunan panitia yang diusulkan.
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Jika perlu revisi, tulis catatan spesifik agar pengusul bisa memperbaiki draft tanpa ambigu.
          </div>
        </div>
      </div>
    </div>
  );
}
