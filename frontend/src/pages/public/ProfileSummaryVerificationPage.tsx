import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type VerificationResponse = {
  valid: boolean;
  verifiedAt: string;
  generatedAt: string;
  snapshot: {
    formalPhotoUrl?: string | null;
    user: {
      name: string;
      username: string;
      role: string;
      verificationStatus?: string | null;
      email?: string | null;
      phone?: string | null;
    };
  };
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  TEACHER: 'Guru',
  STUDENT: 'Siswa',
  PRINCIPAL: 'Kepala Sekolah',
  STAFF: 'Staff',
  PARENT: 'Orang Tua / Wali',
  CALON_SISWA: 'Calon Siswa',
  UMUM: 'Pelamar BKK',
  EXAMINER: 'Penguji Eksternal',
  EXTRACURRICULAR_TUTOR: 'Tutor / Pembina',
};

const VERIFICATION_LABELS: Record<string, string> = {
  VERIFIED: 'Terverifikasi',
  PENDING: 'Menunggu Verifikasi',
  REJECTED: 'Perlu Review',
};

function normalizeText(value?: string | null) {
  return String(value || '').trim();
}

function resolveMediaUrl(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/api/uploads/${raw.replace(/^\/+/, '')}`;
}

function formatRoleLabel(role?: string | null) {
  const normalized = normalizeText(role).toUpperCase();
  return ROLE_LABELS[normalized] || normalized || '-';
}

function formatVerificationLabel(status?: string | null) {
  const normalized = normalizeText(status).toUpperCase();
  return VERIFICATION_LABELS[normalized] || normalized || '-';
}

function formatDateTime(value?: string | null) {
  const raw = normalizeText(value);
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProfileSummaryVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-profile-summary-verification', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/public/profile-summaries/verify/${token}`);
      if (!response.ok) {
        throw new Error('Ringkasan profil tidak ditemukan.');
      }
      const payload = await response.json();
      return payload?.data as VerificationResponse;
    },
  });

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          {verificationQuery.isLoading ? (
            <div className="text-sm text-slate-600">Memverifikasi ringkasan profil...</div>
          ) : verificationQuery.isError || !verificationQuery.data ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Dokumen Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                Barcode atau tautan verifikasi ringkasan profil ini tidak dikenali oleh sistem SIS KGB2.
              </p>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-center text-2xl font-bold text-slate-900">Ringkasan Profil Terverifikasi</h1>
              <p className="mt-2 text-center text-sm text-slate-600">
                Dokumen ini valid dan sesuai dengan data profil pengguna terbaru yang tersimpan di sistem SIS KGB2.
              </p>

              <div className="mt-8 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-slate-700">
                {verificationQuery.data.snapshot.formalPhotoUrl ? (
                  <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 md:grid-cols-[96px_minmax(0,1fr)] md:items-center">
                    <div className="flex justify-center md:justify-start">
                      <div className="h-[144px] w-[96px] overflow-hidden rounded-xl border border-emerald-100 bg-white">
                        <img
                          src={resolveMediaUrl(verificationQuery.data.snapshot.formalPhotoUrl)}
                          alt={`Foto ${verificationQuery.data.snapshot.user.name}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Foto Formal</div>
                      <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.user.name}</div>
                      <div>
                        {formatRoleLabel(verificationQuery.data.snapshot.user.role)} • @
                        {verificationQuery.data.snapshot.user.username}
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Nama Lengkap</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.user.name}</div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Akun</div>
                  <div>@{verificationQuery.data.snapshot.user.username}</div>
                  <div>{formatRoleLabel(verificationQuery.data.snapshot.user.role)}</div>
                </div>

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Status Verifikasi</div>
                  <div>{formatVerificationLabel(verificationQuery.data.snapshot.user.verificationStatus)}</div>
                </div>

                {normalizeText(verificationQuery.data.snapshot.user.email) ? (
                  <div className="grid gap-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Email</div>
                    <div>{verificationQuery.data.snapshot.user.email}</div>
                  </div>
                ) : null}

                {normalizeText(verificationQuery.data.snapshot.user.phone) ? (
                  <div className="grid gap-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">No. Telepon</div>
                    <div>{verificationQuery.data.snapshot.user.phone}</div>
                  </div>
                ) : null}

                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Legalitas Dokumen</div>
                  <div>Dicetak pada {formatDateTime(verificationQuery.data.generatedAt)}</div>
                  <div>Diverifikasi pada {formatDateTime(verificationQuery.data.verifiedAt)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
