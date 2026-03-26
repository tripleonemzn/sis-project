import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  type JobApplicationBatchSummary,
  humasService,
  type JobApplicationAssessmentStageCode,
  type JobApplicationReviewRow,
  type JobApplicationStatus,
  type JobVacancy,
  type ReviewableJobApplicationStatus,
} from '../../../../services/humas.service';
import { ApplicationStatusBadge } from '../../../public/bkkShared';

const REVIEW_FLOW_STATUSES: ReviewableJobApplicationStatus[] = [
  'REVIEWING',
  'SHORTLISTED',
  'PARTNER_INTERVIEW',
  'HIRED',
  'REJECTED',
];

const REVIEW_FLOW_STATUS_META: Record<
  ReviewableJobApplicationStatus,
  { label: string; description: string }
> = {
  REVIEWING: {
    label: 'Reviewing',
    description: 'Tim BKK sedang screening dokumen, profil, dan kesiapan pelamar.',
  },
  SHORTLISTED: {
    label: 'Shortlisted',
    description: 'Pelamar lolos tahap internal dan sudah siap diteruskan ke mitra industri.',
  },
  PARTNER_INTERVIEW: {
    label: 'Interview Mitra',
    description: 'Pelamar sedang masuk tahap interview/evaluasi akhir oleh mitra industri.',
  },
  HIRED: {
    label: 'Diterima Mitra',
    description: 'Mitra industri menyatakan pelamar diterima untuk lowongan ini.',
  },
  REJECTED: {
    label: 'Rejected',
    description: 'Pelamar tidak dilanjutkan pada pipeline lowongan ini.',
  },
  INTERVIEW: {
    label: 'Interview (Legacy)',
    description: 'Status lama sebelum pipeline partner baru dipakai.',
  },
  ACCEPTED: {
    label: 'Accepted (Legacy)',
    description: 'Status lama sebelum istilah Diterima Mitra dipakai.',
  },
};

type StageForm = {
  score: string;
  maxScore: string;
  weight: string;
  passingScore: string;
  notes: string;
  assessedAt: string;
};

type StageFormMap = Record<
  JobApplicationAssessmentStageCode,
  StageForm
>;

type PartnerArchiveForm = {
  partnerReferenceCode: string;
  partnerHandoffNotes: string;
  partnerDecisionNotes: string;
};

type BatchShortlistForm = {
  partnerReferenceCode: string;
  partnerHandoffNotes: string;
  shortlistedAt: string;
};

const STAGE_META: Array<{ code: JobApplicationAssessmentStageCode; title: string; description: string }> = [
  {
    code: 'DOCUMENT_SCREENING',
    title: 'Screening Dokumen',
    description: 'Penilaian awal kesesuaian profil, CV, dan syarat dasar lowongan.',
  },
  {
    code: 'ONLINE_TEST',
    title: 'Tes Online / CBT',
    description: 'Nilai tes tertulis atau tes online yang menjadi tahapan seleksi BKK.',
  },
  {
    code: 'INTERNAL_INTERVIEW',
    title: 'Interview Internal BKK',
    description: 'Wawancara awal oleh tim sekolah/BKK sebelum kandidat dikirim ke industri.',
  },
  {
    code: 'PARTNER_INTERVIEW',
    title: 'Interview Mitra Industri',
    description: 'Hasil interview atau evaluasi akhir dari pihak industri mitra.',
  },
];

const defaultStageFormMap = (): StageFormMap => ({
  DOCUMENT_SCREENING: { score: '', maxScore: '100', weight: '15', passingScore: '70', notes: '', assessedAt: '' },
  ONLINE_TEST: { score: '', maxScore: '100', weight: '35', passingScore: '70', notes: '', assessedAt: '' },
  INTERNAL_INTERVIEW: { score: '', maxScore: '100', weight: '20', passingScore: '70', notes: '', assessedAt: '' },
  PARTNER_INTERVIEW: { score: '', maxScore: '100', weight: '30', passingScore: '70', notes: '', assessedAt: '' },
});

const createDefaultPartnerArchiveForm = (): PartnerArchiveForm => ({
  partnerReferenceCode: '',
  partnerHandoffNotes: '',
  partnerDecisionNotes: '',
});

const createDefaultBatchShortlistForm = (): BatchShortlistForm => ({
  partnerReferenceCode: '',
  partnerHandoffNotes: '',
  shortlistedAt: '',
});

const toDateInputValue = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null) {
    const normalized = error as { response?: { data?: { message?: string } }; message?: string };
    return normalized.response?.data?.message || normalized.message || fallback;
  }
  return fallback;
}

function resolveCompanyName(item: JobApplicationReviewRow['vacancy']) {
  return item.industryPartner?.name || item.companyName || 'Perusahaan umum';
}

function canBatchShortlist(item: JobApplicationReviewRow) {
  return !['REJECTED', 'WITHDRAWN', 'PARTNER_INTERVIEW', 'HIRED', 'ACCEPTED'].includes(item.status);
}

function getShortlistBatchPrintPath(vacancyId: number, partnerReferenceCode: string) {
  const params = new URLSearchParams({
    vacancyId: String(vacancyId),
    partnerReferenceCode,
  });
  return `/print/bkk-shortlist-batch?${params.toString()}`;
}

export function ApplicationsTab({ showOverview = true }: { showOverview?: boolean }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | JobApplicationStatus>('ALL');
  const [vacancyIdFilter, setVacancyIdFilter] = useState<'ALL' | number>('ALL');
  const [selectedApplicationIds, setSelectedApplicationIds] = useState<number[]>([]);
  const [assessmentForms, setAssessmentForms] = useState<Record<number, StageFormMap>>({});
  const [partnerArchiveForms, setPartnerArchiveForms] = useState<Record<number, PartnerArchiveForm>>({});
  const [batchShortlistForm, setBatchShortlistForm] = useState<BatchShortlistForm>(createDefaultBatchShortlistForm());

  const vacanciesQuery = useQuery({
    queryKey: ['bkk-vacancy-options'],
    queryFn: async () => {
      const response = await humasService.getVacancies({ page: 1, limit: 200 });
      const rows = (response.data?.data?.vacancies || []) as JobVacancy[];
      return rows;
    },
    staleTime: 60_000,
  });

  const shortlistBatchesQuery = useQuery({
    queryKey: ['bkk-shortlist-batches', vacancyIdFilter],
    enabled: vacancyIdFilter !== 'ALL',
    queryFn: async () => {
      const response = await humasService.getShortlistBatches({
        vacancyId: typeof vacancyIdFilter === 'number' ? vacancyIdFilter : undefined,
      });
      return ((response.data?.data?.batches || []) as JobApplicationBatchSummary[]).sort((left, right) =>
        String(right.shortlistedAt || right.updatedAt).localeCompare(String(left.shortlistedAt || left.updatedAt)),
      );
    },
    staleTime: 30_000,
  });

  const applicationsQuery = useQuery({
    queryKey: ['bkk-applications-review', search, status, vacancyIdFilter],
    queryFn: () =>
      humasService.getApplications({
        page: 1,
        limit: 20,
        search: search.trim() || undefined,
        status: status === 'ALL' ? undefined : status,
        vacancyId: vacancyIdFilter === 'ALL' ? undefined : vacancyIdFilter,
      }),
  });

  const payload = useMemo(() => {
    const data = applicationsQuery.data?.data?.data as
      | {
          applications?: JobApplicationReviewRow[];
          summary?: Record<string, number>;
        }
      | undefined;
    return {
      applications: Array.isArray(data?.applications) ? data!.applications : [],
      summary: data?.summary || {},
    };
  }, [applicationsQuery.data]);

  useEffect(() => {
    const nextForms: Record<number, StageFormMap> = {};
    const nextPartnerArchiveForms: Record<number, PartnerArchiveForm> = {};
    payload.applications.forEach((item) => {
      const form = defaultStageFormMap();
      (item.assessmentBoard?.items || []).forEach((stage) => {
        if (!STAGE_META.some((meta) => meta.code === stage.code)) return;
        form[stage.code] = {
          score: stage.rawScore != null ? String(stage.rawScore) : stage.score != null ? String(stage.score) : '',
          maxScore: stage.maxScore != null ? String(stage.maxScore) : form[stage.code].maxScore,
          weight: stage.weight != null ? String(stage.weight) : form[stage.code].weight,
          passingScore:
            stage.passingScore != null ? String(stage.passingScore) : form[stage.code].passingScore,
          notes: stage.notes || '',
          assessedAt: toDateInputValue(stage.assessedAt),
        };
      });
      nextForms[item.id] = form;
      nextPartnerArchiveForms[item.id] = {
        partnerReferenceCode: item.partnerReferenceCode || '',
        partnerHandoffNotes: item.partnerHandoffNotes || '',
        partnerDecisionNotes: item.partnerDecisionNotes || '',
      };
    });
    setAssessmentForms(nextForms);
    setPartnerArchiveForms(nextPartnerArchiveForms);
  }, [payload.applications]);

  useEffect(() => {
    setSelectedApplicationIds((current) =>
      current.filter((id) => payload.applications.some((item) => item.id === id && canBatchShortlist(item))),
    );
  }, [payload.applications]);

  const statusMutation = useMutation({
    mutationFn: async (params: { applicationId: number; nextStatus: ReviewableJobApplicationStatus }) =>
      humasService.updateApplicationStatus(params.applicationId, {
        status: params.nextStatus,
      }),
    onSuccess: () => {
      toast.success('Status lamaran berhasil diperbarui');
      void queryClient.invalidateQueries({ queryKey: ['bkk-applications-review'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui status lamaran'));
    },
  });

  const assessmentMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const form = assessmentForms[applicationId] || defaultStageFormMap();
      return humasService.saveApplicationAssessmentBoard(applicationId, {
        items: STAGE_META.map((stage) => ({
          stageCode: stage.code,
          score: form[stage.code].score ? Number(form[stage.code].score) : null,
          maxScore: form[stage.code].maxScore ? Number(form[stage.code].maxScore) : null,
          weight: form[stage.code].weight ? Number(form[stage.code].weight) : null,
          passingScore: form[stage.code].passingScore ? Number(form[stage.code].passingScore) : null,
          notes: form[stage.code].notes.trim() || null,
          assessedAt: form[stage.code].assessedAt || null,
        })),
      });
    },
    onSuccess: () => {
      toast.success('Board seleksi BKK berhasil diperbarui');
      void queryClient.invalidateQueries({ queryKey: ['bkk-applications-review'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan board seleksi BKK'));
    },
  });

  const partnerArchiveMutation = useMutation({
    mutationFn: async (applicationId: number) => {
      const form = partnerArchiveForms[applicationId] || createDefaultPartnerArchiveForm();
      return humasService.saveApplicationPartnerArchive(applicationId, {
        partnerReferenceCode: form.partnerReferenceCode.trim() || null,
        partnerHandoffNotes: form.partnerHandoffNotes.trim() || null,
        partnerDecisionNotes: form.partnerDecisionNotes.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Arsip handoff mitra berhasil diperbarui');
      void queryClient.invalidateQueries({ queryKey: ['bkk-applications-review'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan arsip handoff mitra'));
    },
  });

  const batchShortlistMutation = useMutation({
    mutationFn: async () => {
      if (vacancyIdFilter === 'ALL') {
        throw new Error('Pilih lowongan terlebih dahulu sebelum membuat batch shortlist.');
      }
      return humasService.batchShortlistApplications({
        vacancyId: vacancyIdFilter,
        applicationIds: selectedApplicationIds,
        partnerReferenceCode: batchShortlistForm.partnerReferenceCode.trim() || null,
        partnerHandoffNotes: batchShortlistForm.partnerHandoffNotes.trim() || null,
        shortlistedAt: batchShortlistForm.shortlistedAt || null,
      });
    },
    onSuccess: (response) => {
      const payload = response.data?.data as { partnerReferenceCode?: string; total?: number } | undefined;
      toast.success(
        `Batch shortlist berhasil dibuat${payload?.partnerReferenceCode ? ` (${payload.partnerReferenceCode})` : ''}.`,
      );
      setSelectedApplicationIds([]);
      setBatchShortlistForm((current) => ({
        ...createDefaultBatchShortlistForm(),
        partnerReferenceCode: payload?.partnerReferenceCode || current.partnerReferenceCode,
      }));
      void queryClient.invalidateQueries({ queryKey: ['bkk-applications-review'] });
      void queryClient.invalidateQueries({ queryKey: ['bkk-shortlist-batches'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal membuat batch shortlist'));
    },
  });

  const allSelectableIds = payload.applications.filter(canBatchShortlist).map((item) => item.id);
  const selectableCount = allSelectableIds.length;
  const allSelectedOnPage =
    selectableCount > 0 && allSelectableIds.every((id) => selectedApplicationIds.includes(id));

  return (
    <div className="space-y-6">
      {showOverview ? (
        <div className="grid gap-4 xl:grid-cols-5">
          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Total</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{payload.summary.total || payload.applications.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Reviewing</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{payload.summary.reviewing || 0}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Shortlisted</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{payload.summary.shortlisted || 0}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Interview Mitra</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{payload.summary.partnerInterview || 0}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
            <p className="text-sm text-gray-500">Diterima Mitra</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{payload.summary.hired || payload.summary.accepted || 0}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_220px_260px]">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama pelamar, username, sekolah, atau lowongan..."
          className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as 'ALL' | JobApplicationStatus)}
          className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="ALL">Semua Status</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="REVIEWING">Reviewing</option>
          <option value="SHORTLISTED">Shortlisted</option>
          <option value="PARTNER_INTERVIEW">Interview Mitra</option>
          <option value="HIRED">Diterima Mitra</option>
          <option value="INTERVIEW">Interview (Legacy)</option>
          <option value="ACCEPTED">Accepted (Legacy)</option>
          <option value="REJECTED">Rejected</option>
          <option value="WITHDRAWN">Withdrawn</option>
        </select>
        <select
          value={vacancyIdFilter}
          onChange={(event) => {
            const nextValue = event.target.value === 'ALL' ? 'ALL' : Number(event.target.value);
            setVacancyIdFilter(nextValue);
            setSelectedApplicationIds([]);
          }}
          className="rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        >
          <option value="ALL">Semua Lowongan</option>
          {(vacanciesQuery.data || []).map((vacancy) => (
            <option key={vacancy.id} value={vacancy.id}>
              {vacancy.title}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900">Batch Shortlist per Lowongan</p>
            <p className="mt-1 text-sm text-slate-600">
              Pilih satu lowongan, centang pelamar yang lolos, lalu kirim ke mitra dengan satu referensi batch.
            </p>
          </div>
          {vacancyIdFilter !== 'ALL' ? (
            <button
              type="button"
              onClick={() =>
                setSelectedApplicationIds(allSelectedOnPage ? [] : allSelectableIds)
              }
              className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
            >
              {allSelectedOnPage ? 'Kosongkan Pilihan' : 'Pilih Semua di Halaman'}
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)_220px_auto]">
          <input
            value={batchShortlistForm.partnerReferenceCode}
            onChange={(event) =>
              setBatchShortlistForm((prev) => ({
                ...prev,
                partnerReferenceCode: event.target.value,
              }))
            }
            placeholder="Kode batch, opsional"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <textarea
            rows={2}
            value={batchShortlistForm.partnerHandoffNotes}
            onChange={(event) =>
              setBatchShortlistForm((prev) => ({
                ...prev,
                partnerHandoffNotes: event.target.value,
              }))
            }
            placeholder="Catatan saat batch dikirim ke mitra industri"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="date"
            value={batchShortlistForm.shortlistedAt}
            onChange={(event) =>
              setBatchShortlistForm((prev) => ({
                ...prev,
                shortlistedAt: event.target.value,
              }))
            }
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => batchShortlistMutation.mutate()}
            disabled={vacancyIdFilter === 'ALL' || selectedApplicationIds.length === 0 || batchShortlistMutation.isPending}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {batchShortlistMutation.isPending ? 'Memproses...' : `Shortlist ${selectedApplicationIds.length} Pelamar`}
          </button>
        </div>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          {vacancyIdFilter === 'ALL'
            ? 'Pilih lowongan terlebih dahulu agar sistem memastikan seluruh batch berasal dari lowongan yang sama.'
            : `${selectedApplicationIds.length} pelamar terpilih dari lowongan ini.`}
        </p>
      </div>

      {vacancyIdFilter !== 'ALL' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900">Batch Shortlist Tersimpan</p>
              <p className="mt-1 text-sm text-slate-500">
                Daftar batch resmi yang pernah dikirim ke mitra untuk lowongan ini.
              </p>
            </div>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
              {shortlistBatchesQuery.data?.length || 0} batch
            </span>
          </div>

          {shortlistBatchesQuery.isLoading ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Memuat daftar batch shortlist...
            </div>
          ) : (shortlistBatchesQuery.data || []).length > 0 ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {(shortlistBatchesQuery.data || []).map((batch) => (
                <div key={`${batch.vacancyId}-${batch.partnerReferenceCode}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
                        {batch.vacancy.industryPartner?.name || batch.vacancy.companyName || 'Perusahaan umum'}
                      </p>
                      <p className="mt-2 text-base font-semibold text-slate-900">{batch.partnerReferenceCode}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {batch.shortlistedAt
                          ? `Dibuat ${new Date(batch.shortlistedAt).toLocaleString('id-ID')}`
                          : `Diperbarui ${new Date(batch.updatedAt).toLocaleString('id-ID')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => window.open(getShortlistBatchPrintPath(batch.vacancyId, batch.partnerReferenceCode), '_blank', 'noopener,noreferrer')}
                      className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                    >
                      Cetak Batch
                    </button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-white/70 bg-white p-3 text-sm text-slate-600">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Total</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{batch.total}</p>
                    </div>
                    <div className="rounded-xl border border-white/70 bg-white p-3 text-sm text-slate-600">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Interview Mitra</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{batch.summary.partnerInterview || 0}</p>
                    </div>
                    <div className="rounded-xl border border-white/70 bg-white p-3 text-sm text-slate-600">
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Diterima</p>
                      <p className="mt-1 text-xl font-semibold text-slate-900">{batch.summary.hired || batch.summary.accepted || 0}</p>
                    </div>
                  </div>

                  {batch.partnerHandoffNotes ? (
                    <p className="mt-3 text-sm leading-6 text-slate-600">{batch.partnerHandoffNotes}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
              Belum ada batch shortlist untuk lowongan ini.
            </div>
          )}
        </div>
      ) : null}

      {applicationsQuery.isLoading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-600">Memuat lamaran...</div>
      ) : payload.applications.length > 0 ? (
        <div className="space-y-4">
          {payload.applications.map((item) => (
            <section key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-3">
                  {vacancyIdFilter !== 'ALL' ? (
                    <input
                      type="checkbox"
                      checked={selectedApplicationIds.includes(item.id)}
                      disabled={!canBatchShortlist(item)}
                      onChange={(event) =>
                        setSelectedApplicationIds((current) => {
                          if (event.target.checked) return Array.from(new Set([...current, item.id]));
                          return current.filter((value) => value !== item.id);
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  ) : null}
                  <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{resolveCompanyName(item.vacancy)}</p>
                  <h3 className="mt-2 text-lg font-semibold text-gray-900">{item.vacancy.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">
                    Pelamar: <span className="font-semibold text-gray-800">{item.applicant.name}</span> (@{item.applicant.username})
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Kontak: {item.applicant.phone || '-'} • {item.applicant.email || '-'}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Pendidikan: {item.profile?.educationLevel || '-'} • {item.profile?.schoolName || '-'} • {item.profile?.major || '-'}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">
                    Dikirim: {new Date(item.appliedAt).toLocaleString('id-ID')}
                  </p>
                  </div>
                </div>
                <ApplicationStatusBadge status={item.status} />
              </div>

              {item.coverLetter?.trim() ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Cover Letter</p>
                  <p className="mt-2 whitespace-pre-line">{item.coverLetter}</p>
                </div>
              ) : null}

              {item.reviewerNotes?.trim() ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Catatan Petugas</p>
                  <p className="mt-2 whitespace-pre-line">{item.reviewerNotes}</p>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-900">Timeline Pipeline BKK</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Masuk</p>
                    <p className="mt-2 text-sm text-slate-700">{new Date(item.appliedAt).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Shortlist</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {item.shortlistedAt ? new Date(item.shortlistedAt).toLocaleString('id-ID') : 'Belum'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Interview Mitra</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {item.partnerInterviewAt ? new Date(item.partnerInterviewAt).toLocaleString('id-ID') : 'Belum'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Keputusan Final</p>
                    <p className="mt-2 text-sm text-slate-700">
                      {item.finalizedAt ? new Date(item.finalizedAt).toLocaleString('id-ID') : 'Belum'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Arsip Handoff Mitra</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Simpan kode referensi shortlist, catatan pengiriman ke mitra, dan hasil keputusan partner.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => partnerArchiveMutation.mutate(item.id)}
                    disabled={partnerArchiveMutation.isPending && partnerArchiveMutation.variables === item.id}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {partnerArchiveMutation.isPending && partnerArchiveMutation.variables === item.id
                      ? 'Menyimpan...'
                      : 'Simpan Arsip Mitra'}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                  <input
                    value={partnerArchiveForms[item.id]?.partnerReferenceCode || ''}
                    onChange={(event) =>
                      setPartnerArchiveForms((prev) => ({
                        ...prev,
                        [item.id]: {
                          ...(prev[item.id] || createDefaultPartnerArchiveForm()),
                          partnerReferenceCode: event.target.value,
                        },
                      }))
                    }
                    placeholder="Kode batch / referensi ke mitra"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <textarea
                      rows={4}
                      value={partnerArchiveForms[item.id]?.partnerHandoffNotes || ''}
                      onChange={(event) =>
                        setPartnerArchiveForms((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || createDefaultPartnerArchiveForm()),
                            partnerHandoffNotes: event.target.value,
                          },
                        }))
                      }
                      placeholder="Catatan saat pelamar diserahkan ke mitra industri"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                    <textarea
                      rows={4}
                      value={partnerArchiveForms[item.id]?.partnerDecisionNotes || ''}
                      onChange={(event) =>
                        setPartnerArchiveForms((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || createDefaultPartnerArchiveForm()),
                            partnerDecisionNotes: event.target.value,
                          },
                        }))
                      }
                      placeholder="Catatan keputusan / umpan balik resmi dari mitra"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">Board Seleksi BKK</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Tahapan seleksi ini bisa dipakai bersama sekolah dan mitra industri untuk menyimpan nilai proses rekrutmen.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => assessmentMutation.mutate(item.id)}
                    disabled={assessmentMutation.isPending && assessmentMutation.variables === item.id}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {assessmentMutation.isPending && assessmentMutation.variables === item.id
                      ? 'Menyimpan...'
                      : 'Simpan Board'}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {STAGE_META.map((stage) => {
                    const stageItem = item.assessmentBoard?.items.find((entry) => entry.code === stage.code);
                    const form = assessmentForms[item.id]?.[stage.code] || defaultStageFormMap()[stage.code];
                    return (
                      <div key={stage.code} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{stage.title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{stage.description}</p>
                          </div>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              stageItem?.completed
                                ? stageItem.passed === false
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {stageItem?.completed ? (stageItem.passed === false ? 'Perlu atensi' : 'Tercatat') : 'Belum ada'}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <input
                            type="number"
                            min="0"
                            value={form.score}
                            onChange={(event) =>
                              setAssessmentForms((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...(prev[item.id] || defaultStageFormMap()),
                                  [stage.code]: {
                                    ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                    score: event.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="Skor"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                          <input
                            type="number"
                            min="1"
                            value={form.maxScore}
                            onChange={(event) =>
                              setAssessmentForms((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...(prev[item.id] || defaultStageFormMap()),
                                  [stage.code]: {
                                    ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                    maxScore: event.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="Maks"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                          <input
                            type="number"
                            min="1"
                            value={form.weight}
                            onChange={(event) =>
                              setAssessmentForms((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...(prev[item.id] || defaultStageFormMap()),
                                  [stage.code]: {
                                    ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                    weight: event.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="Bobot"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                          <input
                            type="number"
                            min="0"
                            value={form.passingScore}
                            onChange={(event) =>
                              setAssessmentForms((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...(prev[item.id] || defaultStageFormMap()),
                                  [stage.code]: {
                                    ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                    passingScore: event.target.value,
                                  },
                                },
                              }))
                            }
                            placeholder="Ambang"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <input
                          type="date"
                          value={form.assessedAt}
                          onChange={(event) =>
                            setAssessmentForms((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] || defaultStageFormMap()),
                                [stage.code]: {
                                  ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                  assessedAt: event.target.value,
                                },
                              },
                            }))
                          }
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />

                        <textarea
                          rows={3}
                          value={form.notes}
                          onChange={(event) =>
                            setAssessmentForms((prev) => ({
                              ...prev,
                              [item.id]: {
                                ...(prev[item.id] || defaultStageFormMap()),
                                [stage.code]: {
                                  ...((prev[item.id] || defaultStageFormMap())[stage.code]),
                                  notes: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="Catatan tahap seleksi"
                          className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Ringkasan Seleksi</p>
                  <p className="mt-2">Tahap selesai: {item.assessmentBoard?.summary.completedStages || 0}/{item.assessmentBoard?.summary.totalStages || STAGE_META.length}</p>
                  <p>Nilai akhir berbobot: {item.assessmentBoard?.summary.weightedAverage ?? '-'}</p>
                  <p>
                    Rekomendasi:{' '}
                    <span className="font-semibold text-slate-900">
                      {item.assessmentBoard?.summary.recommendation === 'PASS'
                        ? 'Lanjut / lolos tahap nilai'
                        : item.assessmentBoard?.summary.recommendation === 'FAIL'
                          ? 'Perlu evaluasi / tidak lolos nilai'
                          : 'Tahap belum lengkap'}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {REVIEW_FLOW_STATUSES.map((nextStatus) => {
                  const active = item.status === nextStatus;
                  const meta = REVIEW_FLOW_STATUS_META[nextStatus];
                  return (
                    <button
                      key={nextStatus}
                      type="button"
                      onClick={() => statusMutation.mutate({ applicationId: item.id, nextStatus })}
                      disabled={statusMutation.isPending && statusMutation.variables?.applicationId === item.id}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? 'bg-slate-900 text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {statusMutation.isPending && statusMutation.variables?.applicationId === item.id && statusMutation.variables?.nextStatus === nextStatus
                        ? 'Menyimpan...'
                        : meta.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {item.status in REVIEW_FLOW_STATUS_META
                  ? REVIEW_FLOW_STATUS_META[item.status as ReviewableJobApplicationStatus].description
                  : 'Status ini berasal dari data lama dan tetap dipertahankan agar histori seleksi tetap terbaca.'}
              </p>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
          Belum ada lamaran masuk pada filter saat ini.
        </div>
      )}
    </div>
  );
}
