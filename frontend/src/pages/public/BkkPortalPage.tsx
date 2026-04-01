import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, Building2, ExternalLink, FileText, ShieldCheck, UserRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { humasService, type JobVacancy } from '../../services/humas.service';
import { DashboardWelcomeCard } from '../../components/common/DashboardWelcomeCard';
import {
  ApplicationStatusBadge,
  ApplicantVerificationNotice,
  BKK_APPLICANT_PROFILE_QUERY_KEY,
  BKK_MY_APPLICATIONS_QUERY_KEY,
  InfoCard,
  VerificationBadge,
  extractApplicantProfilePayload,
  extractApplicationsPayload,
  getActiveBkkProcessingCount,
  getSuccessfulBkkPlacementCount,
  isApplicantVerifiedStatus,
  resolveVacancyCompany,
  useOpenVacancies,
} from './bkkShared';

function VacancyCard({
  item,
  footer,
}: {
  item: JobVacancy;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
          <p className="mt-1 text-sm text-slate-600">{resolveVacancyCompany(item)}</p>
        </div>
        <span
          className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            item.isOpen ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {item.isOpen ? 'Aktif' : 'Tutup'}
        </span>
      </div>

      {item.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-slate-600">
        <span className="inline-flex items-center gap-2">
          <Building2 size={16} className="text-orange-600" />
          {resolveVacancyCompany(item)}
        </span>
        {item.deadline ? <span>Deadline: {new Date(item.deadline).toLocaleDateString('id-ID')}</span> : null}
        {typeof item.applicationCount === 'number' ? <span>{item.applicationCount} pelamar</span> : null}
      </div>

      {item.requirements ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Kebutuhan</p>
          <p className="mt-2 whitespace-pre-line">{item.requirements}</p>
        </div>
      ) : null}

      {item.myApplication ? (
        <div className="mt-4 flex items-center justify-between rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Lamaran sudah terkirim</p>
            <p className="mt-1 text-xs text-slate-600">
              Dikirim pada {new Date(item.myApplication.appliedAt).toLocaleString('id-ID')}
            </p>
          </div>
          <ApplicationStatusBadge status={item.myApplication.status} />
        </div>
      ) : null}

      {footer ? <div className="mt-4">{footer}</div> : null}
    </div>
  );
}

export const BkkDashboardPage = () => {
  const { data: meResponse, isLoading: isUserLoading } = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });
  const vacanciesQuery = useOpenVacancies(3);
  const profileQuery = useQuery({
    queryKey: BKK_APPLICANT_PROFILE_QUERY_KEY,
    queryFn: humasService.getMyApplicantProfile,
    staleTime: 60_000,
  });
  const applicationsQuery = useQuery({
    queryKey: BKK_MY_APPLICATIONS_QUERY_KEY,
    queryFn: humasService.getMyApplications,
    staleTime: 60_000,
  });

  const user = meResponse?.data;
  const latestVacancies = useMemo(() => vacanciesQuery.data || [], [vacanciesQuery.data]);
  const applicantProfile = useMemo(() => extractApplicantProfilePayload(profileQuery.data), [profileQuery.data]);
  const applicationsPayload = useMemo(() => extractApplicationsPayload(applicationsQuery.data), [applicationsQuery.data]);
  const applicantVerified = isApplicantVerifiedStatus(user?.verificationStatus);

  if (isUserLoading) {
    return <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Memuat dashboard BKK...</div>;
  }

  return (
    <div className="space-y-6">
      <DashboardWelcomeCard
        user={user}
        eyebrow="Portal BKK"
        subtitle="Lengkapi profil kerja, pantau lowongan aktif, dan kirim lamaran langsung dari akun pelamar Anda."
        meta={`Username pelamar: ${user?.username || '-'}`}
        tone="orange"
        className="mt-10"
        aside={
          <div className="rounded-2xl border border-orange-100 bg-white/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Status Verifikasi</p>
            <div className="mt-2">
              <VerificationBadge status={user?.verificationStatus} />
            </div>
          </div>
        }
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <InfoCard title="Ringkasan Akun">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-700">
              <UserRound size={16} className="text-orange-600" />
              <span>{user?.name || '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <ShieldCheck size={16} className="text-orange-600" />
              <span>Role: {user?.role || 'UMUM'}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <Briefcase size={16} className="text-orange-600" />
              <span>Username: {user?.username || '-'}</span>
            </div>
          </div>
        </InfoCard>

        <InfoCard title="Profil Pelamar">
          <p className="text-3xl font-semibold text-slate-900">
            {applicantProfile?.completeness.isReady ? 'Siap' : 'Belum'}
          </p>
          <p className="mt-2 text-sm text-slate-600">
            {applicantProfile?.completeness.isReady
              ? 'Profil Anda sudah siap dipakai untuk melamar lowongan.'
              : `Lengkapi ${applicantProfile?.completeness.missingFields.length || 0} bagian lagi sebelum melamar.`}
          </p>
        </InfoCard>

        <InfoCard title="Lamaran Aktif">
          <p className="text-3xl font-semibold text-slate-900">{getActiveBkkProcessingCount(applicationsPayload.summary)}</p>
          <p className="mt-2 text-sm text-slate-600">
            {getActiveBkkProcessingCount(applicationsPayload.summary)} lamaran sedang diproses.
          </p>
        </InfoCard>

        <InfoCard title="Hasil Diterima">
          <p className="text-3xl font-semibold text-slate-900">{getSuccessfulBkkPlacementCount(applicationsPayload.summary)}</p>
          <p className="mt-2 text-sm text-slate-600">
            {applicationsPayload.summary.rejected} lamaran berstatus ditolak dan {applicationsPayload.summary.withdrawn} dibatalkan.
          </p>
        </InfoCard>
      </div>

      <ApplicantVerificationNotice status={user?.verificationStatus} />

      {!applicantProfile?.completeness.isReady ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Profil pelamar belum lengkap</p>
          <p className="mt-2 text-sm text-amber-800">
            Lengkapi bagian berikut terlebih dahulu: {applicantProfile?.completeness.missingFields.join(', ') || 'data utama pelamar'}.
          </p>
          <Link
            to="/public/profile"
            className="mt-4 inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Lengkapi Profil Pelamar
          </Link>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <InfoCard title="Aksi Cepat">
          <div className="flex flex-wrap gap-3">
            <Link
              to="/public/vacancies"
              className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
            >
              Lihat Lowongan
            </Link>
            <Link
              to="/public/applications"
              className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-950"
            >
              Lamaran Saya
            </Link>
            <Link
              to={applicantVerified ? '/public/exams' : '/public/profile'}
              className={`inline-flex items-center rounded-xl px-4 py-2 text-sm font-semibold transition ${
                applicantVerified
                  ? 'border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                  : 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {applicantVerified ? 'Tes BKK' : 'Lengkapi & Tunggu Verifikasi'}
            </Link>
            <Link
              to="/public/profile"
              className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Profil Pelamar
            </Link>
          </div>
        </InfoCard>

        <InfoCard title="Status Lamaran">
          <div className="space-y-2">
            <p>Submitted: {applicationsPayload.summary.submitted}</p>
            <p>Review Internal: {applicationsPayload.summary.reviewing}</p>
            <p>Shortlisted: {applicationsPayload.summary.shortlisted}</p>
            <p>Interview Mitra: {applicationsPayload.summary.partnerInterview}</p>
            <p>Diterima Mitra: {applicationsPayload.summary.hired || applicationsPayload.summary.accepted}</p>
          </div>
        </InfoCard>

        <InfoCard title="Tahap Selanjutnya">
          <div className="space-y-2">
            <p>1. Lengkapi profil pelamar hingga statusnya siap.</p>
            <p>2. Pilih lowongan yang masih aktif.</p>
            <p>3. Kirim lamaran, lalu pantau review internal, shortlist, dan interview mitra industri.</p>
            <p>4. Jika lowongan memiliki CBT, buka menu Tes BKK untuk mengerjakannya.</p>
          </div>
        </InfoCard>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Lowongan Terbaru</h2>
            <p className="text-sm text-slate-600">Ringkasan lowongan aktif yang bisa langsung dilamar dari akun ini.</p>
          </div>
          <Link to="/public/vacancies" className="text-sm font-semibold text-orange-700 transition hover:text-orange-800">
            Lihat semua
          </Link>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {latestVacancies.length > 0 ? (
            latestVacancies.map((item) => (
              <VacancyCard
                key={item.id}
                item={item}
                footer={
                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/public/vacancies"
                      className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
                    >
                      Detail & Lamar
                    </Link>
                    {item.registrationLink ? (
                      <a
                        href={item.registrationLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Tautan Eksternal
                        <ExternalLink size={16} />
                      </a>
                    ) : null}
                  </div>
                }
              />
            ))
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 xl:col-span-3">
              Belum ada lowongan aktif yang ditampilkan saat ini.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export const BkkVacanciesPage = () => {
  const queryClient = useQueryClient();
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });
  const vacanciesQuery = useOpenVacancies(24);
  const profileQuery = useQuery({
    queryKey: BKK_APPLICANT_PROFILE_QUERY_KEY,
    queryFn: humasService.getMyApplicantProfile,
    staleTime: 60_000,
  });
  const applicantProfile = useMemo(() => extractApplicantProfilePayload(profileQuery.data), [profileQuery.data]);
  const verificationStatus = meQuery.data?.data?.verificationStatus || applicantProfile?.verificationStatus || 'PENDING';
  const applicantVerified = isApplicantVerifiedStatus(verificationStatus);
  const vacancies = vacanciesQuery.data || [];
  const [selectedVacancy, setSelectedVacancy] = useState<JobVacancy | null>(null);
  const [coverLetter, setCoverLetter] = useState('');
  const [expectedSalary, setExpectedSalary] = useState('');

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedVacancy) throw new Error('Lowongan tidak dipilih.');
      return humasService.applyToVacancy(selectedVacancy.id, {
        coverLetter: coverLetter.trim() || undefined,
        expectedSalary: expectedSalary.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Lamaran berhasil dikirim');
      setSelectedVacancy(null);
      setCoverLetter('');
      setExpectedSalary('');
      void queryClient.invalidateQueries({ queryKey: ['public-bkk-vacancies'] });
      void queryClient.invalidateQueries({ queryKey: BKK_MY_APPLICATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: BKK_APPLICANT_PROFILE_QUERY_KEY });
    },
    onError: (error: unknown) => {
      const normalized = error as { response?: { data?: { message?: string } }; message?: string };
      toast.error(normalized.response?.data?.message || normalized.message || 'Gagal mengirim lamaran');
    },
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">Lowongan BKK</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Daftar Lowongan Aktif</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Pilih lowongan yang sesuai, lalu kirim lamaran langsung dari aplikasi. Jika lowongan juga menyediakan tautan
          eksternal, Anda bisa memakainya sebagai opsi tambahan.
        </p>
      </section>

      <ApplicantVerificationNotice status={verificationStatus} />

      {!applicantProfile?.completeness.isReady ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-sm font-semibold text-amber-900">Profil pelamar belum siap untuk melamar</p>
          <p className="mt-2 text-sm text-amber-800">
            Lengkapi terlebih dahulu: {applicantProfile?.completeness.missingFields.join(', ') || 'profil pelamar'}.
          </p>
          <Link
            to="/public/profile"
            className="mt-4 inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Lengkapi Profil
          </Link>
        </div>
      ) : null}

      {vacanciesQuery.isLoading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Memuat daftar lowongan...</div>
      ) : vacancies.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {vacancies.map((item) => (
            <VacancyCard
              key={item.id}
              item={item}
              footer={
                <div className="flex flex-wrap gap-3">
                  {item.myApplication ? (
                    <Link
                      to="/public/applications"
                      className="inline-flex items-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-950"
                    >
                      Lihat Status Lamaran
                    </Link>
                  ) : item.canApplyInApp && applicantProfile?.completeness.isReady && applicantVerified ? (
                    <button
                      type="button"
                      onClick={() => setSelectedVacancy(item)}
                      className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700"
                    >
                      Lamar di Aplikasi
                    </button>
                  ) : (
                    <Link
                      to="/public/profile"
                      className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      {applicantProfile?.completeness.isReady ? 'Tunggu Verifikasi Admin' : 'Lengkapi Profil Dulu'}
                    </Link>
                  )}
                  {item.registrationLink ? (
                    <a
                      href={item.registrationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      Tautan Eksternal
                      <ExternalLink size={16} />
                    </a>
                  ) : null}
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">
          Belum ada lowongan aktif yang tersedia.
        </div>
      )}

      {selectedVacancy && applicantVerified ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-orange-600">Lamaran Baru</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedVacancy.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{resolveVacancyCompany(selectedVacancy)}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedVacancy(null)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Tutup
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Pesan singkat / cover letter</span>
                <textarea
                  value={coverLetter}
                  onChange={(event) => setCoverLetter(event.target.value)}
                  rows={6}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  placeholder="Tuliskan ringkasan minat, pengalaman singkat, atau alasan Anda melamar."
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Ekspektasi gaji / catatan kompensasi</span>
                <input
                  value={expectedSalary}
                  onChange={(event) => setExpectedSalary(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                  placeholder="Opsional"
                />
              </label>
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedVacancy(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => applyMutation.mutate()}
                disabled={applyMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileText size={16} />
                {applyMutation.isPending ? 'Mengirim...' : 'Kirim Lamaran'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
