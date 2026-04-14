import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Briefcase, ClipboardList, Clock3, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { humasService } from '../../../services/humas.service';
import { userService } from '../../../services/user.service';
import { ApplicationsTab } from '../../teacher/humas/components/ApplicationsTab';

export const AdminBkkApplicationsPage = () => {
  const applicantUsersQuery = useQuery({
    queryKey: ['admin-bkk-users-summary'],
    queryFn: async () => userService.getAll({ role: 'UMUM', limit: 1000 }),
  });

  const applicationsSummaryQuery = useQuery({
    queryKey: ['admin-bkk-applications-summary'],
    queryFn: async () => humasService.getApplications({ page: 1, limit: 1 }),
  });

  const applicantSummary = useMemo(() => {
    const users = applicantUsersQuery.data?.data || [];
    return {
      total: users.length,
      verified: users.filter((user) => user.verificationStatus === 'VERIFIED').length,
      pending: users.filter((user) => user.verificationStatus === 'PENDING').length,
      rejected: users.filter((user) => user.verificationStatus === 'REJECTED').length,
    };
  }, [applicantUsersQuery.data]);

  const applicationSummary = useMemo(() => {
    const payload = applicationsSummaryQuery.data?.data?.data as
      | {
          total?: number;
          summary?: Record<string, number>;
        }
      | undefined;
    const summary = payload?.summary || {};
    return {
      total: payload?.total || 0,
      reviewing: summary.reviewing || 0,
      shortlisted: summary.shortlisted || 0,
      partnerInterview: summary.partnerInterview || 0,
      interview: summary.interview || 0,
      hired: summary.hired || 0,
      accepted: summary.accepted || 0,
      rejected: summary.rejected || 0,
      withdrawn: summary.withdrawn || 0,
      inProgress:
        (summary.submitted || 0) +
        (summary.reviewing || 0) +
        (summary.shortlisted || 0) +
        (summary.partnerInterview || 0) +
        (summary.interview || 0),
    };
  }, [applicationsSummaryQuery.data]);

  const statCards = [
    {
      label: 'Akun Pelamar',
      value: applicantSummary.total,
      helper: `${applicantSummary.verified} terverifikasi`,
      icon: Users,
      tone: 'from-blue-50 to-sky-100 border-blue-100 text-blue-700',
    },
    {
      label: 'Menunggu Verifikasi',
      value: applicantSummary.pending,
      helper: `${applicantSummary.rejected} ditolak`,
      icon: ShieldCheck,
      tone: 'from-amber-50 to-yellow-100 border-amber-100 text-amber-700',
    },
    {
      label: 'Total Lamaran',
      value: applicationSummary.total,
      helper: `${applicationSummary.inProgress} sedang diproses`,
      icon: ClipboardList,
      tone: 'from-emerald-50 to-teal-100 border-emerald-100 text-emerald-700',
    },
    {
      label: 'Diterima Mitra',
      value: applicationSummary.hired || applicationSummary.accepted,
      helper: `${applicationSummary.partnerInterview} interview mitra`,
      icon: Briefcase,
      tone: 'from-violet-50 to-fuchsia-100 border-violet-100 text-violet-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 text-blue-700">
          <ClipboardList className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-page-title font-bold text-gray-900">Lamaran BKK</h1>
          <p className="mt-1 text-sm text-gray-500">
            Admin dapat memantau pelamar BKK, melihat status lamaran, dan ikut melakukan review tanpa harus masuk ke modul Humas.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${item.tone}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{item.label}</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">
                    {item.value.toLocaleString('id-ID')}
                  </p>
                </div>
                <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">{item.helper}</p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ringkasan Pengelolaan BKK</h2>
              <p className="mt-1 text-sm text-gray-500">
                Pantau akun pelamar, cek kesehatan funnel lamaran, lalu lanjut review tanpa pindah modul.
              </p>
            </div>
            <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              Admin View
            </span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Verified Rate</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {applicantSummary.total > 0
                  ? `${Math.round((applicantSummary.verified / applicantSummary.total) * 100)}%`
                  : '0%'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Persentase akun pelamar yang sudah lolos verifikasi admin</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lamaran Aktif</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {applicationSummary.inProgress.toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-slate-500">Total pipeline berjalan dari screening sampai interview mitra</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Belum Ada Lamaran</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {Math.max(applicantSummary.total - applicationSummary.total, 0).toLocaleString('id-ID')}
              </p>
              <p className="mt-1 text-xs text-slate-500">Akun pelamar yang sudah ada, tetapi belum mengirim lamaran kerja</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Aksi Cepat Admin</h2>
          <p className="mt-1 text-sm text-gray-500">
            Jalur cepat untuk menangani pelamar baru dan menjaga pipeline BKK tetap rapi.
          </p>

          <div className="mt-4 space-y-3">
            <Link
              to="/admin/bkk-users"
              className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 transition hover:border-blue-200 hover:bg-white hover:shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">Kelola Akun Pelamar</p>
                <p className="mt-1 text-xs text-gray-500">Verifikasi akun, cek identitas, dan rapikan data pelamar BKK</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-blue-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>

            <a
              href="#application-review"
              className="group flex items-center justify-between rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 transition hover:border-emerald-200 hover:bg-white hover:shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">Lanjut Review Lamaran</p>
                <p className="mt-1 text-xs text-gray-500">Langsung lompat ke daftar lamaran yang sedang masuk dan butuh keputusan</p>
              </div>
              <ArrowUpRight className="h-4 w-4 text-emerald-600 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </a>

            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-3">
                <Clock3 className="mt-0.5 h-4 w-4 text-amber-600" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Prioritas hari ini</p>
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Ada {applicationSummary.inProgress.toLocaleString('id-ID')} lamaran aktif, {applicationSummary.shortlisted.toLocaleString('id-ID')} shortlist, dan {applicantSummary.pending.toLocaleString('id-ID')} akun pelamar yang masih menunggu verifikasi.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div id="application-review" className="scroll-mt-24">
        <ApplicationsTab showOverview={false} />
      </div>
    </div>
  );
};

export default AdminBkkApplicationsPage;
