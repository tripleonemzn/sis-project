import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Printer, X } from 'lucide-react';
import PrintLayout from './PrintLayout';
import { candidateAdmissionService } from '../../services/candidateAdmission.service';
import {
  extractCandidateAdmissionPayload,
  formatCandidateDateTime,
} from '../public/candidateShared';

function formatLongDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function CandidateDecisionLetterPrint() {
  const { id } = useParams<{ id: string }>();
  const normalizedId = Number(id);
  const hasValidId = Number.isInteger(normalizedId) && normalizedId > 0;

  const detailQuery = useQuery({
    queryKey: ['candidate-decision-letter-print', normalizedId],
    enabled: hasValidId,
    queryFn: async () => candidateAdmissionService.getDecisionLetter(normalizedId),
    staleTime: 60_000,
  });

  const detail = useMemo(
    () => extractCandidateAdmissionPayload(detailQuery.data),
    [detailQuery.data],
  );

  if (!hasValidId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rose-50 p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-sm font-semibold text-rose-700">ID surat hasil seleksi tidak valid.</p>
        </div>
      </div>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
        <div>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-sm font-semibold text-slate-700">Memuat surat hasil seleksi...</p>
        </div>
      </div>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rose-50 p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-sm font-semibold text-rose-700">
            Surat hasil seleksi belum tersedia atau Anda tidak punya akses.
          </p>
        </div>
      </div>
    );
  }

  const decisionLetter = detail.decisionLetter;
  const decisionAnnouncement = detail.decisionAnnouncement;
  const principalName = decisionLetter.principalName || '-';
  const signerName = decisionLetter.signerName || '-';
  const issueDate = decisionLetter.issuedAt || detail.decisionAnnouncement.publishedAt || detail.reviewedAt;

  return (
    <div className="min-h-screen bg-[#525659]">
      <div className="no-print fixed left-0 right-0 top-0 z-[99999] border-b border-slate-200 bg-white px-6 py-3 shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">Draft Surat Hasil Seleksi</h1>
            <p className="mt-1 text-xs text-slate-500">
              {decisionLetter.isFinalized
                ? 'Draft ini sudah memakai metadata final surat TU.'
                : 'Draft ini digenerasikan otomatis dari keputusan PPDB yang sudah dipublikasikan.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <Printer className="mr-2 h-4 w-4" />
              Cetak / Simpan PDF
            </button>
            <button
              type="button"
              onClick={() => window.close()}
              className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <X className="mr-2 h-4 w-4" />
              Tutup
            </button>
          </div>
        </div>
      </div>

      <PrintLayout title={decisionLetter.title || 'Surat Hasil Seleksi PPDB'}>
        <div className="text-[15px] leading-7 text-slate-900">
          <header className="border-b-2 border-slate-900 pb-4 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.35em] text-slate-600">SMKS Karya Guna Bhakti 2</p>
            <h2 className="mt-2 text-[28px] font-bold uppercase">Surat Hasil Seleksi PPDB</h2>
            <p className="mt-2 text-sm text-slate-600">
              {decisionLetter.letterNumber ? (
                <>Nomor: {decisionLetter.letterNumber}</>
              ) : (
                <>Draft otomatis sistem, menunggu finalisasi nomor surat oleh Tata Usaha</>
              )}
            </p>
          </header>

          <section className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div>
              <p>
                Berdasarkan proses seleksi penerimaan peserta didik baru yang telah dilaksanakan oleh sekolah, dengan ini
                kami menyampaikan hasil seleksi kepada:
              </p>

              <div className="mt-5 rounded-2xl border border-slate-300 p-4">
                <div className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
                  <p className="font-semibold">Nama</p>
                  <p>: {detail.user.name}</p>
                  <p className="font-semibold">Nomor Pendaftaran</p>
                  <p>: {detail.registrationNumber}</p>
                  <p className="font-semibold">NISN / Username</p>
                  <p>: {detail.user.nisn || detail.user.username || '-'}</p>
                  <p className="font-semibold">Asal Sekolah</p>
                  <p>: {detail.previousSchool || '-'}</p>
                  <p className="font-semibold">Jurusan Tujuan</p>
                  <p>: {detail.desiredMajor ? `${detail.desiredMajor.code} - ${detail.desiredMajor.name}` : '-'}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status Keputusan</p>
              <h3 className="mt-2 text-xl font-bold text-slate-900">
                {decisionAnnouncement.title || decisionLetter.title || 'Hasil Seleksi PPDB'}
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                {decisionAnnouncement.summary || detail.decisionSummary || 'Hasil seleksi resmi sekolah telah diterbitkan.'}
              </p>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-slate-500">
                Dipublikasikan {formatCandidateDateTime(decisionAnnouncement.publishedAt)}
              </p>
            </div>
          </section>

          <section className="mt-8 rounded-2xl border border-emerald-300 bg-emerald-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Keputusan Sekolah</p>
            <h3 className="mt-2 text-2xl font-bold text-emerald-900">
              {decisionAnnouncement.title || 'Pengumuman Hasil Seleksi PPDB'}
            </h3>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-emerald-950">
              {decisionAnnouncement.summary || detail.decisionSummary || '-'}
            </p>
            {decisionAnnouncement.nextSteps ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-4">
                <p className="text-sm font-semibold text-emerald-900">Langkah Berikutnya</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {decisionAnnouncement.nextSteps}
                </p>
              </div>
            ) : null}
          </section>

          <section className="mt-8">
            <p>
              Surat ini diterbitkan sebagai draf pengumuman resmi hasil seleksi pada sistem SIS sekolah. Jika Tata Usaha
              telah mengunggah surat final bertanda tangan, calon siswa dapat menggunakan versi resmi tersebut sebagai
              dokumen administrasi.
            </p>
          </section>

          <section className="mt-12 grid grid-cols-2 gap-10 text-center">
            <div>
              <p>Mengetahui,</p>
              <p className="font-semibold">Kepala Sekolah</p>
              <div className="h-24" />
              <p className="font-semibold underline underline-offset-4">{principalName}</p>
            </div>
            <div>
              <p>
                {decisionLetter.issuedCity || 'Bekasi'}, {formatLongDate(issueDate)}
              </p>
              <p className="font-semibold">{decisionLetter.signerPosition || 'Kepala Tata Usaha'}</p>
              <div className="h-24" />
              <p className="font-semibold underline underline-offset-4">{signerName}</p>
            </div>
          </section>
        </div>
      </PrintLayout>
    </div>
  );
}
