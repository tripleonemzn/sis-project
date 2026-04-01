import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import {
  candidateAdmissionService,
  type CandidateAdmissionDetail,
} from '../../services/candidateAdmission.service';
import { majorService, type Major } from '../../services/major.service';
import {
  CANDIDATE_ADMISSION_QUERY_KEY,
  formatCandidateDateTime,
  formatCandidateCurrency,
  CandidateAdmissionStatusBadge,
  CandidateInfoCard,
  VerificationBadge,
  extractCandidateAdmissionPayload,
  getCandidateFinanceSummaryMeta,
  getCandidateDecisionLetterPrintPath,
  getCandidateSelectionStatusMeta,
} from './candidateShared';

type CandidateFormState = {
  name: string;
  phone: string;
  email: string;
  gender: '' | 'MALE' | 'FEMALE';
  birthPlace: string;
  birthDate: string;
  address: string;
  religion: string;
  previousSchool: string;
  lastEducation: string;
  desiredMajorId: string;
  fatherName: string;
  motherName: string;
  guardianName: string;
  guardianPhone: string;
  parentName: string;
  parentPhone: string;
  domicileCity: string;
  motivation: string;
  submissionNotes: string;
};

const emptyForm: CandidateFormState = {
  name: '',
  phone: '',
  email: '',
  gender: '',
  birthPlace: '',
  birthDate: '',
  address: '',
  religion: '',
  previousSchool: '',
  lastEducation: '',
  desiredMajorId: '',
  fatherName: '',
  motherName: '',
  guardianName: '',
  guardianPhone: '',
  parentName: '',
  parentPhone: '',
  domicileCity: '',
  motivation: '',
  submissionNotes: '',
};

function buildForm(admission: CandidateAdmissionDetail | null): CandidateFormState {
  if (!admission) return emptyForm;
  return {
    name: admission.user.name || '',
    phone: admission.user.phone || '',
    email: admission.user.email || '',
    gender: admission.user.gender || '',
    birthPlace: admission.user.birthPlace || '',
    birthDate: admission.user.birthDate ? String(admission.user.birthDate).slice(0, 10) : '',
    address: admission.user.address || '',
    religion: admission.user.religion || '',
    previousSchool: admission.previousSchool || '',
    lastEducation: admission.lastEducation || '',
    desiredMajorId: admission.desiredMajorId ? String(admission.desiredMajorId) : '',
    fatherName: admission.user.fatherName || '',
    motherName: admission.user.motherName || '',
    guardianName: admission.user.guardianName || '',
    guardianPhone: admission.user.guardianPhone || '',
    parentName: admission.parentName || admission.resolvedParentName || '',
    parentPhone: admission.parentPhone || admission.resolvedParentPhone || '',
    domicileCity: admission.domicileCity || '',
    motivation: admission.motivation || '',
    submissionNotes: admission.submissionNotes || '',
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  type?: 'text' | 'date' | 'email';
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-800">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={4}
          placeholder={placeholder}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
        />
      )}
    </label>
  );
}

export const CandidateApplicationPage = () => {
  const queryClient = useQueryClient();
  const admissionQuery = useQuery({
    queryKey: CANDIDATE_ADMISSION_QUERY_KEY,
    queryFn: candidateAdmissionService.getMyAdmission,
    staleTime: 60_000,
  });
  const admission = useMemo(
    () => extractCandidateAdmissionPayload(admissionQuery.data),
    [admissionQuery.data],
  );
  const majorsQuery = useQuery({
    queryKey: ['public-majors', 'candidate-application'],
    queryFn: async () => {
      const response = await majorService.list({ page: 1, limit: 100 });
      return (response?.data?.majors || []) as Major[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const [form, setForm] = useState<CandidateFormState>(emptyForm);
  const documentChecklist = admission?.documentChecklist;
  const requiredDocuments = documentChecklist?.required || [];
  const optionalDocuments = documentChecklist?.optional || [];
  const missingDocuments = requiredDocuments.filter((item) => !item.isComplete);
  const invalidDocuments = documentChecklist?.invalidDocuments || [];
  const selectionResults = admission?.selectionResults?.results || [];
  const selectionSummary = admission?.selectionResults?.summary;
  const decisionLetter = admission?.decisionLetter;
  const assessmentBoard = admission?.assessmentBoard;
  const financeSummary = admission?.financeSummary;
  const financeMeta = getCandidateFinanceSummaryMeta(financeSummary?.state);

  useEffect(() => {
    if (!admission) return;
    setForm(buildForm(admission));
  }, [admission]);

  const saveMutation = useMutation({
    mutationFn: async () =>
      candidateAdmissionService.saveMyAdmission({
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        gender: form.gender || undefined,
        birthPlace: form.birthPlace.trim() || undefined,
        birthDate: form.birthDate || undefined,
        address: form.address.trim() || undefined,
        religion: form.religion.trim() || undefined,
        fatherName: form.fatherName.trim() || undefined,
        motherName: form.motherName.trim() || undefined,
        guardianName: form.guardianName.trim() || undefined,
        guardianPhone: form.guardianPhone.trim() || undefined,
        previousSchool: form.previousSchool.trim() || undefined,
        lastEducation: form.lastEducation.trim() || undefined,
        desiredMajorId: form.desiredMajorId ? Number(form.desiredMajorId) : undefined,
        parentName: form.parentName.trim() || undefined,
        parentPhone: form.parentPhone.trim() || undefined,
        domicileCity: form.domicileCity.trim() || undefined,
        motivation: form.motivation.trim() || undefined,
        submissionNotes: form.submissionNotes.trim() || undefined,
      }),
    onSuccess: async () => {
      toast.success('Data pendaftaran berhasil disimpan');
      authService.clearMeCache();
      await queryClient.invalidateQueries({ queryKey: CANDIDATE_ADMISSION_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal menyimpan data pendaftaran');
    },
  });

  const submitMutation = useMutation({
    mutationFn: candidateAdmissionService.submitMyAdmission,
    onSuccess: async () => {
      toast.success('Pendaftaran berhasil dikirim untuk direview admin');
      await queryClient.invalidateQueries({ queryKey: CANDIDATE_ADMISSION_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal mengirim pendaftaran');
    },
  });

  const handleSubmitApplication = async () => {
    await saveMutation.mutateAsync();
    await submitMutation.mutateAsync();
  };

  if (admissionQuery.isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Memuat formulir pendaftaran calon siswa...
      </div>
    );
  }

  if (!admission) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-rose-50 p-8 text-sm text-rose-700">
        Data pendaftaran tidak ditemukan. Silakan refresh halaman.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">PPDB Calon Siswa</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Formulir Pendaftaran</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              Lengkapi data inti PPDB di sini, unggah dokumen dari menu Profil, lalu kirim pendaftaran untuk
              direview admin sekolah.
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border border-blue-100 bg-white/90 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Nomor Pendaftaran</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{admission.registrationNumber}</p>
            </div>
            <CandidateAdmissionStatusBadge status={admission.status} />
          </div>
        </div>
      </section>

      {admission.decisionAnnouncement.isPublished ? (
        <section className="rounded-[30px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Pengumuman Hasil Seleksi
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">
            {admission.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {admission.decisionAnnouncement.summary || 'Hasil resmi seleksi sudah dipublikasikan oleh admin sekolah.'}
          </p>
          {admission.decisionAnnouncement.nextSteps ? (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-900">Langkah berikutnya:</span>{' '}
              {admission.decisionAnnouncement.nextSteps}
            </p>
          ) : null}
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            Dipublikasikan {formatCandidateDateTime(admission.decisionAnnouncement.publishedAt)}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            {decisionLetter?.isDraftAvailable ? (
              <Link
                to={getCandidateDecisionLetterPrintPath(admission.id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                Lihat Draft Surat
              </Link>
            ) : null}
            {decisionLetter?.officialFileUrl ? (
              <a
                href={decisionLetter.officialFileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
              >
                Unduh Surat Resmi
              </a>
            ) : (
              <span className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600">
                Surat resmi masih menunggu unggahan Tata Usaha
              </span>
            )}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <CandidateInfoCard title="Status PPDB">
          <div className="space-y-3">
            <CandidateAdmissionStatusBadge status={admission.status} />
            <p className="text-sm text-slate-600">
              {admission.reviewNotes
                ? `Catatan admin: ${admission.reviewNotes}`
                : 'Belum ada catatan review dari admin sekolah.'}
            </p>
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Kelengkapan">
          <p className="text-3xl font-semibold text-slate-900">{admission.completeness.percent}%</p>
          <p className="mt-2 text-sm text-slate-600">
            {admission.completeness.isReady
              ? 'Data inti sudah siap untuk dikirim.'
              : `Masih perlu dilengkapi: ${admission.completeness.missingFields.join(', ')}.`}
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Dokumen">
          <p className="text-3xl font-semibold text-slate-900">
            {documentChecklist?.summary.requiredUploaded || 0}/{documentChecklist?.summary.requiredTotal || 0}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {missingDocuments.length === 0 && invalidDocuments.length === 0
              ? 'Dokumen wajib PPDB sudah lengkap.'
              : [
                  missingDocuments.length > 0
                    ? `Masih kurang: ${missingDocuments.map((item) => item.label).join(', ')}`
                    : null,
                  invalidDocuments.length > 0 ? `${invalidDocuments.length} dokumen perlu diperbaiki formatnya` : null,
                ]
                  .filter(Boolean)
                  .join('. ')}
          </p>
          <Link
            to="/candidate/profile"
            className="mt-3 inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Buka Profil
          </Link>
        </CandidateInfoCard>
        <CandidateInfoCard title="Hasil Tes Seleksi">
          <p className="text-3xl font-semibold text-slate-900">{selectionSummary?.averageScore ?? '-'}</p>
          <p className="mt-2 text-sm text-slate-600">
            {selectionSummary?.total
              ? `${selectionSummary.completed} sesi selesai, ${selectionSummary.passed} lulus.`
              : 'Belum ada hasil tes seleksi yang tercatat.'}
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
              ? 'Tagihan administrasi akan muncul di sini setelah diterbitkan sekolah.'
              : financeSummary?.hasOverdue
                ? `${financeSummary.overdueInvoices} tagihan administrasi sudah melewati jatuh tempo.`
                : financeSummary?.hasOutstanding
                  ? `${financeSummary.activeInvoices} tagihan administrasi masih aktif.`
                  : 'Tagihan administrasi saat ini sudah clear.'}
          </p>
        </CandidateInfoCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CandidateInfoCard title="Status Akun">
          <VerificationBadge status={admission.accountVerificationStatus} />
          <p className="mt-2 text-sm text-slate-600">
            Status verifikasi akun tetap terpisah dari proses review PPDB.
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Checklist Dokumen">
          <div className="space-y-3">
            {requiredDocuments.map((item) => (
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
            {optionalDocuments.length > 0 ? (
              <p className="text-xs text-slate-500">
                Opsional: {optionalDocuments.map((item) => item.label).join(', ')}.
              </p>
            ) : null}
            {documentChecklist?.summary.uncategorizedCount ? (
              <p className="text-xs text-amber-600">
                Ada {documentChecklist.summary.uncategorizedCount} dokumen tanpa kategori PPDB yang tepat.
              </p>
            ) : null}
            {documentChecklist?.summary.invalidCount ? (
              <p className="text-xs text-rose-600">
                Ada {documentChecklist.summary.invalidCount} dokumen PPDB dengan format file yang belum sesuai.
              </p>
            ) : null}
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Tes Seleksi">
          <p className="text-sm text-slate-600">
            {selectionSummary?.latestSubmittedAt
              ? `Submit terakhir: ${formatCandidateDateTime(selectionSummary.latestSubmittedAt)}`
              : 'Belum ada submit tes seleksi.'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Gunakan menu Tes Seleksi jika admin sudah menjadwalkan ujian untuk akun ini.
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Tagihan Aktif">
          <div className="space-y-2 text-sm text-slate-600">
            <p>Outstanding: {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}</p>
            <p>Tagihan aktif: {financeSummary?.activeInvoices || 0}</p>
            <p>Lewat jatuh tempo: {financeSummary?.overdueInvoices || 0}</p>
            <p>Jatuh tempo terdekat: {formatCandidateDateTime(financeSummary?.nextDueDate)}</p>
          </div>
          {financeSummary?.invoices?.length ? (
            <div className="mt-3 space-y-2">
              {financeSummary.invoices.slice(0, 3).map((invoice) => (
                <div key={invoice.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="font-semibold text-slate-900">{invoice.label}</p>
                  <p className="text-xs text-slate-500">
                    {invoice.invoiceNo} • {invoice.periodKey}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Sisa {formatCandidateCurrency(invoice.balanceAmount)} • jatuh tempo {formatCandidateDateTime(invoice.dueDate)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CandidateInfoCard>
        <CandidateInfoCard title="Surat Hasil Seleksi">
          <p className="text-sm text-slate-600">
            {decisionLetter?.isDraftAvailable
              ? decisionLetter.isFinalized
                ? `Draft surat sudah difinalkan dengan nomor ${decisionLetter.letterNumber || '-'}`
                : 'Draft surat otomatis siap dicetak dari portal web.'
              : 'Surat hasil seleksi akan tersedia setelah pengumuman resmi dipublikasikan.'}
          </p>
          {decisionLetter?.officialUploadedAt ? (
            <p className="mt-2 text-sm text-slate-600">
              Surat resmi diunggah {formatCandidateDateTime(decisionLetter.officialUploadedAt)}.
            </p>
          ) : null}
        </CandidateInfoCard>
      </div>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ringkasan Hasil Tes</h2>
            <p className="text-sm text-slate-500">
              Dashboard ini mengambil hasil dari sesi tes seleksi yang memang ditargetkan untuk calon siswa.
            </p>
          </div>
          <Link
            to="/candidate/exams"
            className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Buka Tes Seleksi
          </Link>
        </div>

        {selectionResults.length === 0 ? (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            Belum ada hasil tes seleksi yang bisa ditampilkan.
          </div>
        ) : (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {selectionResults.map((item) => {
              const statusMeta = getCandidateSelectionStatusMeta(item.status, item.passed);
              return (
                <div key={item.sessionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
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
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Board Penilaian PPDB</h2>
            <p className="text-sm text-slate-500">
              Panel ini menggabungkan TKD dari tes online dan penilaian manual dari panitia PPDB.
            </p>
          </div>
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            Rekomendasi: {assessmentBoard?.summary.recommendation || 'INCOMPLETE'}
          </span>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-4">
          <CandidateInfoCard title="Komponen Selesai">
            <p className="text-3xl font-semibold text-slate-900">
              {assessmentBoard?.summary.completedComponents || 0}/{assessmentBoard?.summary.totalComponents || 0}
            </p>
            <p className="mt-2 text-sm text-slate-600">Jumlah komponen penilaian yang sudah terisi.</p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Nilai Akhir">
            <p className="text-3xl font-semibold text-slate-900">{assessmentBoard?.summary.weightedAverage ?? '-'}</p>
            <p className="mt-2 text-sm text-slate-600">Rata-rata berbobot sebagai acuan hasil seleksi.</p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Menunggu Penilaian">
            <p className="text-sm text-slate-600">
              {assessmentBoard?.summary.incompleteComponents.length
                ? assessmentBoard.summary.incompleteComponents.join(', ')
                : 'Semua komponen sudah dinilai.'}
            </p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Perlu Perhatian">
            <p className="text-sm text-slate-600">
              {assessmentBoard?.summary.failedComponents.length
                ? assessmentBoard.summary.failedComponents.join(', ')
                : 'Belum ada komponen di bawah ambang kelulusan.'}
            </p>
          </CandidateInfoCard>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {(assessmentBoard?.items || []).map((item) => (
            <div key={item.code} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{item.title}</p>
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{item.sourceType}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    item.completed
                      ? item.passed === false
                        ? 'border-rose-200 bg-rose-50 text-rose-700'
                        : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-amber-200 bg-amber-50 text-amber-700'
                  }`}
                >
                  {item.completed ? (item.passed === false ? 'Perlu perhatian' : 'Selesai') : 'Menunggu'}
                </span>
              </div>
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>Nilai: {item.score ?? '-'}</p>
                <p>Bobot: {item.weight}</p>
                <p>Ambang lulus: {item.passingScore ?? '-'}</p>
                <p>Dinilai: {formatCandidateDateTime(item.assessedAt)}</p>
              </div>
              {item.notes ? <p className="mt-3 text-xs leading-5 text-slate-500">{item.notes}</p> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 xl:grid-cols-2">
          <Field label="Nama Lengkap" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
          <label className="block">
            <span className="text-sm font-semibold text-slate-800">NISN</span>
            <input
              readOnly
              value={admission.user.nisn || admission.user.username}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none"
            />
          </label>
          <Field label="Nomor HP" value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
          <Field label="Email" type="email" value={form.email} onChange={(value) => setForm((prev) => ({ ...prev, email: value }))} />

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Jenis Kelamin</span>
            <select
              value={form.gender}
              onChange={(event) => setForm((prev) => ({ ...prev, gender: event.target.value as CandidateFormState['gender'] }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Pilih jenis kelamin</option>
              <option value="MALE">Laki-laki</option>
              <option value="FEMALE">Perempuan</option>
            </select>
          </label>
          <Field
            label="Agama"
            value={form.religion}
            onChange={(value) => setForm((prev) => ({ ...prev, religion: value }))}
          />

          <Field
            label="Tempat Lahir"
            value={form.birthPlace}
            onChange={(value) => setForm((prev) => ({ ...prev, birthPlace: value }))}
          />
          <Field
            label="Tanggal Lahir"
            type="date"
            value={form.birthDate}
            onChange={(value) => setForm((prev) => ({ ...prev, birthDate: value }))}
          />

          <div className="xl:col-span-2">
            <Field
              label="Alamat Domisili"
              value={form.address}
              onChange={(value) => setForm((prev) => ({ ...prev, address: value }))}
              multiline
            />
          </div>

          <Field
            label="Asal Sekolah"
            value={form.previousSchool}
            onChange={(value) => setForm((prev) => ({ ...prev, previousSchool: value }))}
          />
          <Field
            label="Jenjang Pendidikan Terakhir"
            value={form.lastEducation}
            onChange={(value) => setForm((prev) => ({ ...prev, lastEducation: value }))}
            placeholder="Contoh: SMP / MTs"
          />

          <label className="block">
            <span className="text-sm font-semibold text-slate-800">Jurusan Tujuan</span>
            <select
              value={form.desiredMajorId}
              onChange={(event) => setForm((prev) => ({ ...prev, desiredMajorId: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              <option value="">Pilih jurusan tujuan</option>
              {(majorsQuery.data || []).map((major) => (
                <option key={major.id} value={major.id}>
                  {major.code} - {major.name}
                </option>
              ))}
            </select>
          </label>
          <Field
            label="Kota / Domisili"
            value={form.domicileCity}
            onChange={(value) => setForm((prev) => ({ ...prev, domicileCity: value }))}
          />

          <div className="xl:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3">
            <p className="text-sm font-semibold text-blue-900">Data Keluarga & Kontak Utama</p>
            <p className="mt-1 text-sm leading-6 text-blue-700">
              Data ayah, ibu, dan wali dipakai untuk identitas keluarga. Kontak utama dipakai panitia untuk komunikasi
              PPDB yang paling aktif.
            </p>
          </div>

          <Field
            label="Nama Ayah"
            value={form.fatherName}
            onChange={(value) => setForm((prev) => ({ ...prev, fatherName: value }))}
            placeholder="Sesuai dokumen keluarga"
          />
          <Field
            label="Nama Ibu"
            value={form.motherName}
            onChange={(value) => setForm((prev) => ({ ...prev, motherName: value }))}
            placeholder="Sesuai dokumen keluarga"
          />
          <Field
            label="Nama Wali (Opsional)"
            value={form.guardianName}
            onChange={(value) => setForm((prev) => ({ ...prev, guardianName: value }))}
            placeholder="Diisi jika ada wali selain orang tua"
          />
          <Field
            label="No. HP Wali (Opsional)"
            value={form.guardianPhone}
            onChange={(value) => setForm((prev) => ({ ...prev, guardianPhone: value }))}
            placeholder="Nomor aktif wali"
          />
          <Field
            label="Nama Kontak Utama Orang Tua / Wali"
            value={form.parentName}
            onChange={(value) => setForm((prev) => ({ ...prev, parentName: value }))}
            placeholder="Pihak yang paling aktif dihubungi panitia"
          />
          <Field
            label="No. HP Kontak Utama Orang Tua / Wali"
            value={form.parentPhone}
            onChange={(value) => setForm((prev) => ({ ...prev, parentPhone: value }))}
            placeholder="Nomor aktif WhatsApp / telepon"
          />

          <div className="xl:col-span-2">
            <Field
              label="Motivasi / Catatan Singkat"
              value={form.motivation}
              onChange={(value) => setForm((prev) => ({ ...prev, motivation: value }))}
              multiline
              placeholder="Ceritakan minat jurusan atau kesiapan mengikuti proses seleksi."
            />
          </div>

          <div className="xl:col-span-2">
            <Field
              label="Catatan Pengajuan"
              value={form.submissionNotes}
              onChange={(value) => setForm((prev) => ({ ...prev, submissionNotes: value }))}
              multiline
              placeholder="Opsional: catatan tambahan yang ingin disampaikan ke admin."
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
          <button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || submitMutation.isPending}
            className="inline-flex items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Draft'}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmitApplication()}
            disabled={saveMutation.isPending || submitMutation.isPending || !admission.canSubmit}
            className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {submitMutation.isPending ? 'Mengirim...' : 'Kirim Pendaftaran'}
          </button>
          <Link
            to="/candidate/exams"
            className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Buka Tes Seleksi
          </Link>
        </div>
      </section>
    </div>
  );
};

export default CandidateApplicationPage;
