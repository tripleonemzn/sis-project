import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type VerificationResponse = {
  valid: boolean;
  verifiedAt: string;
  reportType: string;
  snapshot: {
    schoolName: string;
    academicYearName: string;
    semesterLabel: string;
    reportLabel: string;
    student: {
      id: number;
      name: string;
      nis: string;
      nisn: string;
      className: string;
    };
    homeroom: {
      title: string;
      name: string;
      nip?: string | null;
    };
    issue: {
      place: string;
      date: string;
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

export default function StudentReportVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-report-card-verification', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/public/report-cards/verify/${token}`);
      if (!response.ok) {
        throw new Error('Rapor tidak ditemukan.');
      }
      const payload = await response.json();
      return payload?.data as VerificationResponse;
    },
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {verificationQuery.isLoading ? (
            <div className="text-sm text-slate-600">Memverifikasi rapor SBTS...</div>
          ) : verificationQuery.isError || !verificationQuery.data ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Rapor Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                QR atau tautan verifikasi rapor SBTS tidak dikenali oleh sistem SIS KGB2.
              </p>
            </div>
          ) : (
            <>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="-rotate-12 opacity-[0.07]">
                  <div className="flex flex-col items-center">
                    <img src="/logo_sis_kgb2.png" alt="" className="h-56 w-56 object-contain" />
                    <div className="mt-4 text-center text-xl font-semibold uppercase tracking-[0.22em] text-emerald-900">
                      Dokumen ini sah dan legal secara internal
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative z-10 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="relative z-10 mt-4 text-center text-2xl font-bold text-slate-900">
                Rapor SBTS Terverifikasi
              </h1>
              <p className="relative z-10 mt-2 text-center text-sm text-slate-600">
                Dokumen rapor SBTS ini terdaftar di sistem SIS KGB2 dan dinyatakan valid.
              </p>

              <div className="relative z-10 mt-8 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-slate-700">
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dokumen</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.reportLabel}</div>
                  <div>
                    {verificationQuery.data.snapshot.schoolName} • Tahun Ajaran{' '}
                    {verificationQuery.data.snapshot.academicYearName}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Peserta Didik</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.student.name}</div>
                  <div>
                    {verificationQuery.data.snapshot.student.className} • NIS {verificationQuery.data.snapshot.student.nis} •
                    {' '}NISN {verificationQuery.data.snapshot.student.nisn}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Semester</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.semesterLabel}</div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Wali Kelas</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.homeroom.name}</div>
                  <div>
                    {verificationQuery.data.snapshot.homeroom.title}
                    {verificationQuery.data.snapshot.homeroom.nip
                      ? ` • NIP/NUPTK ${verificationQuery.data.snapshot.homeroom.nip}`
                      : ''}
                  </div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Tanggal Rapor</div>
                  <div className="font-semibold text-slate-900">
                    {verificationQuery.data.snapshot.issue.place}, {verificationQuery.data.snapshot.issue.date}
                  </div>
                </div>
              </div>

              <div className="relative z-10 mt-6 text-center text-xs text-slate-500">
                Verifikasi dilakukan pada {formatDateTime(verificationQuery.data.verifiedAt)}.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
