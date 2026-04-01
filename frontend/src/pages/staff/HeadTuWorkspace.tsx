import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  CreditCard,
  FileText,
  GraduationCap,
  Loader2,
  Printer,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { academicYearService } from '../../services/academicYear.service';
import { authService } from '../../services/auth.service';
import {
  candidateAdmissionService,
} from '../../services/candidateAdmission.service';
import { officeService, type OfficeLetter, type OfficeLetterType } from '../../services/office.service';
import { uploadService } from '../../services/upload.service';
import { userService } from '../../services/user.service';
import { permissionService, type StudentPermission } from '../../services/permission.service';
import {
  staffFinanceService,
  type FinanceBankReconciliation,
  type FinanceBudgetProgressStage,
  type FinanceCashSession,
  type FinanceClosingPeriod,
  type FinanceClosingPeriodReopenRequest,
  type FinanceGovernanceSummary,
  type FinanceIntegritySummary,
  type FinancePerformanceSummary,
  type FinancePaymentReversalRequest,
  type FinanceReportSnapshot,
  type FinanceWriteOffRequest,
} from '../../services/staffFinance.service';
import api from '../../services/api';
import type { User } from '../../types/auth';
import {
  CandidateAdmissionStatusBadge,
  extractCandidateAdmissionListPayload,
  extractCandidateAdmissionPayload,
  formatCandidateDateTime,
  getCandidateDecisionLetterPrintPath,
} from '../public/candidateShared';
import { getStaffDivisionLabel, resolveStaffDivision } from '../../utils/staffRole';

function matchesSearch(term: string, values: Array<string | number | null | undefined>) {
  if (!term) return true;
  return values.some((value) => String(value || '').toLowerCase().includes(term));
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCurrency(value: number) {
  return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
}

function getCashSessionApprovalTone(session: FinanceCashSession) {
  if (session.approvalStatus === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Review', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (session.approvalStatus === 'PENDING_PRINCIPAL') {
    return { label: 'Ke Kepala Sekolah', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (session.approvalStatus === 'REJECTED') {
    return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (session.approvalStatus === 'AUTO_APPROVED') {
    return { label: 'Auto Approved', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
}

function getClosingPeriodStatusTone(period: FinanceClosingPeriod) {
  if (period.status === 'CLOSED') {
    return { label: 'Terkunci', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (period.status === 'CLOSING_REVIEW') {
    return { label: 'Review Closing', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { label: 'Terbuka', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getClosingPeriodApprovalTone(period: FinanceClosingPeriod) {
  if (period.approvalStatus === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Review', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (period.approvalStatus === 'PENDING_PRINCIPAL') {
    return { label: 'Ke Kepala Sekolah', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (period.approvalStatus === 'APPROVED') {
    return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (period.approvalStatus === 'REJECTED') {
    return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  return { label: 'Belum Diajukan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getClosingPeriodReopenTone(request: FinanceClosingPeriodReopenRequest) {
  if (request.status === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Review', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (request.status === 'PENDING_PRINCIPAL') {
    return { label: 'Ke Kepala Sekolah', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (request.status === 'APPLIED') {
    return { label: 'Direopen', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getBudgetProgressTone(stage: FinanceBudgetProgressStage) {
  if (stage === 'RETURNED_BY_FINANCE') {
    return { label: 'Dikembalikan Keuangan', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (stage === 'FINANCE_REVIEW') {
    return { label: 'Review Keuangan', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (stage === 'LPJ_PREPARATION') {
    return { label: 'Persiapan LPJ', className: 'bg-violet-50 text-violet-700 border border-violet-200' };
  }
  if (stage === 'WAITING_LPJ') {
    return { label: 'Menunggu LPJ', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (stage === 'WAITING_REALIZATION') {
    return { label: 'Menunggu Realisasi', className: 'bg-orange-50 text-orange-700 border border-orange-200' };
  }
  if (stage === 'PENDING_APPROVAL') {
    return { label: 'Menunggu Persetujuan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
  }
  if (stage === 'REALIZED') {
    return { label: 'Terealisasi', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getGovernanceRiskTone(level: FinanceGovernanceSummary['overview']['riskLevel']) {
  if (level === 'CRITICAL') {
    return { label: 'Kritis', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (level === 'HIGH') {
    return { label: 'Tinggi', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (level === 'MEDIUM') {
    return { label: 'Pantau', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  return { label: 'Stabil', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
}

function getGovernanceSeverityTone(level: FinanceGovernanceSummary['followUpQueue'][number]['severity']) {
  if (level === 'CRITICAL') {
    return { className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  if (level === 'HIGH') {
    return { className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (level === 'MEDIUM') {
    return { className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  return { className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getPerformanceSignalTone(level: FinancePerformanceSummary['signals'][number]['tone']) {
  if (level === 'POSITIVE') {
    return { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (level === 'WATCH') {
    return { className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getIntegrityStatusTone(level: FinanceIntegritySummary['overview']['status']) {
  if (level === 'READY') return { className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  if (level === 'WATCH') return { className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  if (level === 'ACTION_REQUIRED') return { className: 'bg-orange-50 text-orange-700 border border-orange-200' };
  return { className: 'bg-rose-50 text-rose-700 border border-rose-200' };
}

function getIntegritySeverityTone(level: FinanceIntegritySummary['issues'][number]['severity']) {
  if (level === 'CRITICAL') return { className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  if (level === 'HIGH') return { className: 'bg-orange-50 text-orange-700 border border-orange-200' };
  if (level === 'MEDIUM') return { className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  return { className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type PermissionRow = StudentPermission & {
  student?: StudentPermission['student'] & {
    studentClass?: {
      name?: string | null;
    } | null;
  };
};

type StaffUser = User & {
  roleLabel?: string;
};

type ExamSittingListRow = {
  id: number;
  roomName: string;
  examType?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  sessionLabel?: string | null;
  programSession?: {
    label?: string | null;
  } | null;
};

type ExamSittingDetailRow = ExamSittingListRow & {
  students?: Array<{
    student?: {
      id: number;
      name: string;
      username?: string | null;
      nis?: string | null;
      nisn?: string | null;
      studentClass?: {
        name?: string | null;
      } | null;
    } | null;
  }>;
};

type ExamCardEntry = {
  sittingId: number;
  examType: string;
  roomName: string;
  startTime: string | null;
  endTime: string | null;
  sessionLabel: string | null;
};

type ExamCardRow = {
  studentId: number;
  studentName: string;
  username: string;
  nis: string | null;
  nisn: string | null;
  className: string;
  examCount: number;
  entries: ExamCardEntry[];
};

type CandidateLetterFormState = {
  issueCity: string;
  issueDate: string;
  signerName: string;
  signerPosition: string;
};

const emptyCandidateLetterForm: CandidateLetterFormState = {
  issueCity: 'Bekasi',
  issueDate: new Date().toISOString().slice(0, 10),
  signerName: '',
  signerPosition: 'Kepala Tata Usaha',
};

const HeadTuWorkspace = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const pathname = location.pathname.replace(/\/+$/, '') || '/staff';

  const isAdministrationPage = pathname.startsWith('/staff/head-tu/administration');
  const isFinancePage = pathname.startsWith('/staff/head-tu/finance');
  const isStudentsPage = pathname.startsWith('/staff/head-tu/students');
  const isTeachersPage = pathname.startsWith('/staff/head-tu/teachers');
  const isPermissionsPage = pathname.startsWith('/staff/head-tu/permissions');
  const isLettersPage = pathname.startsWith('/staff/head-tu/letters');
  const isExamCardsPage = pathname.startsWith('/staff/head-tu/exam-cards');
  const isDashboardPage =
    !isAdministrationPage &&
    !isFinancePage &&
    !isStudentsPage &&
    !isTeachersPage &&
    !isPermissionsPage &&
    !isLettersPage &&
    !isExamCardsPage;

  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [examCardSearch, setExamCardSearch] = useState('');
  const [letterArchiveSearch, setLetterArchiveSearch] = useState('');
  const [letterArchiveTypeFilter, setLetterArchiveTypeFilter] = useState<'ALL' | OfficeLetterType>('ALL');
  const [candidateLetterSearch, setCandidateLetterSearch] = useState('');
  const [selectedCandidateLetterId, setSelectedCandidateLetterId] = useState<number | null>(null);
  const [candidateLetterForm, setCandidateLetterForm] = useState<CandidateLetterFormState>(emptyCandidateLetterForm);
  const [candidateOfficialLetterFile, setCandidateOfficialLetterFile] = useState<File | null>(null);
  const [examCardClassFilter, setExamCardClassFilter] = useState<string>('ALL');
  const [examCardExamTypeFilter, setExamCardExamTypeFilter] = useState<string>('ALL');
  const [letterType, setLetterType] = useState<OfficeLetterType>('STUDENT_CERTIFICATE');
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [letterPurpose, setLetterPurpose] = useState('');
  const [letterNotes, setLetterNotes] = useState('');

  const meQuery = useQuery({
    queryKey: ['head-tu-me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const studentsQuery = useQuery({
    queryKey: ['head-tu-students'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const teachersQuery = useQuery({
    queryKey: ['head-tu-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const staffsQuery = useQuery({
    queryKey: ['head-tu-staffs'],
    queryFn: () => userService.getUsers({ role: 'STAFF', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const principalsQuery = useQuery({
    queryKey: ['head-tu-principals'],
    queryFn: () => userService.getUsers({ role: 'PRINCIPAL', limit: 10 }),
    staleTime: 5 * 60 * 1000,
  });

  const permissionsQuery = useQuery({
    queryKey: ['head-tu-permissions'],
    queryFn: () => permissionService.getPermissions({ limit: 200 }),
    staleTime: 60_000,
  });

  const academicYearsQuery = useQuery({
    queryKey: ['head-tu-academic-years'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    staleTime: 5 * 60 * 1000,
  });

  const academicYears =
    academicYearsQuery.data?.data?.academicYears || academicYearsQuery.data?.academicYears || [];
  const activeYear = academicYears.find((item: { isActive?: boolean }) => item.isActive) || academicYears[0];

  const financeSnapshotQuery = useQuery({
    queryKey: ['head-tu-finance-snapshot', activeYear?.id || 'none'],
    queryFn: () =>
      staffFinanceService.listReports({
        academicYearId: activeYear?.id,
      }),
    enabled: Boolean(activeYear?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeWriteOffsQuery = useQuery({
    queryKey: ['head-tu-finance-write-offs'],
    queryFn: () => staffFinanceService.listWriteOffs({ pendingFor: 'HEAD_TU', limit: 50 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financePaymentReversalsQuery = useQuery({
    queryKey: ['head-tu-finance-payment-reversals'],
    queryFn: () => staffFinanceService.listPaymentReversals({ pendingFor: 'HEAD_TU', limit: 50 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeCashSessionsQuery = useQuery({
    queryKey: ['head-tu-finance-cash-sessions'],
    queryFn: () => staffFinanceService.listCashSessions({ mine: false, limit: 8 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeCashSessionApprovalsQuery = useQuery({
    queryKey: ['head-tu-finance-cash-session-approvals'],
    queryFn: () => staffFinanceService.listCashSessions({ pendingFor: 'HEAD_TU', limit: 20 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeBankReconciliationsQuery = useQuery({
    queryKey: ['head-tu-finance-bank-reconciliations'],
    queryFn: () => staffFinanceService.listBankReconciliations({ limit: 8 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeBudgetRealizationQuery = useQuery({
    queryKey: ['head-tu-finance-budget-realization', activeYear?.id || 'none'],
    queryFn: () =>
      staffFinanceService.getBudgetRealizationSummary({
        academicYearId: activeYear?.id,
        limit: 8,
      }),
    enabled: (isFinancePage || isDashboardPage) && Boolean(activeYear?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeGovernanceQuery = useQuery({
    queryKey: ['head-tu-finance-governance', activeYear?.id || 'none'],
    queryFn: () =>
      staffFinanceService.getGovernanceSummary({
        academicYearId: activeYear?.id,
        limit: 6,
      }),
    enabled: (isFinancePage || isDashboardPage) && Boolean(activeYear?.id),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeAuditQuery = useQuery({
    queryKey: ['head-tu-finance-audit'],
    queryFn: () =>
      staffFinanceService.getAuditSummary({
        days: 30,
        limit: 6,
      }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financePerformanceQuery = useQuery({
    queryKey: ['head-tu-finance-performance'],
    queryFn: () =>
      staffFinanceService.getPerformanceSummary({
        months: 6,
      }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeIntegrityQuery = useQuery({
    queryKey: ['head-tu-finance-integrity'],
    queryFn: () =>
      staffFinanceService.getIntegritySummary({
        limit: 6,
      }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: 45_000,
  });

  const financeClosingPeriodsQuery = useQuery({
    queryKey: ['head-tu-finance-closing-periods'],
    queryFn: () => staffFinanceService.listClosingPeriods({ limit: 8 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeClosingPeriodApprovalsQuery = useQuery({
    queryKey: ['head-tu-finance-closing-period-approvals'],
    queryFn: () => staffFinanceService.listClosingPeriods({ pendingFor: 'HEAD_TU', limit: 20 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeClosingPeriodReopenRequestsQuery = useQuery({
    queryKey: ['head-tu-finance-closing-period-reopen-requests'],
    queryFn: () => staffFinanceService.listClosingPeriodReopenRequests({ limit: 8 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const financeClosingPeriodReopenApprovalsQuery = useQuery({
    queryKey: ['head-tu-finance-closing-period-reopen-approvals'],
    queryFn: () => staffFinanceService.listClosingPeriodReopenRequests({ pendingFor: 'HEAD_TU', limit: 20 }),
    enabled: isFinancePage || isDashboardPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const headTuWriteOffDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decideWriteOffAsHeadTu(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      toast.success(payload.approved ? 'Write-off diteruskan ke Kepala Sekolah' : 'Write-off ditolak');
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-write-offs'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-snapshot'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-integrity'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval write-off');
    },
  });

  const headTuPaymentReversalDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decidePaymentReversalAsHeadTu(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-payment-reversals'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-integrity'] });
      toast.success(payload.approved ? 'Reversal diteruskan ke Kepala Sekolah' : 'Pengajuan reversal ditolak');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval reversal pembayaran');
    },
  });

  const headTuCashSessionDecisionMutation = useMutation({
    mutationFn: (payload: { sessionId: number; approved: boolean }) =>
      staffFinanceService.decideCashSessionAsHeadTu(payload.sessionId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Settlement kas ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-cash-session-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-cash-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-integrity'] });
      toast.success(
        payload.approved
          ? 'Settlement kas diproses oleh Kepala TU'
          : 'Settlement kas ditolak oleh Kepala TU',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses settlement kas');
    },
  });

  const headTuClosingPeriodDecisionMutation = useMutation({
    mutationFn: (payload: { periodId: number; approved: boolean }) =>
      staffFinanceService.decideClosingPeriodAsHeadTu(payload.periodId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Closing period ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-closing-periods'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-closing-period-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-integrity'] });
      toast.success(
        payload.approved
          ? 'Closing period diproses oleh Kepala TU'
          : 'Closing period ditolak oleh Kepala TU',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses closing period');
    },
  });

  const headTuClosingPeriodReopenDecisionMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decideClosingPeriodReopenAsHeadTu(payload.requestId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Reopen closing period ditolak oleh Kepala TU',
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-closing-periods'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-closing-period-reopen-requests'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-closing-period-reopen-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-finance-integrity'] });
      toast.success(
        payload.approved
          ? 'Reopen closing period diproses oleh Kepala TU'
          : 'Reopen closing period ditolak oleh Kepala TU',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses reopen closing period');
    },
  });

  const officeSummaryQuery = useQuery({
    queryKey: ['head-tu-office-summary', activeYear?.id || 'none'],
    queryFn: () =>
      officeService.getSummary({
        academicYearId: activeYear?.id,
      }),
    enabled: Boolean(activeYear?.id) && (isLettersPage || isDashboardPage),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const officeLettersQuery = useQuery({
    queryKey: ['head-tu-office-letters', activeYear?.id || 'none', letterArchiveTypeFilter, letterArchiveSearch],
    queryFn: () =>
      officeService.listLetters({
        academicYearId: activeYear?.id,
        type: letterArchiveTypeFilter === 'ALL' ? undefined : letterArchiveTypeFilter,
        search: letterArchiveSearch.trim() || undefined,
        limit: 100,
      }),
    enabled: Boolean(activeYear?.id) && isLettersPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const candidateDecisionLettersQuery = useQuery({
    queryKey: ['head-tu-candidate-decision-letters', candidateLetterSearch],
    queryFn: () =>
      candidateAdmissionService.listAdmissions({
        page: 1,
        limit: 100,
        search: candidateLetterSearch.trim() || undefined,
        status: 'ALL',
        publishedOnly: true,
      }),
    enabled: isLettersPage,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const selectedCandidateDecisionDetailQuery = useQuery({
    queryKey: ['head-tu-candidate-decision-letter-detail', selectedCandidateLetterId],
    queryFn: () => candidateAdmissionService.getAdmissionById(selectedCandidateLetterId as number),
    enabled: isLettersPage && Boolean(selectedCandidateLetterId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const examCardsQuery = useQuery({
    queryKey: ['head-tu-exam-cards', activeYear?.id || 'none'],
    enabled: Boolean(activeYear?.id) && (isExamCardsPage || isDashboardPage),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const listResponse = await api.get('/exam-sittings', {
        params: {
          academicYearId: activeYear?.id,
        },
      });

      const listData = Array.isArray(listResponse.data?.data)
        ? listResponse.data.data
        : Array.isArray(listResponse.data)
          ? listResponse.data
          : [];

      const details = await Promise.all(
        (listData as ExamSittingListRow[]).map(async (row) => {
          const detailResponse = await api.get(`/exam-sittings/${row.id}`);
          return (detailResponse.data?.data || detailResponse.data) as ExamSittingDetailRow;
        }),
      );

      return details;
    },
  });

  const currentUser = meQuery.data?.data as User | undefined;
  const students = useMemo<User[]>(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);
  const teachers = useMemo<User[]>(() => teachersQuery.data?.data || [], [teachersQuery.data?.data]);
  const staffs = useMemo<User[]>(() => staffsQuery.data?.data || [], [staffsQuery.data?.data]);
  const principals = useMemo<User[]>(() => principalsQuery.data?.data || [], [principalsQuery.data?.data]);
  const permissions = useMemo<PermissionRow[]>(
    () => ((permissionsQuery.data?.data?.permissions as PermissionRow[]) || []),
    [permissionsQuery.data?.data?.permissions],
  );
  const financeSnapshot = financeSnapshotQuery.data as FinanceReportSnapshot | undefined;
  const pendingHeadTuWriteOffs = financeWriteOffsQuery.data?.requests || [];
  const pendingHeadTuPaymentReversals = financePaymentReversalsQuery.data?.requests || [];
  const financeCashSessions = financeCashSessionsQuery.data?.sessions || [];
  const pendingHeadTuCashSessions = financeCashSessionApprovalsQuery.data?.sessions || [];
  const financeCashSessionSummary = financeCashSessionsQuery.data?.summary;
  const financeBankReconciliations = financeBankReconciliationsQuery.data?.reconciliations || [];
  const financeBankReconciliationSummary = financeBankReconciliationsQuery.data?.summary;
  const financeBudgetRealization = financeBudgetRealizationQuery.data || null;
  const financeGovernance = financeGovernanceQuery.data || null;
  const financeAudit = financeAuditQuery.data || null;
  const financePerformance = financePerformanceQuery.data || null;
  const financeIntegrity = financeIntegrityQuery.data || null;
  const financeClosingPeriods = financeClosingPeriodsQuery.data?.periods || [];
  const financeClosingPeriodSummary = financeClosingPeriodsQuery.data?.summary;
  const pendingHeadTuClosingPeriods = financeClosingPeriodApprovalsQuery.data?.periods || [];
  const financeClosingPeriodReopenRequests = financeClosingPeriodReopenRequestsQuery.data?.requests || [];
  const financeClosingPeriodReopenSummary = financeClosingPeriodReopenRequestsQuery.data?.summary;
  const pendingHeadTuClosingPeriodReopens = financeClosingPeriodReopenApprovalsQuery.data?.requests || [];
  const officeSummary = officeSummaryQuery.data;
  const examCardDetails = examCardsQuery.data || [];
  const officeLetters = officeLettersQuery.data?.letters || [];
  const candidateDecisionLettersPayload = useMemo(
    () => extractCandidateAdmissionListPayload(candidateDecisionLettersQuery.data),
    [candidateDecisionLettersQuery.data],
  );
  const candidateDecisionLetterDetail = useMemo(
    () => extractCandidateAdmissionPayload(selectedCandidateDecisionDetailQuery.data),
    [selectedCandidateDecisionDetailQuery.data],
  );

  const administrationStaffCount = staffs.filter(
    (staff) => resolveStaffDivision(staff) === 'ADMINISTRATION',
  ).length;
  const financeStaffCount = staffs.filter((staff) => resolveStaffDivision(staff) === 'FINANCE').length;
  const pendingPermissions = permissions.filter((permission) => permission.status === 'PENDING');
  const pendingStudentVerification = students.filter(
    (student) => student.verificationStatus && student.verificationStatus !== 'VERIFIED',
  ).length;
  const pendingTeacherVerification = teachers.filter(
    (teacher) => teacher.verificationStatus && teacher.verificationStatus !== 'VERIFIED',
  ).length;

  const combinedEducators = useMemo<StaffUser[]>(
    () => [
      ...teachers.map((teacher) => ({ ...teacher, roleLabel: 'Guru' })),
      ...staffs.map((staff) => ({ ...staff, roleLabel: getStaffDivisionLabel(staff) })),
    ],
    [teachers, staffs],
  );

  const normalizedStudentSearch = studentSearch.trim().toLowerCase();
  const normalizedTeacherSearch = teacherSearch.trim().toLowerCase();
  const normalizedPermissionSearch = permissionSearch.trim().toLowerCase();
  const normalizedExamCardSearch = examCardSearch.trim().toLowerCase();

  const filteredStudents = useMemo(
    () =>
      students.filter((student) =>
        matchesSearch(normalizedStudentSearch, [
          student.name,
          student.nis,
          student.nisn,
          student.studentClass?.name,
          student.studentClass?.major?.name,
          student.verificationStatus,
          student.studentStatus,
        ]),
      ),
    [students, normalizedStudentSearch],
  );

  const filteredEducators = useMemo(
    () =>
      combinedEducators.filter((educator) =>
        matchesSearch(normalizedTeacherSearch, [
          educator.name,
          educator.username,
          educator.nip,
          educator.nuptk,
          educator.ptkType,
          educator.employeeStatus,
          educator.verificationStatus,
          educator.roleLabel,
        ]),
      ),
    [combinedEducators, normalizedTeacherSearch],
  );

  const filteredPermissions = useMemo(
    () =>
      permissions.filter((permission) =>
        matchesSearch(normalizedPermissionSearch, [
          permission.student?.name,
          permission.student?.nis,
          permission.student?.nisn,
          permission.student?.studentClass?.name,
          permission.type,
          permission.status,
          permission.reason,
          permission.approvalNote,
        ]),
      ),
    [permissions, normalizedPermissionSearch],
  );

  const examCardRows = useMemo<ExamCardRow[]>(() => {
    const grouped = new Map<number, ExamCardRow>();

    examCardDetails.forEach((sitting) => {
      const resolvedSessionLabel = String(sitting.programSession?.label || sitting.sessionLabel || '').trim() || null;
      const resolvedExamType = String(sitting.examType || '').trim() || 'UJIAN';

      (sitting.students || []).forEach((row) => {
        const student = row.student;
        if (!student?.id) return;

        if (!grouped.has(student.id)) {
          grouped.set(student.id, {
            studentId: student.id,
            studentName: student.name,
            username: student.username || '-',
            nis: student.nis || null,
            nisn: student.nisn || null,
            className: student.studentClass?.name || '-',
            examCount: 0,
            entries: [],
          });
        }

        const current = grouped.get(student.id)!;
        current.entries.push({
          sittingId: sitting.id,
          examType: resolvedExamType,
          roomName: sitting.roomName || '-',
          startTime: sitting.startTime || null,
          endTime: sitting.endTime || null,
          sessionLabel: resolvedSessionLabel,
        });
        current.examCount = current.entries.length;
      });
    });

    return Array.from(grouped.values()).sort((a, b) =>
      a.studentName.localeCompare(b.studentName, 'id-ID', { sensitivity: 'base' }),
    );
  }, [examCardDetails]);

  const examCardClassOptions = useMemo(
    () =>
      Array.from(new Set(examCardRows.map((row) => row.className).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, 'id-ID', { sensitivity: 'base' }),
      ),
    [examCardRows],
  );

  const examCardExamTypeOptions = useMemo(
    () =>
      Array.from(
        new Set(
          examCardRows.flatMap((row) => row.entries.map((entry) => entry.examType).filter(Boolean)),
        ),
      ).sort((a, b) => a.localeCompare(b, 'id-ID', { sensitivity: 'base' })),
    [examCardRows],
  );

  const filteredExamCardRows = useMemo(
    () =>
      examCardRows.filter((row) => {
        const matchesKeyword = matchesSearch(normalizedExamCardSearch, [
          row.studentName,
          row.nis,
          row.nisn,
          row.className,
          ...row.entries.flatMap((entry) => [entry.examType, entry.roomName, entry.sessionLabel]),
        ]);
        const matchesClass = examCardClassFilter === 'ALL' || row.className === examCardClassFilter;
        const matchesExamType =
          examCardExamTypeFilter === 'ALL' ||
          row.entries.some((entry) => entry.examType === examCardExamTypeFilter);
        return matchesKeyword && matchesClass && matchesExamType;
      }),
    [examCardRows, normalizedExamCardSearch, examCardClassFilter, examCardExamTypeFilter],
  );

  useEffect(() => {
    if (!isLettersPage) return;
    const rows = candidateDecisionLettersPayload.applications;
    if (rows.length === 0) {
      setSelectedCandidateLetterId(null);
      return;
    }
    const stillExists = rows.some((item) => item.id === selectedCandidateLetterId);
    if (!stillExists) {
      setSelectedCandidateLetterId(rows[0].id);
    }
  }, [candidateDecisionLettersPayload.applications, isLettersPage, selectedCandidateLetterId]);

  useEffect(() => {
    if (!candidateDecisionLetterDetail) return;
    setCandidateLetterForm({
      issueCity: candidateDecisionLetterDetail.decisionLetter.issuedCity || 'Bekasi',
      issueDate: String(
        candidateDecisionLetterDetail.decisionLetter.issuedAt ||
          candidateDecisionLetterDetail.decisionAnnouncement.publishedAt ||
          new Date().toISOString(),
      ).slice(0, 10),
      signerName:
        candidateDecisionLetterDetail.decisionLetter.signerName ||
        currentUser?.name ||
        '',
      signerPosition: candidateDecisionLetterDetail.decisionLetter.signerPosition || 'Kepala Tata Usaha',
    });
    setCandidateOfficialLetterFile(null);
  }, [candidateDecisionLetterDetail, currentUser?.name]);

  const selectedStudentRecipient = students.find((student) => String(student.id) === selectedRecipientId) || null;
  const selectedTeacherRecipient = combinedEducators.find((educator) => String(educator.id) === selectedRecipientId) || null;
  const selectedLetterRecipient =
    letterType === 'STUDENT_CERTIFICATE' || letterType === 'EXAM_CARD_COVER'
      ? selectedStudentRecipient
      : selectedTeacherRecipient;

  const principalSigner = principals[0] || null;

  const letterTypeLabelMap: Record<OfficeLetterType, string> = {
    STUDENT_CERTIFICATE: 'Surat Keterangan Siswa Aktif',
    TEACHER_CERTIFICATE: 'Surat Keterangan Guru/Staff Aktif',
    EXAM_CARD_COVER: 'Surat Pengantar Kartu Ujian',
    CANDIDATE_ADMISSION_RESULT: 'Surat Hasil Seleksi PPDB',
  };

  const openPrintWindow = (title: string, bodyHtml: string) => {
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${escapeHtml(title)}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
            h1, h2, h3, p { margin: 0; }
            .page-title { text-align: center; margin-bottom: 24px; }
            .meta { margin-bottom: 20px; font-size: 14px; line-height: 1.6; }
            .meta-row { display: flex; gap: 8px; }
            .section-title { margin: 20px 0 10px; font-size: 16px; font-weight: 700; }
            .table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
            .table th, .table td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
            .table th { background: #f8fafc; text-align: left; }
            .signature-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 32px; margin-top: 48px; }
            .signature-box { text-align: center; }
            .spacer { height: 56px; }
            .card { border: 1px solid #cbd5e1; border-radius: 12px; padding: 18px; margin-bottom: 20px; page-break-inside: avoid; }
            .muted { color: #6b7280; }
            .small { font-size: 12px; }
          </style>
        </head>
        <body>${bodyHtml}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const buildLetterHtml = (options: {
    title: string;
    letterNumber?: string | null;
    recipientName: string;
    username?: string | null;
    primaryId?: string | null;
    recipientContext?: string | null;
    purpose?: string | null;
    notes?: string | null;
    issueDate?: string | null;
  }) => `
      <div class="page-title">
        <h2>SMKS Karya Guna Bhakti 2</h2>
        <p class="muted small">Dokumen Tata Usaha • ${escapeHtml(activeYear?.name || '-')}</p>
        <h1 style="margin-top: 12px;">${escapeHtml(options.title)}</h1>
      </div>
      ${
        options.letterNumber
          ? `<div class="meta"><div class="meta-row"><strong>Nomor Surat</strong><span>:</span><span>${escapeHtml(options.letterNumber)}</span></div></div>`
          : ''
      }
      <div class="meta">
        <div class="meta-row"><strong>Nama</strong><span>:</span><span>${escapeHtml(options.recipientName)}</span></div>
        <div class="meta-row"><strong>Username</strong><span>:</span><span>${escapeHtml(options.username || '-')}</span></div>
        <div class="meta-row"><strong>Identitas</strong><span>:</span><span>${escapeHtml(options.primaryId || '-')}</span></div>
        <div class="meta-row"><strong>Kelas / PTK</strong><span>:</span><span>${escapeHtml(options.recipientContext || '-')}</span></div>
        <div class="meta-row"><strong>Keperluan</strong><span>:</span><span>${escapeHtml(options.purpose || '-')}</span></div>
      </div>
      <p style="line-height:1.8;">
        Dokumen ini diterbitkan oleh Tata Usaha sekolah sebagai bukti administratif bahwa yang bersangkutan tercatat aktif
        pada sistem SIS sekolah untuk tahun ajaran ${escapeHtml(activeYear?.name || '-')}.
      </p>
      ${
        options.notes
          ? `<div class="section-title">Catatan Tambahan</div><p style="line-height:1.8;">${escapeHtml(options.notes)}</p>`
          : ''
      }
      <div class="signature-grid">
        <div class="signature-box">
          <p>Mengetahui,</p>
          <p><strong>Kepala Sekolah</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(principalSigner?.name || '-')}</strong></p>
        </div>
        <div class="signature-box">
          <p>Bekasi, ${escapeHtml(formatDate(options.issueDate || new Date().toISOString()))}</p>
          <p><strong>Kepala Tata Usaha</strong></p>
          <div class="spacer"></div>
          <p><strong>${escapeHtml(currentUser?.name || '-')}</strong></p>
        </div>
      </div>
    `;

  const createLetterMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLetterRecipient) {
        throw new Error('Penerima surat belum dipilih.');
      }

      const recipientContext =
        'studentClass' in selectedLetterRecipient && selectedLetterRecipient.studentClass?.name
          ? selectedLetterRecipient.studentClass.name
          : 'roleLabel' in selectedLetterRecipient && selectedLetterRecipient.roleLabel
            ? selectedLetterRecipient.roleLabel
            : selectedLetterRecipient.ptkType || null;

      return officeService.createLetter({
        academicYearId: activeYear?.id,
        type: letterType,
        recipientId: selectedLetterRecipient.id,
        recipientName: selectedLetterRecipient.name,
        recipientRole:
          'roleLabel' in selectedLetterRecipient && typeof selectedLetterRecipient.roleLabel === 'string'
            ? selectedLetterRecipient.roleLabel
            : selectedLetterRecipient.ptkType || null,
        recipientClass:
          'studentClass' in selectedLetterRecipient ? selectedLetterRecipient.studentClass?.name || null : null,
        recipientPrimaryId:
          selectedLetterRecipient.nisn ||
          selectedLetterRecipient.nis ||
          selectedLetterRecipient.nip ||
          selectedLetterRecipient.nuptk ||
          null,
        purpose: letterPurpose || null,
        notes: letterNotes || null,
        payload: {
          username: selectedLetterRecipient.username || null,
          recipientContext,
          generatedBy: currentUser?.name || null,
        },
      });
    },
    onSuccess: (letter) => {
      toast.success('Surat berhasil disimpan.');
      queryClient.invalidateQueries({ queryKey: ['head-tu-office-summary'] });
      queryClient.invalidateQueries({ queryKey: ['head-tu-office-letters'] });

      const payload = (letter.payload || {}) as Record<string, unknown>;
      const recipientContext =
        letter.recipientClass ||
        letter.recipientRole ||
        (typeof payload.recipientContext === 'string' ? payload.recipientContext : null);

      openPrintWindow(
        `${letter.title} - ${letter.recipientName}`,
        buildLetterHtml({
          title: letter.title,
          letterNumber: letter.letterNumber,
          recipientName: letter.recipientName,
          username: letter.recipient?.username || (typeof payload.username === 'string' ? payload.username : null),
          primaryId: letter.recipientPrimaryId || null,
          recipientContext,
          purpose: letter.purpose || null,
          notes: letter.notes || null,
          issueDate: letter.printedAt || letter.createdAt,
        }),
      );
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal menyimpan surat.';
      toast.error(message);
    },
  });

  const saveCandidateDecisionLetterMutation = useMutation({
    mutationFn: async (mode: 'save' | 'save-with-upload' | 'clear-official') => {
      if (!selectedCandidateLetterId) {
        throw new Error('Pilih calon siswa terlebih dahulu.');
      }

      let officialLetterUrl: string | null | undefined;
      let officialLetterOriginalName: string | null | undefined;

      if (mode === 'save-with-upload') {
        if (!candidateOfficialLetterFile) {
          throw new Error('Pilih file PDF surat resmi terlebih dahulu.');
        }
        if (!/\.pdf$/i.test(candidateOfficialLetterFile.name)) {
          throw new Error('Surat resmi hasil seleksi harus berupa file PDF.');
        }

        const uploaded = await uploadService.uploadTeacherDocument(candidateOfficialLetterFile);
        officialLetterUrl = String(uploaded?.url || '').trim() || null;
        officialLetterOriginalName = String(uploaded?.originalname || candidateOfficialLetterFile.name || '').trim() || null;
      }

      return candidateAdmissionService.saveDecisionLetter(selectedCandidateLetterId, {
        issueCity: candidateLetterForm.issueCity.trim() || 'Bekasi',
        issueDate: candidateLetterForm.issueDate || undefined,
        signerName: candidateLetterForm.signerName.trim() || undefined,
        signerPosition: candidateLetterForm.signerPosition.trim() || undefined,
        ...(mode === 'save-with-upload'
          ? {
              officialLetterUrl: officialLetterUrl || null,
              officialLetterOriginalName: officialLetterOriginalName || null,
            }
          : {}),
        ...(mode === 'clear-official' ? { clearOfficialLetter: true } : {}),
      });
    },
    onSuccess: async (_data, mode) => {
      toast.success(
        mode === 'save-with-upload'
          ? 'Draft surat dan file resmi berhasil diperbarui.'
          : mode === 'clear-official'
            ? 'File surat resmi berhasil dilepas dari arsip PPDB.'
            : 'Draft surat hasil seleksi berhasil diperbarui.',
      );
      setCandidateOfficialLetterFile(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['head-tu-candidate-decision-letters'] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-candidate-decision-letter-detail', selectedCandidateLetterId] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-office-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['head-tu-office-letters'] }),
      ]);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Gagal memperbarui surat hasil seleksi.';
      toast.error(message);
    },
  });

  const handlePrintLetter = () => {
    if (!selectedLetterRecipient || createLetterMutation.isPending) return;
    createLetterMutation.mutate();
  };

  const handlePrintStoredLetter = (letter: OfficeLetter) => {
    const payload = (letter.payload || {}) as Record<string, unknown>;
    if (
      letter.type === 'CANDIDATE_ADMISSION_RESULT' &&
      typeof payload.candidateAdmissionId === 'number' &&
      payload.candidateAdmissionId > 0
    ) {
      window.open(
        getCandidateDecisionLetterPrintPath(payload.candidateAdmissionId),
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }

    const recipientContext =
      letter.recipientClass ||
      letter.recipientRole ||
      (typeof payload.recipientContext === 'string' ? payload.recipientContext : null);

    openPrintWindow(
      `${letter.title} - ${letter.recipientName}`,
      buildLetterHtml({
        title: letter.title,
        letterNumber: letter.letterNumber,
        recipientName: letter.recipientName,
        username: letter.recipient?.username || (typeof payload.username === 'string' ? payload.username : null),
        primaryId: letter.recipientPrimaryId || null,
        recipientContext,
        purpose: letter.purpose || null,
        notes: letter.notes || null,
        issueDate: letter.printedAt || letter.createdAt,
      }),
    );
  };

  const buildExamCardsHtml = (rows: ExamCardRow[]) => `
    <div class="page-title">
      <h2>SMKS Karya Guna Bhakti 2</h2>
      <p class="muted small">Tata Usaha • ${escapeHtml(activeYear?.name || '-')}</p>
      <h1 style="margin-top: 12px;">Kartu Ujian</h1>
    </div>
    ${rows
      .map(
        (row) => `
          <div class="card">
            <h3 style="margin-bottom: 10px;">${escapeHtml(row.studentName)}</h3>
            <div class="meta">
              <div class="meta-row"><strong>NIS</strong><span>:</span><span>${escapeHtml(row.nis || '-')}</span></div>
              <div class="meta-row"><strong>NISN</strong><span>:</span><span>${escapeHtml(row.nisn || '-')}</span></div>
              <div class="meta-row"><strong>Kelas</strong><span>:</span><span>${escapeHtml(row.className)}</span></div>
            </div>
            <table class="table">
              <thead>
                <tr>
                  <th>Jenis Ujian</th>
                  <th>Ruang</th>
                  <th>Sesi</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                </tr>
              </thead>
              <tbody>
                ${row.entries
                  .map(
                    (entry) => `
                      <tr>
                        <td>${escapeHtml(entry.examType)}</td>
                        <td>${escapeHtml(entry.roomName)}</td>
                        <td>${escapeHtml(entry.sessionLabel || '-')}</td>
                        <td>${escapeHtml(formatDateTime(entry.startTime))}</td>
                        <td>${escapeHtml(formatDateTime(entry.endTime))}</td>
                      </tr>
                    `,
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `,
      )
      .join('')}
    <div class="signature-grid">
      <div class="signature-box">
        <p>Mengetahui,</p>
        <p><strong>Kepala Sekolah</strong></p>
        <div class="spacer"></div>
        <p><strong>${escapeHtml(principalSigner?.name || '-')}</strong></p>
      </div>
      <div class="signature-box">
        <p>Bekasi, ${escapeHtml(formatDate(new Date().toISOString()))}</p>
        <p><strong>Kepala Tata Usaha</strong></p>
        <div class="spacer"></div>
        <p><strong>${escapeHtml(currentUser?.name || '-')}</strong></p>
      </div>
    </div>
  `;

  const handlePrintSingleExamCard = (row: ExamCardRow) => {
    openPrintWindow(`Kartu Ujian - ${row.studentName}`, buildExamCardsHtml([row]));
  };

  const handlePrintAllExamCards = () => {
    if (filteredExamCardRows.length === 0) return;
    openPrintWindow('Kartu Ujian', buildExamCardsHtml(filteredExamCardRows));
  };

  if (isStudentsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">Kontrol data siswa lintas kelas untuk layanan tata usaha.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={studentSearch}
              onChange={(event) => setStudentSearch(event.target.value)}
              placeholder="Cari nama, NIS, NISN, kelas, atau status..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void studentsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {studentsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : studentsQuery.isError ? (
            <div className="py-10 text-center text-sm text-red-600">Gagal memuat data siswa.</div>
          ) : filteredStudents.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data siswa yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status Siswa</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{student.name}</div>
                        <div className="text-xs text-gray-500">@{student.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {student.nis || '-'}</div>
                        <div>NISN: {student.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.studentClass?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.verificationStatus || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.studentStatus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isTeachersPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Guru & Staff</h2>
          <p className="mt-1 text-sm text-gray-500">Pantau data guru, staff administrasi, staff keuangan, dan kepala TU dalam satu layar.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={teacherSearch}
              onChange={(event) => setTeacherSearch(event.target.value)}
              placeholder="Cari nama, NIP, NUPTK, PTK, atau role..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              void teachersQuery.refetch();
              void staffsQuery.refetch();
            }}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {teachersQuery.isLoading || staffsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredEducators.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada data guru/staff yang cocok.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PTK</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Verifikasi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEducators.map((educator) => (
                    <tr key={`${educator.roleLabel}-${educator.id}`}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{educator.name}</div>
                        <div className="text-xs text-gray-500">@{educator.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.roleLabel || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIP: {educator.nip || '-'}</div>
                        <div>NUPTK: {educator.nuptk || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.ptkType || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{educator.verificationStatus || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isPermissionsPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Perizinan Siswa</h2>
          <p className="mt-1 text-sm text-gray-500">Monitor pengajuan izin siswa lintas kelas untuk kontrol tata usaha.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
              placeholder="Cari siswa, NISN, alasan, atau status..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
          <button
            type="button"
            onClick={() => void permissionsQuery.refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {permissionsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredPermissions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada data perizinan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rentang</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredPermissions.map((permission) => (
                    <tr key={permission.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{permission.student?.name || '-'}</div>
                        <div className="text-xs text-gray-500">
                          NISN: {permission.student?.nisn || '-'}
                          {permission.student?.studentClass?.name ? ` • ${permission.student.studentClass.name}` : ''}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.type}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {formatDate(permission.startDate)} - {formatDate(permission.endDate)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.status}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{permission.reason || permission.approvalNote || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isLettersPage) {
    const recipientOptions: Array<User | StaffUser> =
      letterType === 'TEACHER_CERTIFICATE'
        ? combinedEducators
        : students;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Surat-Menyurat</h2>
          <p className="mt-1 text-sm text-gray-500">Buat surat administrasi sekolah untuk siswa, guru/staff, dan layanan ujian.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-slate-700/80">Total Arsip Surat</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{officeSummary?.totalLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-slate-700/70">Semua surat tahun ajaran aktif</p>
          </div>
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Surat Bulan Ini</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{officeSummary?.monthlyLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-blue-700/70">Otomatis terarsip setiap cetak</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Tipe Surat Aktif</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{officeSummary?.byType?.length || 0}</p>
            <p className="mt-1 text-xs text-emerald-700/70">Jenis surat yang sudah pernah diterbitkan</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Surat Hasil Seleksi PPDB</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Antrean calon siswa dengan pengumuman hasil yang sudah resmi dipublikasikan.
                </p>
              </div>
              <div className="relative w-full md:max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={candidateLetterSearch}
                  onChange={(event) => setCandidateLetterSearch(event.target.value)}
                  placeholder="Cari nama, nomor pendaftaran, NISN..."
                  className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wider text-blue-700/80">Antrean Surat</p>
                <p className="mt-2 text-2xl font-bold text-blue-900">
                  {candidateDecisionLettersPayload.applications.length.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-700/80">Sudah Final Draft</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">
                  {candidateDecisionLettersPayload.applications
                    .filter((item) => item.decisionLetter?.isFinalized)
                    .length.toLocaleString('id-ID')}
                </p>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wider text-amber-700/80">Surat Resmi Diunggah</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">
                  {candidateDecisionLettersPayload.applications
                    .filter((item) => item.decisionLetter?.officialFileUrl)
                    .length.toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <div className="mt-5 overflow-x-auto">
              {candidateDecisionLettersQuery.isLoading ? (
                <div className="flex py-12 justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                </div>
              ) : candidateDecisionLettersQuery.isError ? (
                <div className="py-10 text-center text-sm text-red-600">
                  Gagal memuat antrean surat hasil seleksi.
                </div>
              ) : candidateDecisionLettersPayload.applications.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  Belum ada pengumuman hasil seleksi yang siap difinalkan menjadi surat.
                </div>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Calon Siswa
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Surat
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Aksi
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {candidateDecisionLettersPayload.applications.map((item) => (
                      <tr key={item.id} className={selectedCandidateLetterId === item.id ? 'bg-blue-50/60' : ''}>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">{item.user.name}</div>
                          <div className="text-xs text-gray-500">
                            {item.registrationNumber} • {item.user.nisn || item.user.username}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <CandidateAdmissionStatusBadge status={item.status} />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">
                            {item.decisionLetter?.letterNumber || 'Draft otomatis'}
                          </div>
                          <div className="text-xs text-gray-500">
                            {item.decisionLetter?.officialFileUrl ? 'Surat resmi tersedia' : 'Belum ada file resmi'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <button
                            type="button"
                            onClick={() => setSelectedCandidateLetterId(item.id)}
                            className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                          >
                            Kelola
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            {!selectedCandidateLetterId ? (
              <div className="py-16 text-center text-sm text-gray-500">
                Pilih salah satu calon siswa untuk memfinalkan draft surat hasil seleksi.
              </div>
            ) : selectedCandidateDecisionDetailQuery.isLoading ? (
              <div className="flex py-16 justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : !candidateDecisionLetterDetail ? (
              <div className="py-16 text-center text-sm text-gray-500">
                Detail surat hasil seleksi tidak ditemukan.
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {candidateDecisionLetterDetail.user.name}
                    </h3>
                    <CandidateAdmissionStatusBadge status={candidateDecisionLetterDetail.status} />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {candidateDecisionLetterDetail.registrationNumber} •{' '}
                    {candidateDecisionLetterDetail.user.nisn || candidateDecisionLetterDetail.user.username}
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                  <p>
                    <span className="font-semibold text-slate-900">Judul keputusan:</span>{' '}
                    {candidateDecisionLetterDetail.decisionAnnouncement.title || 'Hasil Seleksi PPDB'}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Ringkasan:</span>{' '}
                    {candidateDecisionLetterDetail.decisionAnnouncement.summary || '-'}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Dipublikasikan:</span>{' '}
                    {formatCandidateDateTime(candidateDecisionLetterDetail.decisionAnnouncement.publishedAt)}
                  </p>
                  <p className="mt-2">
                    <span className="font-semibold text-slate-900">Draft surat:</span>{' '}
                    {candidateDecisionLetterDetail.decisionLetter.isFinalized
                      ? `Sudah difinalkan (${candidateDecisionLetterDetail.decisionLetter.letterNumber || '-'})`
                      : 'Masih draft otomatis sistem'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    to={getCandidateDecisionLetterPrintPath(candidateDecisionLetterDetail.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Buka Draft Surat
                  </Link>
                  {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                    <a
                      href={candidateDecisionLetterDetail.decisionLetter.officialFileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      Buka Surat Resmi
                    </a>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <h4 className="text-sm font-semibold text-gray-900">Finalisasi Draft Surat</h4>
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Kota Surat</label>
                      <input
                        type="text"
                        value={candidateLetterForm.issueCity}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, issueCity: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Tanggal Surat</label>
                      <input
                        type="date"
                        value={candidateLetterForm.issueDate}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, issueDate: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Nama Penandatangan TU</label>
                      <input
                        type="text"
                        value={candidateLetterForm.signerName}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, signerName: event.target.value }))
                        }
                        placeholder="Nama Kepala Tata Usaha"
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700">Jabatan Penandatangan</label>
                      <input
                        type="text"
                        value={candidateLetterForm.signerPosition}
                        onChange={(event) =>
                          setCandidateLetterForm((prev) => ({ ...prev, signerPosition: event.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                      />
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <label className="block text-sm font-medium text-gray-700">Upload Surat Resmi Bertanda Tangan (PDF)</label>
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(event) => setCandidateOfficialLetterFile(event.target.files?.[0] || null)}
                      className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-blue-700"
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      Upload bersifat opsional. Jika belum ada PDF resmi, calon siswa tetap bisa melihat draft otomatis dari sistem.
                    </p>
                    {candidateOfficialLetterFile ? (
                      <p className="mt-2 text-xs font-semibold text-blue-700">
                        File siap diunggah: {candidateOfficialLetterFile.name}
                      </p>
                    ) : null}
                    {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                      <p className="mt-2 text-xs text-emerald-700">
                        Surat resmi aktif: {candidateDecisionLetterDetail.decisionLetter.officialOriginalName || 'PDF resmi'} •
                        diunggah {formatCandidateDateTime(candidateDecisionLetterDetail.decisionLetter.officialUploadedAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => saveCandidateDecisionLetterMutation.mutate('save')}
                      disabled={saveCandidateDecisionLetterMutation.isPending}
                      className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saveCandidateDecisionLetterMutation.isPending ? 'Menyimpan...' : 'Simpan Draft Surat'}
                    </button>
                    <button
                      type="button"
                      onClick={() => saveCandidateDecisionLetterMutation.mutate('save-with-upload')}
                      disabled={saveCandidateDecisionLetterMutation.isPending || !candidateOfficialLetterFile}
                      className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                    >
                      Simpan + Upload Surat Resmi
                    </button>
                    {candidateDecisionLetterDetail.decisionLetter.officialFileUrl ? (
                      <button
                        type="button"
                        onClick={() => saveCandidateDecisionLetterMutation.mutate('clear-official')}
                        disabled={saveCandidateDecisionLetterMutation.isPending}
                        className="inline-flex items-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Lepas Surat Resmi
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Jenis Surat</label>
              <select
                value={letterType}
                onChange={(event) => {
                  setLetterType(event.target.value as OfficeLetterType);
                  setSelectedRecipientId('');
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="STUDENT_CERTIFICATE">Surat Keterangan Siswa Aktif</option>
                <option value="TEACHER_CERTIFICATE">Surat Keterangan Guru/Staff Aktif</option>
                <option value="EXAM_CARD_COVER">Surat Pengantar Kartu Ujian</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Penerima</label>
              <select
                value={selectedRecipientId}
                onChange={(event) => setSelectedRecipientId(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              >
                <option value="">Pilih penerima surat</option>
                {recipientOptions.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.name}
                    {'studentClass' in recipient && recipient.studentClass?.name
                      ? ` • ${recipient.studentClass.name}`
                      : 'roleLabel' in recipient && recipient.roleLabel
                        ? ` • ${recipient.roleLabel}`
                        : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handlePrintLetter}
                disabled={!selectedLetterRecipient || createLetterMutation.isPending}
                className="inline-flex items-center justify-center w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed"
              >
                {createLetterMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 mr-2" />
                )}
                Simpan & Print Surat
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Keperluan</label>
            <input
              type="text"
              value={letterPurpose}
              onChange={(event) => setLetterPurpose(event.target.value)}
              placeholder="Contoh: Persyaratan beasiswa, arsip pribadi, administrasi ujian"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Catatan Tambahan</label>
            <textarea
              value={letterNotes}
              onChange={(event) => setLetterNotes(event.target.value)}
              rows={4}
              placeholder="Isi catatan tambahan jika diperlukan."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900">Preview Ringkas</h3>
          {!selectedLetterRecipient ? (
            <p className="mt-3 text-sm text-gray-500">Pilih jenis surat dan penerima untuk melihat ringkasan surat.</p>
          ) : (
            <div className="mt-4 space-y-2 text-sm text-gray-700">
              <p><span className="font-semibold text-gray-900">Penerima:</span> {selectedLetterRecipient.name}</p>
              <p><span className="font-semibold text-gray-900">Identitas:</span> {selectedLetterRecipient.nisn || selectedLetterRecipient.nip || selectedLetterRecipient.nuptk || '-'}</p>
              <p>
                <span className="font-semibold text-gray-900">Kelas / PTK:</span>{' '}
                {'studentClass' in selectedLetterRecipient
                  ? selectedLetterRecipient.studentClass?.name || '-'
                  : selectedLetterRecipient.ptkType || '-'}
              </p>
              <p><span className="font-semibold text-gray-900">Keperluan:</span> {letterPurpose || '-'}</p>
              <p><span className="font-semibold text-gray-900">Ditandatangani:</span> Kepala Sekolah dan Kepala TU</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Arsip Surat</h3>
              <p className="mt-1 text-xs text-gray-500">Semua surat yang sudah diterbitkan oleh Kepala TU bisa dicetak ulang dari sini.</p>
            </div>
            <div className="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row">
              <select
                value={letterArchiveTypeFilter}
                onChange={(event) => setLetterArchiveTypeFilter(event.target.value as 'ALL' | OfficeLetterType)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
              >
                <option value="ALL">Semua jenis surat</option>
                <option value="STUDENT_CERTIFICATE">Surat Keterangan Siswa Aktif</option>
                <option value="TEACHER_CERTIFICATE">Surat Keterangan Guru/Staff Aktif</option>
                <option value="EXAM_CARD_COVER">Surat Pengantar Kartu Ujian</option>
                <option value="CANDIDATE_ADMISSION_RESULT">Surat Hasil Seleksi PPDB</option>
              </select>
              <div className="relative w-full">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={letterArchiveSearch}
                  onChange={(event) => setLetterArchiveSearch(event.target.value)}
                  placeholder="Cari nomor surat, penerima, atau keperluan..."
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {officeLettersQuery.isLoading ? (
              <div className="py-10 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : officeLettersQuery.isError ? (
              <div className="py-10 text-center text-sm text-red-600">Gagal memuat arsip surat.</div>
            ) : officeLetters.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500">Belum ada arsip surat yang sesuai.</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nomor Surat</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jenis</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Penerima</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keperluan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dicetak</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {officeLetters.map((letter) => (
                    <tr key={letter.id}>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{letter.letterNumber}</div>
                        <div className="text-xs text-gray-500">{letter.academicYear?.name || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{letterTypeLabelMap[letter.type]}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="font-medium text-gray-900">{letter.recipientName}</div>
                        <div className="text-xs text-gray-500">{letter.recipientClass || letter.recipientRole || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{letter.purpose || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDateTime(letter.printedAt || letter.createdAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <button
                          type="button"
                          onClick={() => handlePrintStoredLetter(letter)}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Print Ulang
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (isExamCardsPage) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Kartu Ujian</h2>
            <p className="mt-1 text-sm text-gray-500">Cetak kartu ujian siswa berdasarkan data ruang, sesi, dan peserta ujian yang aktif.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => void examCardsQuery.refetch()}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
            >
              Muat Ulang
            </button>
            <button
              type="button"
              onClick={handlePrintAllExamCards}
              disabled={filteredExamCardRows.length === 0}
              className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-blue-200 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print Semua
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="flex w-full flex-col gap-3 md:flex-row md:items-center">
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={examCardSearch}
                onChange={(event) => setExamCardSearch(event.target.value)}
                placeholder="Cari nama siswa, NISN, kelas, ruang, atau jenis ujian..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
              />
            </div>
            <select
              value={examCardClassFilter}
              onChange={(event) => setExamCardClassFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
            >
              <option value="ALL">Semua kelas</option>
              {examCardClassOptions.map((className) => (
                <option key={className} value={className}>
                  {className}
                </option>
              ))}
            </select>
            <select
              value={examCardExamTypeFilter}
              onChange={(event) => setExamCardExamTypeFilter(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 md:max-w-xs"
            >
              <option value="ALL">Semua jenis ujian</option>
              {examCardExamTypeOptions.map((examType) => (
                <option key={examType} value={examType}>
                  {examType}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-500">
            {filteredExamCardRows.length} siswa • {examCardRows.length} total data kartu
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {examCardsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : filteredExamCardRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada data kartu ujian yang bisa ditampilkan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Identitas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Jadwal Ujian</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredExamCardRows.map((row) => (
                    <tr key={row.studentId}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="font-medium">{row.studentName}</div>
                        <div className="text-xs text-gray-500">@{row.username}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div>NIS: {row.nis || '-'}</div>
                        <div>NISN: {row.nisn || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{row.className}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="space-y-2">
                          {row.entries.map((entry) => (
                            <div key={`${row.studentId}-${entry.sittingId}`} className="rounded-lg border border-gray-100 px-3 py-2">
                              <div className="font-medium text-gray-900">{entry.examType}</div>
                              <div className="text-xs text-gray-500 mt-1">
                                Ruang {entry.roomName}
                                {entry.sessionLabel ? ` • ${entry.sessionLabel}` : ''}
                              </div>
                              <div className="text-xs text-gray-500">{formatDateTime(entry.startTime)} - {formatDateTime(entry.endTime)}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <button
                          type="button"
                          onClick={() => handlePrintSingleExamCard(row)}
                          className="inline-flex items-center rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isFinancePage) {
    const summary = financeSnapshot?.summary;
    const classRecap = financeSnapshot?.classRecap || [];

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Monitoring Keuangan</h2>
          <p className="mt-1 text-sm text-gray-500">Ringkasan performa tagihan dan piutang siswa untuk kontrol Kepala TU.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Governance Summary</h3>
              <p className="mt-1 text-xs text-gray-500">
                Satu ringkasan kontrol untuk kolektibilitas, treasury, approval, budget, dan kesiapan closing.
              </p>
            </div>
            {financeGovernance ? (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getGovernanceRiskTone(financeGovernance.overview.riskLevel).className}`}>
                {getGovernanceRiskTone(financeGovernance.overview.riskLevel).label}
              </span>
            ) : null}
          </div>
          {financeGovernanceQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !financeGovernance ? (
            <div className="py-10 text-center text-sm text-gray-500">Ringkasan governance finance belum tersedia.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{financeGovernance.overview.headline}</div>
                <div className="mt-1 text-xs text-slate-600">{financeGovernance.overview.detail}</div>
                <div className="mt-2 text-xs text-slate-500">
                  {financeGovernance.overview.attentionItems} item perhatian • {formatCurrency(financeGovernance.overview.attentionAmount)}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-rose-700/80">Kolektibilitas</div>
                  <div className="mt-2 text-lg font-bold text-rose-900">{financeGovernance.collection.criticalCount} kritis</div>
                  <div className="mt-1 text-xs text-rose-800/80">
                    High {financeGovernance.collection.highPriorityCount} • overdue {formatCurrency(financeGovernance.collection.overdueOutstanding)}
                  </div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-sky-700/80">Treasury</div>
                  <div className="mt-2 text-lg font-bold text-sky-900">
                    {financeGovernance.treasury.openCashSessions + financeGovernance.treasury.openBankReconciliations} terbuka
                  </div>
                  <div className="mt-1 text-xs text-sky-800/80">
                    Pending verifikasi {formatCurrency(financeGovernance.treasury.pendingBankVerificationAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-amber-700/80">Approval</div>
                  <div className="mt-2 text-lg font-bold text-amber-900">{financeGovernance.approvals.totalPendingCount} menunggu</div>
                  <div className="mt-1 text-xs text-amber-800/80">
                    Nilai approval {formatCurrency(financeGovernance.approvals.totalPendingAmount)}
                  </div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-violet-700/80">Budget & Closing</div>
                  <div className="mt-2 text-lg font-bold text-violet-900">
                    {financeGovernance.budgetControl.followUpCount + financeGovernance.closingControl.reviewCount} blocker
                  </div>
                  <div className="mt-1 text-xs text-violet-800/80">
                    Pending closing {formatCurrency(financeGovernance.closingControl.pendingVerificationAmount)}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100">
                  <h4 className="text-sm font-semibold text-gray-900">Antrian Prioritas</h4>
                </div>
                {!financeGovernance.followUpQueue.length ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Belum ada antrian governance yang perlu ditindaklanjuti.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {financeGovernance.followUpQueue.map((item) => (
                      <div key={item.key} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getGovernanceSeverityTone(item.severity).className}`}>
                              {item.severity}
                            </span>
                            <span className="text-[11px] font-medium text-gray-500">{item.category}</span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-gray-900">{item.title}</div>
                          <div className="mt-1 text-xs text-gray-500">{item.detail}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            {item.referenceLabel ? `${item.referenceLabel} • ` : ''}
                            {item.updatedAt ? formatDate(item.updatedAt) : 'Perlu ditinjau'}
                          </div>
                        </div>
                        <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatCurrency(item.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Performance Trend 6 Bulan</h3>
            <p className="mt-1 text-xs text-gray-500">
              Tren invoice, pace koleksi, pending verifikasi, treasury flow, dan disiplin closing untuk monitoring Kepala TU.
            </p>
          </div>
          {financePerformanceQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !financePerformance ? (
            <div className="py-10 text-center text-sm text-gray-500">Ringkasan performa finance belum tersedia.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-slate-700/80">Avg Collection</div>
                  <div className="mt-2 text-lg font-bold text-slate-900">{financePerformance.overview.averageCollectionRate.toFixed(1)}%</div>
                  <div className="mt-1 text-xs text-slate-600">{formatCurrency(financePerformance.overview.averageCollectedAgainstIssuedAmount)} / bulan</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-emerald-700/80">Net Flow Terbaru</div>
                  <div className="mt-2 text-lg font-bold text-emerald-900">{formatCurrency(financePerformance.overview.latestNetFlowAmount)}</div>
                  <div className="mt-1 text-xs text-emerald-800/80">{financePerformance.overview.latestMonthLabel || 'Bulan terbaru'}</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-amber-700/80">Outstanding</div>
                  <div className="mt-2 text-lg font-bold text-amber-900">{formatCurrency(financePerformance.overview.latestOutstandingAmount)}</div>
                  <div className="mt-1 text-xs text-amber-800/80">Rate {financePerformance.overview.latestCollectionRate.toFixed(1)}%</div>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-rose-700/80">Pending Verifikasi</div>
                  <div className="mt-2 text-lg font-bold text-rose-900">{formatCurrency(financePerformance.overview.latestPendingVerificationAmount)}</div>
                  <div className="mt-1 text-xs text-rose-800/80">
                    {financePerformance.highlights.highestPendingVerificationMonth
                      ? `Puncak ${financePerformance.highlights.highestPendingVerificationMonth.label}`
                      : 'Tidak ada backlog'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.42fr_0.58fr] gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Signal Prioritas</div>
                  {financePerformance.signals.map((signal) => (
                    <div key={signal.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{signal.title}</div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getPerformanceSignalTone(signal.tone).className}`}>
                          {signal.tone}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{signal.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <h4 className="text-sm font-semibold text-gray-900">Trend Bulanan</h4>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {financePerformance.monthlyTrend.map((row) => (
                      <div key={row.periodKey} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{row.label}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {row.issuedInvoiceCount} invoice • rate {row.collectionRate.toFixed(1)}%
                            </div>
                          </div>
                          <div className="text-right text-sm font-semibold text-gray-900">
                            {formatCurrency(row.issuedInvoiceAmount)}
                            <div className="mt-1 text-[11px] text-gray-500">Collected {formatCurrency(row.collectedAgainstIssuedAmount)}</div>
                          </div>
                        </div>
                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-slate-500">Net Flow</div>
                            <div className="mt-1 font-semibold text-slate-900">{formatCurrency(row.netFlowAmount)}</div>
                          </div>
                          <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                            <div className="text-amber-700">Outstanding</div>
                            <div className="mt-1 font-semibold text-amber-900">{formatCurrency(row.outstandingAmount)}</div>
                          </div>
                          <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                            <div className="text-rose-700">Pending</div>
                            <div className="mt-1 font-semibold text-rose-900">{formatCurrency(row.pendingVerificationAmount)}</div>
                          </div>
                          <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                            <div className="text-sky-700">Recon / Close</div>
                            <div className="mt-1 font-semibold text-sky-900">{row.finalizedReconciliationCount} / {row.finalizedClosingCount}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Integrity &amp; Readiness</h3>
              <p className="mt-1 text-xs text-gray-500">
                Checklist final untuk memastikan verifikasi, approval, treasury, closing, dan portal finance benar-benar bersih sebelum dianggap siap penuh.
              </p>
            </div>
            {financeIntegrity ? (
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getIntegrityStatusTone(financeIntegrity.overview.status).className}`}>
                {financeIntegrity.overview.status}
              </span>
            ) : null}
          </div>
          {financeIntegrityQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !financeIntegrity ? (
            <div className="py-10 text-center text-sm text-gray-500">Ringkasan integrity finance belum tersedia.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{financeIntegrity.overview.headline}</div>
                <div className="mt-1 text-xs text-slate-600">{financeIntegrity.overview.detail}</div>
                <div className="mt-3 grid grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="text-slate-500">Score</div>
                    <div className="mt-1 font-semibold text-slate-900">{financeIntegrity.overview.readinessScore}%</div>
                  </div>
                  <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                    <div className="text-emerald-700">Checklist</div>
                    <div className="mt-1 font-semibold text-emerald-900">
                      {financeIntegrity.overview.passedChecks}/{financeIntegrity.overview.totalChecks}
                    </div>
                  </div>
                  <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                    <div className="text-amber-700">Issue</div>
                    <div className="mt-1 font-semibold text-amber-900">
                      {financeIntegrity.overview.totalIssues} aktif
                    </div>
                  </div>
                  <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                    <div className="text-rose-700">Exposure</div>
                    <div className="mt-1 font-semibold text-rose-900">{formatCurrency(financeIntegrity.overview.pendingAmount)}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-[0.44fr_0.56fr] gap-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                  <div className="text-sm font-semibold text-slate-900">Checklist Penutup</div>
                  {financeIntegrity.checklist.map((item) => (
                    <div key={item.key} className="rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${item.passed ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : getIntegritySeverityTone(item.severity).className}`}>
                          {item.passed ? 'PASS' : item.severity}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-slate-500">{item.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-gray-900">Issue Queue</h4>
                    <span className="text-xs text-gray-500">{financeIntegrity.issues.length} issue</span>
                  </div>
                  {financeIntegrity.issues.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500">Tidak ada issue aktif. Finance terlihat bersih.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {financeIntegrity.issues.map((issue) => (
                        <div key={issue.key} className="px-4 py-3 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getIntegritySeverityTone(issue.severity).className}`}>
                                {issue.severity}
                              </span>
                              <span className="text-[11px] font-medium text-gray-500">{issue.area}</span>
                            </div>
                            <div className="mt-2 text-sm font-semibold text-gray-900">{issue.title}</div>
                            <div className="mt-1 text-xs text-gray-500">{issue.detail}</div>
                            <div className="mt-1 text-xs text-gray-400">{issue.updatedAt ? formatDate(issue.updatedAt) : 'Perlu ditindaklanjuti'}</div>
                          </div>
                          <div className="text-right text-sm font-semibold text-gray-900">
                            {formatCurrency(issue.amount)}
                            <div className="mt-1 text-[11px] text-gray-400">{issue.count} item</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Audit Finance 30 Hari</h3>
            <p className="mt-1 text-xs text-gray-500">
              Ringkasan perubahan policy, approval sensitif, dan kontrol treasury terbaru untuk audit Kepala TU.
            </p>
          </div>
          {financeAuditQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !financeAudit ? (
            <div className="py-10 text-center text-sm text-gray-500">Ringkasan audit finance belum tersedia.</div>
          ) : (
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-rose-700/80">Event Kritis</div>
                  <div className="mt-2 text-lg font-bold text-rose-900">{financeAudit.overview.criticalCount}</div>
                  <div className="mt-1 text-xs text-rose-800/80">High {financeAudit.overview.highCount}</div>
                </div>
                <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-sky-700/80">Policy</div>
                  <div className="mt-2 text-lg font-bold text-sky-900">{financeAudit.overview.policyChangeCount}</div>
                  <div className="mt-1 text-xs text-sky-800/80">{financeAudit.categorySummary.policyCount} log policy</div>
                </div>
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-amber-700/80">Approval</div>
                  <div className="mt-2 text-lg font-bold text-amber-900">{financeAudit.overview.approvalActionCount}</div>
                  <div className="mt-1 text-xs text-amber-800/80">{financeAudit.categorySummary.approvalCount} log approval</div>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
                  <div className="text-xs uppercase tracking-wider text-violet-700/80">Aktor Aktif</div>
                  <div className="mt-2 text-lg font-bold text-violet-900">{financeAudit.overview.uniqueActors}</div>
                  <div className="mt-1 text-xs text-violet-800/80">{financeAudit.overview.totalEvents} event tercatat</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-gray-900">Aktor Paling Aktif</h4>
                  <span className="text-xs text-gray-500">{financeAudit.actorSummary.length} aktor</span>
                </div>
                {financeAudit.actorSummary.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Belum ada aktivitas audit finance pada periode ini.</div>
                ) : (
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    {financeAudit.actorSummary.map((actor) => (
                      <div key={actor.actorId} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <span className="font-semibold text-slate-900">{actor.actorName}</span>
                        <span className="text-slate-500"> • {actor.totalEvents} event</span>
                        <span className="text-slate-500"> • kritis {actor.criticalCount}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-gray-900">Event Terbaru</h4>
                  <span className="text-xs text-gray-500">{financeAudit.filters.days} hari terakhir</span>
                </div>
                {financeAudit.recentEvents.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Belum ada event audit finance yang tercatat.</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {financeAudit.recentEvents.map((event) => (
                      <div key={event.id} className="px-4 py-3 flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getGovernanceSeverityTone(event.severity).className}`}>
                              {event.severity}
                            </span>
                            <span className="text-[11px] font-medium text-gray-500">{event.category}</span>
                          </div>
                          <div className="mt-2 text-sm font-semibold text-gray-900">{event.label}</div>
                          <div className="mt-1 text-xs text-gray-500">{event.summary}</div>
                          <div className="mt-1 text-xs text-gray-400">
                            {event.actor.label} • {formatDateTime(event.createdAt)}
                            {event.entityId ? ` • Ref #${event.entityId}` : ''}
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap">
                          {event.action}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Total Tagihan</p>
            <p className="mt-2 text-2xl font-bold text-violet-900">{summary ? summary.totalInvoices.toLocaleString('id-ID') : '-'}</p>
            <p className="mt-1 text-xs text-violet-800/70">Invoice aktif</p>
          </div>
          <div className="rounded-xl border border-orange-100 bg-gradient-to-br from-orange-50 to-amber-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-orange-700/80">Outstanding</p>
            <p className="mt-2 text-xl font-bold text-orange-900">{summary ? `Rp ${summary.totalOutstanding.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-orange-800/70">Belum terbayar</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Terbayar</p>
            <p className="mt-2 text-xl font-bold text-emerald-900">{summary ? `Rp ${summary.totalPaid.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Pembayaran tercatat</p>
          </div>
          <div className="rounded-xl border border-red-100 bg-gradient-to-br from-red-50 to-rose-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-red-700/80">Tagihan Overdue</p>
            <p className="mt-2 text-2xl font-bold text-red-900">{summary ? summary.overdueInvoices.toLocaleString('id-ID') : '-'}</p>
            <p className="mt-1 text-xs text-red-800/70">Perlu tindak lanjut</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Rekap Kelas</h3>
          </div>
          {financeSnapshotQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : classRecap.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada rekap kelas keuangan.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Siswa</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Overdue</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classRecap.map((row) => (
                    <tr key={`${row.classId}-${row.className}`}>
                      <td className="px-6 py-4 text-sm text-gray-900">{row.className}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.studentCount.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.invoiceCount.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">Rp {row.totalOutstanding.toLocaleString('id-ID')}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 text-right">{row.overdueCount.toLocaleString('id-ID')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Settlement Kas Harian</h3>
              <p className="mt-1 text-xs text-gray-500">Monitoring read-only sesi kas bendahara, termasuk expected closing dan selisih settlement.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Sesi terbuka</div>
                <div className="mt-1 font-semibold text-amber-900">{financeCashSessionSummary?.openCount || 0}</div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-rose-700">Total selisih</div>
                <div className="mt-1 font-semibold text-rose-900">Rp {Math.round(financeCashSessionSummary?.totalVarianceAmount || 0).toLocaleString('id-ID')}</div>
              </div>
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
                <div className="text-sky-700">Pending review</div>
                <div className="mt-1 font-semibold text-sky-900">{financeCashSessionSummary?.pendingHeadTuCount || 0}</div>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                <div className="text-violet-700">Pending Kepsek</div>
                <div className="mt-1 font-semibold text-violet-900">{financeCashSessionSummary?.pendingPrincipalCount || 0}</div>
              </div>
            </div>
          </div>
          {financeCashSessionsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : financeCashSessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada sesi kas harian yang tercatat.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sesi</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Closing</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aktual</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Selisih</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approval</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeCashSessions.map((session: FinanceCashSession) => (
                    <tr key={session.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{session.sessionNo}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(session.businessDate)} • {session.openedBy?.name || '-'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {session.status === 'OPEN' ? 'Masih dibuka' : `Ditutup ${formatDateTime(session.closedAt)}`}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        Rp {Math.round(session.expectedClosingBalance || 0).toLocaleString('id-ID')}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {session.actualClosingBalance == null
                          ? '-'
                          : `Rp ${Math.round(session.actualClosingBalance).toLocaleString('id-ID')}`}
                      </td>
                      <td className={`px-6 py-4 text-sm text-right font-semibold ${Number(session.varianceAmount || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {session.varianceAmount == null
                          ? '-'
                          : `Rp ${Math.round(session.varianceAmount).toLocaleString('id-ID')}`}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getCashSessionApprovalTone(session).className}`}>
                          {getCashSessionApprovalTone(session).label}
                        </span>
                        {session.headTuDecision.note ? (
                          <div className="mt-1 text-xs text-gray-500">{session.headTuDecision.note}</div>
                        ) : null}
                        {session.principalDecision.note ? (
                          <div className="mt-1 text-xs text-gray-500">{session.principalDecision.note}</div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Rekonsiliasi Bank</h3>
              <p className="mt-1 text-xs text-gray-500">
                Monitoring read-only transaksi bank non-tunai untuk melihat variance, statement gap, dan item yang belum matched.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
                <div className="text-indigo-700">Terbuka</div>
                <div className="mt-1 font-semibold text-indigo-900">{financeBankReconciliationSummary?.openCount || 0}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-emerald-700">Final</div>
                <div className="mt-1 font-semibold text-emerald-900">{financeBankReconciliationSummary?.finalizedCount || 0}</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Variance</div>
                <div className="mt-1 font-semibold text-amber-900">{formatCurrency(financeBankReconciliationSummary?.totalVarianceAmount || 0)}</div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-rose-700">Unmatched</div>
                <div className="mt-1 font-semibold text-rose-900">{financeBankReconciliationSummary?.totalUnmatchedStatementEntries || 0}</div>
              </div>
            </div>
          </div>
          {financeBankReconciliationsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : financeBankReconciliations.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada rekonsiliasi bank yang tercatat.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rekonsiliasi</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected Closing</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Statement Closing</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Variance</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeBankReconciliations.map((reconciliation: FinanceBankReconciliation) => (
                    <tr key={reconciliation.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{reconciliation.reconciliationNo}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {reconciliation.bankAccount.bankName} • {reconciliation.bankAccount.accountNumber}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(reconciliation.periodStart)} - {formatDate(reconciliation.periodEnd)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {formatCurrency(reconciliation.summary.expectedClosingBalance)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {formatCurrency(reconciliation.summary.statementComputedClosingBalance)}
                      </td>
                      <td className={`px-6 py-4 text-sm text-right font-semibold ${Number(reconciliation.summary.varianceAmount || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {formatCurrency(reconciliation.summary.varianceAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                            reconciliation.status === 'FINALIZED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {reconciliation.status === 'FINALIZED' ? 'Final' : 'Terbuka'}
                        </span>
                        <div className="mt-1 text-xs text-gray-500">
                          Unmatched statement {reconciliation.summary.unmatchedStatementEntryCount} • payment {reconciliation.summary.unmatchedPaymentCount} • refund {reconciliation.summary.unmatchedRefundCount}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Budget vs Realization</h3>
              <p className="mt-1 text-xs text-gray-500">
                Monitoring anggaran approved, progres LPJ, actual spent, dan variance agar Kepala TU bisa melihat bottleneck realisasi sebelum masuk closing period.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-700">Approved</div>
                <div className="mt-1 font-semibold text-slate-900">
                  {formatCurrency(financeBudgetRealization?.overview.approvedBudgetAmount || 0)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-emerald-700">Actual</div>
                <div className="mt-1 font-semibold text-emerald-900">
                  {formatCurrency(financeBudgetRealization?.overview.actualRealizedAmount || 0)}
                </div>
              </div>
              <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                <div className="text-violet-700">Variance</div>
                <div className="mt-1 font-semibold text-violet-900">
                  {formatCurrency(financeBudgetRealization?.overview.varianceAmount || 0)}
                </div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Review LPJ</div>
                <div className="mt-1 font-semibold text-amber-900">
                  {(financeBudgetRealization?.overview.stageSummary.financeReviewCount || 0) +
                    (financeBudgetRealization?.overview.stageSummary.returnedByFinanceCount || 0)}
                </div>
              </div>
            </div>
          </div>
          {financeBudgetRealizationQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : !financeBudgetRealization ? (
            <div className="py-10 text-center text-sm text-gray-500">Ringkasan budget vs realization belum tersedia.</div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[0.48fr_0.52fr] gap-4 p-4">
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">Rekap per Duty</div>
                  <div className="text-xs text-slate-500">{financeBudgetRealization.dutyRecap.length} duty</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">Duty</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Approved</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Actual</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {financeBudgetRealization.dutyRecap.slice(0, 6).map((row) => (
                        <tr key={row.additionalDuty}>
                          <td className="px-4 py-3 text-sm text-slate-700">
                            <div className="font-semibold text-slate-900">{row.additionalDutyLabel}</div>
                            <div className="mt-1 text-[11px] text-slate-500">
                              {row.totalRequests} request • {row.realizationRate.toFixed(1)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900">
                            {formatCurrency(row.approvedBudgetAmount)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">
                            {formatCurrency(row.actualRealizedAmount)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold text-violet-700">
                            {formatCurrency(row.varianceAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-900">Antrian Tindak Lanjut</div>
                  <div className="text-xs text-slate-500">{financeBudgetRealization.followUpQueue.length} item</div>
                </div>
                <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                  {financeBudgetRealization.followUpQueue.length === 0 ? (
                    <div className="text-sm text-slate-500">Tidak ada antrian tindak lanjut budget.</div>
                  ) : (
                    financeBudgetRealization.followUpQueue.map((row) => {
                      const stageTone = getBudgetProgressTone(row.stage);
                      return (
                        <div key={`head-tu-budget-${row.budgetId}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-slate-900">{row.title}</div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                {row.requesterName} • {row.additionalDutyLabel}
                              </div>
                            </div>
                            <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${stageTone.className}`}>
                              {stageTone.label}
                            </span>
                          </div>
                          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                              <div className="text-slate-500">Approved</div>
                              <div className="mt-1 font-semibold text-slate-900">{formatCurrency(row.approvedBudgetAmount)}</div>
                            </div>
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                              <div className="text-emerald-700">Actual</div>
                              <div className="mt-1 font-semibold text-emerald-900">{formatCurrency(row.actualRealizedAmount)}</div>
                            </div>
                            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                              <div className="text-violet-700">Variance</div>
                              <div className="mt-1 font-semibold text-violet-900">{formatCurrency(row.varianceAmount)}</div>
                            </div>
                          </div>
                          <div className="mt-2 text-[11px] text-slate-500">
                            {row.pendingSince ? `Sejak ${formatDate(row.pendingSince)}` : 'Belum ada tanggal stage'} • {row.daysInStage} hari
                            {row.latestLpjStatus ? ` • LPJ ${row.latestLpjStatus}` : ''}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Closing Period Finance</h3>
              <p className="mt-1 text-xs text-gray-500">
                Monitoring snapshot lock periode finance agar Kepala TU bisa melihat outstanding, pending verifikasi, dan kondisi kas/bank sebelum period ditutup.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-slate-700">Total Period</div>
                <div className="mt-1 font-semibold text-slate-900">{financeClosingPeriodSummary?.totalPeriods || 0}</div>
              </div>
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
                <div className="text-amber-700">Review</div>
                <div className="mt-1 font-semibold text-amber-900">{financeClosingPeriodSummary?.reviewCount || 0}</div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                <div className="text-emerald-700">Locked</div>
                <div className="mt-1 font-semibold text-emerald-900">{financeClosingPeriodSummary?.closedCount || 0}</div>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                <div className="text-rose-700">Pending Verifikasi</div>
                <div className="mt-1 font-semibold text-rose-900">
                  {formatCurrency(financeClosingPeriodSummary?.totalPendingVerificationAmount || 0)}
                </div>
              </div>
            </div>
          </div>
          {financeClosingPeriodsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : financeClosingPeriods.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Belum ada closing period finance yang tercatat.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periode</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending / Unmatched</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Kas / Bank</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {financeClosingPeriods.map((period: FinanceClosingPeriod) => (
                    <tr key={period.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{period.label}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                        </div>
                        {period.requestedBy?.name ? (
                          <div className="text-xs text-gray-500 mt-1">Diajukan {period.requestedBy.name}</div>
                        ) : null}
                        {period.headTuDecisionNote ? (
                          <div className="text-xs text-gray-500 mt-1">Review Kepala TU: {period.headTuDecisionNote}</div>
                        ) : null}
                        {period.principalDecisionNote ? (
                          <div className="text-xs text-gray-500 mt-1">Keputusan Kepsek: {period.principalDecisionNote}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {formatCurrency(period.summary.outstandingAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>{formatCurrency(period.summary.pendingVerificationAmount)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(period.summary.unmatchedBankAmount)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>{formatCurrency(period.summary.cashClosingBalance)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(period.summary.bankClosingBalance)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex flex-wrap gap-2">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getClosingPeriodStatusTone(period).className}`}>
                            {getClosingPeriodStatusTone(period).label}
                          </span>
                          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getClosingPeriodApprovalTone(period).className}`}>
                            {getClosingPeriodApprovalTone(period).label}
                          </span>
                        </div>
                        {period.closedAt ? (
                          <div className="mt-1 text-xs text-emerald-700">
                            Locked {formatDate(period.closedAt)}
                            {period.closedBy?.name ? ` oleh ${period.closedBy.name}` : ''}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Closing Period</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review closing period sebelum ditutup final atau diteruskan ke Kepala Sekolah jika policy eskalasi aktif.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuClosingPeriods.length} menunggu
            </span>
          </div>
          {financeClosingPeriodApprovalsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuClosingPeriods.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada closing period yang menunggu review.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periode</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Outstanding</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pending / Unmatched</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuClosingPeriods.map((period: FinanceClosingPeriod) => (
                    <tr key={period.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{period.label}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {period.periodNo} • {formatDate(period.periodStart)} - {formatDate(period.periodEnd)}
                        </div>
                        {period.closingNote ? (
                          <div className="text-xs text-gray-500 mt-1">{period.closingNote}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {formatCurrency(period.summary.outstandingAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>{formatCurrency(period.summary.pendingVerificationAmount)}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatCurrency(period.summary.unmatchedBankAmount)}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          Kas/rekon terbuka {period.summary.openCashSessionCount}/{period.summary.openReconciliationCount}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              headTuClosingPeriodDecisionMutation.mutate({ periodId: period.id, approved: false })
                            }
                            disabled={headTuClosingPeriodDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              headTuClosingPeriodDecisionMutation.mutate({ periodId: period.id, approved: true })
                            }
                            disabled={headTuClosingPeriodDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Proses
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Reopen Closing Period</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review unlock period yang sudah locked sebelum diteruskan ke Kepala Sekolah atau ditolak.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuClosingPeriodReopens.length} menunggu
            </span>
          </div>
          {financeClosingPeriodReopenApprovalsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuClosingPeriodReopens.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada request reopen yang menunggu review.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Periode</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alasan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuClosingPeriodReopens.map((request: FinanceClosingPeriodReopenRequest) => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.closingPeriod.label}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {request.requestNo} • {request.closingPeriod.periodNo}
                        </div>
                        {request.requestedBy?.name ? (
                          <div className="text-xs text-gray-500 mt-1">Diajukan {request.requestedBy.name}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div>{request.reason}</div>
                        {request.requestedNote ? (
                          <div className="text-xs text-gray-500 mt-1">{request.requestedNote}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getClosingPeriodReopenTone(request).className}`}>
                          {getClosingPeriodReopenTone(request).label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              headTuClosingPeriodReopenDecisionMutation.mutate({ requestId: request.id, approved: false })
                            }
                            disabled={headTuClosingPeriodReopenDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              headTuClosingPeriodReopenDecisionMutation.mutate({ requestId: request.id, approved: true })
                            }
                            disabled={headTuClosingPeriodReopenDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Proses
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {financeClosingPeriodReopenRequests.length > 0 ? (
            <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500">
              Riwayat reopen tercatat: {financeClosingPeriodReopenSummary?.totalRequests || 0} request,{' '}
              {financeClosingPeriodReopenSummary?.appliedCount || 0} sudah direopen.
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Settlement Kas</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review settlement kas dengan selisih sebelum disetujui final atau diteruskan ke Kepala Sekolah.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuCashSessions.length} menunggu
            </span>
          </div>
          {financeCashSessionApprovalsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuCashSessions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada settlement kas yang menunggu review.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sesi</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aktual</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Selisih</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuCashSessions.map((session: FinanceCashSession) => (
                    <tr key={session.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{session.sessionNo}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(session.businessDate)} • {session.openedBy?.name || '-'}
                        </div>
                        {session.closingNote ? (
                          <div className="text-xs text-gray-500 mt-1">{session.closingNote}</div>
                        ) : null}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {formatCurrency(session.expectedClosingBalance)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        {session.actualClosingBalance == null ? '-' : formatCurrency(session.actualClosingBalance)}
                      </td>
                      <td className={`px-6 py-4 text-sm text-right font-semibold ${Number(session.varianceAmount || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {session.varianceAmount == null ? '-' : formatCurrency(session.varianceAmount)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => headTuCashSessionDecisionMutation.mutate({ sessionId: session.id, approved: false })}
                            disabled={headTuCashSessionDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => headTuCashSessionDecisionMutation.mutate({ sessionId: session.id, approved: true })}
                            disabled={headTuCashSessionDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Proses
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Write-Off</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review pengajuan penghapusan piutang sebelum diteruskan ke Kepala Sekolah.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuWriteOffs.length} menunggu
            </span>
          </div>
          {financeWriteOffsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuWriteOffs.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada approval write-off yang menunggu.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pengajuan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuWriteOffs.map((request: FinanceWriteOffRequest) => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.requestNo}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.student?.name || '-'} • {request.student?.studentClass?.name || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.reason}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{request.invoice?.invoiceNo || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Outstanding {request.invoice ? `Rp ${Math.round(request.invoice.balanceAmount).toLocaleString('id-ID')}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>Request Rp {Math.round(request.requestedAmount).toLocaleString('id-ID')}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => headTuWriteOffDecisionMutation.mutate({ requestId: request.id, approved: false })}
                            disabled={headTuWriteOffDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => headTuWriteOffDecisionMutation.mutate({ requestId: request.id, approved: true })}
                            disabled={headTuWriteOffDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Teruskan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">Approval Reversal Pembayaran</h3>
              <p className="mt-1 text-xs text-gray-500">
                Review pengajuan pembatalan sebagian atau seluruh pembayaran sebelum diteruskan ke Kepala Sekolah.
              </p>
            </div>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
              {pendingHeadTuPaymentReversals.length} menunggu
            </span>
          </div>
          {financePaymentReversalsQuery.isLoading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : pendingHeadTuPaymentReversals.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-500">Tidak ada approval reversal pembayaran yang menunggu.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pengajuan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pembayaran</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Nominal</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingHeadTuPaymentReversals.map((request: FinancePaymentReversalRequest) => (
                    <tr key={request.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold text-gray-900">{request.requestNo}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.student?.name || '-'} • {request.student?.studentClass?.name || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">{request.reason}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-medium text-gray-900">{request.payment?.paymentNo || '-'}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          Invoice {request.invoice?.invoiceNo || '-'} • sisa reversible {request.payment ? `Rp ${Math.round(request.payment.remainingReversibleAmount).toLocaleString('id-ID')}` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-gray-700">
                        <div>Request Rp {Math.round(request.requestedAmount).toLocaleString('id-ID')}</div>
                        <div className="text-xs text-slate-500 mt-1">
                          Alokasi Rp {Math.round(request.requestedAllocatedAmount || 0).toLocaleString('id-ID')} • kredit Rp {Math.round(request.requestedCreditedAmount || 0).toLocaleString('id-ID')}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => headTuPaymentReversalDecisionMutation.mutate({ requestId: request.id, approved: false })}
                            disabled={headTuPaymentReversalDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Tolak
                          </button>
                          <button
                            type="button"
                            onClick={() => headTuPaymentReversalDecisionMutation.mutate({ requestId: request.id, approved: true })}
                            disabled={headTuPaymentReversalDecisionMutation.isPending}
                            className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            Teruskan
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (isAdministrationPage) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Operasional Tata Usaha</h2>
          <p className="mt-1 text-sm text-gray-500">Kontrol operasional staff administrasi dan layanan siswa/guru dalam satu dashboard.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Siswa Aktif</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{students.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-blue-800/70">Database siswa</p>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Guru Aktif</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{teachers.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Data guru</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Staff TU</p>
            <p className="mt-2 text-2xl font-bold text-violet-900">{(administrationStaffCount + financeStaffCount + 1).toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-violet-800/70">Administrasi, keuangan, Kepala TU</p>
          </div>
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-100/80 shadow-sm p-4">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Perizinan Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{pendingPermissions.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-amber-800/70">Butuh tindak lanjut</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Antrian Administrasi</h3>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Verifikasi siswa pending</p>
                <p className="text-gray-500 mt-1">{pendingStudentVerification} akun siswa menunggu verifikasi.</p>
              </div>
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Verifikasi guru pending</p>
                <p className="text-gray-500 mt-1">{pendingTeacherVerification} akun guru perlu review.</p>
              </div>
              <div className="rounded-lg border border-gray-100 px-3 py-2.5">
                <p className="font-medium text-gray-900">Komposisi staff</p>
                <p className="text-gray-500 mt-1">Administrasi: {administrationStaffCount} • Keuangan: {financeStaffCount}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Aksi Cepat</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Link to="/staff/head-tu/students" className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                <GraduationCap className="w-4 h-4 mr-2" /> Data Siswa
              </Link>
              <Link to="/staff/head-tu/teachers" className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                <Users className="w-4 h-4 mr-2" /> Data Guru & Staff
              </Link>
              <Link to="/staff/head-tu/permissions" className="inline-flex items-center justify-center rounded-lg border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50">
                <ShieldCheck className="w-4 h-4 mr-2" /> Perizinan Siswa
              </Link>
              <Link to="/staff/head-tu/letters" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <FileText className="w-4 h-4 mr-2" /> Surat-Menyurat
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Kepala Tata Usaha</h2>
        <p className="mt-1 text-sm text-gray-500">Kontrol layanan administrasi, keuangan, operasional TU, surat sekolah, dan kartu ujian.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4">
        <Link to="/staff/head-tu/administration" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-blue-700/80">Siswa Aktif</p>
            <p className="mt-2 text-2xl font-bold text-blue-900">{students.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-blue-800/70">Buka operasional TU</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/teachers" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
          <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-emerald-700/80">Guru & Staff</p>
            <p className="mt-2 text-2xl font-bold text-emerald-900">{combinedEducators.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-emerald-800/70">Pantau SDM sekolah</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/permissions" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500">
          <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-yellow-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-amber-700/80">Perizinan Pending</p>
            <p className="mt-2 text-2xl font-bold text-amber-900">{pendingPermissions.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-amber-800/70">Layanan administrasi</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/finance" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500">
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-violet-700/80">Outstanding</p>
            <p className="mt-2 text-xl font-bold text-violet-900">{financeSnapshot?.summary ? `Rp ${financeSnapshot.summary.totalOutstanding.toLocaleString('id-ID')}` : '-'}</p>
            <p className="mt-1 text-xs text-violet-800/70">Tagihan belum lunas</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/letters" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
          <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-slate-700/80">Surat-Menyurat</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{officeSummary?.monthlyLetters?.toLocaleString('id-ID') || 0}</p>
            <p className="mt-1 text-xs text-slate-800/70">{officeSummary?.totalLetters?.toLocaleString('id-ID') || 0} arsip surat aktif</p>
          </div>
        </Link>
        <Link to="/staff/head-tu/exam-cards" className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
          <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-pink-100/80 shadow-sm p-4 hover:shadow-md transition-shadow">
            <p className="text-xs uppercase tracking-wider text-rose-700/80">Kartu Ujian</p>
            <p className="mt-2 text-2xl font-bold text-rose-900">{examCardRows.length.toLocaleString('id-ID')}</p>
            <p className="mt-1 text-xs text-rose-800/70">Siswa dengan kartu ujian</p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900">Kontrol Operasional TU</h3>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Staff administrasi aktif</p>
              <p className="text-gray-500 mt-1">{administrationStaffCount} personel menangani administrasi siswa/guru.</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Staff keuangan aktif</p>
              <p className="text-gray-500 mt-1">{financeStaffCount} personel menangani billing dan pembayaran.</p>
            </div>
            <div className="rounded-lg border border-gray-100 px-3 py-2.5">
              <p className="font-medium text-gray-900">Tahun ajaran aktif</p>
              <p className="text-gray-500 mt-1">{activeYear?.name || '-'}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-amber-600" />
            <h3 className="text-sm font-semibold text-gray-900">Aksi Cepat Kepala TU</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/staff/head-tu/letters" className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <FileText className="w-4 h-4 mr-2" /> Surat-Menyurat
            </Link>
            <Link to="/staff/head-tu/exam-cards" className="inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50">
              <ClipboardList className="w-4 h-4 mr-2" /> Kartu Ujian
            </Link>
            <Link to="/staff/head-tu/finance" className="inline-flex items-center justify-center rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm font-semibold text-violet-700 hover:bg-violet-50">
              <CreditCard className="w-4 h-4 mr-2" /> Monitoring Keuangan
            </Link>
            <Link to="/staff/head-tu/administration" className="inline-flex items-center justify-center rounded-lg border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <Users className="w-4 h-4 mr-2" /> Operasional TU
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeadTuWorkspace;
