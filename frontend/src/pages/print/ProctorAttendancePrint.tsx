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

type ProctorAttendanceDocumentSnapshot = {
  documentHeader: StandardSchoolDocumentHeaderSnapshot;
  schoolName: string;
  schoolLogoPath: string;
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
  counts: {
    expectedParticipants: number;
    absentParticipants: number;
    presentParticipants: number;
  };
  participants: Array<{
    id: number;
    name: string;
    nis: string | null;
    className: string | null;
    status: 'PRESENT' | 'ABSENT';
    statusLabel: string;
    startTimeLabel: string;
    submitTimeLabel: string;
    absentReason: string | null;
    permissionStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  }>;
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

type AttendanceDocumentResponse = {
  reportId: number;
  documentNumber: string;
  snapshot: ProctorAttendanceDocumentSnapshot;
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

function buildExecutionSlotValue(schedule: ProctorAttendanceDocumentSnapshot['schedule']) {
  const orderLabel =
    Number.isFinite(Number(schedule.executionOrder)) && Number(schedule.executionOrder) > 0
      ? String(schedule.executionOrder)
      : '-';
  const sessionLabel = String(schedule.sessionLabel || '').trim();
  return sessionLabel ? `${orderLabel} / ${sessionLabel}` : orderLabel;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildAttendancePrintLayout(snapshot: ProctorAttendanceDocumentSnapshot) {
  const detailLabels = [
    'Mata Pelajaran',
    'Tanggal Pelaksanaan',
    'Waktu Pelaksanaan',
    'Ruangan',
    'Jam ke / Sesi',
    'Kelas / Rombel',
  ];
  const longestLabel = detailLabels.reduce((max, label) => Math.max(max, label.length), 0);
  const longestName = snapshot.participants.reduce((max, participant) => Math.max(max, String(participant.name || '').length), 'Nama Siswa'.length);
  const longestClass = snapshot.participants.reduce(
    (max, participant) => Math.max(max, String(participant.className || '-').length),
    'Kelas / Rombel'.length,
  );
  const longestStatus = snapshot.participants.reduce((max, participant) => {
    const statusLine =
      participant.status === 'PRESENT'
        ? `${participant.statusLabel} | Mulai ${participant.startTimeLabel} • Selesai ${participant.submitTimeLabel}`
        : participant.statusLabel;
    return Math.max(max, statusLine.length);
  }, 'Status'.length);
  const longestNote = snapshot.participants.reduce(
    (max, participant) => Math.max(max, String(participant.absentReason || '-').length),
    'Keterangan'.length,
  );

  return {
    detailLabelWidth: `${clampNumber(longestLabel + 1, 16, 20)}ch`,
    nameWidth: `${clampNumber(Math.ceil(longestName * 0.82), 22, 30)}ch`,
    classWidth: `${clampNumber(Math.ceil(longestClass * 0.95), 12, 17)}ch`,
    statusWidth: `${clampNumber(Math.ceil(longestStatus * 0.68), 23, 31)}ch`,
    noteWidth: `${clampNumber(Math.ceil(longestNote * 0.58), 12, 20)}ch`,
  };
}

function buildParticipantRows(snapshot: ProctorAttendanceDocumentSnapshot) {
  return snapshot.participants
    .map((participant, index) => {
      const statusLine =
        participant.status === 'PRESENT'
          ? `${participant.statusLabel} | Mulai ${participant.startTimeLabel} • Selesai ${participant.submitTimeLabel}`
          : participant.statusLabel;
      const statusColor = participant.status === 'PRESENT' ? '#047857' : '#be123c';

      return `
        <tr>
          <td class="cell-center">${index + 1}</td>
          <td class="cell-name"><strong>${escapeHtml(participant.name)}</strong></td>
          <td class="cell-center">${escapeHtml(participant.className || '-')}</td>
          <td class="cell-status" style="color:${statusColor};font-weight:600;">${escapeHtml(statusLine)}</td>
          <td class="cell-note">${escapeHtml(participant.absentReason || '-')}</td>
        </tr>
      `;
    })
    .join('');
}

function buildProctorAttendancePrintHtml(params: {
  snapshot: ProctorAttendanceDocumentSnapshot;
  verificationQrDataUrl: string;
}) {
  const { snapshot, verificationQrDataUrl } = params;
  const headerFontSize = '10.5pt';
  const contentFontSize = '9.5pt';
  const tableFontSize = '8.75pt';
  const noteFontSize = '6.75pt';
  const layout = buildAttendancePrintLayout(snapshot);
  const signatureNote = `Ditandatangani dan dikirim ke Kurikulum secara digital oleh pengawas ruang pada ${formatDateOnly(
    snapshot.submittedAt,
  )} pukul ${formatTimeOnly(snapshot.submittedAt)}.`;
  const executionSlotValue = buildExecutionSlotValue(snapshot.schedule);
  const participantRows = buildParticipantRows(snapshot);

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(snapshot.title)} - ${escapeHtml(snapshot.documentNumber)}</title>
      <style>
        @page { size: A4 portrait; margin: 1cm; }
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
          line-height: 1.45;
        }
        .sheet {
          width: 100%;
          box-sizing: border-box;
        }
        .document-body {
          padding: 0 0 28mm;
          box-sizing: border-box;
        }
        .header-line {
          font-size: ${headerFontSize};
          line-height: 1.24;
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
        .detail-grid {
          --detail-label-width: ${layout.detailLabelWidth};
          margin-top: 18px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 7px 24px;
          font-size: ${contentFontSize};
          line-height: 1.2;
        }
        .detail-col {
          display: grid;
          row-gap: 4px;
        }
        .detail-row {
          display: grid;
          grid-template-columns: var(--detail-label-width) 12px 1fr;
        }
        .count-cards {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .count-card {
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
          padding: 8px 10px;
          font-size: ${contentFontSize};
          line-height: 1.2;
        }
        .count-card.success {
          border-color: #a7f3d0;
          background: #ecfdf5;
        }
        .count-card.danger {
          border-color: #fecdd3;
          background: #fff1f2;
        }
        .count-card-label {
          font-size: ${noteFontSize};
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
          color: #475569;
        }
        .count-card-value {
          margin-top: 4px;
          font-size: ${contentFontSize};
          font-weight: 700;
        }
        table {
          width: 100%;
          margin-top: 16px;
          border-collapse: collapse;
          font-size: ${tableFontSize};
          table-layout: auto;
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 6px 8px;
          text-align: left;
          vertical-align: top;
          line-height: 1.2;
        }
        thead {
          display: table-header-group;
        }
        thead th {
          background: #f8fafc;
          font-weight: 700;
          text-align: center;
        }
        .cell-center {
          text-align: center;
          vertical-align: middle;
        }
        .cell-name {
          word-break: break-word;
        }
        .cell-status {
          white-space: nowrap;
          text-align: center;
          vertical-align: middle;
        }
        .cell-note {
          word-break: break-word;
        }
        .footer-row {
          margin-top: 16px;
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
          width: 96px;
          height: 96px;
          object-fit: contain;
          border: 1px solid #cbd5e1;
          border-radius: 12px;
          background: #ffffff;
          padding: 8px;
        }
        .signature-name-wrap {
          margin-top: 8px;
          display: inline-block;
          max-width: 100%;
        }
        .signature-name {
          font-size: ${contentFontSize};
          font-weight: 700;
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
          left: 1cm;
          right: 1cm;
          bottom: 0;
          padding-top: 0;
          font-size: ${noteFontSize};
          line-height: 1.2;
          color: #475569;
          font-style: italic;
        }
        .verify-url {
          margin-top: 2px;
          word-break: break-all;
          color: #334155;
          font-style: italic;
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

          <div class="detail-grid">
            <div class="detail-col">
              <div class="detail-row"><div>Mata Pelajaran</div><div>:</div><div>${escapeHtml(snapshot.schedule.subjectName)}</div></div>
              <div class="detail-row"><div>Tanggal Pelaksanaan</div><div>:</div><div>${escapeHtml(snapshot.schedule.executionDateLabel)}</div></div>
              <div class="detail-row"><div>Waktu Pelaksanaan</div><div>:</div><div>${escapeHtml(snapshot.schedule.startTimeLabel)} - ${escapeHtml(snapshot.schedule.endTimeLabel)} WIB</div></div>
            </div>
            <div class="detail-col">
              <div class="detail-row"><div>Ruangan</div><div>:</div><div>${escapeHtml(snapshot.schedule.roomName)}</div></div>
              <div class="detail-row"><div>Jam ke / Sesi</div><div>:</div><div>${escapeHtml(executionSlotValue)}</div></div>
              <div class="detail-row"><div>Kelas / Rombel</div><div>:</div><div>${escapeHtml(snapshot.schedule.classNames.join(', ') || '-')}</div></div>
            </div>
          </div>

          <div class="count-cards">
            <div class="count-card">
              <div class="count-card-label">Peserta Seharusnya</div>
              <div class="count-card-value">${snapshot.counts.expectedParticipants}</div>
            </div>
            <div class="count-card success">
              <div class="count-card-label">Hadir</div>
              <div class="count-card-value">${snapshot.counts.presentParticipants}</div>
            </div>
            <div class="count-card danger">
              <div class="count-card-label">Tidak Hadir</div>
              <div class="count-card-value">${snapshot.counts.absentParticipants}</div>
            </div>
          </div>

          <table>
            <colgroup>
              <col style="width:5ch;" />
              <col style="width:${layout.nameWidth};" />
              <col style="width:${layout.classWidth};" />
              <col style="width:${layout.statusWidth};" />
              <col style="width:${layout.noteWidth};" />
            </colgroup>
            <thead>
              <tr>
                <th>No</th>
                <th>Nama Siswa</th>
                <th>Kelas / Rombel</th>
                <th>Status</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              ${participantRows}
            </tbody>
          </table>

          <div class="footer-row">
            <div class="signature-box">
              <div class="signature-label">Pengawas,</div>
              <div class="qr-wrap">
                <img src="${escapeHtml(verificationQrDataUrl)}" alt="QR Verifikasi Daftar Hadir" class="qr" />
              </div>
              <div class="signature-name-wrap">
                <div class="signature-name">${escapeHtml(snapshot.proctor.name)}</div>
                <div class="signature-rule"></div>
              </div>
              <div class="signature-note">${escapeHtml(signatureNote)}</div>
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

export default function ProctorAttendancePrint() {
  const navigate = useNavigate();
  const { reportId } = useParams<{ reportId: string }>();
  const parsedReportId = Number(reportId || 0);
  const headerFontSize = '10.5pt';
  const contentFontSize = '9.5pt';
  const tableFontSize = '8.75pt';
  const noteFontSize = '6.75pt';
  const printIframeRef = useRef<HTMLIFrameElement>(null);

  const documentQuery = useQuery({
    queryKey: ['proctor-attendance-document', parsedReportId],
    enabled: Number.isFinite(parsedReportId) && parsedReportId > 0,
    queryFn: async () => {
      const response = await api.get(`/proctoring/reports/${parsedReportId}/attendance-document`);
      return response.data?.data as AttendanceDocumentResponse;
    },
  });

  if (!Number.isFinite(parsedReportId) || parsedReportId <= 0) {
    return <div className="min-h-screen bg-slate-100 p-6 text-sm text-rose-700">ID daftar hadir tidak valid.</div>;
  }

  if (documentQuery.isLoading) {
    return <div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-600">Menyiapkan daftar hadir digital...</div>;
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-rose-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-rose-700">Gagal memuat dokumen daftar hadir.</p>
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
  const layout = buildAttendancePrintLayout(snapshot);
  const executionSlotValue = buildExecutionSlotValue(snapshot.schedule);
  const signatureNote = `Ditandatangani dan dikirim ke Kurikulum secara digital oleh pengawas ruang pada ${formatDateOnly(
    snapshot.submittedAt,
  )} pukul ${formatTimeOnly(snapshot.submittedAt)}.`;

  const handlePrint = () => {
    const iframe = printIframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    const printDoc = iframe.contentWindow.document;
    const html = buildProctorAttendancePrintHtml({ snapshot, verificationQrDataUrl });
    printDoc.open();
    printDoc.write(html);
    printDoc.close();
    window.setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }, 500);
  };

  return (
    <div className="proctor-attendance-root min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4 portrait;
          margin: 1cm;
        }
        @media print {
          .proctor-attendance-root {
            min-height: auto !important;
            padding: 0 !important;
            background: #fff !important;
          }
          body {
            background: #fff !important;
          }
          .proctor-attendance-no-print {
            display: none !important;
          }
          .proctor-attendance-shell {
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
            width: auto !important;
            max-width: 190mm !important;
            min-height: 0 !important;
            border-radius: 0 !important;
            padding: 0 !important;
            box-sizing: border-box !important;
          }
          .proctor-attendance-table thead {
            display: table-header-group;
          }
        }
      `}</style>

      <div className="proctor-attendance-no-print mx-auto mb-4 flex max-w-6xl items-center justify-between px-4">
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
          Print Daftar Hadir
        </button>
      </div>

      <div
        className="proctor-attendance-shell mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{
          width: '210mm',
          maxWidth: '210mm',
          minHeight: '297mm',
          padding: '1cm',
          fontSize: contentFontSize,
          boxSizing: 'border-box',
          position: 'relative',
        }}
        data-proctor-attendance-ready="true"
      >
        <StandardSchoolDocumentHeader header={snapshot.documentHeader} />

        <div style={{ padding: '0 0 36mm', boxSizing: 'border-box' }}>
          <div className="mt-0.5 flex flex-wrap items-start justify-between gap-4 text-slate-600 italic" style={{ fontSize: noteFontSize }}>
            <div style={{ fontSize: noteFontSize }}>
              No. Dokumen: {snapshot.documentNumber}
            </div>
            <div className="text-green-700" style={{ fontSize: noteFontSize }}>
              Diverifikasi melalui QR internal SIS KGB2
            </div>
          </div>

          <div className="mt-2.5 text-center">
            <div className="font-semibold tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.24 }}>{snapshot.title}</div>
            <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.24 }}>
              {formatExamHeadingLabel(snapshot.examLabel)}
            </div>
            <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.24 }}>
              {snapshot.schoolName}
            </div>
            <div className="mt-1 font-semibold uppercase tracking-wide text-slate-900" style={{ fontSize: headerFontSize, lineHeight: 1.24 }}>
              Tahun Ajaran {snapshot.academicYearName}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-2 text-slate-900" style={{ fontSize: contentFontSize, lineHeight: 1.2 }}>
            <div className="grid gap-1">
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Mata Pelajaran</div>
                <div>:</div>
                <div>{snapshot.schedule.subjectName}</div>
              </div>
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Tanggal Pelaksanaan</div>
                <div>:</div>
                <div>{snapshot.schedule.executionDateLabel}</div>
              </div>
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Waktu Pelaksanaan</div>
                <div>:</div>
                <div>
                  {snapshot.schedule.startTimeLabel} - {snapshot.schedule.endTimeLabel} WIB
                </div>
              </div>
            </div>
            <div className="grid gap-1">
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Ruangan</div>
                <div>:</div>
                <div>{snapshot.schedule.roomName}</div>
              </div>
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Jam ke / Sesi</div>
                <div>:</div>
                <div>{executionSlotValue}</div>
              </div>
              <div className="grid grid-cols-[var(--detail-label-width)_12px_1fr]" style={{ ['--detail-label-width' as string]: layout.detailLabelWidth }}>
                <div>Kelas / Rombel</div>
                <div>:</div>
                <div>{snapshot.schedule.classNames.join(', ') || '-'}</div>
              </div>
            </div>
          </div>

          <div className="mt-4.5 grid grid-cols-3 gap-2">
            <div className="rounded-[10px] border border-slate-300 bg-slate-50 px-3 py-2 text-slate-900">
              <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: noteFontSize, lineHeight: 1.1, fontWeight: 700 }}>Peserta Seharusnya</div>
              <div className="mt-1 font-semibold" style={{ fontSize: contentFontSize, lineHeight: 1.1 }}>{snapshot.counts.expectedParticipants}</div>
            </div>
            <div className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
              <div className="uppercase tracking-wide text-emerald-700" style={{ fontSize: noteFontSize, lineHeight: 1.1, fontWeight: 700 }}>Hadir</div>
              <div className="mt-1 font-semibold" style={{ fontSize: contentFontSize, lineHeight: 1.1 }}>{snapshot.counts.presentParticipants}</div>
            </div>
            <div className="rounded-[10px] border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
              <div className="uppercase tracking-wide text-rose-700" style={{ fontSize: noteFontSize, lineHeight: 1.1, fontWeight: 700 }}>Tidak Hadir</div>
              <div className="mt-1 font-semibold" style={{ fontSize: contentFontSize, lineHeight: 1.1 }}>{snapshot.counts.absentParticipants}</div>
            </div>
          </div>

          <div className="mt-4.5 overflow-hidden rounded-xl border border-slate-300">
            <table className="proctor-attendance-table min-w-full border-collapse text-slate-900" style={{ fontSize: tableFontSize, tableLayout: 'auto' }}>
              <colgroup>
                <col style={{ width: '5ch' }} />
                <col style={{ width: layout.nameWidth }} />
                <col style={{ width: layout.classWidth }} />
                <col style={{ width: layout.statusWidth }} />
                <col style={{ width: layout.noteWidth }} />
              </colgroup>
              <thead className="bg-slate-100">
                <tr>
                  <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">No</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">Nama Siswa</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">Kelas / Rombel</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">Status</th>
                  <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.participants.map((participant, index) => (
                  <tr key={participant.id}>
                    <td className="border border-slate-300 px-2 py-1.5 text-center align-middle">{index + 1}</td>
                    <td className="border border-slate-300 px-2 py-1.5 align-top break-words">
                      <div className="font-semibold text-slate-900">{participant.name}</div>
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center align-middle">{participant.className || '-'}</td>
                    <td className="border border-slate-300 px-2 py-1.5 text-center align-middle whitespace-nowrap">
                      <div
                        className={`${
                          participant.status === 'PRESENT'
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-rose-700'
                        }`}
                        style={{ fontSize: tableFontSize }}
                      >
                        {participant.statusLabel}
                        {participant.status === 'PRESENT' ? (
                          <span className="font-normal text-slate-600 whitespace-nowrap" style={{ fontSize: tableFontSize }}>
                            {' '}
                            | Mulai {participant.startTimeLabel} • Selesai {participant.submitTimeLabel}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="border border-slate-300 px-2 py-1.5 align-top whitespace-pre-wrap break-words">
                      {participant.absentReason || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-[300px] text-center text-slate-900" style={{ fontSize: contentFontSize }}>
              <div className="font-medium" style={{ fontSize: contentFontSize }}>Pengawas,</div>
              <div className="mt-2 flex justify-center">
                <img
                  src={verificationQrDataUrl}
                  alt="QR Verifikasi Daftar Hadir"
                  className="proctor-attendance-print-image h-24 w-24 rounded-xl border border-slate-200 bg-white p-2 object-contain"
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

          <div
            className="absolute italic text-slate-600"
            style={{ left: '1cm', right: '1cm', bottom: '1cm', fontSize: noteFontSize, lineHeight: 1.2 }}
          >
            {snapshot.verification.note}
            <div className="mt-0.5 break-all italic text-slate-700" style={{ fontSize: noteFontSize }}>
              {snapshot.verification.verificationUrl}
            </div>
          </div>
        </div>
      </div>

      <iframe
        ref={printIframeRef}
        title="print-proctor-attendance-frame"
        style={{ display: 'none' }}
      />
    </div>
  );
}
