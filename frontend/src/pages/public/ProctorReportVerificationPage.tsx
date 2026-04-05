import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type VerificationResponse = {
  valid: boolean;
  reportId: number;
  documentNumber: string;
  verifiedAt: string;
  snapshot: {
    schoolName: string;
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
    };
    counts: {
      expectedParticipants: number;
      absentParticipants: number;
      presentParticipants: number;
    };
    submittedAt: string;
    proctor: {
      name: string;
    };
  };
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

function formatDocumentLabel(label?: string | null) {
  const normalized = String(label || '').trim();
  if (!normalized) return 'Ujian';
  return /^ujian\b/i.test(normalized) ? normalized : `Ujian ${normalized}`;
}

export default function ProctorReportVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-proctor-report-verification', token],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await fetch(`/api/public/proctoring-reports/verify/${token}`);
      if (!response.ok) {
        throw new Error('Dokumen berita acara tidak ditemukan.');
      }
      const payload = await response.json();
      return payload?.data as VerificationResponse;
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {verificationQuery.isLoading ? (
            <div className="text-sm text-slate-600">Memverifikasi dokumen berita acara...</div>
          ) : verificationQuery.isError || !verificationQuery.data ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Dokumen Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                QR atau tautan verifikasi tidak dikenali oleh sistem SIS KGB2.
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-center text-2xl font-bold text-slate-900">Dokumen Terverifikasi</h1>
              <p className="mt-2 text-center text-sm text-slate-600">
                Dokumen berita acara ini terdaftar di sistem SIS KGB2 dan dinyatakan valid.
              </p>

              <div className="mt-8 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-slate-700">
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Nomor Dokumen</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.documentNumber}</div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dokumen</div>
                  <div className="font-semibold text-slate-900">
                    {verificationQuery.data.snapshot.title} {formatDocumentLabel(verificationQuery.data.snapshot.examLabel)}
                  </div>
                  <div>
                    {verificationQuery.data.snapshot.schoolName} • Tahun Ajaran {verificationQuery.data.snapshot.academicYearName}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Pelaksanaan</div>
                  <div>
                    {verificationQuery.data.snapshot.schedule.executionDateLabel} •{' '}
                    {verificationQuery.data.snapshot.schedule.startTimeLabel} - {verificationQuery.data.snapshot.schedule.endTimeLabel} WIB
                  </div>
                  <div>
                    {verificationQuery.data.snapshot.schedule.subjectName} • Ruang {verificationQuery.data.snapshot.schedule.roomName}
                  </div>
                  {verificationQuery.data.snapshot.schedule.sessionLabel ? (
                    <div>Sesi {verificationQuery.data.snapshot.schedule.sessionLabel}</div>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Pengawas</div>
                  <div>{verificationQuery.data.snapshot.proctor.name}</div>
                  <div>Dikirim pada {formatDateTime(verificationQuery.data.snapshot.submittedAt)}</div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Rekap Peserta</div>
                  <div>
                    Seharusnya {verificationQuery.data.snapshot.counts.expectedParticipants} • Hadir{' '}
                    {verificationQuery.data.snapshot.counts.presentParticipants} • Tidak hadir{' '}
                    {verificationQuery.data.snapshot.counts.absentParticipants}
                  </div>
                </div>
              </div>

              {verificationQuery.data.snapshot.schedule.classNames.length > 0 ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Kelas / Rombel</div>
                  <div className="mt-2">{verificationQuery.data.snapshot.schedule.classNames.join(', ')}</div>
                </div>
              ) : null}

              <div className="mt-6 text-center text-xs text-slate-500">
                Verifikasi dilakukan pada {formatDateTime(verificationQuery.data.verifiedAt)}.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
