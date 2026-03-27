import type { ReactNode } from 'react';
import type {
  CandidateAdmissionDetail,
  CandidateAdmissionFinanceState,
  CandidateAdmissionStatus,
} from '../../services/candidateAdmission.service';

export const CANDIDATE_ADMISSION_QUERY_KEY = ['candidate-admission', 'me'] as const;
export const ADMIN_CANDIDATE_ADMISSION_QUERY_KEY = ['admin-candidate-admissions'] as const;
export const CANDIDATE_DOCUMENT_OPTIONS = [
  {
    value: 'PPDB_AKTA_KELAHIRAN',
    label: 'Akta Kelahiran',
    description: 'Salinan akta kelahiran calon siswa.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_KARTU_KELUARGA',
    label: 'Kartu Keluarga',
    description: 'Scan/foto kartu keluarga terbaru.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_RAPOR_TERAKHIR',
    label: 'Rapor Terakhir',
    description: 'Rapor semester terakhir atau dokumen nilai pendukung.',
    required: true,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_PAS_FOTO',
    label: 'Pas Foto',
    description: 'Pas foto terbaru calon siswa.',
    required: true,
    acceptedFormats: ['JPG', 'JPEG', 'PNG'],
  },
  {
    value: 'PPDB_SERTIFIKAT',
    label: 'Sertifikat / Piagam',
    description: 'Opsional, untuk sertifikat prestasi atau dokumen tambahan.',
    required: false,
    acceptedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
  },
] as const;

const CANDIDATE_DOCUMENT_LABEL_MAP = Object.fromEntries(
  CANDIDATE_DOCUMENT_OPTIONS.map((item) => [item.value, item.label]),
) as Record<string, string>;

export function CandidateInfoCard({
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

export function getCandidateAdmissionStatusMeta(status: CandidateAdmissionStatus) {
  switch (status) {
    case 'DRAFT':
      return { label: 'Draft', className: 'border-slate-200 bg-slate-100 text-slate-700' };
    case 'SUBMITTED':
      return { label: 'Dikirim', className: 'border-sky-200 bg-sky-50 text-sky-700' };
    case 'UNDER_REVIEW':
      return { label: 'Direview', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'NEEDS_REVISION':
      return { label: 'Perlu Revisi', className: 'border-orange-200 bg-orange-50 text-orange-700' };
    case 'TEST_SCHEDULED':
      return { label: 'Tes Dijadwalkan', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' };
    case 'PASSED_TEST':
      return { label: 'Lulus Tes', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'FAILED_TEST':
      return { label: 'Belum Lulus Tes', className: 'border-rose-200 bg-rose-50 text-rose-700' };
    case 'ACCEPTED':
      return { label: 'Diterima', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
    case 'REJECTED':
      return { label: 'Ditolak', className: 'border-rose-200 bg-rose-50 text-rose-700' };
    default:
      return { label: status, className: 'border-slate-200 bg-slate-100 text-slate-700' };
  }
}

export function CandidateAdmissionStatusBadge({ status }: { status: CandidateAdmissionStatus }) {
  const meta = getCandidateAdmissionStatusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

export function extractCandidateAdmissionPayload(response: unknown): CandidateAdmissionDetail | null {
  const row = (response as { data?: { data?: unknown } })?.data?.data;
  return row && typeof row === 'object' ? (row as CandidateAdmissionDetail) : null;
}

export function getCandidateDocumentCategoryLabel(category?: string | null) {
  const normalized = String(category || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return CANDIDATE_DOCUMENT_LABEL_MAP[normalized] || category || 'Dokumen Pendukung';
}

export function formatCandidateDateTime(value?: string | null, withTime = true) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime
      ? {
          hour: '2-digit',
          minute: '2-digit',
        }
      : {}),
  });
}

export function formatCandidateCurrency(value?: number | null) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export function getCandidateFinanceSummaryMeta(state?: CandidateAdmissionFinanceState | null) {
  switch (state) {
    case 'CLEAR':
      return {
        label: 'Clear',
        className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      };
    case 'PENDING':
      return {
        label: 'Ada Tagihan',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
      };
    case 'OVERDUE':
      return {
        label: 'Terlambat',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
      };
    case 'NO_BILLING':
    default:
      return {
        label: 'Belum Terbit',
        className: 'border-slate-200 bg-slate-100 text-slate-700',
      };
  }
}

export function getCandidateDecisionLetterPrintPath(admissionId?: number | null) {
  return `/print/candidate-admission/${admissionId || 0}/decision-letter`;
}

export function getCandidateSelectionStatusMeta(status: string, passed?: boolean | null) {
  const normalized = String(status || '').toUpperCase();

  if (passed === true) {
    return {
      label: 'Lulus',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (passed === false) {
    return {
      label: 'Belum Lulus',
      className: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  switch (normalized) {
    case 'COMPLETED':
      return { label: 'Selesai', className: 'border-sky-200 bg-sky-50 text-sky-700' };
    case 'TIMEOUT':
      return { label: 'Waktu Habis', className: 'border-orange-200 bg-orange-50 text-orange-700' };
    case 'IN_PROGRESS':
      return { label: 'Berlangsung', className: 'border-amber-200 bg-amber-50 text-amber-700' };
    case 'NOT_STARTED':
      return { label: 'Belum Mulai', className: 'border-slate-200 bg-slate-100 text-slate-700' };
    default:
      return { label: normalized || 'Tes', className: 'border-slate-200 bg-slate-100 text-slate-700' };
  }
}

export function extractCandidateAdmissionListPayload(response: unknown): {
  applications: CandidateAdmissionDetail[];
  total: number;
  page: number;
  totalPages: number;
  summary: {
    total: number;
    draft: number;
    submitted: number;
    underReview: number;
    needsRevision: number;
    testScheduled: number;
    passedTest: number;
    failedTest: number;
    accepted: number;
    rejected: number;
  };
} {
  const data = (response as { data?: { data?: unknown } })?.data?.data as
    | {
        applications?: unknown;
        total?: unknown;
        page?: unknown;
        totalPages?: unknown;
        summary?: unknown;
      }
    | undefined;

  const applications = Array.isArray(data?.applications)
    ? (data?.applications as CandidateAdmissionDetail[])
    : [];

  return {
    applications,
    total: Number(data?.total || applications.length || 0),
    page: Number(data?.page || 1),
    totalPages: Number(data?.totalPages || 1),
    summary:
      data?.summary && typeof data.summary === 'object'
        ? (data.summary as {
            total: number;
            draft: number;
            submitted: number;
            underReview: number;
            needsRevision: number;
            testScheduled: number;
            passedTest: number;
            failedTest: number;
            accepted: number;
            rejected: number;
          })
        : {
            total: applications.length,
            draft: 0,
            submitted: 0,
            underReview: 0,
            needsRevision: 0,
            testScheduled: 0,
            passedTest: 0,
            failedTest: 0,
            accepted: 0,
            rejected: 0,
          },
  };
}
