import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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

export default function ProctorAttendancePrint() {
  const navigate = useNavigate();
  const { reportId } = useParams<{ reportId: string }>();
  const [searchParams] = useSearchParams();
  const autoPrint = searchParams.get('autoprint') === '1';
  const printMode = searchParams.get('printMode');
  const isIframePrint = printMode === 'iframe';
  const parsedReportId = Number(reportId || 0);

  const documentQuery = useQuery({
    queryKey: ['proctor-attendance-document', parsedReportId],
    enabled: Number.isFinite(parsedReportId) && parsedReportId > 0,
    queryFn: async () => {
      const response = await api.get(`/proctoring/reports/${parsedReportId}/attendance-document`);
      return response.data?.data as AttendanceDocumentResponse;
    },
  });

  const preparePrintLayout = useCallback(async () => {
    if (typeof document === 'undefined') return;

    if ('fonts' in document) {
      try {
        await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      } catch {
        // ignore
      }
    }

    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>('.proctor-attendance-print-image'),
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
      const shell = document.querySelector<HTMLElement>('.proctor-attendance-shell');
      const contentReady = document.querySelector('[data-proctor-attendance-ready="true"]');
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
  }, []);

  const triggerPrint = useCallback(async () => {
    await preparePrintLayout();
    window.focus();
    window.print();
  }, [preparePrintLayout]);

  useEffect(() => {
    if (!autoPrint || !documentQuery.data) return;
    const printWhenReady = async () => {
      await triggerPrint();
    };
    void printWhenReady();
  }, [autoPrint, documentQuery.data, triggerPrint]);

  useEffect(() => {
    if (!isIframePrint || !documentQuery.data || typeof window === 'undefined' || window.parent === window) return;
    const notifyParent = async () => {
      await preparePrintLayout();
      window.parent.postMessage(
        {
          type: 'sis:proctor-print-ready',
          documentType: 'attendance',
          reportId: parsedReportId,
        },
        window.location.origin,
      );
    };
    void notifyParent();
  }, [documentQuery.data, isIframePrint, parsedReportId, preparePrintLayout]);

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
          onClick={() => {
            void triggerPrint();
          }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Printer className="mr-2 h-4 w-4" />
          Print Daftar Hadir
        </button>
      </div>

      <div
        className="proctor-attendance-shell mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white shadow-sm"
        style={{ maxWidth: '210mm', minHeight: '297mm', padding: '2.5cm' }}
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
              <div className="text-[22px] font-semibold tracking-wide text-slate-900">{snapshot.title}</div>
              <div className="mt-1 text-[15px] font-semibold uppercase tracking-wide text-slate-900">
                {formatExamHeadingLabel(snapshot.examLabel)}
              </div>
              <div className="mt-1 text-[15px] font-semibold uppercase tracking-wide text-slate-900">
                {snapshot.schoolName}
              </div>
              <div className="mt-1 text-[14px] font-semibold uppercase tracking-wide text-slate-900">
                Tahun Ajaran {snapshot.academicYearName}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-slate-900" />
        <div className="mt-1 border-t-2 border-slate-900" />

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 text-[12px] text-slate-700">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="font-semibold text-slate-900">No. Dokumen:</span> {snapshot.documentNumber}
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-800">
            Diverifikasi melalui QR internal SIS KGB2
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-10 gap-y-3 text-[13px] text-slate-900">
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
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Peserta Seharusnya</div>
            <div className="mt-1 text-[20px] font-semibold text-slate-900">{snapshot.counts.expectedParticipants}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Hadir</div>
            <div className="mt-1 text-[20px] font-semibold text-emerald-800">{snapshot.counts.presentParticipants}</div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-rose-700">Tidak Hadir</div>
            <div className="mt-1 text-[20px] font-semibold text-rose-800">{snapshot.counts.absentParticipants}</div>
          </div>
        </div>

        <div className="mt-8 overflow-hidden rounded-xl border border-slate-300">
          <table className="proctor-attendance-table min-w-full border-collapse text-[11px] text-slate-900">
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
                      className={`text-[11px] ${
                        participant.status === 'PRESENT'
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-rose-700'
                      }`}
                    >
                      {participant.statusLabel}
                      {participant.status === 'PRESENT' ? (
                        <span className="font-normal text-slate-600">
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
          <div className="max-w-xl text-[11px] leading-5 text-slate-600">
            <div>{snapshot.verification.note}</div>
            <div className="mt-2">Dokumen dibuat dari laporan pengawas yang telah dikirim ke Kurikulum.</div>
            <div className="mt-2">Dikirim pada {formatDateTime(snapshot.submittedAt)}.</div>
          </div>

          <div className="w-64 shrink-0 text-center">
            <div className="text-[14px] text-slate-900">Pengawas,</div>
            <div className="mt-4 flex justify-center">
              <img
                src={verificationQrDataUrl}
                alt="QR Verifikasi Daftar Hadir"
                className="proctor-attendance-print-image h-[104px] w-[104px] object-contain"
              />
            </div>
            <div className="mt-7 text-[14px] font-semibold text-slate-900">{snapshot.proctor.name}</div>
            <div className="mt-3 border-t border-slate-400" />
            <div className="mt-3 text-[11px] leading-5 text-slate-600">
              {snapshot.proctor.signatureLabel} Dokumen dikirim ke Kurikulum pada {formatDateTime(snapshot.submittedAt)}.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
