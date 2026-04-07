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
    executionOrder: number | null;
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

function formatDateOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimeOnly(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleTimeString('id-ID', {
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

function buildExecutionSlotValue(schedule: ProctorReportDocumentSnapshot['schedule']) {
  const orderLabel = Number.isFinite(Number(schedule.executionOrder)) && Number(schedule.executionOrder) > 0
    ? String(schedule.executionOrder)
    : '-';
  const sessionLabel = String(schedule.sessionLabel || '').trim();
  return sessionLabel ? `${orderLabel} / ${sessionLabel}` : orderLabel;
}

function buildProctorReportPrintHtml(params: {
  snapshot: ProctorReportDocumentSnapshot;
  verificationQrDataUrl: string;
}) {
  const { snapshot, verificationQrDataUrl } = params;
  const headerFontSize = '12pt';
  const contentFontSize = '11pt';
  const noteFontSize = '7pt';
  const noteText = (snapshot.notes || '-').trim() || '-';
  const noteHtml = escapeMultilineHtml(noteText);
  const signatureNote = `Ditandatangani dan dikirim ke Kurikulum secara digital oleh pengawas ruang pada ${formatDateOnly(
    snapshot.submittedAt,
  )} pukul ${formatTimeOnly(snapshot.submittedAt)}.`;
  const executionSlotValue = buildExecutionSlotValue(snapshot.schedule);

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(snapshot.title)} - ${escapeHtml(snapshot.documentNumber)}</title>
      <style>
        @page { margin: 1cm; }
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
        .sheet {
          width: 100%;
          box-sizing: border-box;
        }
        .document-body {
          padding: 0 1.5cm 24mm;
          box-sizing: border-box;
        }
        .header-line {
          font-size: ${headerFontSize};
          line-height: 1.35;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .meta-row {
          margin-top: 2px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .meta-text {
          font-size: ${noteFontSize};
          font-style: italic;
          color: #475569;
        }
        .meta-verify {
          color: #15803d;
        }
        .narrative {
          margin-top: 16px;
          text-align: justify;
          font-size: ${contentFontSize};
          line-height: 1.65;
        }
        .counts {
          margin-top: 16px;
          margin-left: 1cm;
          display: grid;
          row-gap: 6px;
          font-size: ${contentFontSize};
        }
        .count-row {
          display: grid;
          grid-template-columns: 230px 16px 1fr;
        }
        .note-title {
          margin-top: 18px;
          font-weight: 700;
          font-size: ${contentFontSize};
        }
        .note-text {
          margin-top: 8px;
          font-size: ${contentFontSize};
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .note-declaration {
          margin-top: 8px;
          font-size: ${contentFontSize};
        }
        .closing-section {
          margin-top: 18px;
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .signature-row {
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
          margin-top: 8px;
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
          font-size: ${contentFontSize};
          font-weight: 700;
        }
        .signature-name-wrap {
          margin-top: 8px;
          display: inline-block;
          max-width: 100%;
        }
        .signature-rule {
          margin-top: 2px;
          border-top: 1px solid #94a3b8;
        }
        .signature-note {
          margin-top: 4px;
          font-size: ${noteFontSize};
          line-height: 1.25;
          color: #475569;
          font-style: italic;
        }
        .verify-block {
          position: fixed;
          left: calc(1cm + 1.5cm);
          right: calc(1cm + 1.5cm);
          bottom: 0;
          font-size: ${noteFontSize};
          line-height: 1.2;
          color: #475569;
          font-style: italic;
        }
        .verify-url {
          margin-top: 2px;
          word-break: break-all;
          font-style: italic;
          color: #334155;
        }
      </style>
    </head>
    <body>
      <div class="sheet">
        ${buildStandardSchoolDocumentHeaderHtml(snapshot.documentHeader)}
        <div class="document-body">
          <div class="meta-row">
            <div class="meta-text">No. Dokumen: ${escapeHtml(snapshot.documentNumber)}</div>
            <div class="meta-text meta-verify">Diverifikasi melalui QR internal SIS KGB2</div>
          </div>

          <div style="margin-top:10px;text-align:center;">
            <div class="header-line">${escapeHtml(snapshot.title)}</div>
            <div class="header-line">${escapeHtml(formatExamHeadingLabel(snapshot.examLabel))}</div>
            <div class="header-line">${escapeHtml(snapshot.schoolName)}</div>
            <div class="header-line">Tahun Ajaran ${escapeHtml(snapshot.academicYearName)}</div>
          </div>

          <div class="narrative">${escapeHtml(snapshot.narrative)}</div>

          <div class="counts">
            <div class="count-row"><div>Jam ke / Sesi</div><div>:</div><div>${escapeHtml(executionSlotValue)}</div></div>
            <div class="count-row"><div>Jumlah Peserta Seharusnya</div><div>:</div><div>${snapshot.counts.expectedParticipants}</div></div>
            <div class="count-row"><div>Jumlah Peserta yang tidak hadir</div><div>:</div><div>${snapshot.counts.absentParticipants}</div></div>
            <div class="count-row"><div>Jumlah Peserta yang hadir</div><div>:</div><div>${snapshot.counts.presentParticipants}</div></div>
          </div>

          <div class="note-title">Catatan Pengawas selama Ujian berlangsung.</div>
          <div class="note-text">${noteHtml}</div>
          <div class="note-declaration">Berita Acara ini dibuat dengan sesungguhnya</div>

          <div class="closing-section">
            <div class="signature-row">
              <div class="signature-box">
                <div class="signature-label">Pengawas,</div>
                <div class="qr-wrap">
                  <img src="${escapeHtml(verificationQrDataUrl)}" alt="QR Verifikasi Berita Acara" class="qr" />
                </div>
                <div class="signature-name-wrap">
                  <div class="signature-name">${escapeHtml(snapshot.proctor.name)}</div>
                  <div class="signature-rule"></div>
                </div>
                <div class="signature-note">${escapeHtml(signatureNote)}</div>
              </div>
            </div>

          </div>

          <div class="verify-block">
            ${escapeHtml(snapshot.verification.note)}
            <div class="verify-url">${escapeHtml(snapshot.verification.verificationUrl)}</div>
          </div>
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
  const noteFontSize = '7pt';
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
  const signatureNote = `Ditandatangani dan dikirim ke Kurikulum secara digital oleh pengawas ruang pada ${formatDateOnly(
    snapshot.submittedAt,
  )} pukul ${formatTimeOnly(snapshot.submittedAt)}.`;
  const executionSlotValue = buildExecutionSlotValue(snapshot.schedule);
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
          margin: 1cm;
        }
        @media print {
          .proctor-report-root {
            min-height: auto !important;
            padding: 0 !important;
            background: #fff !important;
          }
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
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            border-radius: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
            overflow: visible !important;
          }
          .proctor-report-document-body {
            padding-bottom: 24mm !important;
          }
          .proctor-report-closing-section {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
          .proctor-report-verify-block {
            position: fixed !important;
            left: 2.5cm !important;
            right: 2.5cm !important;
            bottom: 0 !important;
            margin-top: 0 !important;
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
        className="proctor-report-shell mx-auto w-full max-w-[960px] rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{
          padding: '1cm',
          fontSize: contentFontSize,
          boxSizing: 'border-box',
        }}
        data-proctor-report-ready="true"
      >
        <StandardSchoolDocumentHeader header={snapshot.documentHeader} />

        <div className="proctor-report-document-body" style={{ padding: '0 1.5cm 0', boxSizing: 'border-box' }}>
          <div className="mt-0.5 flex flex-wrap items-start justify-between gap-4 text-slate-600 italic" style={{ fontSize: noteFontSize }}>
            <div style={{ fontSize: noteFontSize }}>
              No. Dokumen: {snapshot.documentNumber}
            </div>
            <div className="text-green-700" style={{ fontSize: noteFontSize }}>
              Diverifikasi melalui QR internal SIS KGB2
            </div>
          </div>

          <div className="mt-2.5 text-center">
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

          <div className="mt-4 text-slate-900" style={{ fontSize: contentFontSize, lineHeight: 1.65 }}>
            <p className="text-justify">{snapshot.narrative}</p>
          </div>

          <div className="mt-4 grid gap-1.5 text-slate-900" style={{ fontSize: contentFontSize, marginLeft: '1cm' }}>
            <div className="grid grid-cols-[230px_16px_1fr]">
              <div>Jam ke / Sesi</div>
              <div>:</div>
              <div>{executionSlotValue}</div>
            </div>
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

          <div className="mt-[18px]">
            <div className="font-semibold text-slate-900" style={{ fontSize: contentFontSize }}>Catatan Pengawas selama Ujian berlangsung.</div>
            <div className="mt-2 whitespace-pre-wrap text-slate-900" style={{ fontSize: contentFontSize, lineHeight: 1.55 }}>
              {noteText}
            </div>
            <div className="mt-2 text-slate-900" style={{ fontSize: contentFontSize }}>
              Berita Acara ini dibuat dengan sesungguhnya
            </div>
          </div>

          <div className="proctor-report-closing-section mt-[18px]">
            <div className="flex justify-end">
              <div className="w-full max-w-[300px] text-center text-slate-900" style={{ fontSize: contentFontSize }}>
                <div className="font-medium" style={{ fontSize: contentFontSize }}>Pengawas,</div>
                <div className="mt-2 flex justify-center">
                  <img
                    src={verificationQrDataUrl}
                    alt="QR Verifikasi Berita Acara"
                    className="proctor-report-print-image h-[104px] w-[104px] rounded-xl border border-slate-200 bg-white p-2"
                  />
                </div>
                <div className="mt-2 inline-block max-w-full">
                  <div className="font-semibold" style={{ fontSize: contentFontSize }}>{snapshot.proctor.name}</div>
                  <div className="mt-0.5 border-t border-slate-400" />
                </div>
                <div className="mt-1 italic text-slate-600" style={{ fontSize: noteFontSize, lineHeight: 1.25 }}>
                  {signatureNote}
                </div>
              </div>
            </div>

          </div>

          <div
            className="proctor-report-verify-block mt-4 italic text-slate-600"
            style={{ fontSize: noteFontSize, lineHeight: 1.2 }}
          >
            {snapshot.verification.note}
            <div className="mt-0.5 break-all italic text-slate-700" style={{ fontSize: noteFontSize }}>{snapshot.verification.verificationUrl}</div>
          </div>
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
