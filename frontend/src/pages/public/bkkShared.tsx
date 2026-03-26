import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { humasService, type JobApplicationRow, type JobApplicationStatus, type JobApplicantProfile, type JobVacancy } from '../../services/humas.service';

export type BkkApplicationSummary = {
  total: number;
  submitted: number;
  reviewing: number;
  shortlisted: number;
  partnerInterview: number;
  interview: number;
  hired: number;
  accepted: number;
  rejected: number;
  withdrawn: number;
};

export const BKK_APPLICANT_PROFILE_QUERY_KEY = ['public-bkk-applicant-profile'] as const;
export const BKK_MY_APPLICATIONS_QUERY_KEY = ['public-bkk-my-applications'] as const;

export function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  );
}

export function VerificationBadge({ status }: { status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null }) {
  const normalized = String(status || 'PENDING').toUpperCase();
  const className =
    normalized === 'VERIFIED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : normalized === 'REJECTED'
        ? 'bg-rose-50 text-rose-700 border-rose-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>
      {normalized}
    </span>
  );
}

export function isApplicantVerifiedStatus(status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null) {
  return String(status || '').toUpperCase() === 'VERIFIED';
}

export function ApplicantVerificationNotice({
  status,
  className = '',
}: {
  status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null;
  className?: string;
}) {
  const normalized = String(status || 'PENDING').toUpperCase();
  if (normalized === 'VERIFIED') return null;

  const title = normalized === 'REJECTED' ? 'Akun pelamar ditolak sementara' : 'Akun pelamar masih menunggu verifikasi';
  const description =
    normalized === 'REJECTED'
      ? 'Periksa kembali data profil pelamar Anda, lalu hubungi admin atau tim BKK jika perlu perbaikan sebelum melamar lagi.'
      : 'Lengkapi profil pelamar Anda terlebih dahulu. Fitur melamar lowongan dan mengikuti Tes BKK akan aktif setelah admin memverifikasi akun ini.';

  return (
    <section className={`rounded-3xl border border-amber-200 bg-amber-50 p-5 ${className}`.trim()}>
      <p className="text-sm font-semibold text-amber-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-amber-800">{description}</p>
    </section>
  );
}

export function getApplicationStatusMeta(status: JobApplicationStatus) {
  switch (status) {
    case 'SUBMITTED':
      return {
        label: 'Dikirim',
        className: 'border-sky-200 bg-sky-50 text-sky-700',
      };
    case 'REVIEWING':
      return {
        label: 'Review Internal',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    case 'SHORTLISTED':
      return {
        label: 'Shortlist Mitra',
        className: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      };
    case 'PARTNER_INTERVIEW':
      return {
        label: 'Interview Mitra',
        className: 'border-violet-200 bg-violet-50 text-violet-700',
      };
    case 'INTERVIEW':
      return {
        label: 'Interview (Legacy)',
        className: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
      };
    case 'HIRED':
      return {
        label: 'Diterima Mitra',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'ACCEPTED':
      return {
        label: 'Diterima (Legacy)',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'REJECTED':
      return {
        label: 'Ditolak',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'WITHDRAWN':
      return {
        label: 'Dibatalkan',
        className: 'border-slate-200 bg-slate-100 text-slate-700',
      };
    default:
      return {
        label: status,
        className: 'border-slate-200 bg-slate-100 text-slate-700',
      };
  }
}

export function ApplicationStatusBadge({ status }: { status: JobApplicationStatus }) {
  const meta = getApplicationStatusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function resolveVacancyCompany(item: JobVacancy | JobApplicationRow['vacancy']) {
  return item.industryPartner?.name || item.companyName || 'Perusahaan umum';
}

export function extractVacanciesPayload(response: unknown): JobVacancy[] {
  const rows = (response as { data?: { data?: { vacancies?: unknown } } })?.data?.data?.vacancies;
  return Array.isArray(rows) ? (rows as JobVacancy[]) : [];
}

export function extractApplicantProfilePayload(response: unknown): JobApplicantProfile | null {
  const row = (response as { data?: { data?: unknown } })?.data?.data;
  return row && typeof row === 'object' ? (row as JobApplicantProfile) : null;
}

export function extractApplicationsPayload(response: unknown): {
  applications: JobApplicationRow[];
  summary: BkkApplicationSummary;
} {
  const data = (response as { data?: { data?: unknown } })?.data?.data as
    | {
        applications?: unknown;
        summary?: unknown;
      }
    | undefined;
  const applications = Array.isArray(data?.applications) ? (data?.applications as JobApplicationRow[]) : [];
  const summary = data?.summary && typeof data.summary === 'object'
    ? (data.summary as BkkApplicationSummary)
    : {
        total: applications.length,
        submitted: 0,
        reviewing: 0,
        shortlisted: 0,
        partnerInterview: 0,
        interview: 0,
        hired: 0,
        accepted: 0,
        rejected: 0,
        withdrawn: 0,
      };
  return { applications, summary };
}

export function useOpenVacancies(limit = 12) {
  return useQuery({
    queryKey: ['public-bkk-vacancies', limit],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const response = await humasService.getVacancies({ page: 1, limit, isOpen: true });
      return extractVacanciesPayload(response);
    },
  });
}

export function isWithdrawableApplication(status: JobApplicationStatus) {
  return status === 'SUBMITTED' || status === 'REVIEWING' || status === 'INTERVIEW';
}

export function getActiveBkkProcessingCount(summary: BkkApplicationSummary) {
  return (
    summary.submitted +
    summary.reviewing +
    summary.shortlisted +
    summary.partnerInterview +
    summary.interview
  );
}

export function getSuccessfulBkkPlacementCount(summary: BkkApplicationSummary) {
  return summary.hired + Math.max(summary.accepted - summary.hired, 0);
}
