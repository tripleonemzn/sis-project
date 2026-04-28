import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, MessageSquareText, ShieldCheck, Users, X, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  committeeService,
  type CommitteeEventSummary,
  type CommitteeFeatureCode,
} from '../../services/committee.service';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDateTime,
  getCommitteeStatusTone,
} from '../../features/committee/committeeUi';

const COMMITTEE_FEATURE_LABELS: Record<CommitteeFeatureCode, string> = {
  EXAM_PROGRAM: 'Program Ujian',
  EXAM_SCHEDULE: 'Jadwal Ujian',
  EXAM_ROOMS: 'Ruang Ujian',
  EXAM_PROCTOR: 'Jadwal Mengawas',
  EXAM_LAYOUT: 'Generate Denah Ruang',
  EXAM_CARD: 'Kartu Ujian',
};

function CommitteeReviewModal({
  item,
  feedback,
  onFeedbackChange,
  approvingApprove,
  approvingReject,
  onApprove,
  onReject,
  onClose,
}: {
  item: CommitteeEventSummary;
  feedback: string;
  onFeedbackChange: (value: string) => void;
  approvingApprove: boolean;
  approvingReject: boolean;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
      <div className="flex max-h-[80vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
          <div>
            <h2 className="text-section-title font-semibold text-gray-900">Review Usulan Panitia</h2>
            <p className="mt-1 text-body text-gray-500">
              {item.title} • {item.code}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup popup review kepanitiaan"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Pengusul</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">{item.requestedBy.name}</div>
              <div className="mt-1 text-xs text-slate-500">{item.requestedBy.username}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Program Ujian</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {item.programLabel || item.programCode || 'Tanpa program ujian khusus'}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs uppercase tracking-wide text-slate-500">Ringkasan</div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {item.counts.members} anggota • {item.counts.grantedFeatures} fitur workspace unik
              </div>
              <div className="mt-1 text-xs text-slate-500">Diajukan {formatCommitteeDateTime(item.updatedAt)}</div>
            </div>
          </div>

          {item.description ? (
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <h3 className="text-sm font-semibold text-slate-900">Deskripsi / Catatan Pengajuan</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Users className="h-4 w-4 text-slate-500" />
              Preview Susunan Panitia
            </div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Preview menampilkan hingga 5 anggota pertama agar review tetap ringkas.
            </p>

            {item.membersPreview.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Draft ini belum memiliki anggota panitia. Sebaiknya dikembalikan agar pengusul melengkapi susunan panitia
                terlebih dahulu.
              </div>
            ) : (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Anggota</th>
                        <th className="px-4 py-3 font-semibold">Jenis</th>
                        <th className="px-4 py-3 font-semibold">Peran</th>
                        <th className="px-4 py-3 font-semibold">Usulan Feature</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {item.membersPreview.map((member) => (
                        <tr key={`principal-committee-member-${item.id}-${member.id}`} className="align-top">
                          <td className="px-4 py-4">
                            <div className="font-semibold text-slate-900">{member.memberLabel}</div>
                            <div className="mt-1 text-xs text-slate-500">{member.memberDetail || '-'}</div>
                          </td>
                          <td className="px-4 py-4 text-slate-600">{member.memberTypeLabel}</td>
                          <td className="px-4 py-4 text-slate-700">{member.assignmentRole}</td>
                          <td className="px-4 py-4">
                            {member.featureCodes.length === 0 ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                Tanpa usulan feature
                              </span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {member.featureCodes.map((featureCode) => (
                                  <span
                                    key={`principal-committee-feature-${item.id}-${member.id}-${featureCode}`}
                                    className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                  >
                                    {COMMITTEE_FEATURE_LABELS[featureCode]}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <label htmlFor={`committee-feedback-${item.id}`} className="mb-1 block text-sm font-medium text-slate-700">
              Catatan Kepala Sekolah
            </label>
            <textarea
              id={`committee-feedback-${item.id}`}
              name={`committee-feedback-${item.id}`}
              rows={4}
              value={feedback}
              onChange={(event) => onFeedbackChange(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
              placeholder="Tambahkan catatan approval atau alasan revisi bila diperlukan."
            />
          </section>
        </div>

        <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onReject}
            disabled={approvingApprove || approvingReject}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
          >
            {approvingReject ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
            Tolak / Kembalikan
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={approvingApprove || approvingReject}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {approvingApprove ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Setujui & Teruskan ke TU
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommitteeApprovalPage() {
  const queryClient = useQueryClient();
  const [feedbackById, setFeedbackById] = useState<Record<number, string>>({});
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);

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
      setSelectedReviewId((current) => (current === payload.id ? null : current));
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses persetujuan panitia');
    },
  });

  const items = queueQuery.data?.data?.items || [];
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedReviewId) || null,
    [items, selectedReviewId],
  );
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
            <p className="mt-1 text-sm text-slate-500">Queue review dirapikan dalam tabel agar lebih cepat dipindai.</p>
          </div>
        </div>

        <div className="mt-5">
          {queueQuery.isLoading ? (
            <div className="flex min-h-[220px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              Tidak ada pengajuan kepanitiaan yang menunggu review.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Kegiatan</th>
                      <th className="px-4 py-3 font-semibold">Program</th>
                      <th className="px-4 py-3 font-semibold">Pengusul</th>
                      <th className="px-4 py-3 font-semibold">Anggota</th>
                      <th className="px-4 py-3 font-semibold">Fitur Unik</th>
                      <th className="px-4 py-3 font-semibold">Diajukan</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {items.map((item) => (
                      <tr key={`principal-committee-${item.id}`} className="align-top">
                        <td className="px-4 py-4">
                          <div className="font-semibold text-slate-900">{item.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.code}</div>
                        </td>
                        <td className="px-4 py-4 text-slate-600">
                          {item.programLabel || item.programCode || 'Tanpa program khusus'}
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-900">{item.requestedBy.name}</div>
                          <div className="mt-1 text-xs text-slate-500">{item.requestedBy.username}</div>
                        </td>
                        <td className="px-4 py-4 text-slate-700">{item.counts.members}</td>
                        <td className="px-4 py-4 text-slate-700">{item.counts.grantedFeatures}</td>
                        <td className="px-4 py-4 text-slate-600">{formatCommitteeDateTime(item.updatedAt)}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(item.status)}`}>
                            {COMMITTEE_STATUS_LABELS[item.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedReviewId(item.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Review
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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

      {selectedItem ? (
        <CommitteeReviewModal
          item={selectedItem}
          feedback={feedbackById[selectedItem.id] || ''}
          onFeedbackChange={(value) =>
            setFeedbackById((current) => ({
              ...current,
              [selectedItem.id]: value,
            }))
          }
          approvingApprove={
            decisionMutation.isPending &&
            decisionMutation.variables?.id === selectedItem.id &&
            Boolean(decisionMutation.variables?.approved)
          }
          approvingReject={
            decisionMutation.isPending &&
            decisionMutation.variables?.id === selectedItem.id &&
            decisionMutation.variables?.approved === false
          }
          onApprove={() => decisionMutation.mutate({ id: selectedItem.id, approved: true })}
          onReject={() => decisionMutation.mutate({ id: selectedItem.id, approved: false })}
          onClose={() => setSelectedReviewId(null)}
        />
      ) : null}
    </div>
  );
}
