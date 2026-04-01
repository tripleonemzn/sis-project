import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  candidateAdmissionService,
  type CandidateAdmissionStatus,
} from '../../../services/candidateAdmission.service';
import { majorService, type Major } from '../../../services/major.service';
import {
  ADMIN_CANDIDATE_ADMISSION_QUERY_KEY,
  formatCandidateDateTime,
  formatCandidateCurrency,
  CandidateAdmissionStatusBadge,
  CandidateInfoCard,
  VerificationBadge,
  extractCandidateAdmissionListPayload,
  extractCandidateAdmissionPayload,
  getCandidateFinanceSummaryMeta,
  getCandidateDecisionLetterPrintPath,
  getCandidateSelectionStatusMeta,
} from '../../public/candidateShared';

const STATUS_OPTIONS: Array<{ value: CandidateAdmissionStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Dikirim' },
  { value: 'UNDER_REVIEW', label: 'Direview' },
  { value: 'NEEDS_REVISION', label: 'Perlu Revisi' },
  { value: 'TEST_SCHEDULED', label: 'Tes Dijadwalkan' },
  { value: 'PASSED_TEST', label: 'Lulus Tes' },
  { value: 'FAILED_TEST', label: 'Belum Lulus Tes' },
  { value: 'ACCEPTED', label: 'Diterima' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const REVIEW_OPTIONS: Array<{ value: CandidateAdmissionStatus; label: string }> = [
  { value: 'UNDER_REVIEW', label: 'Direview' },
  { value: 'NEEDS_REVISION', label: 'Perlu Revisi' },
  { value: 'TEST_SCHEDULED', label: 'Tes Dijadwalkan' },
  { value: 'PASSED_TEST', label: 'Lulus Tes' },
  { value: 'FAILED_TEST', label: 'Belum Lulus Tes' },
  { value: 'ACCEPTED', label: 'Diterima' },
  { value: 'REJECTED', label: 'Ditolak' },
];

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const anyErr = error as { response?: { data?: { message?: string } }; message?: string };
    return anyErr.response?.data?.message || anyErr.message || fallback;
  }
  return fallback;
};

type ReviewForm = {
  status: CandidateAdmissionStatus;
  reviewNotes: string;
  decisionTitle: string;
  decisionSummary: string;
  decisionNextSteps: string;
};

type ManualAssessmentKey = 'LITERACY_COLOR' | 'INTERVIEW' | 'PHYSICAL';

type ManualAssessmentForm = Record<
  ManualAssessmentKey,
  {
    score: string;
    maxScore: string;
    weight: string;
    passingScore: string;
    notes: string;
    assessedAt: string;
  }
>;

const MANUAL_ASSESSMENT_META: Array<{ code: ManualAssessmentKey; title: string; description: string }> = [
  {
    code: 'LITERACY_COLOR',
    title: 'Tes Buta Huruf & Warna',
    description: 'Nilai observasi dasar untuk membaca sederhana, pengenalan huruf, dan pemeriksaan warna.',
  },
  {
    code: 'INTERVIEW',
    title: 'Tes Wawancara',
    description: 'Nilai komunikasi, motivasi, kesiapan belajar, dan kecocokan umum calon siswa.',
  },
  {
    code: 'PHYSICAL',
    title: 'Tes Fisik',
    description: 'Nilai kebugaran atau aspek fisik yang memang dipakai panitia sebagai komponen seleksi.',
  },
];

const createEmptyAssessmentForm = (): ManualAssessmentForm => ({
  LITERACY_COLOR: { score: '', maxScore: '100', weight: '15', passingScore: '70', notes: '', assessedAt: '' },
  INTERVIEW: { score: '', maxScore: '100', weight: '25', passingScore: '70', notes: '', assessedAt: '' },
  PHYSICAL: { score: '', maxScore: '100', weight: '20', passingScore: '70', notes: '', assessedAt: '' },
});

const toDateInputValue = (value?: string | null) => (value ? String(value).slice(0, 10) : '');

export const CandidateAdmissionReviewPage = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CandidateAdmissionStatus | 'ALL'>('ALL');
  const [majorFilter, setMajorFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reviewForm, setReviewForm] = useState<ReviewForm>({
    status: 'UNDER_REVIEW',
    reviewNotes: '',
    decisionTitle: '',
    decisionSummary: '',
    decisionNextSteps: '',
  });
  const [assessmentForm, setAssessmentForm] = useState<ManualAssessmentForm>(createEmptyAssessmentForm);

  const majorsQuery = useQuery({
    queryKey: ['admin-candidate-admission-majors'],
    queryFn: async () => {
      const response = await majorService.list({ page: 1, limit: 100 });
      return (response?.data?.majors || []) as Major[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const listQuery = useQuery({
    queryKey: [...ADMIN_CANDIDATE_ADMISSION_QUERY_KEY, page, search, statusFilter, majorFilter],
    queryFn: async () =>
      candidateAdmissionService.listAdmissions({
        page,
        limit: 12,
        search: search.trim() || undefined,
        status: statusFilter,
        desiredMajorId: majorFilter === 'ALL' ? 'ALL' : Number(majorFilter),
      }),
  });

  const listPayload = useMemo(
    () => extractCandidateAdmissionListPayload(listQuery.data),
    [listQuery.data],
  );

  useEffect(() => {
    if (!listPayload.applications.length) {
      setSelectedId(null);
      return;
    }
    const stillExists = listPayload.applications.some((item) => item.id === selectedId);
    if (!stillExists) {
      setSelectedId(listPayload.applications[0].id);
    }
  }, [listPayload.applications, selectedId]);

  const detailQuery = useQuery({
    queryKey: ['admin-candidate-admission-detail', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => candidateAdmissionService.getAdmissionById(selectedId as number),
  });

  const detail = useMemo(
    () => extractCandidateAdmissionPayload(detailQuery.data),
    [detailQuery.data],
  );

  useEffect(() => {
    if (!detail) return;
    const nextStatus = REVIEW_OPTIONS.some((item) => item.value === detail.status)
      ? detail.status
      : 'UNDER_REVIEW';
    setReviewForm({
      status: nextStatus,
      reviewNotes: detail.reviewNotes || '',
      decisionTitle: detail.decisionTitle || '',
      decisionSummary: detail.decisionSummary || '',
      decisionNextSteps: detail.decisionNextSteps || '',
    });

    const nextAssessmentForm = createEmptyAssessmentForm();
    (detail.assessmentBoard?.items || []).forEach((item) => {
      if (!MANUAL_ASSESSMENT_META.some((meta) => meta.code === item.code)) return;
      const code = item.code as ManualAssessmentKey;
      nextAssessmentForm[code] = {
        score: item.rawScore != null ? String(item.rawScore) : item.score != null ? String(item.score) : '',
        maxScore: item.maxScore != null ? String(item.maxScore) : '100',
        weight: item.weight != null ? String(item.weight) : nextAssessmentForm[code].weight,
        passingScore:
          item.passingScore != null ? String(item.passingScore) : nextAssessmentForm[code].passingScore,
        notes: item.notes || '',
        assessedAt: toDateInputValue(item.assessedAt),
      };
    });
    setAssessmentForm(nextAssessmentForm);
  }, [detail]);

  const reviewMutation = useMutation({
    mutationFn: async (mode: 'save' | 'publish' | 'unpublish') => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      const payload: Parameters<typeof candidateAdmissionService.reviewAdmission>[1] = {
        status: reviewForm.status,
        reviewNotes: reviewForm.reviewNotes.trim() || undefined,
        decisionTitle: reviewForm.decisionTitle.trim() || undefined,
        decisionSummary: reviewForm.decisionSummary.trim() || undefined,
        decisionNextSteps: reviewForm.decisionNextSteps.trim() || undefined,
      };
      if (mode === 'publish') {
        payload.publishDecision = true;
      } else if (mode === 'unpublish') {
        payload.publishDecision = false;
      }
      return candidateAdmissionService.reviewAdmission(selectedId, payload);
    },
    onSuccess: async (_data, mode) => {
      toast.success(
        mode === 'publish'
          ? 'Pengumuman hasil seleksi berhasil dipublikasikan'
          : mode === 'unpublish'
            ? 'Publikasi hasil seleksi berhasil ditarik'
            : 'Status PPDB berhasil diperbarui',
      );
      await queryClient.invalidateQueries({ queryKey: ADMIN_CANDIDATE_ADMISSION_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['admin-candidate-admission-detail', selectedId] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal memperbarui status PPDB'));
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      return candidateAdmissionService.acceptAsStudent(selectedId);
    },
    onSuccess: async () => {
      toast.success('Calon siswa berhasil diaktifkan menjadi akun siswa resmi');
      await queryClient.invalidateQueries({ queryKey: ADMIN_CANDIDATE_ADMISSION_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['admin-candidate-admission-detail', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ['users', 'verification'] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal mempromosikan calon siswa'));
    },
  });

  const assessmentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Pilih calon siswa terlebih dahulu.');
      return candidateAdmissionService.saveAssessmentBoard(selectedId, {
        items: MANUAL_ASSESSMENT_META.map((meta) => ({
          componentCode: meta.code,
          score: assessmentForm[meta.code].score ? Number(assessmentForm[meta.code].score) : null,
          maxScore: assessmentForm[meta.code].maxScore ? Number(assessmentForm[meta.code].maxScore) : null,
          weight: assessmentForm[meta.code].weight ? Number(assessmentForm[meta.code].weight) : null,
          passingScore: assessmentForm[meta.code].passingScore
            ? Number(assessmentForm[meta.code].passingScore)
            : null,
          notes: assessmentForm[meta.code].notes.trim() || null,
          assessedAt: assessmentForm[meta.code].assessedAt || null,
        })),
      });
    },
    onSuccess: async () => {
      toast.success('Komponen tes PPDB berhasil diperbarui');
      await queryClient.invalidateQueries({ queryKey: ['admin-candidate-admission-detail', selectedId] });
      await queryClient.invalidateQueries({ queryKey: ADMIN_CANDIDATE_ADMISSION_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan komponen tes PPDB'));
    },
  });

  const summary = listPayload.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">PPDB Calon Siswa</h1>
          <p className="text-gray-500">
            Admin dapat mereview formulir calon siswa, memberi catatan perbaikan, dan mempromosikan yang sudah
            diterima menjadi akun siswa resmi.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        <CandidateInfoCard title="Total Pendaftar">
          <p className="text-3xl font-semibold text-slate-900">{summary.total}</p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Perlu Tindakan">
          <p className="text-3xl font-semibold text-slate-900">
            {summary.submitted + summary.needsRevision + summary.testScheduled}
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Direview">
          <p className="text-3xl font-semibold text-slate-900">{summary.underReview}</p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Lulus / Diterima">
          <p className="text-3xl font-semibold text-slate-900">{summary.passedTest + summary.accepted}</p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Ditolak / Tidak Lulus">
          <p className="text-3xl font-semibold text-slate-900">{summary.failedTest + summary.rejected}</p>
        </CandidateInfoCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Cari nama, NISN, atau nomor pendaftaran..."
                className="w-full rounded-2xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as CandidateAdmissionStatus | 'ALL');
                  setPage(1);
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                {STATUS_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                value={majorFilter}
                onChange={(event) => {
                  setMajorFilter(event.target.value);
                  setPage(1);
                }}
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="ALL">Semua Jurusan</option>
                {(majorsQuery.data || []).map((major) => (
                  <option key={major.id} value={major.id}>
                    {major.code} - {major.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {listQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : listPayload.applications.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-slate-500">
              Belum ada pendaftaran calon siswa yang sesuai filter ini.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Calon Siswa</th>
                    <th className="px-5 py-3">Jurusan</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Kelengkapan</th>
                    <th className="px-5 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {listPayload.applications.map((item) => (
                    <tr key={item.id} className={selectedId === item.id ? 'bg-blue-50/60' : 'hover:bg-slate-50'}>
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900">{item.user.name}</div>
                        <div className="text-xs text-slate-500">
                          {item.registrationNumber} • {item.user.nisn || item.user.username}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {item.desiredMajor ? `${item.desiredMajor.code} - ${item.desiredMajor.name}` : '-'}
                      </td>
                      <td className="px-5 py-4">
                        <CandidateAdmissionStatusBadge status={item.status} />
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        <div className="font-medium text-slate-900">{item.completeness.percent}%</div>
                        <div className="text-xs text-slate-500">{item.documentCount} dokumen</div>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-4 text-sm text-slate-500">
            <div>
              Halaman {listPayload.page} dari {Math.max(1, listPayload.totalPages)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Sebelumnya
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(listPayload.totalPages || 1, prev + 1))}
                disabled={page >= (listPayload.totalPages || 1)}
                className="rounded-xl border border-slate-200 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          {!selectedId ? (
            <div className="py-20 text-center text-sm text-slate-500">
              Pilih salah satu calon siswa untuk melihat detail review.
            </div>
          ) : detailQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : !detail ? (
            <div className="py-20 text-center text-sm text-slate-500">Detail pendaftaran tidak ditemukan.</div>
          ) : (
            <div className="space-y-5">
              {(() => {
                const financeSummary = detail.financeSummary;
                const financeMeta = getCandidateFinanceSummaryMeta(financeSummary?.state);
                return (
                  <>
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-slate-900">{detail.user.name}</h2>
                  <CandidateAdmissionStatusBadge status={detail.status} />
                  <VerificationBadge status={detail.accountVerificationStatus} />
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {detail.registrationNumber} • {detail.user.nisn || detail.user.username}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <CandidateInfoCard title="Kontak">
                  <p>{detail.user.phone || '-'}</p>
                  <p>{detail.user.email || '-'}</p>
                  <p>{detail.user.address || '-'}</p>
                </CandidateInfoCard>
                <CandidateInfoCard title="PPDB">
                  <p>Asal sekolah: {detail.previousSchool || '-'}</p>
                  <p>Jurusan tujuan: {detail.desiredMajor ? `${detail.desiredMajor.code} - ${detail.desiredMajor.name}` : '-'}</p>
                  <p>
                    Dokumen wajib: {detail.documentChecklist.summary.requiredUploaded}/
                    {detail.documentChecklist.summary.requiredTotal}
                  </p>
                </CandidateInfoCard>
                <CandidateInfoCard title="Administrasi Keuangan">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${financeMeta.className}`}>
                    {financeMeta.label}
                  </span>
                  <p className="mt-3 text-2xl font-semibold text-slate-900">
                    {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    {financeSummary?.state === 'NO_BILLING'
                      ? 'Belum ada tagihan administrasi yang diterbitkan untuk calon siswa ini.'
                      : financeSummary?.hasOverdue
                        ? `${financeSummary.overdueInvoices} tagihan sudah lewat jatuh tempo.`
                        : financeSummary?.hasOutstanding
                          ? `${financeSummary.activeInvoices} tagihan masih aktif.`
                          : 'Tagihan administrasi untuk akun ini sudah clear.'}
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    <p>Tagihan aktif: {financeSummary?.activeInvoices || 0}</p>
                    <p>Jatuh tempo terdekat: {formatCandidateDateTime(financeSummary?.nextDueDate)}</p>
                    <p>Pembayaran terakhir: {formatCandidateDateTime(financeSummary?.lastPaymentAt)}</p>
                  </div>
                </CandidateInfoCard>
              </div>

              <CandidateInfoCard title="Kelengkapan">
                <p className="font-semibold text-slate-900">
                  {detail.completeness.completedCount}/{detail.completeness.totalFields} komponen
                </p>
                <p className="mt-2">
                  {detail.completeness.isReady
                    ? 'Formulir inti sudah lengkap.'
                    : `Masih kurang: ${detail.completeness.missingFields.join(', ')}.`}
                </p>
              </CandidateInfoCard>

              <div className="grid gap-4 md:grid-cols-2">
                <CandidateInfoCard title="Checklist Dokumen PPDB">
                  <div className="space-y-3">
                    {detail.documentChecklist.required.map((item) => (
                      <div key={item.code}>
                        <p className="font-semibold text-slate-900">{item.label}</p>
                        <p className="text-xs text-slate-500">
                          {item.isComplete ? `${item.validUploadedCount} file valid terunggah` : 'Belum ada file valid'}
                        </p>
                        {item.invalidCount > 0 ? (
                          <p className="text-xs text-rose-600">
                            {item.invalidCount} file salah format. Gunakan {item.acceptedFormats.join(', ')}.
                          </p>
                        ) : null}
                      </div>
                    ))}
                    {detail.documentChecklist.summary.uncategorizedCount ? (
                      <p className="text-xs text-amber-600">
                        Ada {detail.documentChecklist.summary.uncategorizedCount} dokumen tanpa kategori PPDB yang tepat.
                      </p>
                    ) : null}
                    {detail.documentChecklist.summary.invalidCount ? (
                      <p className="text-xs text-rose-600">
                        Total {detail.documentChecklist.summary.invalidCount} dokumen PPDB perlu diperbaiki formatnya.
                      </p>
                    ) : null}
                  </div>
                </CandidateInfoCard>
                <CandidateInfoCard title="Ringkasan Tes Seleksi">
                  <p>Total sesi: {detail.selectionResults?.summary.total || 0}</p>
                  <p>Selesai: {detail.selectionResults?.summary.completed || 0}</p>
                  <p>Lulus: {detail.selectionResults?.summary.passed || 0}</p>
                  <p>Belum lulus: {detail.selectionResults?.summary.failed || 0}</p>
                  <p>Rata-rata skor: {detail.selectionResults?.summary.averageScore ?? '-'}</p>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Board Penilaian</p>
                    <p className="mt-2 text-sm text-slate-600">
                      Komponen selesai: {detail.assessmentBoard?.summary.completedComponents || 0}/
                      {detail.assessmentBoard?.summary.totalComponents || 0}
                    </p>
                    <p className="text-sm text-slate-600">
                      Nilai akhir berbobot: {detail.assessmentBoard?.summary.weightedAverage ?? '-'}
                    </p>
                    <p className="text-sm text-slate-600">
                      Rekomendasi:{' '}
                      <span className="font-semibold text-slate-900">
                        {detail.assessmentBoard?.summary.recommendation === 'PASS'
                          ? 'Lulus tes'
                          : detail.assessmentBoard?.summary.recommendation === 'FAIL'
                            ? 'Belum lulus tes'
                            : 'Belum lengkap'}
                      </span>
                    </p>
                  </div>
                </CandidateInfoCard>
              </div>

              {financeSummary?.invoices?.length ? (
                <CandidateInfoCard title="Riwayat Tagihan Administrasi">
                  <div className="space-y-3">
                    {financeSummary.invoices.slice(0, 4).map((invoice) => (
                      <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{invoice.label}</p>
                            <p className="text-xs text-slate-500">
                              {invoice.invoiceNo} • {invoice.periodKey}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-slate-900">
                            {formatCandidateCurrency(invoice.balanceAmount)}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                          <p>Total: {formatCandidateCurrency(invoice.totalAmount)}</p>
                          <p>Terbayar: {formatCandidateCurrency(invoice.paidAmount)}</p>
                          <p>Status: {invoice.status}</p>
                          <p>Jatuh tempo: {formatCandidateDateTime(invoice.dueDate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CandidateInfoCard>
              ) : null}

              <CandidateInfoCard title="Riwayat Tes Seleksi">
                {!detail.selectionResults?.results.length ? (
                  <p>Belum ada hasil tes seleksi yang terekam untuk calon siswa ini.</p>
                ) : (
                  <div className="space-y-3">
                    {detail.selectionResults.results.map((item) => {
                      const statusMeta = getCandidateSelectionStatusMeta(item.status, item.passed);
                      return (
                        <div key={item.sessionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-semibold text-slate-900">{item.title}</p>
                              <p className="text-xs text-slate-500">
                                {item.subject?.name || item.programCode || 'Tes Seleksi'} •{' '}
                                {formatCandidateDateTime(item.scheduleStartTime)}
                              </p>
                            </div>
                            <span
                              className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusMeta.className}`}
                            >
                              {statusMeta.label}
                            </span>
                          </div>
                          <div className="mt-2 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
                            <p>Skor: {item.score ?? '-'}</p>
                            <p>KKM: {item.kkm ?? '-'}</p>
                            <p>Mulai: {formatCandidateDateTime(item.startedAt)}</p>
                            <p>Submit: {formatCandidateDateTime(item.submittedAt)}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CandidateInfoCard>

              <CandidateInfoCard title="Board Penilaian PPDB">
                <div className="grid gap-3 md:grid-cols-2">
                  {(detail.assessmentBoard?.items || []).map((item) => (
                    <div key={item.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{item.title}</p>
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                            item.completed
                              ? item.passed === false
                                ? 'bg-rose-100 text-rose-700'
                                : 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {item.completed ? (item.passed === false ? 'Perlu atensi' : 'Tercatat') : 'Menunggu nilai'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-slate-600">
                        <p>Sumber: {item.sourceType}</p>
                        <p>Skor: {item.score ?? '-'} / 100</p>
                        <p>Bobot: {item.weight}</p>
                        <p>Ambang lulus: {item.passingScore ?? '-'}</p>
                        {item.notes ? <p>Catatan: {item.notes}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Ringkasan board</p>
                  <p className="mt-2">
                    Nilai akhir berbobot: <span className="font-semibold text-slate-900">{detail.assessmentBoard?.summary.weightedAverage ?? '-'}</span>
                  </p>
                  <p>
                    Komponen belum lengkap:{' '}
                    {detail.assessmentBoard?.summary.incompleteComponents.length
                      ? detail.assessmentBoard.summary.incompleteComponents.join(', ')
                      : 'Tidak ada'}
                  </p>
                  <p>
                    Komponen di bawah ambang:{' '}
                    {detail.assessmentBoard?.summary.failedComponents.length
                      ? detail.assessmentBoard.summary.failedComponents.join(', ')
                      : 'Tidak ada'}
                  </p>
                </div>
              </CandidateInfoCard>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">Input Nilai Manual Tes PPDB</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Komponen CBT/TKD diambil otomatis dari hasil ujian calon siswa. Isi komponen manual berikut untuk melengkapi board seleksi.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => assessmentMutation.mutate()}
                    disabled={assessmentMutation.isPending}
                    className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {assessmentMutation.isPending ? 'Menyimpan nilai...' : 'Simpan Nilai Manual'}
                  </button>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  {MANUAL_ASSESSMENT_META.map((meta) => {
                    const form = assessmentForm[meta.code];
                    return (
                      <div key={meta.code} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <p className="font-semibold text-slate-900">{meta.title}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{meta.description}</p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Skor</label>
                            <input
                              type="number"
                              min="0"
                              value={form.score}
                              onChange={(event) =>
                                setAssessmentForm((prev) => ({
                                  ...prev,
                                  [meta.code]: { ...prev[meta.code], score: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Maksimum</label>
                            <input
                              type="number"
                              min="1"
                              value={form.maxScore}
                              onChange={(event) =>
                                setAssessmentForm((prev) => ({
                                  ...prev,
                                  [meta.code]: { ...prev[meta.code], maxScore: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bobot</label>
                            <input
                              type="number"
                              min="1"
                              value={form.weight}
                              onChange={(event) =>
                                setAssessmentForm((prev) => ({
                                  ...prev,
                                  [meta.code]: { ...prev[meta.code], weight: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Ambang Lulus</label>
                            <input
                              type="number"
                              min="0"
                              value={form.passingScore}
                              onChange={(event) =>
                                setAssessmentForm((prev) => ({
                                  ...prev,
                                  [meta.code]: { ...prev[meta.code], passingScore: event.target.value },
                                }))
                              }
                              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Tanggal Penilaian</label>
                          <input
                            type="date"
                            value={form.assessedAt}
                            onChange={(event) =>
                              setAssessmentForm((prev) => ({
                                ...prev,
                                [meta.code]: { ...prev[meta.code], assessedAt: event.target.value },
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>

                        <div className="mt-3">
                          <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Catatan</label>
                          <textarea
                            rows={3}
                            value={form.notes}
                            onChange={(event) =>
                              setAssessmentForm((prev) => ({
                                ...prev,
                                [meta.code]: { ...prev[meta.code], notes: event.target.value },
                              }))
                            }
                            className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <CandidateInfoCard title="Pengumuman Hasil Seleksi">
                {detail.decisionAnnouncement.isPublished ? (
                  <div className="space-y-2">
                    <p className="font-semibold text-slate-900">
                      {detail.decisionAnnouncement.title || 'Pengumuman Hasil Seleksi'}
                    </p>
                    <p>{detail.decisionAnnouncement.summary || '-'}</p>
                    {detail.decisionAnnouncement.nextSteps ? (
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">Langkah berikutnya:</span>{' '}
                        {detail.decisionAnnouncement.nextSteps}
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-500">
                      Dipublikasikan: {formatCandidateDateTime(detail.decisionAnnouncement.publishedAt)}
                    </p>
                  </div>
                ) : detail.canPublishDecision ? (
                  <p>
                    Status saat ini sudah memenuhi syarat untuk publikasi hasil. Simpan draft pengumuman di bawah,
                    lalu tekan tombol publikasikan jika sudah final.
                  </p>
                ) : (
                  <p>
                    Pengumuman hasil seleksi belum bisa dipublikasikan karena status saat ini belum final.
                  </p>
                )}
              </CandidateInfoCard>

              <CandidateInfoCard title="Surat Hasil Seleksi">
                <p>
                  {detail.decisionLetter.isDraftAvailable
                    ? detail.decisionLetter.isFinalized
                      ? `Draft surat sudah difinalkan dengan nomor ${detail.decisionLetter.letterNumber || '-'}`
                      : 'Draft surat otomatis siap dicetak dari portal web.'
                    : 'Surat hasil seleksi akan tersedia setelah hasil resmi dipublikasikan.'}
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {detail.decisionLetter.isDraftAvailable ? (
                    <a
                      href={getCandidateDecisionLetterPrintPath(detail.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Buka Draft Surat
                    </a>
                  ) : null}
                  {detail.decisionLetter.officialFileUrl ? (
                    <a
                      href={detail.decisionLetter.officialFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                    >
                      Buka Surat Resmi
                    </a>
                  ) : null}
                </div>
              </CandidateInfoCard>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <label className="block text-sm font-semibold text-slate-800">Status Review</label>
                <select
                  value={reviewForm.status}
                  onChange={(event) =>
                    setReviewForm((prev) => ({
                      ...prev,
                      status: event.target.value as CandidateAdmissionStatus,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                >
                  {REVIEW_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <label className="mt-4 block text-sm font-semibold text-slate-800">Catatan Review</label>
                <textarea
                  value={reviewForm.reviewNotes}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, reviewNotes: event.target.value }))
                  }
                  rows={5}
                  placeholder="Tulis catatan untuk calon siswa atau operator sekolah"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <label className="mt-4 block text-sm font-semibold text-slate-800">Judul Pengumuman</label>
                <input
                  value={reviewForm.decisionTitle}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, decisionTitle: event.target.value }))
                  }
                  placeholder="Contoh: Pengumuman Kelulusan PPDB"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <label className="mt-4 block text-sm font-semibold text-slate-800">Ringkasan Pengumuman</label>
                <textarea
                  value={reviewForm.decisionSummary}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, decisionSummary: event.target.value }))
                  }
                  rows={4}
                  placeholder="Isi ringkasan resmi yang akan tampil di dashboard pendaftaran"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <label className="mt-4 block text-sm font-semibold text-slate-800">Langkah Berikutnya</label>
                <textarea
                  value={reviewForm.decisionNextSteps}
                  onChange={(event) =>
                    setReviewForm((prev) => ({ ...prev, decisionNextSteps: event.target.value }))
                  }
                  rows={4}
                  placeholder="Contoh: siapkan berkas daftar ulang, pantau jadwal administrasi, dll."
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                />

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => reviewMutation.mutate('save')}
                    disabled={reviewMutation.isPending}
                    className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {reviewMutation.isPending ? 'Menyimpan...' : 'Simpan Review'}
                  </button>
                  <button
                    type="button"
                    onClick={() => reviewMutation.mutate('publish')}
                    disabled={!detail.canPublishDecision || reviewMutation.isPending}
                    className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
                  >
                    {detail.decisionAnnouncement.isPublished ? 'Publikasikan Ulang' : 'Publikasikan Hasil'}
                  </button>
                  {detail.decisionAnnouncement.isPublished ? (
                    <button
                      type="button"
                      onClick={() => reviewMutation.mutate('unpublish')}
                      disabled={reviewMutation.isPending}
                      className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Tarik Publikasi
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => acceptMutation.mutate()}
                    disabled={!detail.canPromoteToStudent || acceptMutation.isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    <UserCheck size={16} />
                    {acceptMutation.isPending
                      ? 'Memproses...'
                      : detail.officialStudentAccount
                        ? 'Sudah Menjadi Siswa Resmi'
                        : 'Aktifkan Akun Siswa Resmi'}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4">
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Dikirim:</span> {formatCandidateDateTime(detail.submittedAt)}
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Direview:</span> {formatCandidateDateTime(detail.reviewedAt)}
                </div>
                <div className="text-sm text-slate-600">
                  <span className="font-semibold text-slate-900">Diterima:</span> {formatCandidateDateTime(detail.acceptedAt)}
                </div>
              </div>

              {detail.officialStudentAccount ? (
                <div className="grid gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-emerald-900">Akun Siswa Resmi</p>
                    <p className="mt-1 text-sm text-emerald-700">
                      Calon siswa ini sudah terintegrasi ke akun siswa resmi dan siap mengikuti alur siswa aktif.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">Username:</span>{' '}
                      {detail.officialStudentAccount.username || '-'}
                    </div>
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">NIS:</span>{' '}
                      {detail.officialStudentAccount.nis || '-'}
                    </div>
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">NISN:</span>{' '}
                      {detail.officialStudentAccount.nisn || '-'}
                    </div>
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">Status Siswa:</span>{' '}
                      {detail.officialStudentAccount.studentStatus || '-'}
                    </div>
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">Tahun Akademik Aktif:</span>{' '}
                      {detail.officialStudentAccount.currentAcademicYear?.name || 'Belum ada'}
                    </div>
                    <div className="text-sm text-emerald-800">
                      <span className="font-semibold text-emerald-950">Kelas Aktif:</span>{' '}
                      {detail.officialStudentAccount.currentClass?.name || 'Belum ditempatkan'}
                    </div>
                  </div>
                </div>
              ) : null}
                  </>
                );
              })()}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default CandidateAdmissionReviewPage;
