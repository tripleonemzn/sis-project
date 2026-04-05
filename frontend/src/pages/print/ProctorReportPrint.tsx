import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';

type ProctorReportDocumentSnapshot = {
  schoolName: string;
  schoolLogoPath: string;
  title: string;
  examLabel: string;
  academicYearName: string;
  documentNumber: string;
  schedule: {
    subjectName: string;
    roomName: string;
    sessionLabel: string | null;
    classNames: string[];
    startTimeLabel: string;
    endTimeLabel: string;
    executionDateLabel: string;
    executionYear: string;
  };
  narrative: string;
  counts: {
    expectedParticipants: number;
    absentParticipants: number;
    presentParticipants: number;
  };
  notes: string | null;
  incident: string | null;
  submittedAt: string;
  proctor: {
    id: number;
    name: string;
    signatureLabel: string;
  };
  verification: {
    token: string;
    verificationUrl: string;
    note: string;
  };
};

type DocumentResponse = {
  reportId: number;
  documentNumber: string;
  snapshot: ProctorReportDocumentSnapshot;
  verificationQrDataUrl: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatExamHeadingLabel(label?: string | null) {
  const normalized = String(label || '').trim();
  if (!normalized) return 'UJIAN';
  return /^ujian\b/i.test(normalized) ? normalized.toUpperCase() : `UJIAN ${normalized.toUpperCase()}`;
}

export default function ProctorReportPrint() {
  const navigate = useNavigate();
  const { reportId } = useParams<{ reportId: string }>();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('autoprint') === '1';
  const parsedReportId = Number(reportId || 0);

  const documentQuery = useQuery({
    queryKey: ['proctor-report-document', parsedReportId],
    enabled: Number.isFinite(parsedReportId) && parsedReportId > 0,
    queryFn: async () => {
      const response = await api.get(`/proctoring/reports/${parsedReportId}/document`);
      return response.data?.data as DocumentResponse;
    },
  });

  useEffect(() => {
    if (!autoPrint || !documentQuery.data) return;
    const timeout = window.setTimeout(() => {
      window.print();
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [autoPrint, documentQuery.data]);

  if (!Number.isFinite(parsedReportId) || parsedReportId <= 0) {
    return <div className="min-h-screen bg-slate-100 p-6 text-sm text-rose-700">ID berita acara tidak valid.</div>;
  }

  if (documentQuery.isLoading) {
    return <div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-600">Menyiapkan dokumen berita acara...</div>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Gagal memuat dokumen berita acara.</p>
          <button
            type="button"
            onClick={() => documentQuery.refetch()}
            className="mt-4 inline-flex items-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  const { snapshot, verificationQrDataUrl } = documentQuery.data;

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          body {
            background: #fff !important;
          }
          .proctor-report-no-print {
            display: none !important;
          }
          .proctor-report-shell {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>

      <div className="proctor-report-no-print mx-auto mb-4 flex max-w-5xl items-center justify-between px-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Kembali
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Dokumen
        </button>
      </div>

      <div className="proctor-report-shell mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm print:px-6 print:py-8">
        <div className="flex items-start gap-5">
          <div className="flex w-28 shrink-0 justify-center">
            <img src={snapshot.schoolLogoPath} alt="Logo KGB2" className="h-24 w-24 object-contain" />
          </div>
          <div className="flex-1 text-center">
            <div className="text-[28px] font-semibold tracking-wide text-slate-900">{snapshot.title}</div>
            <div className="mt-1 text-[22px] font-semibold uppercase tracking-wide text-slate-900">
              {formatExamHeadingLabel(snapshot.examLabel)}
            </div>
            <div className="mt-1 text-[22px] font-semibold uppercase tracking-wide text-slate-900">
              {snapshot.schoolName}
            </div>
            <div className="mt-1 text-[20px] font-semibold uppercase tracking-wide text-slate-900">
              Tahun Ajaran {snapshot.academicYearName}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-slate-900" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-sm text-slate-700">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-900">No. Dokumen:</span> {snapshot.documentNumber}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            Diverifikasi melalui QR internal SIS KGB2
          </div>
        </div>

        <div className="mt-7 text-[20px] leading-10 text-slate-900">
          <p className="text-justify">{snapshot.narrative}</p>
        </div>

        <div className="mt-6 grid gap-3 text-[18px] text-slate-900">
          <div className="grid grid-cols-[220px_16px_1fr]">
            <div className="font-medium">Mata Pelajaran</div>
            <div>:</div>
            <div>{snapshot.schedule.subjectName}</div>
          </div>
          <div className="grid grid-cols-[220px_16px_1fr]">
            <div className="font-medium">Tanggal Pelaksanaan</div>
            <div>:</div>
            <div>{snapshot.schedule.executionDateLabel}</div>
          </div>
          <div className="grid grid-cols-[220px_16px_1fr]">
            <div className="font-medium">Waktu Pelaksanaan</div>
            <div>:</div>
            <div>
              {snapshot.schedule.startTimeLabel} - {snapshot.schedule.endTimeLabel} WIB
            </div>
          </div>
          <div className="grid grid-cols-[220px_16px_1fr]">
            <div className="font-medium">Ruangan</div>
            <div>:</div>
            <div>{snapshot.schedule.roomName}</div>
          </div>
          {snapshot.schedule.sessionLabel ? (
            <div className="grid grid-cols-[220px_16px_1fr]">
              <div className="font-medium">Sesi</div>
              <div>:</div>
              <div>{snapshot.schedule.sessionLabel}</div>
            </div>
          ) : null}
          {snapshot.schedule.classNames.length > 0 ? (
            <div className="grid grid-cols-[220px_16px_1fr]">
              <div className="font-medium">Kelas / Rombel</div>
              <div>:</div>
              <div>{snapshot.schedule.classNames.join(', ')}</div>
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-3 text-[20px] text-slate-900">
          <div className="grid grid-cols-[280px_16px_1fr]">
            <div>Jumlah Peserta Seharusnya</div>
            <div>:</div>
            <div>{snapshot.counts.expectedParticipants}</div>
          </div>
          <div className="grid grid-cols-[280px_16px_1fr]">
            <div>Jumlah Peserta yang tidak hadir</div>
            <div>:</div>
            <div>{snapshot.counts.absentParticipants}</div>
          </div>
          <div className="grid grid-cols-[280px_16px_1fr]">
            <div>Jumlah Peserta yang hadir</div>
            <div>:</div>
            <div>{snapshot.counts.presentParticipants}</div>
          </div>
        </div>

        <div className="mt-10">
          <div className="text-[20px] text-slate-900">Catatan Pengawas selama Ujian berlangsung.</div>
          <div className="mt-3 min-h-[180px] rounded-xl border border-slate-900 px-5 py-4 text-[18px] leading-8 text-slate-900">
            <p>{snapshot.notes || 'Tidak ada catatan tambahan dari pengawas.'}</p>
            {snapshot.incident ? (
              <p className="mt-4">
                <span className="font-semibold">Kejadian Khusus:</span> {snapshot.incident}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <div className="w-full max-w-[320px] text-center text-[18px] text-slate-900">
            <div className="font-medium">Pengawas,</div>
            <div className="mt-4 flex justify-center">
              <img
                src={verificationQrDataUrl}
                alt="QR Verifikasi Berita Acara"
                className="h-28 w-28 rounded-xl border border-slate-200 bg-white p-2"
              />
            </div>
            <div className="mt-3 text-sm leading-6 text-slate-600">{snapshot.proctor.signatureLabel}</div>
            <div className="mt-10 border-t border-slate-400 pt-2 font-semibold">{snapshot.proctor.name}</div>
            <div className="mt-2 text-sm text-slate-500">Dikirim ke Kurikulum pada {formatDateTime(snapshot.submittedAt)}</div>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {snapshot.verification.note}
          <div className="mt-1 break-all font-medium text-slate-700">{snapshot.verification.verificationUrl}</div>
        </div>
      </div>
    </div>
  );
}
