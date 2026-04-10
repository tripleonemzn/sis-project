import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';

type VerificationResponse = {
  valid: boolean;
  verifiedAt: string;
  participantNumber: string;
  cardId: number;
  snapshot: {
    title: string;
    examLabel: string;
    schoolName: string;
    academicYearName: string;
    student: {
      name: string;
      username: string;
      className: string;
      photoUrl?: string | null;
    };
    placement: {
      roomName: string;
      sessionLabel?: string | null;
      seatLabel?: string | null;
      startTime?: string | null;
      endTime?: string | null;
    };
    issueLabel?: string | null;
    principal: {
      name: string;
      title: string;
    };
  };
};

function resolveMediaUrl(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  return `/api/uploads/${raw.replace(/^\/+/, '')}`;
}

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

export default function ExamCardVerificationPage() {
  const { token } = useParams<{ token: string }>();

  const verificationQuery = useQuery({
    queryKey: ['public-exam-card-verification', token],
    enabled: Boolean(token),
    retry: false,
    queryFn: async () => {
      const response = await fetch(`/api/public/exam-cards/verify/${token}`);
      if (!response.ok) {
        throw new Error('Kartu ujian tidak ditemukan.');
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
            <div className="text-sm text-slate-600">Memverifikasi kartu ujian...</div>
          ) : verificationQuery.isError || !verificationQuery.data ? (
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <ShieldAlert className="h-8 w-8" />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Kartu Tidak Valid</h1>
              <p className="mt-2 text-sm text-slate-600">
                QR atau tautan verifikasi kartu ujian tidak dikenali oleh sistem SIS KGB2.
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
              <h1 className="relative z-10 mt-4 text-center text-2xl font-bold text-slate-900">Kartu Ujian Terverifikasi</h1>
              <p className="relative z-10 mt-2 text-center text-sm text-slate-600">
                Kartu peserta ujian ini terdaftar di sistem SIS KGB2 dan dinyatakan valid.
              </p>

              <div className="relative z-10 mt-8 grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5 text-sm text-slate-700">
                {verificationQuery.data.snapshot.student.photoUrl ? (
                  <div className="grid gap-3 rounded-2xl border border-emerald-100 bg-white/80 p-4 md:grid-cols-[92px_minmax(0,1fr)] md:items-center">
                    <div className="flex justify-center md:justify-start">
                      <div className="h-24 w-[92px] overflow-hidden rounded-xl border border-emerald-100 bg-white">
                        <img
                          src={resolveMediaUrl(verificationQuery.data.snapshot.student.photoUrl)}
                          alt={`Foto ${verificationQuery.data.snapshot.student.name}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Foto Formal Peserta</div>
                      <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.student.name}</div>
                      <div>
                        {verificationQuery.data.snapshot.student.className} • @{verificationQuery.data.snapshot.student.username}
                      </div>
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Nomor Peserta</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.participantNumber}</div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Program Ujian</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.examLabel}</div>
                  <div>
                    {verificationQuery.data.snapshot.schoolName} • Tahun Ajaran {verificationQuery.data.snapshot.academicYearName}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Peserta</div>
                  <div className="font-semibold text-slate-900">{verificationQuery.data.snapshot.student.name}</div>
                  <div>
                    {verificationQuery.data.snapshot.student.className} • @{verificationQuery.data.snapshot.student.username}
                  </div>
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Penempatan</div>
                  <div>
                    Ruang {verificationQuery.data.snapshot.placement.roomName}
                    {verificationQuery.data.snapshot.placement.sessionLabel
                      ? ` • Sesi ${verificationQuery.data.snapshot.placement.sessionLabel}`
                      : ''}
                    {verificationQuery.data.snapshot.placement.seatLabel
                      ? ` • Kursi ${verificationQuery.data.snapshot.placement.seatLabel}`
                      : ''}
                  </div>
                  {verificationQuery.data.snapshot.placement.startTime || verificationQuery.data.snapshot.placement.endTime ? (
                    <div>
                      {formatDateTime(verificationQuery.data.snapshot.placement.startTime)} -{' '}
                      {formatDateTime(verificationQuery.data.snapshot.placement.endTime)}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Legalitas</div>
                  <div>{verificationQuery.data.snapshot.issueLabel || '-'}</div>
                  <div>
                    {verificationQuery.data.snapshot.principal.title} • {verificationQuery.data.snapshot.principal.name}
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
