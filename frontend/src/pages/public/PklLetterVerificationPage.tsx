import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type PklLetterVerificationResponse = {
  valid: boolean;
  documentType: string;
  token: string;
  verifiedAt: string;
  issuedDate: string;
  participantCount: number;
  companyName: string;
  academicYearName: string;
  student: {
    name: string;
    nis: string;
    className: string;
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

export default function PklLetterVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-pkl-letter-verification', token],
    enabled: Boolean(token),
    queryFn: async () => {
      const response = await fetch(`/api/public/pkl-letters/verify/${token}`);
      if (!response.ok) {
        throw new Error('Surat PKL tidak ditemukan.');
      }
      const payload = await response.json();
      return payload?.data as PklLetterVerificationResponse;
    },
    retry: false,
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {verificationQuery.isLoading ? (
            <div className="text-sm text-slate-600">Memverifikasi surat PKL...</div>
          ) : verificationQuery.isError || !verificationQuery.data ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Dokumen Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                QR atau tautan verifikasi surat PKL tidak dikenali oleh sistem SIS KGB2.
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
              <h1 className="relative z-10 mt-4 text-center text-2xl font-bold text-slate-900">Dokumen Terverifikasi</h1>
              <p className="relative z-10 mt-2 text-center text-sm text-slate-600">
                Surat PKL ini terdaftar di sistem SIS KGB2 dan dinyatakan valid secara internal.
              </p>

              <div className="relative z-10 mt-8 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-slate-700">
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Dokumen</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.documentType}</div>
                  <div>Tahun Ajaran {verificationQuery.data.academicYearName}</div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Tujuan PKL</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.companyName}</div>
                  <div>
                    Peserta terdaftar: {verificationQuery.data.participantCount} siswa - Tanggal surat:{' '}
                    {verificationQuery.data.issuedDate}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Referensi Peserta</div>
                  <div>
                    {verificationQuery.data.student.name} - {verificationQuery.data.student.nis} -{' '}
                    {verificationQuery.data.student.className}
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
