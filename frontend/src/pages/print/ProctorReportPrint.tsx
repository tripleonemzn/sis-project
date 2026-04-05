import { useCallback, useEffect } from 'react';
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
  const normalized = String(label || '').replace(/^ujian\s+/i, '').trim();
  if (!normalized) return 'UJIAN';
  return normalized.toUpperCase();
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

  const triggerPrint = useCallback(async () => {
    if (typeof document === 'undefined') return;

    if ('fonts' in document) {
      try {
        await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      } catch {
        // ignore
      }
    }

    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>('.proctor-report-print-image'),
    );
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          }),
      ),
    );

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const shell = document.querySelector<HTMLElement>('.proctor-report-shell');
      const contentReady = document.querySelector('[data-proctor-report-ready="true"]');
      const hasText = Boolean(shell?.textContent?.replace(/\s+/g, '').trim());
      const hasLayout = (shell?.getBoundingClientRect().height || 0) > 320;
      if (contentReady && hasText && hasLayout) break;
      await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
    }

    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            window.setTimeout(resolve, 700);
          });
        });
      });
    });

    document.body.getBoundingClientRect();
    window.focus();
    window.print();
  }, []);

  useEffect(() => {
    if (!autoPrint || !documentQuery.data) return;
    const printWhenReady = async () => {
      await triggerPrint();
    };
    void printWhenReady();
  }, [autoPrint, documentQuery.data, triggerPrint]);

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
        @page {
          size: A4 portrait;
          margin: 2.5cm;
        }
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
            border-radius: 0 !important;
            padding: 0 !important;
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
          onClick={() => {
            void triggerPrint();
          }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Dokumen
        </button>
      </div>

      <div
        className="proctor-report-shell mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ maxWidth: '210mm', minHeight: '297mm', padding: '2.5cm' }}
        data-proctor-report-ready="true"
      >
        <div className="flex justify-center">
          <div className="inline-flex items-center justify-center" style={{ columnGap: '2cm' }}>
            <img
              src={snapshot.schoolLogoPath}
              alt="Logo KGB2"
              className="proctor-report-print-image h-[112px] w-[112px] shrink-0 object-contain"
            />
            <div className="text-center">
              <div className="text-[26px] font-semibold tracking-wide text-slate-900">{snapshot.title}</div>
              <div className="mt-1 text-[18px] font-semibold uppercase tracking-wide text-slate-900">
                {formatExamHeadingLabel(snapshot.examLabel)}
              </div>
              <div className="mt-1 text-[18px] font-semibold uppercase tracking-wide text-slate-900">
                {snapshot.schoolName}
              </div>
              <div className="mt-1 text-[18px] font-semibold uppercase tracking-wide text-slate-900">
                Tahun Ajaran {snapshot.academicYearName}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-900" />
        <div className="mt-1 border-t-2 border-slate-900" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-sm text-slate-700">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-900">No. Dokumen:</span> {snapshot.documentNumber}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            Diverifikasi melalui QR internal SIS KGB2
          </div>
        </div>

        <div className="mt-8 text-[18px] leading-10 text-slate-900">
          <p className="text-justify">{snapshot.narrative}</p>
        </div>

        <div className="mt-8 grid gap-3 text-[19px] text-slate-900">
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
          <div className="text-[19px] text-slate-900">Catatan Pengawas selama Ujian berlangsung.</div>
          <div
            className="mt-3 min-h-[210px] rounded-xl border border-slate-900 text-[18px] leading-8 text-slate-900 whitespace-pre-wrap"
            style={{ padding: '0.55cm 0.65cm' }}
          >
            <p>{snapshot.notes || 'Tidak ada catatan tambahan dari pengawas.'}</p>
          </div>
        </div>

        <div className="mt-12 flex justify-end">
          <div className="w-full max-w-[320px] text-center text-[18px] text-slate-900">
            <div className="font-medium">Pengawas,</div>
            <div className="mt-4 flex justify-center">
              <img
                src={verificationQrDataUrl}
                alt="QR Verifikasi Berita Acara"
                className="proctor-report-print-image h-28 w-28 rounded-xl border border-slate-200 bg-white p-2"
              />
            </div>
            <div className="mt-8 font-semibold">{snapshot.proctor.name}</div>
            <div className="mt-3 border-t border-slate-400" />
            <div className="mt-3 text-sm leading-6 text-slate-600">
              {snapshot.proctor.signatureLabel} Dokumen dikirim ke Kurikulum pada {formatDateTime(snapshot.submittedAt)}.
            </div>
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
