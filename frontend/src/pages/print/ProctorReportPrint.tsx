import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';
import {
  buildStandardSchoolDocumentHeaderHtml,
  StandardSchoolDocumentHeader,
  type StandardSchoolDocumentHeaderSnapshot,
} from './shared/StandardSchoolDocumentHeader';

type ProctorReportDocumentSnapshot = {
  schoolName: string;
  schoolLogoPath: string;
  documentHeader: StandardSchoolDocumentHeaderSnapshot;
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

function escapeHtml(value?: string | null) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeMultilineHtml(value?: string | null) {
  return escapeHtml(value).replace(/\n/g, '<br />');
}

function buildProctorReportPrintHtml(params: {
  snapshot: ProctorReportDocumentSnapshot;
  verificationQrDataUrl: string;
}) {
  const { snapshot, verificationQrDataUrl } = params;
  const headerFontSize = '12pt';
  const contentFontSize = '11pt';
  const noteFontSize = '8pt';
  const noteText = (snapshot.notes || '-').trim() || '-';
  const noteHtml = escapeMultilineHtml(noteText);

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(snapshot.title)} - ${escapeHtml(snapshot.documentNumber)}</title>
      <style>
        @page { size: A4 portrait; margin: 2.5cm; }
        html, body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          color: #0f172a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: ${contentFontSize};
          line-height: 1.6;
        }
        .sheet { width: 100%; }
        .header-line {
          font-size: ${headerFontSize};
          line-height: 1.35;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .meta-row {
          margin-top: 12px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .meta-chip {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: ${noteFontSize};
        }
        .meta-note {
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
          color: #065f46;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: ${noteFontSize};
        }
        .narrative {
          margin-top: 24px;
          text-align: justify;
          font-size: ${contentFontSize};
          line-height: 1.8;
        }
        .counts {
          margin-top: 24px;
          display: grid;
          row-gap: 10px;
          font-size: ${contentFontSize};
        }
        .count-row {
          display: grid;
          grid-template-columns: 230px 16px 1fr;
        }
        .note-title {
          margin-top: 28px;
          font-weight: 700;
          font-size: ${contentFontSize};
        }
        .note-text {
          margin-top: 10px;
          font-size: ${contentFontSize};
          line-height: 1.75;
          white-space: pre-wrap;
        }
        .note-declaration {
          margin-top: 10px;
          font-size: ${contentFontSize};
        }
        .signature-row {
          margin-top: 28px;
          display: flex;
          justify-content: flex-end;
        }
        .signature-box {
          width: 300px;
          text-align: center;
          font-size: ${contentFontSize};
        }
        .signature-label {
          font-size: ${contentFontSize};
        }
        .qr-wrap {
          margin-top: 16px;
          display: flex;
          justify-content: center;
        }
        .qr {
          width: 104px;
          height: 104px;
          object-fit: contain;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #ffffff;
          padding: 8px;
        }
        .signature-name {
          margin-top: 28px;
          font-size: ${contentFontSize};
          font-weight: 700;
        }
        .signature-rule {
          margin-top: 10px;
          border-top: 1px solid #94a3b8;
        }
        .signature-note {
          margin-top: 10px;
          font-size: ${noteFontSize};
          line-height: 1.5;
          color: #475569;
        }
        .verify-box {
          margin-top: 24px;
          border: 1px dashed #cbd5e1;
          border-radius: 14px;
          background: #f8fafc;
          padding: 12px 16px;
          font-size: ${noteFontSize};
          line-height: 1.5;
          color: #475569;
        }
        .verify-url {
          margin-top: 4px;
          word-break: break-all;
          font-weight: 600;
          color: #334155;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${buildStandardSchoolDocumentHeaderHtml(snapshot.documentHeader)}

        <div style="text-align:center;">
          <div class="header-line">${escapeHtml(snapshot.title)}</div>
          <div class="header-line">${escapeHtml(formatExamHeadingLabel(snapshot.examLabel))}</div>
          <div class="header-line">${escapeHtml(snapshot.schoolName)}</div>
          <div class="header-line">Tahun Ajaran ${escapeHtml(snapshot.academicYearName)}</div>
        </div>

        <div class="meta-row">
          <div class="meta-chip"><strong>No. Dokumen:</strong> ${escapeHtml(snapshot.documentNumber)}</div>
          <div class="meta-note">Diverifikasi melalui QR internal SIS KGB2</div>
        </div>

        <div class="narrative">${escapeHtml(snapshot.narrative)}</div>

        <div class="counts">
          <div class="count-row"><div>Jumlah Peserta Seharusnya</div><div>:</div><div>${snapshot.counts.expectedParticipants}</div></div>
          <div class="count-row"><div>Jumlah Peserta yang tidak hadir</div><div>:</div><div>${snapshot.counts.absentParticipants}</div></div>
          <div class="count-row"><div>Jumlah Peserta yang hadir</div><div>:</div><div>${snapshot.counts.presentParticipants}</div></div>
        </div>

        <div class="note-title">Catatan Pengawas selama Ujian berlangsung.</div>
        <div class="note-text">${noteHtml}</div>
        <div class="note-declaration">Berita Acara ini dibuat dengan sesungguhnya</div>

        <div class="signature-row">
          <div class="signature-box">
            <div class="signature-label">Pengawas,</div>
            <div class="qr-wrap">
              <img src="${escapeHtml(verificationQrDataUrl)}" alt="QR Verifikasi Berita Acara" class="qr" />
            </div>
            <div class="signature-name">${escapeHtml(snapshot.proctor.name)}</div>
            <div class="signature-rule"></div>
            <div class="signature-note">${escapeHtml(snapshot.proctor.signatureLabel)} Dokumen dikirim ke Kurikulum pada ${escapeHtml(formatDateTime(snapshot.submittedAt))}.</div>
          </div>
        </div>

        <div class="verify-box">
          ${escapeHtml(snapshot.verification.note)}
          <div class="verify-url">${escapeHtml(snapshot.verification.verificationUrl)}</div>
        </div>
      </div>
    </body>
  </html>`;
}

export default function ProctorReportPrint() {
  const navigate = useNavigate();
  const { reportId } = useParams<{ reportId: string }>();
  const parsedReportId = Number(reportId || 0);
  const headerFontSize = '12pt';
  const contentFontSize = '11pt';
  const noteFontSize = '8pt';
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const documentQuery = useQuery({
    queryKey: ['proctor-report-document', parsedReportId],
    enabled: Number.isFinite(parsedReportId) && parsedReportId > 0,
    queryFn: async () => {
      const response = await api.get(`/proctoring/reports/${parsedReportId}/document`);
      return response.data?.data as DocumentResponse;
    },
  });

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
  const noteText = (snapshot.notes || '-').trim() || '-';
  const handlePrint = () => {
    const iframe = printIframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const printDoc = iframe.contentWindow.document;
    const html = buildProctorReportPrintHtml({ snapshot, verificationQrDataUrl });
    printDoc.open();
    printDoc.write(html);
    printDoc.close();
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 500);
  };

  return (
    <div className="proctor-report-root min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
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
          onClick={handlePrint}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Dokumen
        </button>
      </div>

      <div
        className="proctor-report-shell mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ maxWidth: '210mm', minHeight: '297mm', padding: '2.5cm', fontSize: contentFontSize }}
        data-proctor-report-ready="true"
      >
        <StandardSchoolDocumentHeader header={snapshot.documentHeader} />

        <div className="text-center">
          <div className="font-semibold tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.35 }}>{snapshot.title}</div>
          <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.35 }}>
            {formatExamHeadingLabel(snapshot.examLabel)}
          </div>
          <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.35 }}>
            {snapshot.schoolName}
          </div>
          <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.35 }}>
            Tahun Ajaran {snapshot.academicYearName}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4 text-slate-700" style={{ fontSize: noteFontSize }}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" style={{ fontSize: noteFontSize }}>
            <span className="font-semibold text-slate-900">No. Dokumen:</span> {snapshot.documentNumber}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800" style={{ fontSize: noteFontSize }}>
            Diverifikasi melalui QR internal SIS KGB2
          </div>
        </div>

        <div className="mt-7 text-slate-900" style={{ fontSize: contentFontSize, lineHeight: 1.8 }}>
          <p className="text-justify">{snapshot.narrative}</p>
        </div>

        <div className="mt-7 grid gap-2.5 text-slate-900" style={{ fontSize: contentFontSize }}>
          <div className="grid grid-cols-[230px_16px_1fr]">
            <div>Jumlah Peserta Seharusnya</div>
            <div>:</div>
            <div>{snapshot.counts.expectedParticipants}</div>
          </div>
          <div className="grid grid-cols-[230px_16px_1fr]">
            <div>Jumlah Peserta yang tidak hadir</div>
            <div>:</div>
            <div>{snapshot.counts.absentParticipants}</div>
          </div>
          <div className="grid grid-cols-[230px_16px_1fr]">
            <div>Jumlah Peserta yang hadir</div>
            <div>:</div>
            <div>{snapshot.counts.presentParticipants}</div>
          </div>
        </div>

        <div className="mt-8">
          <div className="font-semibold text-slate-900" style={{ fontSize: contentFontSize }}>Catatan Pengawas selama Ujian berlangsung.</div>
          <div className="mt-2 whitespace-pre-wrap text-slate-900" style={{ fontSize: contentFontSize, lineHeight: 1.75 }}>
            {noteText}
          </div>
          <div className="mt-2 text-slate-900" style={{ fontSize: contentFontSize }}>
            Berita Acara ini dibuat dengan sesungguhnya
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <div className="w-full max-w-[300px] text-center text-slate-900" style={{ fontSize: contentFontSize }}>
            <div className="font-medium" style={{ fontSize: contentFontSize }}>Pengawas,</div>
            <div className="mt-4 flex justify-center">
              <img
                src={verificationQrDataUrl}
                alt="QR Verifikasi Berita Acara"
                className="proctor-report-print-image h-[104px] w-[104px] rounded-xl border border-slate-200 bg-white p-2"
              />
            </div>
            <div className="mt-7 font-semibold" style={{ fontSize: contentFontSize }}>{snapshot.proctor.name}</div>
            <div className="mt-3 border-t border-slate-400" />
            <div className="mt-3 text-slate-600" style={{ fontSize: noteFontSize, lineHeight: 1.5 }}>
              {snapshot.proctor.signatureLabel} Dokumen dikirim ke Kurikulum pada {formatDateTime(snapshot.submittedAt)}.
            </div>
          </div>
        </div>

        <div className="mt-7 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-slate-600" style={{ fontSize: noteFontSize, lineHeight: 1.5 }}>
          {snapshot.verification.note}
          <div className="mt-1 break-all font-medium text-slate-700" style={{ fontSize: noteFontSize }}>{snapshot.verification.verificationUrl}</div>
        </div>
      </div>

      <iframe
        ref={printIframeRef}
        title="print-proctor-report-frame"
        style={{ display: 'none' }}
      />
    </div>
  );
}
