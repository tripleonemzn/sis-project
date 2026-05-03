import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type VerificationPayload = {
  verified: boolean;
  signerRole: string;
  documentTitle?: string | null;
  teacherName?: string | null;
  approvedAt?: string | null;
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

export default function TeachingResourceVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-teaching-resource-verification', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/public/teaching-resources/verify/${token}`);
      if (!response.ok) throw new Error('Verifikasi perangkat ajar tidak ditemukan.');
      const payload = await response.json();
      return payload?.data as VerificationPayload;
    },
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          {verificationQuery.isLoading ? (
            <p className="text-sm text-slate-600">Memverifikasi tanda tangan perangkat ajar...</p>
          ) : verificationQuery.isError || !verificationQuery.data?.verified ? (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Tanda Tangan Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                Barcode perangkat ajar ini tidak dikenali atau dokumen belum disetujui final.
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Tanda Tangan Terverifikasi</h1>
              <div className="mt-6 rounded-2xl bg-slate-50 p-5 text-left text-sm text-slate-700">
                <div className="flex justify-between gap-4 border-b border-slate-200 py-2">
                  <span className="font-medium">Penanda tangan</span>
                  <span>{verificationQuery.data.signerRole}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-200 py-2">
                  <span className="font-medium">Dokumen</span>
                  <span className="text-right">{verificationQuery.data.documentTitle || '-'}</span>
                </div>
                <div className="flex justify-between gap-4 border-b border-slate-200 py-2">
                  <span className="font-medium">Guru</span>
                  <span>{verificationQuery.data.teacherName || '-'}</span>
                </div>
                <div className="flex justify-between gap-4 py-2">
                  <span className="font-medium">Disetujui final</span>
                  <span>{formatDateTime(verificationQuery.data.approvedAt)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
