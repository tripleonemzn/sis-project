import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleAlert, FileCheck2, GraduationCap, ShieldCheck, UserRound } from 'lucide-react';
import { authService } from '../../services/auth.service';
import { candidateAdmissionService } from '../../services/candidateAdmission.service';
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

export const CandidateDashboardPage = () => {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });
  const admissionQuery = useQuery({
    queryKey: CANDIDATE_ADMISSION_QUERY_KEY,
    queryFn: candidateAdmissionService.getMyAdmission,
    staleTime: 60_000,
  });

  const user = meQuery.data?.data;
  const admission = useMemo(
    () => extractCandidateAdmissionPayload(admissionQuery.data),
    [admissionQuery.data],
  );
  const requiredDocuments = admission?.documentChecklist.required || [];
  const missingDocuments = requiredDocuments.filter((item) => !item.isComplete);
  const invalidDocuments = admission?.documentChecklist.invalidDocuments || [];
  const selectionSummary = admission?.selectionResults?.summary;
  const recentResults = admission?.selectionResults?.results.slice(0, 3) || [];
  const decisionLetter = admission?.decisionLetter;
  const assessmentBoard = admission?.assessmentBoard;
  const financeSummary = admission?.financeSummary;
  const financeMeta = getCandidateFinanceSummaryMeta(financeSummary?.state);

  if (meQuery.isLoading || admissionQuery.isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600">
        Memuat dashboard calon siswa...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">Calon Siswa</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Dashboard Pendaftaran</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Akun ini sekarang sudah memiliki alur PPDB yang lebih lengkap. Isi formulir, unggah dokumen, lalu pantau
              review admin dan jadwal tes seleksi dari aplikasi.
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border border-blue-100 bg-white/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status PPDB Saat Ini</p>
            {admission ? (
              <CandidateAdmissionStatusBadge status={admission.status} />
            ) : (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                Belum Tersedia
              </span>
            )}
          </div>
        </div>
      </section>

      {admission?.decisionAnnouncement.isPublished ? (
        <section className="rounded-[30px] border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-600">
            Pengumuman Hasil Seleksi
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-900">
            {admission.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
            {admission.decisionAnnouncement.summary || 'Pengumuman resmi dari sekolah sudah tersedia.'}
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
                Surat resmi masih disiapkan Tata Usaha
              </span>
            )}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-5">
        <CandidateInfoCard title="Ringkasan Akun">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <UserRound size={16} className="text-blue-600" />
              <span>{user?.name || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <GraduationCap size={16} className="text-blue-600" />
              <span>NISN / Username: {user?.nisn || user?.username || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldCheck size={16} className="text-blue-600" />
              <span>No. Pendaftaran: {admission?.registrationNumber || '-'}</span>
            </div>
          </div>
        </CandidateInfoCard>

        <CandidateInfoCard title="Kelengkapan Data">
          <p className="text-3xl font-semibold text-slate-900">{admission?.completeness.percent || 0}%</p>
          <p className="mt-2 text-sm text-slate-600">
            {admission?.completeness.isReady
              ? 'Formulir inti siap dikirim untuk direview.'
              : `Masih perlu: ${admission?.completeness.missingFields.join(', ') || 'lengkapi formulir utama'}.`}
          </p>
        </CandidateInfoCard>

        <CandidateInfoCard title="Dokumen Wajib">
          <p className="text-3xl font-semibold text-slate-900">
            {admission?.documentChecklist.summary.requiredUploaded || 0}/
            {admission?.documentChecklist.summary.requiredTotal || 0}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {missingDocuments.length === 0 && invalidDocuments.length === 0
              ? 'Semua dokumen wajib sudah terunggah.'
              : [
                  missingDocuments.length > 0
                    ? `Masih kurang: ${missingDocuments.map((item) => item.label).join(', ')}`
                    : null,
                  invalidDocuments.length > 0 ? `${invalidDocuments.length} dokumen perlu diperbaiki formatnya` : null,
                ]
                  .filter(Boolean)
                  .join('. ')}
          </p>
        </CandidateInfoCard>

        <CandidateInfoCard title="Hasil Tes Seleksi">
          <p className="text-3xl font-semibold text-slate-900">
            {selectionSummary?.averageScore ?? '-'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {selectionSummary?.total
              ? `${selectionSummary.completed} sesi selesai, ${selectionSummary.passed} lulus, ${selectionSummary.failed} belum lulus.`
              : 'Belum ada hasil tes seleksi yang terekam.'}
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
              ? 'Belum ada tagihan administrasi yang diterbitkan untuk akun ini.'
              : financeSummary?.hasOverdue
                ? `${financeSummary.overdueInvoices} tagihan sudah lewat jatuh tempo.`
                : financeSummary?.hasOutstanding
                  ? `${financeSummary.activeInvoices} tagihan masih aktif dan menunggu penyelesaian.`
                  : 'Tidak ada outstanding finance yang aktif saat ini.'}
          </p>
        </CandidateInfoCard>
      </div>

      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Board Penilaian PPDB</h2>
            <p className="text-sm text-slate-500">
              Nilai akhir menggabungkan TKD dari sistem dan penilaian manual dari panitia PPDB.
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
            <p className="mt-2 text-sm text-slate-600">Semua komponen tes yang sudah memiliki nilai.</p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Nilai Akhir">
            <p className="text-3xl font-semibold text-slate-900">
              {assessmentBoard?.summary.weightedAverage ?? '-'}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Rata-rata berbobot dari seluruh komponen yang sudah selesai.
            </p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Komponen Menunggu">
            <p className="text-sm text-slate-600">
              {assessmentBoard?.summary.incompleteComponents.length
                ? assessmentBoard.summary.incompleteComponents.join(', ')
                : 'Semua komponen sudah dinilai.'}
            </p>
          </CandidateInfoCard>
          <CandidateInfoCard title="Catatan Kelulusan">
            <p className="text-sm text-slate-600">
              {assessmentBoard?.summary.failedComponents.length
                ? `Komponen di bawah ambang: ${assessmentBoard.summary.failedComponents.join(', ')}`
                : 'Belum ada komponen yang berada di bawah ambang kelulusan.'}
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

      <div className="grid gap-4 xl:grid-cols-3">
        <CandidateInfoCard title="Status Akun">
          <VerificationBadge status={user?.verificationStatus} />
          <p className="mt-2 text-sm text-slate-600">
            Verifikasi akun tetap dikelola admin, terpisah dari status review PPDB.
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Review Admin">
          <p>
            {admission?.reviewNotes
              ? admission.reviewNotes
              : 'Belum ada catatan review. Setelah formulir dikirim, admin akan memperbarui status di panel PPDB.'}
          </p>
        </CandidateInfoCard>
        <CandidateInfoCard title="Surat Hasil Seleksi">
          <p>
            {decisionLetter?.isDraftAvailable
              ? decisionLetter.isFinalized
                ? `Draft surat sudah difinalkan dengan nomor ${decisionLetter.letterNumber || '-'}`
                : 'Draft surat otomatis sudah tersedia dan bisa dicetak dari portal web.'
              : 'Surat hasil seleksi akan tersedia setelah pengumuman resmi dipublikasikan.'}
          </p>
          {decisionLetter?.officialUploadedAt ? (
            <p className="mt-2 text-sm text-slate-600">
              Surat resmi diunggah {formatCandidateDateTime(decisionLetter.officialUploadedAt)}.
            </p>
          ) : null}
        </CandidateInfoCard>
        <CandidateInfoCard title="Ringkasan Tagihan">
          <div className="space-y-2">
            <p>Outstanding: {formatCandidateCurrency(financeSummary?.outstandingAmount || 0)}</p>
            <p>Tagihan aktif: {financeSummary?.activeInvoices || 0}</p>
            <p>Lewat jatuh tempo: {financeSummary?.overdueInvoices || 0}</p>
            <p>Pembayaran terakhir: {formatCandidateDateTime(financeSummary?.lastPaymentAt)}</p>
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
        <CandidateInfoCard title="Aksi Cepat">
          <div className="flex flex-wrap gap-3">
            <Link
              to="/candidate/application"
              className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Buka Formulir PPDB
            </Link>
            <Link
              to="/candidate/exams"
              className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              Tes Seleksi
            </Link>
            <Link
              to="/candidate/profile"
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Dokumen Profil
            </Link>
          </div>
        </CandidateInfoCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <CandidateInfoCard title="Tahap Berikutnya">
          <div className="space-y-2">
            <p>1. Lengkapi formulir pendaftaran sampai status kelengkapan siap.</p>
            <p>2. Unggah dokumen PPDB wajib dari menu Profil sesuai kategorinya.</p>
            <p>3. Pantau jadwal dan hasil tes seleksi dari dashboard ini.</p>
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Checklist Dokumen">
          <div className="space-y-3">
            {requiredDocuments.length === 0 ? (
              <p>Checklist dokumen belum tersedia.</p>
            ) : (
              requiredDocuments.map((item) => (
                <div key={item.code} className="flex items-start gap-2">
                  {item.isComplete ? (
                    <CheckCircle2 size={16} className="mt-1 text-emerald-600" />
                  ) : (
                    <CircleAlert size={16} className="mt-1 text-amber-600" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{item.label}</p>
                    <p className="text-xs text-slate-500">
                      {item.isComplete
                        ? `${item.validUploadedCount} file valid terunggah`
                        : 'Belum ada file valid'}
                    </p>
                    {item.invalidCount > 0 ? (
                      <p className="text-xs text-rose-600">
                        {item.invalidCount} file salah format. Gunakan {item.acceptedFormats.join(', ')}.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Hasil Tes Terbaru">
          {recentResults.length === 0 ? (
            <p>Belum ada hasil tes seleksi yang bisa ditampilkan.</p>
          ) : (
            <div className="space-y-3">
              {recentResults.map((item) => {
                const statusMeta = getCandidateSelectionStatusMeta(item.status, item.passed);
                return (
                  <div key={item.sessionId} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900">{item.title}</p>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusMeta.className}`}
                      >
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.subject?.name || item.programCode || 'Tes Seleksi'} •{' '}
                      {formatCandidateDateTime(item.submittedAt || item.scheduleStartTime)}
                    </p>
                    <p className="mt-2 text-sm text-slate-600">
                      Skor: {item.score ?? '-'} {typeof item.kkm === 'number' ? `• KKM ${item.kkm}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CandidateInfoCard>
      </div>
    </div>
  );
};

export const CandidateInformationPage = () => {
  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-600">Informasi PPDB</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Alur Pendaftaran Calon Siswa</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Jalur calon siswa sekarang sudah mencakup register publik, formulir PPDB, status review admin, dokumen
          pendukung melalui profil, dan akses tes seleksi langsung dari aplikasi.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <CandidateInfoCard title="Tahap 1">
          <div className="flex items-start gap-3">
            <FileCheck2 size={18} className="mt-1 text-blue-600" />
            <p>Buat akun calon siswa dari halaman register publik.</p>
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Tahap 2">
          <div className="flex items-start gap-3">
            <UserRound size={18} className="mt-1 text-blue-600" />
            <p>Lengkapi formulir PPDB inti sampai status kelengkapan siap.</p>
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Tahap 3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="mt-1 text-blue-600" />
            <p>Unggah dokumen dari menu Profil dan kirim pendaftaran untuk direview admin.</p>
          </div>
        </CandidateInfoCard>
        <CandidateInfoCard title="Tahap 4">
          <div className="flex items-start gap-3">
            <GraduationCap size={18} className="mt-1 text-blue-600" />
            <p>Jika tes seleksi sudah dijadwalkan, akun ini bisa langsung mengerjakannya dari menu Tes Seleksi.</p>
          </div>
        </CandidateInfoCard>
      </div>
    </div>
  );
};
