import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Printer, X } from 'lucide-react';
import PrintLayout from './PrintLayout';
import { humasService, type JobApplicationBatchReport } from '../../services/humas.service';

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

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID');
}

function resolveCompanyName(report: JobApplicationBatchReport['vacancy']) {
  return report.industryPartner?.name || report.companyName || 'Perusahaan umum';
}

export default function BkkShortlistBatchPrint() {
  const [searchParams] = useSearchParams();
  const vacancyId = Number(searchParams.get('vacancyId'));
  const partnerReferenceCode = String(searchParams.get('partnerReferenceCode') || '').trim();
  const isValid = Number.isInteger(vacancyId) && vacancyId > 0 && partnerReferenceCode.length > 0;

  const reportQuery = useQuery({
    queryKey: ['bkk-shortlist-batch-print', vacancyId, partnerReferenceCode],
    enabled: isValid,
    queryFn: async () => {
      const response = await humasService.getShortlistBatchReport({
        vacancyId,
        partnerReferenceCode,
      });
      return (response.data?.data || null) as JobApplicationBatchReport | null;
    },
    staleTime: 60_000,
  });

  const report = useMemo(() => reportQuery.data || null, [reportQuery.data]);

  if (!isValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rose-50 p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-sm font-semibold text-rose-700">Parameter batch shortlist tidak valid.</p>
        </div>
      </div>
    );
  }

  if (reportQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
        <div>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
          <p className="mt-4 text-sm font-semibold text-slate-700">Memuat batch shortlist...</p>
        </div>
      </div>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-rose-50 p-8 text-center">
        <div>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <p className="mt-4 text-sm font-semibold text-rose-700">
            Batch shortlist tidak ditemukan atau Anda tidak memiliki akses.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#525659]">
      <div className="no-print fixed left-0 right-0 top-0 z-[99999] border-b border-slate-200 bg-white px-6 py-3 shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div>
            <h1 className="text-sm font-bold uppercase tracking-[0.18em] text-slate-900">Daftar Batch Shortlist BKK</h1>
            <p className="mt-1 text-xs text-slate-500">
              Cetak daftar resmi pelamar yang dikirim ke mitra industri.
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

      <PrintLayout title={`Batch Shortlist BKK - ${report.partnerReferenceCode}`}>
        <div className="text-[14px] leading-6 text-slate-900">
          <header className="border-b-2 border-slate-900 pb-4 text-center">
            <p className="text-[13px] font-semibold uppercase tracking-[0.35em] text-slate-600">SMKS Karya Guna Bhakti 2</p>
            <h2 className="mt-2 text-[28px] font-bold uppercase">Daftar Batch Shortlist BKK</h2>
            <p className="mt-2 text-sm text-slate-600">
              Referensi batch: <span className="font-semibold text-slate-900">{report.partnerReferenceCode}</span>
            </p>
          </header>

          <section className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-slate-300 p-4">
              <div className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
                <p className="font-semibold">Lowongan</p>
                <p>: {report.vacancy.title}</p>
                <p className="font-semibold">Mitra / Perusahaan</p>
                <p>: {resolveCompanyName(report.vacancy)}</p>
                <p className="font-semibold">Tanggal Shortlist</p>
                <p>: {formatLongDate(report.shortlistedAt)}</p>
                <p className="font-semibold">Dicetak Pada</p>
                <p>: {formatDateTime(new Date().toISOString())}</p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Total Pelamar</p>
                <p className="mt-2 text-3xl font-bold text-slate-900">{report.total}</p>
              </div>
              <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Progress Batch</p>
                <p className="mt-2 text-sm text-slate-700">
                  {report.summary.partnerInterview || 0} interview mitra • {report.summary.hired || report.summary.accepted || 0} diterima
                </p>
              </div>
            </div>
          </section>

          {report.partnerHandoffNotes ? (
            <section className="mt-6 rounded-2xl border border-slate-300 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Catatan Pengiriman ke Mitra</p>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{report.partnerHandoffNotes}</p>
            </section>
          ) : null}

          <section className="mt-8">
            <div className="overflow-hidden rounded-2xl border border-slate-300">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">No</th>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">Pelamar</th>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">Kontak</th>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">Asal Sekolah / Jurusan</th>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">Nilai Akhir</th>
                    <th className="border border-slate-300 px-3 py-3 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.applications.map((application, index) => (
                    <tr key={application.id}>
                      <td className="border border-slate-300 px-3 py-3 align-top">{index + 1}</td>
                      <td className="border border-slate-300 px-3 py-3 align-top">
                        <p className="font-semibold text-slate-900">{application.applicant.name}</p>
                        <p className="text-slate-600">@{application.applicant.username}</p>
                      </td>
                      <td className="border border-slate-300 px-3 py-3 align-top">
                        <p>{application.applicant.phone || '-'}</p>
                        <p>{application.applicant.email || '-'}</p>
                      </td>
                      <td className="border border-slate-300 px-3 py-3 align-top">
                        <p>{application.profile?.schoolName || '-'}</p>
                        <p>{application.profile?.major || '-'}</p>
                      </td>
                      <td className="border border-slate-300 px-3 py-3 align-top">
                        {application.assessmentBoard?.summary.weightedAverage ?? '-'}
                      </td>
                      <td className="border border-slate-300 px-3 py-3 align-top">{application.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-10 grid grid-cols-2 gap-10 text-center">
            <div>
              <p>Mengetahui,</p>
              <p className="font-semibold">Wakasek Humas / Tim BKK</p>
              <div className="h-24" />
              <p className="font-semibold underline underline-offset-4">______________________________</p>
            </div>
            <div>
              <p>
                Bekasi, {formatLongDate(report.shortlistedAt || new Date().toISOString())}
              </p>
              <p className="font-semibold">Mitra Industri</p>
              <div className="h-24" />
              <p className="font-semibold underline underline-offset-4">______________________________</p>
            </div>
          </section>
        </div>
      </PrintLayout>
    </div>
  );
}
