import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';
import api from '../../services/api';

type ProctorAttendanceDocumentSnapshot = {
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

function resolveAbsoluteAssetUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (typeof window === 'undefined') return raw;
  return new URL(raw, window.location.origin).toString();
}

function buildProctorAttendancePrintHtml(params: {
  snapshot: ProctorAttendanceDocumentSnapshot;
  verificationQrDataUrl: string;
}) {
  const { snapshot, verificationQrDataUrl } = params;
  const headerFontSize = '12pt';
  const contentFontSize = '11pt';
  const noteFontSize = '8pt';
  const logoUrl = resolveAbsoluteAssetUrl(snapshot.schoolLogoPath);
  const participantRows = snapshot.participants
    .map((participant, index) => {
      const statusLine =
        participant.status === 'PRESENT'
          ? `${participant.statusLabel} | Mulai ${participant.startTimeLabel} • Selesai ${participant.submitTimeLabel}`
          : participant.statusLabel;
      const statusColor = participant.status === 'PRESENT' ? '#047857' : '#be123c';
      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(participant.name)}</strong></td>
          <td>${escapeHtml(participant.nis || '-')}</td>
          <td>${escapeHtml(participant.className || '-')}</td>
          <td style="color:${statusColor}; font-weight:600;">${escapeHtml(statusLine)}</td>
          <td>${escapeHtml(participant.absentReason || '-')}</td>
        </tr>
      `;
    })
    .join('');

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
        .header-wrap { text-align: center; }
        .header-group {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 2cm;
        }
        .logo {
          width: 112px;
          height: 112px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .header-line {
          font-size: ${headerFontSize};
          line-height: 1.35;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .rule-top {
          margin-top: 16px;
          border-top: 1px solid #0f172a;
        }
        .rule-bottom {
          margin-top: 4px;
          border-top: 2px solid #0f172a;
        }
        .meta-row {
          margin-top: 16px;
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
          font-size: ${contentFontSize};
        }
        .meta-note {
          border: 1px solid #a7f3d0;
          background: #ecfdf5;
          color: #065f46;
          border-radius: 10px;
          padding: 8px 12px;
          font-size: ${noteFontSize};
        }
        .detail-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px 40px;
          font-size: ${contentFontSize};
        }
        .detail-col {
          display: grid;
          row-gap: 8px;
        }
        .detail-row {
          display: grid;
          grid-template-columns: 170px 16px 1fr;
        }
        .summary-grid {
          margin-top: 24px;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 12px;
        }
        .summary-box {
          border-radius: 14px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          padding: 12px 16px;
          font-size: ${contentFontSize};
        }
        .summary-box.success {
          border-color: #a7f3d0;
          background: #ecfdf5;
          color: #065f46;
        }
        .summary-box.danger {
          border-color: #fecdd3;
          background: #fff1f2;
          color: #9f1239;
        }
        .summary-label {
          font-size: ${contentFontSize};
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .summary-value {
          margin-top: 4px;
          font-size: ${contentFontSize};
          font-weight: 700;
        }
        table {
          width: 100%;
          margin-top: 24px;
          border-collapse: collapse;
          font-size: ${contentFontSize};
        }
        th, td {
          border: 1px solid #cbd5e1;
          padding: 8px 10px;
          text-align: left;
          vertical-align: top;
        }
        thead th {
          background: #f1f5f9;
          font-weight: 700;
        }
        .footer-row {
          margin-top: 36px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
        }
        .footer-note {
          max-width: 470px;
          font-size: ${noteFontSize};
          line-height: 1.5;
          color: #475569;
        }
        .signature-box {
          width: 260px;
          text-align: center;
        }
        .signature-label {
          font-size: ${contentFontSize};
        }
        .qr {
          margin-top: 16px;
          width: 104px;
          height: 104px;
          object-fit: contain;
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
      </style>
    </head>
    <body>
      <div class="sheet">
        <div class="header-wrap">
          <div class="header-group">
            <img src="${escapeHtml(logoUrl)}" alt="Logo KGB2" class="logo" />
            <div>
              <div class="header-line">${escapeHtml(snapshot.title)}</div>
              <div class="header-line">${escapeHtml(formatExamHeadingLabel(snapshot.examLabel))}</div>
              <div class="header-line">${escapeHtml(snapshot.schoolName)}</div>
              <div class="header-line">Tahun Ajaran ${escapeHtml(snapshot.academicYearName)}</div>
            </div>
          </div>
        </div>
        <div class="rule-top"></div>
        <div class="rule-bottom"></div>

        <div class="meta-row">
          <div class="meta-chip"><strong>No. Dokumen:</strong> ${escapeHtml(snapshot.documentNumber)}</div>
          <div class="meta-note">Diverifikasi melalui QR internal SIS KGB2</div>
        </div>

        <div class="detail-grid">
          <div class="detail-col">
            <div class="detail-row"><div>Mata Pelajaran</div><div>:</div><div>${escapeHtml(snapshot.schedule.subjectName)}</div></div>
            <div class="detail-row"><div>Tanggal Pelaksanaan</div><div>:</div><div>${escapeHtml(snapshot.schedule.executionDateLabel)}</div></div>
            <div class="detail-row"><div>Waktu Pelaksanaan</div><div>:</div><div>${escapeHtml(snapshot.schedule.startTimeLabel)} - ${escapeHtml(snapshot.schedule.endTimeLabel)} WIB</div></div>
          </div>
          <div class="detail-col">
            <div class="detail-row"><div>Ruangan</div><div>:</div><div>${escapeHtml(snapshot.schedule.roomName)}</div></div>
            <div class="detail-row"><div>Sesi</div><div>:</div><div>${escapeHtml(snapshot.schedule.sessionLabel || '-')}</div></div>
            <div class="detail-row"><div>Kelas / Rombel</div><div>:</div><div>${escapeHtml(snapshot.schedule.classNames.join(', ') || '-')}</div></div>
          </div>
        </div>

        <div class="summary-grid">
          <div class="summary-box">
            <div class="summary-label">Peserta Seharusnya</div>
            <div class="summary-value">${snapshot.counts.expectedParticipants}</div>
          </div>
          <div class="summary-box success">
            <div class="summary-label">Hadir</div>
            <div class="summary-value">${snapshot.counts.presentParticipants}</div>
          </div>
          <div class="summary-box danger">
            <div class="summary-label">Tidak Hadir</div>
            <div class="summary-value">${snapshot.counts.absentParticipants}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Siswa</th>
              <th>NIS</th>
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
          <div class="footer-note">
            <div>${escapeHtml(snapshot.verification.note)}</div>
            <div style="margin-top: 8px;">Dokumen dibuat dari laporan pengawas yang telah dikirim ke Kurikulum.</div>
            <div style="margin-top: 8px;">Dikirim pada ${escapeHtml(formatDateTime(snapshot.submittedAt))}.</div>
          </div>
          <div class="signature-box">
            <div class="signature-label">Pengawas,</div>
            <div style="display:flex; justify-content:center;">
              <img src="${escapeHtml(verificationQrDataUrl)}" alt="QR Verifikasi Daftar Hadir" class="qr" />
            </div>
            <div class="signature-name">${escapeHtml(snapshot.proctor.name)}</div>
            <div class="signature-rule"></div>
            <div class="signature-note">${escapeHtml(snapshot.proctor.signatureLabel)} Dokumen dikirim ke Kurikulum pada ${escapeHtml(formatDateTime(snapshot.submittedAt))}.</div>
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
  const headerFontSize = '12pt';
  const contentFontSize = '11pt';
  const noteFontSize = '8pt';
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
          margin: 2.5cm;
        }
        @media print {
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
            max-width: none !important;
            border-radius: 0 !important;
            padding: 0 !important;
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
        className="proctor-attendance-shell mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ maxWidth: '210mm', minHeight: '297mm', padding: '2.5cm', fontSize: contentFontSize }}
        data-proctor-attendance-ready="true"
      >
        <div className="flex justify-center">
          <div className="inline-flex items-center justify-center" style={{ columnGap: '2cm' }}>
            <img
              src={snapshot.schoolLogoPath}
              alt="Logo KGB2"
              className="proctor-attendance-print-image h-[112px] w-[112px] shrink-0 object-contain"
            />
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
          </div>
        </div>

        <div className="mt-4 border-t border-slate-900" />
        <div className="mt-1 border-t-2 border-slate-900" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-slate-700" style={{ fontSize: contentFontSize }}>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" style={{ fontSize: contentFontSize }}>
            <span className="font-semibold text-slate-900">No. Dokumen:</span> {snapshot.documentNumber}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800" style={{ fontSize: noteFontSize }}>
            Diverifikasi melalui QR internal SIS KGB2
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3 text-slate-900" style={{ fontSize: contentFontSize }}>
          <div className="grid gap-2">
            <div className="grid grid-cols-[170px_16px_1fr]">
              <div>Mata Pelajaran</div>
              <div>:</div>
              <div>{snapshot.schedule.subjectName}</div>
            </div>
            <div className="grid grid-cols-[170px_16px_1fr]">
              <div>Tanggal Pelaksanaan</div>
              <div>:</div>
              <div>{snapshot.schedule.executionDateLabel}</div>
            </div>
            <div className="grid grid-cols-[170px_16px_1fr]">
              <div>Waktu Pelaksanaan</div>
              <div>:</div>
              <div>
                {snapshot.schedule.startTimeLabel} - {snapshot.schedule.endTimeLabel} WIB
              </div>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="grid grid-cols-[150px_16px_1fr]">
              <div>Ruangan</div>
              <div>:</div>
              <div>{snapshot.schedule.roomName}</div>
            </div>
            <div className="grid grid-cols-[150px_16px_1fr]">
              <div>Sesi</div>
              <div>:</div>
              <div>{snapshot.schedule.sessionLabel || '-'}</div>
            </div>
            <div className="grid grid-cols-[150px_16px_1fr]">
              <div>Kelas / Rombel</div>
              <div>:</div>
              <div>{snapshot.schedule.classNames.join(', ') || '-'}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="font-semibold uppercase tracking-wide text-slate-500" style={{ fontSize: contentFontSize }}>Peserta Seharusnya</div>
            <div className="mt-1 font-semibold text-slate-900" style={{ fontSize: contentFontSize }}>{snapshot.counts.expectedParticipants}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="font-semibold uppercase tracking-wide text-emerald-700" style={{ fontSize: contentFontSize }}>Hadir</div>
            <div className="mt-1 font-semibold text-emerald-800" style={{ fontSize: contentFontSize }}>{snapshot.counts.presentParticipants}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="font-semibold uppercase tracking-wide text-rose-700" style={{ fontSize: contentFontSize }}>Tidak Hadir</div>
            <div className="mt-1 font-semibold text-rose-800" style={{ fontSize: contentFontSize }}>{snapshot.counts.absentParticipants}</div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-300">
          <table className="proctor-attendance-table min-w-full border-collapse text-slate-900" style={{ fontSize: contentFontSize }}>
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">No</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Nama Siswa</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">NIS</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Kelas / Rombel</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Status</th>
                <th className="border border-slate-300 px-3 py-2 text-left font-semibold">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.participants.map((participant, index) => (
                <tr key={participant.id}>
                  <td className="border border-slate-300 px-3 py-2 align-top">{index + 1}</td>
                  <td className="border border-slate-300 px-3 py-2 align-top">
                    <div className="font-semibold text-slate-900">{participant.name}</div>
                  </td>
                  <td className="border border-slate-300 px-3 py-2 align-top">{participant.nis || '-'}</td>
                  <td className="border border-slate-300 px-3 py-2 align-top">{participant.className || '-'}</td>
                  <td className="border border-slate-300 px-3 py-2 align-top">
                    <div
                      className={`${
                        participant.status === 'PRESENT'
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-rose-700'
                      }`}
                      style={{ fontSize: contentFontSize }}
                    >
                      {participant.statusLabel}
                      {participant.status === 'PRESENT' ? (
                        <span className="font-normal text-slate-600" style={{ fontSize: contentFontSize }}>
                          {' '}
                          | Mulai {participant.startTimeLabel} • Selesai {participant.submitTimeLabel}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="border border-slate-300 px-3 py-2 align-top whitespace-pre-wrap">
                    {participant.absentReason || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex items-start justify-between gap-6">
          <div className="max-w-xl text-slate-600" style={{ fontSize: noteFontSize, lineHeight: 1.5 }}>
            <div>{snapshot.verification.note}</div>
            <div className="mt-2">Dokumen dibuat dari laporan pengawas yang telah dikirim ke Kurikulum.</div>
            <div className="mt-2">Dikirim pada {formatDateTime(snapshot.submittedAt)}.</div>
          </div>

          <div className="w-64 shrink-0 text-center">
            <div className="text-slate-900" style={{ fontSize: contentFontSize }}>Pengawas,</div>
            <div className="mt-4 flex justify-center">
              <img
                src={verificationQrDataUrl}
                alt="QR Verifikasi Daftar Hadir"
                className="proctor-attendance-print-image h-[104px] w-[104px] object-contain"
              />
            </div>
            <div className="mt-7 font-semibold text-slate-900" style={{ fontSize: contentFontSize }}>{snapshot.proctor.name}</div>
            <div className="mt-3 border-t border-slate-400" />
            <div className="mt-3 text-slate-600" style={{ fontSize: noteFontSize, lineHeight: 1.5 }}>
              {snapshot.proctor.signatureLabel} Dokumen dikirim ke Kurikulum pada {formatDateTime(snapshot.submittedAt)}.
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
