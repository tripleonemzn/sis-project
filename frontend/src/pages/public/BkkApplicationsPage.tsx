import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { humasService } from '../../services/humas.service';
import {
  ApplicationStatusBadge,
  ApplicantVerificationNotice,
  BKK_MY_APPLICATIONS_QUERY_KEY,
  InfoCard,
  extractApplicationsPayload,
  getActiveBkkProcessingCount,
  getSuccessfulBkkPlacementCount,
  isApplicantVerifiedStatus,
  isWithdrawableApplication,
  resolveVacancyCompany,
} from './bkkShared';

export const BkkApplicationsPage = () => {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });
  const applicationsQuery = useQuery({
    queryKey: BKK_MY_APPLICATIONS_QUERY_KEY,
    queryFn: humasService.getMyApplications,
    staleTime: 60_000,
  });
  const payload = useMemo(() => extractApplicationsPayload(applicationsQuery.data), [applicationsQuery.data]);
  const applicantVerified = isApplicantVerifiedStatus(meQuery.data?.data?.verificationStatus);

  const withdrawMutation = useMutation({
    mutationFn: async (applicationId: number) => humasService.withdrawMyApplication(applicationId),
    onSuccess: () => {
      toast.success('Lamaran berhasil dibatalkan');
      void queryClient.invalidateQueries({ queryKey: BKK_MY_APPLICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['public-bkk-vacancies'] });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal membatalkan lamaran');
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">Lamaran Saya</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Pantau Proses Lamaran BKK</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Halaman ini menampilkan seluruh lamaran yang sudah Anda kirim melalui aplikasi beserta status prosesnya.
        </p>
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        <InfoCard title="Total Lamaran">
          <p className="text-3xl font-semibold text-slate-900">{payload.summary.total}</p>
          <p className="mt-2 text-sm text-slate-600">Semua lamaran yang tercatat untuk akun ini.</p>
        </InfoCard>
        <InfoCard title="Sedang Diproses">
          <p className="text-3xl font-semibold text-slate-900">{getActiveBkkProcessingCount(payload.summary)}</p>
          <p className="mt-2 text-sm text-slate-600">Lamaran yang masih berjalan di pipeline BKK.</p>
        </InfoCard>
        <InfoCard title="Diterima Mitra">
          <p className="text-3xl font-semibold text-slate-900">{getSuccessfulBkkPlacementCount(payload.summary)}</p>
          <p className="mt-2 text-sm text-slate-600">Lamaran dengan keputusan akhir diterima oleh mitra industri.</p>
        </InfoCard>
        <InfoCard title="Ditutup">
          <p className="text-3xl font-semibold text-slate-900">
            {payload.summary.rejected + payload.summary.withdrawn}
          </p>
          <p className="mt-2 text-sm text-slate-600">Lamaran yang ditolak atau dibatalkan.</p>
        </InfoCard>
      </div>

      <ApplicantVerificationNotice status={meQuery.data?.data?.verificationStatus} />

      {applicationsQuery.isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Memuat lamaran...</div>
      ) : payload.applications.length > 0 ? (
        <div className="space-y-4">
          {payload.applications.map((application) => (
            <section key={application.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-orange-600">
                    {resolveVacancyCompany(application.vacancy)}
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">{application.vacancy.title}</h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Dikirim pada {new Date(application.appliedAt).toLocaleString('id-ID')}
                  </p>
                </div>
                <ApplicationStatusBadge status={application.status} />
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Ringkasan Lamaran</p>
                  <p className="mt-2">Sumber: {application.source || 'IN_APP'}</p>
                  <p className="mt-1">
                    Ekspektasi gaji: {application.expectedSalary?.trim() ? application.expectedSalary : 'Belum diisi'}
                  </p>
                  <p className="mt-1">
                    Deadline lowongan:{' '}
                    {application.vacancy.deadline
                      ? new Date(application.vacancy.deadline).toLocaleDateString('id-ID')
                      : 'Tidak dibatasi'}
                  </p>
                  {application.vacancy.registrationLink ? (
                    <a
                      href={application.vacancy.registrationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center text-sm font-semibold text-orange-700 transition hover:text-orange-800"
                    >
                      Buka tautan eksternal
                    </a>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Umpan Balik BKK</p>
                  <p className="mt-2 whitespace-pre-line">
                    {application.reviewerNotes?.trim()
                      ? application.reviewerNotes
                      : 'Belum ada catatan dari petugas BKK untuk lamaran ini.'}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Masuk Lamaran</p>
                  <p className="mt-2">{new Date(application.appliedAt).toLocaleString('id-ID')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Shortlist Mitra</p>
                  <p className="mt-2">
                    {application.shortlistedAt ? new Date(application.shortlistedAt).toLocaleString('id-ID') : 'Belum'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Interview Mitra</p>
                  <p className="mt-2">
                    {application.partnerInterviewAt ? new Date(application.partnerInterviewAt).toLocaleString('id-ID') : 'Belum'}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Keputusan Final</p>
                  <p className="mt-2">
                    {application.finalizedAt ? new Date(application.finalizedAt).toLocaleString('id-ID') : 'Belum'}
                  </p>
                </div>
              </div>

              {application.partnerReferenceCode || application.partnerDecisionNotes ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-900">Arsip Mitra Industri</p>
                  {application.partnerReferenceCode ? (
                    <p className="mt-2">
                      Referensi mitra: <span className="font-semibold text-slate-900">{application.partnerReferenceCode}</span>
                    </p>
                  ) : null}
                  <p className="mt-2 whitespace-pre-line">
                    {application.partnerDecisionNotes?.trim()
                      ? application.partnerDecisionNotes
                      : 'Belum ada catatan keputusan mitra yang dibagikan ke pelamar.'}
                  </p>
                </div>
              ) : null}

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">Board Seleksi BKK</p>
                    <p className="text-sm text-slate-500">
                      Tahapan tes dan review yang dikelola oleh tim BKK dan mitra industri.
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    Rekomendasi: {application.assessmentBoard?.summary.recommendation || 'INCOMPLETE'}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
                  {(application.assessmentBoard?.items || []).map((stage) => (
                    <div key={stage.code} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{stage.title}</p>
                          <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{stage.sourceType}</p>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                            stage.completed
                              ? stage.passed === false
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                          }`}
                        >
                          {stage.completed ? (stage.passed === false ? 'Perlu perhatian' : 'Selesai') : 'Menunggu'}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1">
                        <p>Nilai: {stage.score ?? '-'}</p>
                        <p>Bobot: {stage.weight}</p>
                        <p>Ambang lulus: {stage.passingScore ?? '-'}</p>
                        <p>Dinilai: {stage.assessedAt ? new Date(stage.assessedAt).toLocaleString('id-ID') : '-'}</p>
                      </div>
                      {stage.notes ? <p className="mt-3 text-xs leading-5 text-slate-500">{stage.notes}</p> : null}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Tahap Selesai</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {application.assessmentBoard?.summary.completedStages || 0}/
                      {application.assessmentBoard?.summary.totalStages || 0}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Nilai Akhir</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">
                      {application.assessmentBoard?.summary.weightedAverage ?? '-'}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">Tahap Menunggu</p>
                    <p className="mt-2">
                      {application.assessmentBoard?.summary.incompleteStages.length
                        ? application.assessmentBoard.summary.incompleteStages.join(', ')
                        : 'Semua tahap sudah diisi.'}
                    </p>
                  </div>
                </div>
              </div>

              {application.coverLetter?.trim() ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  <p className="font-semibold text-slate-800">Cover Letter</p>
                  <p className="mt-2 whitespace-pre-line">{application.coverLetter}</p>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  to="/public/vacancies"
                  className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Kembali ke Lowongan
                </Link>
                <Link
                  to={applicantVerified ? '/public/exams' : '/public/profile'}
                  className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    applicantVerified
                      ? 'border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                      : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  {applicantVerified ? 'Buka Tes BKK' : 'Tunggu Verifikasi Admin'}
                </Link>
                {isWithdrawableApplication(application.status) ? (
                  <button
                    type="button"
                    onClick={() => withdrawMutation.mutate(application.id)}
                    disabled={withdrawMutation.isPending}
                    className="inline-flex items-center rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {withdrawMutation.isPending ? 'Memproses...' : 'Batalkan Lamaran'}
                  </button>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          Belum ada lamaran yang terkirim. Buka halaman lowongan untuk mulai melamar.
        </div>
      )}
    </div>
  );
};
