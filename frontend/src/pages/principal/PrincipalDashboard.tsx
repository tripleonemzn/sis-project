import React, { useState, useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createPortal } from 'react-dom';
import { academicYearService, type AcademicYear } from '../../services/academicYear.service';
import {
  budgetRequestService,
  type BudgetRequest,
  type UpdateBudgetRequestStatusPayload,
} from '../../services/budgetRequest.service';
import {
  staffFinanceService,
  type FinanceBankReconciliation,
  type FinanceBudgetProgressStage,
  type FinanceCashSession,
  type FinanceClosingPeriod,
  type FinanceGovernanceSummary,
  type FinancePaymentReversalRequest,
  type FinanceWriteOffRequest,
} from '../../services/staffFinance.service';
import { workProgramService, type WorkProgram } from '../../services/workProgram.service';
import {
  teachingResourceProgramService,
  type TeachingResourceEntry,
  type TeachingResourceEntryStatus,
} from '../../services/teachingResourceProgram.service';
import { officeService } from '../../services/office.service';
import { permissionService } from '../../services/permission.service';
import {
  Loader2,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  XCircle,
  Users,
  GraduationCap,
  School,
  Wallet,
  ArrowUpRight,
  ClipboardList,
  ThumbsUp,
  ThumbsDown,
  X,
  AlertTriangle,
  Gauge,
  Clock3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import InventoryHubPage from '../teacher/wakasek/sarpras/InventoryHubPage';
import { InventoryDetailPage } from '../teacher/wakasek/sarpras/InventoryDetailPage';
import { userService } from '../../services/user.service';
import { teacherAssignmentService, type TeacherAssignment } from '../../services/teacherAssignment.service';
import { AttendanceRecapPage } from '../admin/academic/AttendanceRecapPage';
import { ReportCardsPage } from '../admin/academic/ReportCardsPage';
import WorkProgramApprovalsPage from '../teacher/wakasek/curriculum/WorkProgramApprovalsPage';
import { OsisElectionMonitoringPage } from '../common/OsisElectionMonitoringPage';
import { getMenuItems, type MenuItem } from '../../components/layout/Sidebar';
import type { User } from '../../types/auth';

type StatTone = 'blue' | 'orange' | 'red' | 'teal';

type PrincipalBehaviorType = 'POSITIVE' | 'NEGATIVE';

interface PrincipalOverviewTotals {
  students: number;
  teachers: number;
  pendingBudgetRequests: number;
  totalPendingBudgetAmount: number;
  totalPresentToday: number;
  totalAbsentToday: number;
}

interface StudentByMajorStat {
  majorId: number;
  name: string;
  code: string;
  totalStudents: number;
  totalClasses: number;
}

interface TeacherAssignmentSummary {
  totalAssignments: number;
  totalTeachersWithAssignments: number;
}

interface PrincipalAcademicOverviewMajor {
  majorId: number;
  name: string;
  code: string;
  totalStudents: number;
  averageScore: number;
}

interface PrincipalAcademicOverviewStudent {
  studentId: number;
  name: string;
  nis: string | null;
  nisn: string | null;
  averageScore: number;
  class: {
    id: number;
    name: string;
    level: string;
  } | null;
  major: {
    id: number;
    name: string;
    code: string;
  } | null;
}

interface PrincipalAcademicOverview {
  academicYear: {
    id: number;
    name: string;
  };
  semester: string | null;
  topStudents: PrincipalAcademicOverviewStudent[];
  majors: PrincipalAcademicOverviewMajor[];
}

interface PrincipalBehaviorSummaryClass {
  classId: number;
  className: string;
  major: {
    id: number;
    name: string;
    code: string;
  } | null;
  positiveCount: number;
  negativeCount: number;
}

interface PrincipalBehaviorSummaryMajor {
  majorId: number;
  name: string;
  code: string;
  positiveCount: number;
  negativeCount: number;
}

interface PrincipalBehaviorSummaryItem {
  id: number;
  date: string;
  type: PrincipalBehaviorType;
  category?: string | null;
  description: string;
  point: number;
  student: {
    id: number;
    name: string;
    nis: string | null;
    nisn: string | null;
  };
  class: {
    id: number;
    name: string;
  } | null;
  major: {
    id: number;
    name: string;
    code: string;
  } | null;
}

interface PrincipalBehaviorSummary {
  academicYear: {
    id: number;
    name: string;
  };
  summaryByClass: PrincipalBehaviorSummaryClass[];
  summaryByMajor: PrincipalBehaviorSummaryMajor[];
  latestBehaviors: PrincipalBehaviorSummaryItem[];
}

interface PrincipalOverviewData {
  totals: PrincipalOverviewTotals;
  activeAcademicYear: { id: number; name: string } | null;
  studentByMajor: StudentByMajorStat[];
  teacherAssignmentSummary: TeacherAssignmentSummary | null;
  academicOverview: PrincipalAcademicOverview | null;
  behaviorSummary: PrincipalBehaviorSummary | null;
}

interface PrincipalProctorReportRow {
  room: string | null;
  startTime: string;
  endTime: string;
  sessionLabel: string | null;
  examType: string | null;
  classNames: string[];
  expectedParticipants: number;
  presentParticipants: number;
  absentParticipants: number;
  totalParticipants: number;
  absentStudents?: Array<{
    id: number;
    name: string;
    nis?: string | null;
    className?: string | null;
    absentReason?: string | null;
    permissionStatus?: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  }>;
  report: {
    id: number;
    signedAt: string;
    notes: string | null;
    incident: string | null;
    proctor: {
      id: number;
      name: string;
    } | null;
  } | null;
}

interface PrincipalProctorReportSummary {
  totalRooms: number;
  totalExpected: number;
  totalPresent: number;
  totalAbsent: number;
  reportedRooms: number;
}

interface PrincipalProctorReportsResponse {
  rows: PrincipalProctorReportRow[];
  summary: PrincipalProctorReportSummary;
}

type PrincipalOperationalRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

interface PrincipalOperationalRisk {
  id: string;
  level: PrincipalOperationalRiskLevel;
  title: string;
  detail: string;
  actionPath?: string;
  actionLabel?: string;
}

interface PrincipalOperationalMonitoringData {
  activeAcademicYear: {
    id: number;
    name: string;
  } | null;
  pendingBudgetCount: number;
  pendingBudgetAmount: number;
  overdueBudgetCount: number;
  pendingWorkProgramCount: number;
  overdueWorkProgramCount: number;
  unreportedRooms: number;
  absentParticipants: number;
  reportSummary: PrincipalProctorReportSummary;
  bpbkSummary: {
    totalCases: number;
    negativeCases: number;
    highRiskStudents: number;
    openCounselings: number;
    inProgressCounselings: number;
    closedCounselings: number;
    summonPendingCounselings: number;
    overdueCounselings: number;
  };
  bpbkHighRiskStudents: Array<{
    studentId: number;
    studentName: string;
    nis: string | null;
    nisn: string | null;
    className: string | null;
    negativeCaseCount: number;
    totalNegativePoint: number;
  }>;
  bpbkOverdueCounselings: Array<{
    id: number;
    sessionDate: string;
    status: 'OPEN' | 'IN_PROGRESS' | 'CLOSED';
    issueSummary: string;
    summonParent: boolean;
    summonDate: string | null;
    student: {
      id: number;
      name: string;
      nis: string | null;
      nisn: string | null;
      className: string | null;
    };
    counselor?: {
      id: number;
      name: string;
      username: string;
    } | null;
  }>;
  teachingResourceSummary: {
    total: number;
    submitted: number;
    approved: number;
    rejected: number;
    draft: number;
    latest: TeachingResourceEntry[];
  };
  officeSummary: {
    totalLetters: number;
    monthlyLetters: number;
    byType: Array<{ type: string; _count: { _all: number } }>;
    latest: Array<{
      id: number;
      type: string;
      letterNumber: string;
      recipientName: string;
      purpose?: string | null;
      printedAt?: string | null;
      createdAt: string;
    }>;
  };
  administrationSummary: {
    totalStudents: number;
    totalTeachers: number;
    administrationStaffCount: number;
    financeStaffCount: number;
    pendingPermissions: number;
    incompleteStudents: number;
    incompleteTeachers: number;
    studentCompletenessRate: number;
    teacherCompletenessRate: number;
  };
  administrationIncompleteStudents: Array<{
    id: number;
    name: string;
    nis: string | null;
    className: string | null;
    missing: string[];
  }>;
  administrationIncompleteTeachers: Array<{
    id: number;
    name: string;
    username: string;
    ptkType: string | null;
    missing: string[];
  }>;
  administrationPendingPermissions: Array<{
    id: number;
    studentName: string;
    className: string | null;
    type: string;
    status: string;
    startDate: string;
    endDate: string;
    reason: string | null;
  }>;
  risks: PrincipalOperationalRisk[];
  pendingBudgets: BudgetRequest[];
  pendingWorkPrograms: WorkProgram[];
}

type PrincipalQuickActionType = 'BUDGET' | 'WORK_PROGRAM' | 'EXAM_REPORT' | 'BP_BK' | 'TEACHING_RESOURCE';
type PrincipalQuickActionSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
type PrincipalQuickActionFilter = 'ALL' | PrincipalQuickActionType;

interface PrincipalQuickActionItem {
  key: string;
  type: PrincipalQuickActionType;
  severity: PrincipalQuickActionSeverity;
  title: string;
  detail: string;
  ageDays: number;
  actionPath: string;
  actionLabel: string;
  budgetId?: number;
  workProgramId?: number;
}

type PrincipalOutletContext = {
  user: Parameters<typeof getMenuItems>[0] | null;
  activeYear: { id: number; name: string } | null;
};

type StudentWithClass = {
  id: number;
  name: string;
  nis?: string | null;
  nisn?: string | null;
  phone?: string | null;
  address?: string | null;
  motherName?: string | null;
  verificationStatus?: string | null;
  studentClass?: {
    id?: number;
    name?: string | null;
    major?: {
      id: number;
      name: string;
      code: string;
    } | null;
  } | null;
};

interface PrincipalStatCardProps {
  title: string;
  value: string;
  icon: React.ElementType;
  tone: StatTone;
  subtitle?: string;
  to?: string;
  loading?: boolean;
}

const PrincipalStatCard = ({
  title,
  value,
  icon: Icon,
  tone,
  subtitle,
  to,
  loading,
}: PrincipalStatCardProps) => {
  const getColorClasses = (color: StatTone) => {
    switch (color) {
      case 'blue':
        return {
          bg: 'bg-gradient-to-br from-blue-50 to-sky-100/85 border-blue-100',
          soft: 'bg-blue-100',
          icon: 'text-blue-700',
          textMain: 'text-blue-900',
          textSub: 'text-blue-700/80',
        };
      case 'orange':
        return {
          bg: 'bg-gradient-to-br from-orange-50 to-amber-100/85 border-orange-100',
          soft: 'bg-orange-100',
          icon: 'text-orange-700',
          textMain: 'text-orange-900',
          textSub: 'text-orange-700/80',
        };
      case 'red':
        return {
          bg: 'bg-gradient-to-br from-rose-50 to-red-100/85 border-rose-100',
          soft: 'bg-rose-100',
          icon: 'text-rose-700',
          textMain: 'text-rose-900',
          textSub: 'text-rose-700/80',
        };
      case 'teal':
      default:
        return {
          bg: 'bg-gradient-to-br from-teal-50 to-emerald-100/85 border-teal-100',
          soft: 'bg-teal-100',
          icon: 'text-teal-700',
          textMain: 'text-teal-900',
          textSub: 'text-teal-700/80',
        };
    }
  };

  const { bg, soft, icon, textMain, textSub } = getColorClasses(tone);

  const content = (
    <div className="flex flex-col items-center justify-center">
      <div
        className={`relative w-32 h-32 rounded-full border ${bg} shadow-sm flex flex-col items-center justify-center transition-transform hover:scale-[1.03]`}
      >
        <div
          className={`absolute -top-1.5 -right-1.5 p-2 rounded-full ${soft} flex items-center justify-center`}
        >
          <Icon className={`w-4 h-4 ${icon}`} />
        </div>
        <div className="flex flex-col items-center justify-center px-3 text-center">
          <p className={`text-[11px] font-medium ${textSub} mb-1 line-clamp-1`}>{title}</p>
          <p className={`text-2xl font-bold ${textMain}`}>
            {loading ? (
              <span className="inline-flex items-center gap-1 text-xs">
                <Loader2 className="w-3 h-3 animate-spin" />
                Memuat
              </span>
            ) : (
              value
            )}
          </p>
        </div>
      </div>
      {subtitle && (
        <p className="mt-2 text-xs text-gray-500 text-center max-w-[11rem]">{subtitle}</p>
      )}
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded-2xl">
        {content}
      </Link>
    );
  }

  return content;
};

function normalizeDuty(value?: string | null) {
  return String(value || '').trim().toUpperCase();
}

function formatFinanceDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('id-ID');
}

function formatFinanceCurrency(value: number) {
  return `Rp ${Math.round(value || 0).toLocaleString('id-ID')}`;
}

function getPrincipalGovernanceRiskTone(level: FinanceGovernanceSummary['overview']['riskLevel']) {
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

function getPrincipalGovernanceSeverityTone(level: FinanceGovernanceSummary['followUpQueue'][number]['severity']) {
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

function getPrincipalClosingPeriodStatusTone(period: FinanceClosingPeriod) {
  if (period.status === 'CLOSED') {
    return { label: 'Terkunci', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (period.status === 'CLOSING_REVIEW') {
    return { label: 'Review Closing', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  return { label: 'Terbuka', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getPrincipalClosingPeriodApprovalTone(period: FinanceClosingPeriod) {
  if (period.approvalStatus === 'PENDING_HEAD_TU') {
    return { label: 'Menunggu Head TU', className: 'bg-amber-50 text-amber-700 border border-amber-200' };
  }
  if (period.approvalStatus === 'PENDING_PRINCIPAL') {
    return { label: 'Menunggu Kepsek', className: 'bg-sky-50 text-sky-700 border border-sky-200' };
  }
  if (period.approvalStatus === 'APPROVED') {
    return { label: 'Disetujui', className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' };
  }
  if (period.approvalStatus === 'REJECTED') {
    return { label: 'Ditolak', className: 'bg-rose-50 text-rose-700 border border-rose-200' };
  }
  return { label: 'Belum Diajukan', className: 'bg-slate-50 text-slate-700 border border-slate-200' };
}

function getPrincipalBudgetProgressTone(stage: FinanceBudgetProgressStage) {
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

function isFilled(value: string | number | null | undefined) {
  return String(value ?? '').trim().length > 0;
}

function buildStudentAdministrationSummary(student: StudentWithClass) {
  const missing = [
    !isFilled(student.nis) ? 'NIS' : null,
    !isFilled(student.nisn) ? 'NISN' : null,
    !isFilled(student.studentClass?.name) ? 'Kelas' : null,
    !isFilled(student.address) ? 'Alamat' : null,
    !isFilled(student.phone) ? 'Telepon' : null,
    !isFilled(student.motherName) ? 'Nama ibu' : null,
  ].filter(Boolean) as string[];
  return {
    missing,
    isComplete: missing.length === 0,
  };
}

function buildTeacherAdministrationSummary(
  teacher: Partial<User> & {
    nip?: string | null;
    nuptk?: string | null;
    ptkType?: string | null;
    employeeStatus?: string | null;
    institution?: string | null;
    phone?: string | null;
  },
) {
  const missing = [
    !isFilled(teacher.nip) ? 'NIP' : null,
    !isFilled(teacher.nuptk) ? 'NUPTK' : null,
    !isFilled(teacher.ptkType) ? 'Jenis PTK' : null,
    !isFilled(teacher.employeeStatus) ? 'Status pegawai' : null,
    !isFilled(teacher.institution) ? 'Instansi' : null,
    !isFilled(teacher.phone) ? 'Telepon' : null,
  ].filter(Boolean) as string[];
  return {
    missing,
    isComplete: missing.length === 0,
  };
}

const PrincipalHomePage = () => {
  const { user: contextUser } = useOutletContext<PrincipalOutletContext>() || {};
  const [academicSemesterFilter, setAcademicSemesterFilter] = useState<'ALL' | 'ODD' | 'EVEN'>(
    'ALL',
  );
  const [behaviorMajorFilter, setBehaviorMajorFilter] = useState<number | 'ALL'>('ALL');
  const [behaviorTypeFilter, setBehaviorTypeFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>(
    'ALL',
  );

  const { data, isLoading, isError } = useQuery<PrincipalOverviewData>({
    queryKey: ['principal-dashboard', 'overview', academicSemesterFilter],
    queryFn: async () => {
      let activeYear: { id: number; name: string } | null = null;
      try {
        const res = await academicYearService.getActiveSafe();
        activeYear = res?.data ?? null;
      } catch {
        activeYear = null;
      }

      const semesterParam =
        academicSemesterFilter === 'ALL' ? undefined : academicSemesterFilter;

      const [
        studentsRes,
        teachersRes,
        budgetsRes,
        teacherAssignmentsRes,
        academicOverviewRes,
        behaviorSummaryRes,
      ] = await Promise.all([
        userService.getUsers({ role: 'STUDENT', limit: 10000 }),
        userService.getUsers({ role: 'TEACHER', limit: 10000 }),
        budgetRequestService.list({
          academicYearId: activeYear?.id,
          view: 'approver',
        }),
        teacherAssignmentService.list({
          academicYearId: activeYear?.id,
          limit: 1000,
        }),
        api
          .get('/reports/principal-overview', {
            params: {
              academicYearId: activeYear?.id,
              semester: semesterParam,
            },
          })
          .then((res) => res.data?.data)
          .catch(() => null),
        api
          .get('/behaviors/principal-summary', {
            params: {
              academicYearId: activeYear?.id,
            },
          })
          .then((res) => res.data?.data)
          .catch(() => null),
      ]);

      const studentsList = studentsRes.data || [];
      const teachersList = teachersRes.data || [];

      const rawBudgets =
        (budgetsRes as { data?: BudgetRequest[] } | null)?.data ||
        (budgetsRes as BudgetRequest[] | null) ||
        [];
      const budgets: BudgetRequest[] = rawBudgets || [];

      const pendingBudgets = budgets.filter((b) => b.status === 'PENDING');
      const totalPendingBudgetAmount = pendingBudgets.reduce(
        (sum, b) => sum + b.totalAmount,
        0,
      );

      const totalPresentToday = 0;
      const totalAbsentToday = 0;

      const assignmentsPayload = teacherAssignmentsRes as
        | {
            data?: {
              assignments?: TeacherAssignment[];
              data?: {
                assignments?: TeacherAssignment[];
              };
            };
            assignments?: TeacherAssignment[];
          }
        | null;
      const assignmentsList: TeacherAssignment[] =
        assignmentsPayload?.data?.assignments ||
        assignmentsPayload?.assignments ||
        assignmentsPayload?.data?.data?.assignments ||
        [];

      const studentByMajorMap = new Map<
        number,
        {
          majorId: number;
          name: string;
          code: string;
          totalStudents: number;
          classIds: Set<number>;
        }
      >();

      for (const student of studentsList) {
        const studentClass = (student as StudentWithClass).studentClass;
        const major = studentClass?.major;
        const classId = studentClass?.id;
        if (!major || !classId) continue;

        const key = major.id;
        if (!studentByMajorMap.has(key)) {
          studentByMajorMap.set(key, {
            majorId: major.id,
            name: major.name,
            code: major.code,
            totalStudents: 0,
            classIds: new Set<number>(),
          });
        }

        const entry = studentByMajorMap.get(key)!;
        entry.totalStudents += 1;
        entry.classIds.add(classId);
      }

      const studentByMajor: StudentByMajorStat[] = Array.from(studentByMajorMap.values())
        .map((entry) => ({
          majorId: entry.majorId,
          name: entry.name,
          code: entry.code,
          totalStudents: entry.totalStudents,
          totalClasses: entry.classIds.size,
        }))
        .sort((a, b) => b.totalStudents - a.totalStudents);
      
      const totalAssignments = assignmentsList.length;
      const uniqueTeacherIds = new Set<number>();
      assignmentsList.forEach((a) => {
        if (a.teacherId) {
          uniqueTeacherIds.add(a.teacherId);
        }
      });

      const teacherAssignmentSummary: TeacherAssignmentSummary | null = {
        totalAssignments,
        totalTeachersWithAssignments: uniqueTeacherIds.size,
      };

      return {
        totals: {
          students: studentsList.length,
          teachers: teachersList.length,
          pendingBudgetRequests: pendingBudgets.length,
          totalPendingBudgetAmount,
          totalPresentToday,
          totalAbsentToday,
        },
        activeAcademicYear: activeYear,
        studentByMajor,
        teacherAssignmentSummary,
        academicOverview: (academicOverviewRes || null) as PrincipalAcademicOverview | null,
        behaviorSummary: (behaviorSummaryRes || null) as PrincipalBehaviorSummary | null,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const totals = data?.totals;
  const activeYear = data?.activeAcademicYear;
  const studentByMajor = data?.studentByMajor || [];
  const teacherAssignmentSummary = data?.teacherAssignmentSummary || null;
  const academicOverview = data?.academicOverview || null;
  const behaviorSummary = data?.behaviorSummary || null;

  const totalMajors = studentByMajor.length;
  const totalClasses = studentByMajor.reduce((sum, item) => sum + (item.totalClasses || 0), 0);

  const attendanceSummary = useMemo(() => {
    if (!totals) {
      return null;
    }
    const present = totals.totalPresentToday || 0;
    const absent = totals.totalAbsentToday || 0;
    const total = present + absent;
    if (!total) {
      return {
        percentage: null as number | null,
        present,
        absent,
      };
    }
    const percentage = Math.round((present / total) * 100);
    return {
      percentage,
      present,
      absent,
    };
  }, [totals]);

  const academicAverageByMajor = useMemo(() => {
    const map = new Map<
      number,
      {
        averageScore: number;
        totalStudents: number;
      }
    >();
    if (!academicOverview) return map;
    academicOverview.majors.forEach((m) => {
      map.set(m.majorId, {
        averageScore: m.averageScore,
        totalStudents: m.totalStudents,
      });
    });
    return map;
  }, [academicOverview]);

  const overallAcademicAverage = useMemo(() => {
    if (!academicOverview || !academicOverview.majors.length) return null;
    let totalWeighted = 0;
    let totalStudentsCount = 0;
    academicOverview.majors.forEach((m) => {
      totalWeighted += m.averageScore * m.totalStudents;
      totalStudentsCount += m.totalStudents;
    });
    if (!totalStudentsCount) return null;
    return totalWeighted / totalStudentsCount;
  }, [academicOverview]);

  const filteredBehaviorSummaryByMajor = useMemo(() => {
    if (!behaviorSummary) return [];
    if (behaviorMajorFilter === 'ALL') return behaviorSummary.summaryByMajor;
    return behaviorSummary.summaryByMajor.filter(
      (item) => item.majorId === behaviorMajorFilter,
    );
  }, [behaviorSummary, behaviorMajorFilter]);

  const handleBehaviorDrilldown = (majorId: number) => {
    setBehaviorMajorFilter(majorId);
    setBehaviorTypeFilter('NEGATIVE');
    if (typeof window !== 'undefined') {
      const el = document.getElementById('principal-behavior-latest');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  const handleCopyBehaviorSummary = async () => {
    if (!behaviorSummary || filteredBehaviorSummaryByMajor.length === 0) {
      toast.error('Belum ada ringkasan perilaku untuk disalin');
      return;
    }

    const lines: string[] = [];
    lines.push(`Ringkasan perilaku wali kelas - ${yearLabel}`);

    const majorLabel =
      behaviorMajorFilter === 'ALL'
        ? 'Semua jurusan'
        : `Jurusan ${filteredBehaviorSummaryByMajor[0]?.code || ''} ${
            filteredBehaviorSummaryByMajor[0]?.name || ''
          }`;

    const typeLabel =
      behaviorTypeFilter === 'ALL'
        ? 'Semua catatan'
        : behaviorTypeFilter === 'POSITIVE'
        ? 'Catatan positif'
        : 'Catatan negatif';

    lines.push(`Filter: ${majorLabel}`);
    lines.push(`Jenis: ${typeLabel}`);
    lines.push('');

    filteredBehaviorSummaryByMajor.forEach((item) => {
      const total = item.positiveCount + item.negativeCount;
      lines.push(
        `- ${item.code || '-'} ${item.name}: +${item.positiveCount} / -${
          item.negativeCount
        } (total ${total})`,
      );
    });

    const text = lines.join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success('Ringkasan perilaku berhasil disalin');
      } else {
        throw new Error('Clipboard not available');
      }
    } catch {
      toast.error('Gagal menyalin ringkasan ke clipboard');
    }
  };

  const handleCopyAcademicSummary = async () => {
    if (!academicOverview || academicOverview.majors.length === 0) {
      toast.error('Belum ada ringkasan akademik untuk disalin');
      return;
    }

    const lines: string[] = [];
    lines.push(`Ringkasan akademik - ${yearLabel}`);

    const semesterLabel =
      academicSemesterFilter === 'ALL'
        ? 'Semua semester'
        : academicSemesterFilter === 'ODD'
        ? 'Semester Ganjil'
        : 'Semester Genap';

    lines.push(`Semester: ${semesterLabel}`);
    lines.push('');

    const sortedMajors = [...academicOverview.majors].sort(
      (a, b) => b.averageScore - a.averageScore,
    );

    const topMajors = sortedMajors.slice(0, 3);
    if (topMajors.length > 0) {
      lines.push('Top 3 jurusan berdasarkan rata-rata nilai:');
      topMajors.forEach((m, index) => {
        lines.push(
          `${index + 1}. ${m.code || '-'} ${m.name} - rata-rata ${m.averageScore.toFixed(1)} (${
            m.totalStudents
          } siswa)`,
        );
      });
      lines.push('');
    }

    const lowestMajor = sortedMajors[sortedMajors.length - 1];
    if (lowestMajor && sortedMajors.length > 1) {
      lines.push(
        `Jurusan dengan rata-rata terendah: ${lowestMajor.code || '-'} ${lowestMajor.name} - rata-rata ${lowestMajor.averageScore.toFixed(
          1,
        )} (${lowestMajor.totalStudents} siswa)`,
      );
      lines.push('');
    }

    if (academicOverview.topStudents && academicOverview.topStudents.length > 0) {
      const topStudents = academicOverview.topStudents.slice(0, 3);
      lines.push('Top 3 siswa sekolah:');
      topStudents.forEach((s, index) => {
        lines.push(
          `${index + 1}. ${s.name} - rata-rata ${s.averageScore.toFixed(1)} (${
            s.class?.name || '-'
          } • ${s.major?.code || '-'})`,
        );
      });
    }

    const text = lines.join('\n');

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast.success('Ringkasan akademik berhasil disalin');
      } else {
        throw new Error('Clipboard not available');
      }
    } catch {
      toast.error('Gagal menyalin ringkasan ke clipboard');
    }
  };

  const filteredLatestBehaviors = useMemo(() => {
    if (!behaviorSummary) return [];
    return behaviorSummary.latestBehaviors.filter((item) => {
      if (behaviorMajorFilter !== 'ALL') {
        if (!item.major || item.major.id !== behaviorMajorFilter) {
          return false;
        }
      }
      if (behaviorTypeFilter === 'ALL') return true;
      return item.type === behaviorTypeFilter;
    });
  }, [behaviorSummary, behaviorMajorFilter, behaviorTypeFilter]);

  const yearLabel = activeYear?.name || 'Belum ada tahun ajaran aktif';

  const principalMenuItems: MenuItem[] = useMemo(() => {
    if (!contextUser) return [];
    try {
      return getMenuItems(contextUser).filter((item) =>
        item.path.startsWith('/principal'),
      );
    } catch {
      return [];
    }
  }, [contextUser]);

  const getShortcutInfo = (item: { group: string; path: string; label: string }) => {
    if (item.group === 'MONITORING') {
      return {
        subtitle: 'Pantau indikator risiko dan SLA persetujuan lintas role.',
        tag: 'Monitoring operasional',
      };
    }
    if (item.group === 'AKADEMIK') {
      if (item.path === '/principal/academic/reports') {
        return {
          subtitle: 'Lihat rekap rapor dan peringkat sekolah.',
          tag: 'Monitoring akademik',
        };
      }
      if (item.path === '/principal/academic/attendance') {
        return {
          subtitle: 'Pantau rekap kehadiran siswa per kelas.',
          tag: 'Monitoring kehadiran',
        };
      }
    }
    if (item.group === 'KEUANGAN') {
      return {
        subtitle: 'Tinjau dan setujui pengajuan anggaran.',
        tag: 'Monitoring keuangan',
      };
    }
    if (item.group === 'KESISWAAN') {
      return {
        subtitle: 'Lihat dan telusuri data siswa aktif.',
        tag: 'Data kesiswaan',
      };
    }
    if (item.group === 'SDM GURU') {
      return {
        subtitle: 'Lihat dan telusuri data guru dan staff.',
        tag: 'Data SDM guru',
      };
    }
    if (!item.group && item.path === '/principal') {
      return {
        subtitle: 'Kembali ke ringkasan utama Kepala Sekolah.',
        tag: 'Dashboard utama',
      };
    }
    return {
      subtitle: 'Buka modul ini langsung dari dashboard.',
      tag: 'Akses cepat',
    };
  };

  const shortcutItems = useMemo(
    () =>
      principalMenuItems.flatMap((item) => {
        if (item.children && item.children.length > 0) {
          return item.children.map((child) => ({
            key: child.path,
            group: item.label,
            label: child.label,
            path: child.path,
            icon: child.icon || item.icon,
          }));
        }

        return [
          {
            key: item.path,
            group: '',
            label: item.label,
            path: item.path,
            icon: item.icon,
          },
        ];
      }),
    [principalMenuItems],
  );

  const shortcutAccentPresets = [
    {
      hoverBorder: 'hover:border-blue-200',
      hoverShadow: 'hover:shadow-[0_10px_25px_-8px_rgba(37,99,235,0.35)]',
      tagText: 'text-blue-600',
      iconBg: 'bg-blue-50 group-hover:bg-blue-600',
      iconText: 'text-blue-600 group-hover:text-white',
      ctaText: 'text-blue-600 group-hover:text-white',
      ctaBg: 'bg-blue-50 group-hover:bg-blue-600',
    },
    {
      hoverBorder: 'hover:border-orange-200',
      hoverShadow: 'hover:shadow-[0_10px_25px_-8px_rgba(249,115,22,0.35)]',
      tagText: 'text-orange-500',
      iconBg: 'bg-orange-50 group-hover:bg-orange-500',
      iconText: 'text-orange-500 group-hover:text-white',
      ctaText: 'text-orange-600 group-hover:text-white',
      ctaBg: 'bg-orange-50 group-hover:bg-orange-500',
    },
    {
      hoverBorder: 'hover:border-teal-200',
      hoverShadow: 'hover:shadow-[0_10px_25px_-8px_rgba(13,148,136,0.35)]',
      tagText: 'text-teal-600',
      iconBg: 'bg-teal-50 group-hover:bg-teal-600',
      iconText: 'text-teal-600 group-hover:text-white',
      ctaText: 'text-teal-600 group-hover:text-white',
      ctaBg: 'bg-teal-50 group-hover:bg-teal-600',
    },
    {
      hoverBorder: 'hover:border-red-200',
      hoverShadow: 'hover:shadow-[0_10px_25px_-8px_rgba(239,68,68,0.35)]',
      tagText: 'text-red-600',
      iconBg: 'bg-rose-50 group-hover:bg-red-600',
      iconText: 'text-red-600 group-hover:text-white',
      ctaText: 'text-red-600 group-hover:text-white',
      ctaBg: 'bg-rose-50 group-hover:bg-red-600',
    },
    {
      hoverBorder: 'hover:border-slate-200',
      hoverShadow: 'hover:shadow-[0_10px_25px_-8px_rgba(148,163,184,0.35)]',
      tagText: 'text-slate-600',
      iconBg: 'bg-slate-50 group-hover:bg-slate-600',
      iconText: 'text-slate-600 group-hover:text-white',
      ctaText: 'text-slate-600 group-hover:text-white',
      ctaBg: 'bg-slate-50 group-hover:bg-slate-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard Kepala Sekolah</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ringkasan akademik, keuangan, dan SDM berdasarkan tahun ajaran aktif.
        </p>
      </div>

      {isError && !isLoading && (
        <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3">
          Gagal memuat ringkasan dashboard. Silakan muat ulang halaman.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 items-stretch">
        <div className="flex flex-col items-center justify-center">
          <Link
            to="/principal/academic/reports"
            className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
          <div className="relative w-32 h-32 rounded-full border border-cyan-100 bg-gradient-to-br from-cyan-50 to-teal-100/85 shadow-sm flex flex-col items-center justify-center">
            <div className="absolute -top-1.5 -right-1.5 p-2 rounded-full bg-cyan-100 flex items-center justify-center">
              <School className="w-4 h-4 text-cyan-700" />
            </div>
            <div className="flex flex-col items-center justify-center px-3 text-center">
              <p className="text-[11px] font-medium text-cyan-700/80 mb-1 line-clamp-1">
                Tahun Ajaran Aktif
              </p>
              <p className="text-sm font-semibold text-cyan-900">
                {yearLabel}
              </p>
            </div>
          </div>
          </Link>
          <p className="mt-2 text-xs text-gray-500 text-center max-w-[11rem]">
            Periode berjalan untuk seluruh statistik di dashboard.
          </p>
        </div>

        <PrincipalStatCard
          title="Siswa Aktif"
          value={
            isLoading || !totals
              ? '0'
              : totals.students.toLocaleString('id-ID')
          }
          icon={GraduationCap}
          tone="orange"
          subtitle="Berstatus siswa di sistem"
          to="/principal/students"
          loading={isLoading}
        />

        <PrincipalStatCard
          title="Guru & Staff"
          value={
            isLoading || !totals
              ? '0'
              : totals.teachers.toLocaleString('id-ID')
          }
          icon={Users}
          tone="red"
          subtitle="Guru dan staff aktif"
          to="/principal/teachers"
          loading={isLoading}
        />

        <PrincipalStatCard
          title="Pengajuan Anggaran Pending"
          value={
            isLoading || !totals
              ? '0'
              : totals.pendingBudgetRequests.toLocaleString('id-ID')
          }
          icon={Wallet}
          tone="blue"
          subtitle={
            totals
              ? `Total Rp ${totals.totalPendingBudgetAmount.toLocaleString('id-ID')}`
              : 'Total nilai pengajuan'
          }
          to="/principal/finance/requests"
          loading={isLoading}
        />

        <PrincipalStatCard
          title="Kompetensi Keahlian"
          value={
            isLoading
              ? '0'
              : totalMajors.toLocaleString('id-ID')
          }
          icon={School}
          tone="teal"
          subtitle="Jumlah jurusan aktif"
          to="/principal/students"
          loading={isLoading}
        />

        <PrincipalStatCard
          title="Kelas Aktif"
          value={
            isLoading
              ? '0'
              : totalClasses.toLocaleString('id-ID')
          }
          icon={ClipboardList}
          tone="orange"
          subtitle="Jumlah rombel aktif"
          to="/principal/students"
          loading={isLoading}
        />

        <PrincipalStatCard
          title="Kehadiran Hari Ini"
          value={
            isLoading || !attendanceSummary || attendanceSummary.percentage === null
              ? '0%'
              : `${attendanceSummary.percentage}%`
          }
          icon={CheckCircle2}
          tone="blue"
          subtitle={
            attendanceSummary
              ? `Hadir ${attendanceSummary.present.toLocaleString(
                  'id-ID',
                )} • Tidak hadir ${attendanceSummary.absent.toLocaleString('id-ID')}`
              : 'Ringkasan kehadiran siswa hari ini'
          }
          to="/principal/academic/attendance"
          loading={isLoading}
        />
      </div>

      {totals && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Statistik Siswa per Kompetensi Keahlian</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Distribusi jumlah siswa dan kelas berdasarkan kompetensi keahlian.
                </p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-400 uppercase tracking-[0.16em]">
                <span>KOMPETENSI KEAHLIAN</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>SISWA</span>
                <span className="w-1 h-1 rounded-full bg-gray-300" />
                <span>KELAS</span>
              </div>
            </div>
            {studentByMajor.length === 0 && (
              <div className="py-10 text-center text-sm text-gray-400">
                Belum ada data siswa per kompetensi keahlian pada tahun ajaran aktif.
              </div>
            )}
            {studentByMajor.length > 0 && (
              <div className="space-y-3">
                {studentByMajor.map((item) => {
                  const total = item.totalStudents || 0;
                  const max = studentByMajor[0]?.totalStudents || 1;
                  const percentage = Math.max(8, Math.round((total / max) * 100));
                  return (
                    <div
                      key={item.majorId ?? item.code}
                      className="rounded-xl border border-gray-100 px-4 py-3 flex items-center justify-between gap-4 hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold">
                          {item.code || '-'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {item.name}
                          </p>
                          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-blue-500 to-sky-400"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex items-end gap-6 text-right">
                        <div>
                          <p className="text-[11px] text-gray-500">SISWA</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {item.totalStudents.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-gray-500">KELAS</p>
                          <p className="text-sm font-semibold text-gray-900">
                            {item.totalClasses.toLocaleString('id-ID')}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h3 className="font-bold text-gray-800 mb-2">Ringkasan Assignment Guru</h3>
              <p className="text-xs text-gray-500 mb-5">
                Gambaran singkat distribusi assignment mengajar pada tahun ajaran aktif.
              </p>
              {teacherAssignmentSummary ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <ClipboardList size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">TOTAL ASSIGNMENT</p>
                        <p className="text-base font-semibold text-gray-900">
                          {teacherAssignmentSummary.totalAssignments.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                        <School size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">GURU DENGAN ASSIGNMENT</p>
                        <p className="text-base font-semibold text-gray-900">
                          {teacherAssignmentSummary.totalTeachersWithAssignments.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                        <Users size={18} />
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">TOTAL GURU & STAFF</p>
                        <p className="text-base font-semibold text-gray-900">
                          {totals.teachers.toLocaleString('id-ID')}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-100">
                    {totals.teachers > 0 ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span className="text-xs font-medium text-gray-600">
                            Coverage assignment guru
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-600">
                          {Math.round(
                            Math.min(
                              100,
                              ((teacherAssignmentSummary.totalTeachersWithAssignments || 0) /
                                totals.teachers) *
                                100,
                            ),
                          )}
                          %
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        Belum ada data guru untuk dihitung coverage assignment.
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-sm text-gray-400">
                  Ringkasan assignment guru belum tersedia.
                </div>
              )}
            </div>
        </div>
        </div>
      )}

      {academicOverview && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">
                  Rata-rata Nilai per Kompetensi Keahlian
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  Urutan jurusan berdasarkan rata-rata nilai rapor siswa.
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Menampilkan:{' '}
                  {academicSemesterFilter === 'ALL'
                    ? 'Semua semester'
                    : academicSemesterFilter === 'ODD'
                    ? 'Semester Ganjil'
                    : 'Semester Genap'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">Semester</span>
                  <select
                    value={academicSemesterFilter}
                    onChange={(e) =>
                      setAcademicSemesterFilter(e.target.value as 'ALL' | 'ODD' | 'EVEN')
                    }
                    className="border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                  >
                    <option value="ALL">Semua</option>
                    <option value="ODD">Ganjil</option>
                    <option value="EVEN">Genap</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAcademicSummary}
                    className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <ClipboardList size={12} />
                    <span>Salin ringkasan</span>
                  </button>
                  <Link
                    to="/principal/academic/reports"
                    className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700"
                  >
                    <span>Lihat detail peringkat</span>
                    <ArrowUpRight size={12} />
                  </Link>
                </div>
              </div>
            </div>
            {academicOverview.majors.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Belum ada data nilai untuk ditampilkan.
              </div>
            ) : (
              <div className="space-y-3">
                {academicOverview.majors.map((item, index) => {
                  const max = academicOverview.majors[0]?.averageScore || 0;
                  const base = max > 0 ? (item.averageScore / max) * 100 : 0;
                  const percentage = Math.max(8, Math.round(base));
                  return (
                    <div
                      key={item.majorId}
                      className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
                        index === 0
                          ? 'border-amber-300 bg-amber-50/40'
                          : 'border-gray-100 hover:border-blue-200 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold ${
                            index === 0 ? 'bg-amber-500 text-white' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {item.code || '-'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">
                            {item.name}
                          </p>
                          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={`h-full ${
                                index === 0
                                  ? 'bg-gradient-to-r from-amber-500 to-orange-400'
                                  : 'bg-gradient-to-r from-blue-500 to-sky-400'
                              }`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[11px] text-gray-500">Rata-rata</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {item.averageScore.toFixed(1)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {item.totalStudents.toLocaleString('id-ID')} siswa
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h3 className="font-bold text-gray-800 mb-2">Top 3 Siswa Sekolah</h3>
            <p className="text-xs text-gray-500 mb-4">
              Peringkat 1–3 berdasarkan rata-rata nilai rapor seluruh jurusan.
            </p>
            {academicOverview.topStudents.length === 0 ? (
              <div className="py-6 text-sm text-gray-400">
                Belum ada data peringkat siswa untuk ditampilkan.
              </div>
            ) : (
              <div className="space-y-3">
                {academicOverview.topStudents.map((student, index) => (
                  <div
                    key={student.studentId}
                    className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          index === 0
                            ? 'bg-yellow-100 text-yellow-700'
                            : index === 1
                            ? 'bg-slate-100 text-slate-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 truncate max-w-[160px]">
                          {student.name}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {student.class?.name || '-'}{' '}
                          {student.major ? `• ${student.major.code}` : ''}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          NISN: {student.nisn || '-'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-gray-500">Rata-rata</p>
                      <p className="text-base font-semibold text-gray-900">
                        {student.averageScore.toFixed(1)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {behaviorSummary && (
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-gray-800">Ringkasan Perilaku per Kompetensi</h3>
                <p className="text-xs text-gray-500 mt-1">
                  Total catatan positif dan negatif dari wali kelas per jurusan.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">Jurusan</span>
                  <select
                    value={behaviorMajorFilter === 'ALL' ? 'ALL' : String(behaviorMajorFilter)}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === 'ALL') {
                        setBehaviorMajorFilter('ALL');
                      } else {
                        setBehaviorMajorFilter(Number(value));
                      }
                    }}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                  >
                    <option value="ALL">Semua</option>
                    {behaviorSummary.summaryByMajor.map((major) => (
                      <option key={major.majorId} value={major.majorId}>
                        {major.code} - {major.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-500">Jenis</span>
                  <select
                    value={behaviorTypeFilter}
                    onChange={(e) =>
                      setBehaviorTypeFilter(e.target.value as 'ALL' | 'POSITIVE' | 'NEGATIVE')
                    }
                    className="border border-gray-300 rounded-lg px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-emerald-500/60"
                  >
                    <option value="ALL">Semua</option>
                    <option value="POSITIVE">Positif</option>
                    <option value="NEGATIVE">Negatif</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleCopyBehaviorSummary}
                  className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                >
                  <ClipboardList size={12} />
                  <span>Salin ringkasan</span>
                </button>
              </div>
            </div>
            {filteredBehaviorSummaryByMajor.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                Belum ada catatan perilaku dari wali kelas.
              </div>
            ) : (
              <div className="space-y-3">
                {filteredBehaviorSummaryByMajor.map((item) => {
                  const total = item.positiveCount + item.negativeCount;
                  const positiveRatio = total > 0 ? (item.positiveCount / total) * 100 : 0;
                  const negativeRatio = total > 0 ? (item.negativeCount / total) * 100 : 0;
                  const isRisky = total >= 3 && negativeRatio >= 50;
                  const academicInfo = academicAverageByMajor.get(item.majorId);
                  const academicLabel =
                    academicInfo && overallAcademicAverage !== null
                      ? academicInfo.averageScore >= overallAcademicAverage
                        ? 'di atas rata-rata sekolah'
                        : 'di bawah rata-rata sekolah'
                      : null;
                  return (
                    <div
                      key={item.majorId}
                      className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 transition-colors ${
                        isRisky
                          ? 'border-rose-200 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50/80'
                          : 'border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold ${
                            isRisky ? 'bg-rose-100 text-rose-700' : 'bg-emerald-50 text-emerald-600'
                          }`}
                        >
                          {item.code || '-'}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">
                              {item.name}
                            </p>
                            {isRisky && (
                              <button
                                type="button"
                                onClick={() => handleBehaviorDrilldown(item.majorId)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-[10px] font-semibold text-rose-700 hover:bg-rose-200 focus:outline-none focus:ring-1 focus:ring-rose-400"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                Perlu perhatian
                              </button>
                            )}
                          </div>
                          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${positiveRatio}%` }}
                            />
                            <div
                              className="h-full bg-rose-400"
                              style={{ width: `${100 - positiveRatio}%` }}
                            />
                          </div>
                          {academicInfo && (
                            <p className="mt-1 text-[11px] text-gray-500">
                              Rata-rata nilai jurusan:{' '}
                              {academicInfo.averageScore.toFixed(1)}
                              {academicLabel ? ` (${academicLabel})` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-end gap-4 text-right">
                        <div>
                          <div className="flex items-center gap-1 justify-end text-emerald-600">
                            <ThumbsUp size={14} />
                            <span className="text-[11px] font-medium">Positif</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            {item.positiveCount.toLocaleString('id-ID')}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-1 justify-end text-rose-600">
                            <ThumbsDown size={14} />
                            <span className="text-[11px] font-medium">Negatif</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            {item.negativeCount.toLocaleString('id-ID')}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div
            className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6"
            id="principal-behavior-latest"
          >
            <h3 className="font-bold text-gray-800 mb-2">Catatan Perilaku Terbaru</h3>
            <p className="text-xs text-gray-500 mb-4">
              Log singkat catatan perilaku terbaru dari seluruh wali kelas.
            </p>
            {filteredLatestBehaviors.length === 0 ? (
              <div className="py-6 text-sm text-gray-400">
                Belum ada catatan perilaku yang tercatat.
              </div>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {filteredLatestBehaviors.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl border border-gray-100 px-3 py-2.5"
                  >
                    <div
                      className={`mt-1 w-7 h-7 rounded-full flex items-center justify-center ${
                        item.type === 'POSITIVE'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {item.type === 'POSITIVE' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {item.student.name}
                        </p>
                        <p className="text-[11px] text-gray-400 whitespace-nowrap">
                          {new Date(item.date).toLocaleDateString('id-ID', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                          })}
                        </p>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {item.class?.name || '-'}{' '}
                        {item.major ? `• ${item.major.code}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-gray-800 line-clamp-2">
                        {item.description}
                      </p>
                      {item.category && (
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          Kategori: {item.category}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {shortcutItems.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold text-gray-800 uppercase tracking-[0.16em]">
                MENU CEPAT
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Akses cepat ke seluruh menu di sidebar Kepala Sekolah.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {shortcutItems.map((item, index) => {
              const accent = shortcutAccentPresets[index % shortcutAccentPresets.length];
              const Icon = item.icon;
              const info = getShortcutInfo(item);
              return (
                <Link
                  key={item.key}
                  to={item.path}
                  className={`group rounded-2xl border border-gray-100 bg-gray-50/60 p-4 flex flex-col justify-between hover:bg-white ${accent.hoverBorder} ${accent.hoverShadow} transition-all duration-200`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      {item.group && (
                        <p
                          className={`text-[11px] font-semibold tracking-[0.12em] ${accent.tagText} mb-1`}
                        >
                          {item.group}
                        </p>
                      )}
                      <h4 className="text-sm font-semibold text-gray-800">{item.label}</h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {info.subtitle}
                      </p>
                    </div>
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center ${accent.iconBg} ${accent.iconText}`}
                    >
                      <Icon size={18} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">{info.tag}</p>
                      <p className="text-[11px] font-medium text-gray-400 truncate max-w-[160px]">
                        {item.path}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-semibold ${accent.ctaText} ${accent.ctaBg}`}
                    >
                      Buka Menu
                      <ArrowUpRight size={14} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const daysSince = (value?: string | null): number => {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const now = Date.now();
  return Math.max(0, Math.floor((now - date.getTime()) / (24 * 60 * 60 * 1000)));
};

const countTeachingResourceStatus = (
  rows: Array<{ status: TeachingResourceEntryStatus; total: number }> | undefined,
  status: TeachingResourceEntryStatus,
): number => {
  if (!Array.isArray(rows)) return 0;
  return rows.find((item) => item.status === status)?.total || 0;
};

const PrincipalOperationalMonitoringPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [quickActionFilter, setQuickActionFilter] = useState<PrincipalQuickActionFilter>('ALL');

  const { data, isLoading, isError, refetch } = useQuery<PrincipalOperationalMonitoringData>({
    queryKey: ['principal-operational-monitoring', reportDate],
    queryFn: async () => {
      let activeAcademicYear: { id: number; name: string } | null = null;
      try {
        const activeYearRes = await academicYearService.getActiveSafe();
        activeAcademicYear = activeYearRes?.data || null;
      } catch {
        activeAcademicYear = null;
      }

      const [
        budgetsRes,
        pendingProgramsRes,
        reportsRes,
        bpbkSummaryRes,
        teachingSummaryRes,
        officeSummaryRes,
        studentsRes,
        teachersRes,
        staffsRes,
        permissionsRes,
      ] = await Promise.all([
        budgetRequestService.list({
          academicYearId: activeAcademicYear?.id,
          view: 'approver',
        }),
        workProgramService.listPendingForApproval().catch(() => ({ data: [] })),
        api
          .get('/proctoring/reports', {
            params: {
              academicYearId: activeAcademicYear?.id,
              date: reportDate || undefined,
            },
          })
          .then((response) => response.data?.data || null)
          .catch(() => null),
        api
          .get('/bpbk/principal-summary', {
            params: {
              academicYearId: activeAcademicYear?.id,
            },
          })
          .then((response) => response.data?.data || null)
          .catch(() => null),
        teachingResourceProgramService
          .getEntriesSummary({
            academicYearId: activeAcademicYear?.id,
          })
          .catch(() => null),
        officeService
          .getSummary({
            academicYearId: activeAcademicYear?.id,
          })
          .catch(() => null),
        userService.getUsers({ role: 'STUDENT', limit: 10000 }).catch(() => ({ data: [] })),
        userService.getUsers({ role: 'TEACHER', limit: 10000 }).catch(() => ({ data: [] })),
        userService.getUsers({ role: 'STAFF', limit: 10000 }).catch(() => ({ data: [] })),
        permissionService
          .getPermissions({
            academicYearId: activeAcademicYear?.id,
            limit: 200,
          })
          .catch(() => ({ data: { permissions: [] } })),
      ]);

      const rawBudgets =
        (budgetsRes as { data?: BudgetRequest[] } | null)?.data ||
        (budgetsRes as BudgetRequest[] | null) ||
        [];
      const pendingBudgets = (rawBudgets || []).filter((item) => item.status === 'PENDING');
      const pendingBudgetAmount = pendingBudgets.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);
      const overdueBudgetCount = pendingBudgets.filter((item) => daysSince(item.createdAt) > 2).length;

      const rawPendingPrograms = Array.isArray((pendingProgramsRes as { data?: unknown[] } | null)?.data)
        ? ((pendingProgramsRes as { data?: unknown[] }).data as unknown[])
        : [];
      const pendingWorkPrograms = rawPendingPrograms
        .map((item) => item as WorkProgram)
        .filter((item) => {
          if (!item || item.approvalStatus !== 'PENDING') return false;
          if (!activeAcademicYear?.id) return true;
          return Number(item.academicYearId) === Number(activeAcademicYear.id);
        });
      const overdueWorkProgramCount = pendingWorkPrograms.filter((item) => daysSince(item.createdAt) > 5).length;

      const reportSummary = (reportsRes?.summary || {
        totalRooms: 0,
        totalExpected: 0,
        totalPresent: 0,
        totalAbsent: 0,
        reportedRooms: 0,
      }) as PrincipalProctorReportSummary;

      const bpbkSummary = (bpbkSummaryRes?.summary || {
        totalCases: 0,
        negativeCases: 0,
        highRiskStudents: 0,
        openCounselings: 0,
        inProgressCounselings: 0,
        closedCounselings: 0,
        summonPendingCounselings: 0,
        overdueCounselings: 0,
      }) as PrincipalOperationalMonitoringData['bpbkSummary'];
      const bpbkHighRiskStudents = Array.isArray(bpbkSummaryRes?.highRiskStudents)
        ? (bpbkSummaryRes.highRiskStudents as PrincipalOperationalMonitoringData['bpbkHighRiskStudents'])
        : [];
      const bpbkOverdueCounselings = Array.isArray(bpbkSummaryRes?.overdueCounselings)
        ? (bpbkSummaryRes.overdueCounselings as PrincipalOperationalMonitoringData['bpbkOverdueCounselings'])
        : [];
      const teachingSummary: PrincipalOperationalMonitoringData['teachingResourceSummary'] = {
        total: Number(teachingSummaryRes?.data?.total || 0),
        submitted: countTeachingResourceStatus(teachingSummaryRes?.data?.byStatus, 'SUBMITTED'),
        approved: countTeachingResourceStatus(teachingSummaryRes?.data?.byStatus, 'APPROVED'),
        rejected: countTeachingResourceStatus(teachingSummaryRes?.data?.byStatus, 'REJECTED'),
        draft: countTeachingResourceStatus(teachingSummaryRes?.data?.byStatus, 'DRAFT'),
        latest: Array.isArray(teachingSummaryRes?.data?.latest)
          ? (teachingSummaryRes?.data?.latest as TeachingResourceEntry[])
          : [],
      };
      const officeSummary: PrincipalOperationalMonitoringData['officeSummary'] = {
        totalLetters: Number(officeSummaryRes?.totalLetters || 0),
        monthlyLetters: Number(officeSummaryRes?.monthlyLetters || 0),
        byType: Array.isArray(officeSummaryRes?.byType) ? officeSummaryRes.byType : [],
        latest: Array.isArray(officeSummaryRes?.latest) ? officeSummaryRes.latest : [],
      };
      const students = Array.isArray(studentsRes?.data) ? (studentsRes.data as StudentWithClass[]) : [];
      const teachers = Array.isArray(teachersRes?.data) ? (teachersRes.data as User[]) : [];
      const staffs = Array.isArray(staffsRes?.data) ? (staffsRes.data as User[]) : [];
      const permissions = Array.isArray(permissionsRes?.data?.permissions) ? permissionsRes.data.permissions : [];
      const personnel = [...teachers, ...staffs];
      const incompleteStudents = students.filter(
        (student) => !buildStudentAdministrationSummary(student).isComplete,
      ).length;
      const incompleteTeachers = personnel.filter(
        (teacher) => !buildTeacherAdministrationSummary(teacher).isComplete,
      ).length;
      const administrationSummary: PrincipalOperationalMonitoringData['administrationSummary'] = {
        totalStudents: students.length,
        totalTeachers: personnel.length,
        administrationStaffCount: staffs.filter((staff) => staff.ptkType === 'STAFF_ADMINISTRASI').length,
        financeStaffCount: staffs.filter((staff) => staff.ptkType === 'STAFF_KEUANGAN').length,
        pendingPermissions: permissions.filter((permission) => permission.status === 'PENDING').length,
        incompleteStudents,
        incompleteTeachers,
        studentCompletenessRate:
          students.length === 0 ? 100 : Math.round(((students.length - incompleteStudents) / students.length) * 100),
        teacherCompletenessRate:
          personnel.length === 0 ? 100 : Math.round(((personnel.length - incompleteTeachers) / personnel.length) * 100),
      };
      const administrationIncompleteStudents: PrincipalOperationalMonitoringData['administrationIncompleteStudents'] = students
        .map((student) => {
          const summary = buildStudentAdministrationSummary(student);
          return {
            id: student.id,
            name: student.name || '-',
            nis: student.nis || null,
            className: student.studentClass?.name || null,
            missing: summary.missing,
            isComplete: summary.isComplete,
          };
        })
        .filter((student) => !student.isComplete)
        .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name))
        .slice(0, 6)
        .map(({ isComplete: _isComplete, ...row }) => row);
      const administrationIncompleteTeachers: PrincipalOperationalMonitoringData['administrationIncompleteTeachers'] = personnel
        .map((teacher) => {
          const summary = buildTeacherAdministrationSummary(teacher);
          return {
            id: teacher.id,
            name: teacher.name || '-',
            username: teacher.username || '-',
            ptkType: teacher.ptkType || null,
            missing: summary.missing,
            isComplete: summary.isComplete,
          };
        })
        .filter((teacher) => !teacher.isComplete)
        .sort((a, b) => b.missing.length - a.missing.length || a.name.localeCompare(b.name))
        .slice(0, 6)
        .map(({ isComplete: _isComplete, ...row }) => row);
      const administrationPendingPermissions: PrincipalOperationalMonitoringData['administrationPendingPermissions'] = permissions
        .filter((permission) => permission.status === 'PENDING')
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 6)
        .map((permission) => ({
          id: permission.id,
          studentName: permission.student?.name || 'Siswa',
          className: permissionsRes?.data?.permissions
            ? null
            : null,
          type: permission.type,
          status: permission.status,
          startDate: permission.startDate,
          endDate: permission.endDate,
          reason: permission.reason || null,
        }));

      const unreportedRooms = Math.max(0, Number(reportSummary.totalRooms || 0) - Number(reportSummary.reportedRooms || 0));
      const absentParticipants = Math.max(0, Number(reportSummary.totalAbsent || 0));

      const risks: PrincipalOperationalRisk[] = [];
      if (overdueBudgetCount > 0) {
        risks.push({
          id: 'budget-overdue',
          level: 'HIGH',
          title: `${overdueBudgetCount} pengajuan anggaran melewati SLA`,
          detail: 'Ada pengajuan pending lebih dari 2 hari dan perlu keputusan Kepala Sekolah.',
          actionPath: '/principal/finance/requests',
          actionLabel: 'Tinjau Keuangan',
        });
      }
      if (overdueWorkProgramCount > 0) {
        risks.push({
          id: 'workprogram-overdue',
          level: 'MEDIUM',
          title: `${overdueWorkProgramCount} program kerja menunggu persetujuan`,
          detail: 'Ada program kerja pending lebih dari 5 hari pada approver principal.',
          actionPath: '/principal/work-program-approvals',
          actionLabel: 'Tinjau Program Kerja',
        });
      }
      if (unreportedRooms > 0) {
        risks.push({
          id: 'proctor-unreported',
          level: 'HIGH',
          title: `${unreportedRooms} ruang ujian belum kirim berita acara`,
          detail: `Monitoring tanggal ${reportDate}: berita acara belum masuk dari seluruh ruang aktif.`,
          actionPath: '/principal/exams/reports',
          actionLabel: 'Lihat Berita Acara',
        });
      }
      if (absentParticipants > 0) {
        risks.push({
          id: 'exam-absent',
          level: 'MEDIUM',
          title: `${absentParticipants} siswa tidak hadir ujian`,
          detail: 'Perlu validasi tindak lanjut ketidakhadiran pada sesi ujian berjalan.',
          actionPath: '/principal/exams/reports',
          actionLabel: 'Cek Detail Ujian',
        });
      }
      if (bpbkSummary.overdueCounselings > 0) {
        risks.push({
          id: 'bpbk-overdue',
          level: 'HIGH',
          title: `${bpbkSummary.overdueCounselings} tindak lanjut BP/BK melewati 7 hari`,
          detail: 'Ada konseling aktif yang belum ditutup dan perlu keputusan/monitoring principal.',
          actionPath: '/principal/monitoring/bpbk',
          actionLabel: 'Buka Ringkasan BP/BK',
        });
      }
      if (bpbkSummary.highRiskStudents > 0) {
        risks.push({
          id: 'bpbk-high-risk',
          level: 'MEDIUM',
          title: `${bpbkSummary.highRiskStudents} siswa masuk kategori risiko tinggi`,
          detail: 'Perlu pemantauan lintas BP/BK, wali kelas, dan wakasis.',
          actionPath: '/principal/monitoring/bpbk',
          actionLabel: 'Tinjau Risiko Siswa',
        });
      }
      if (teachingSummary.submitted > 0) {
        risks.push({
          id: 'teaching-resource-pending',
          level: 'MEDIUM',
          title: `${teachingSummary.submitted} perangkat ajar menunggu review`,
          detail: 'Dokumen perangkat ajar perlu ditinjau oleh kurikulum/principal.',
          actionPath: '/principal/monitoring/operations#teaching-resource',
          actionLabel: 'Lihat Ringkasan',
        });
      }
      if (administrationSummary.pendingPermissions > 0) {
        risks.push({
          id: 'administration-permissions-pending',
          level: administrationSummary.pendingPermissions >= 10 ? 'HIGH' : 'MEDIUM',
          title: `${administrationSummary.pendingPermissions} perizinan administrasi menunggu tindak lanjut`,
          detail: 'Perlu sinkronisasi staff administrasi, wali kelas, dan pimpinan agar layanan berjalan cepat.',
          actionPath: '/principal/monitoring/operations#administration-tu',
          actionLabel: 'Buka Monitoring TU',
        });
      }
      if (administrationSummary.incompleteStudents > 0 || administrationSummary.incompleteTeachers > 0) {
        risks.push({
          id: 'administration-incomplete-data',
          level:
            administrationSummary.incompleteStudents + administrationSummary.incompleteTeachers >= 25
              ? 'HIGH'
              : 'MEDIUM',
          title: `${administrationSummary.incompleteStudents + administrationSummary.incompleteTeachers} data administrasi belum lengkap`,
          detail: `${administrationSummary.incompleteStudents} siswa dan ${administrationSummary.incompleteTeachers} guru/staff perlu dilengkapi.`,
          actionPath: '/principal/monitoring/operations#administration-tu',
          actionLabel: 'Cek Kelengkapan',
        });
      }
      if (risks.length === 0) {
        risks.push({
          id: 'healthy',
          level: 'LOW',
          title: 'Semua indikator operasional dalam batas aman',
          detail: 'Belum ada backlog approval kritis atau risiko ujian pada filter saat ini.',
        });
      }

      return {
        activeAcademicYear,
        pendingBudgetCount: pendingBudgets.length,
        pendingBudgetAmount,
        overdueBudgetCount,
        pendingWorkProgramCount: pendingWorkPrograms.length,
        overdueWorkProgramCount,
        unreportedRooms,
        absentParticipants,
        reportSummary,
        bpbkSummary,
        bpbkHighRiskStudents,
        bpbkOverdueCounselings,
        teachingResourceSummary: teachingSummary,
        officeSummary,
        administrationSummary,
        administrationIncompleteStudents,
        administrationIncompleteTeachers,
        administrationPendingPermissions,
        risks,
        pendingBudgets: pendingBudgets.slice(0, 8),
        pendingWorkPrograms: pendingWorkPrograms.slice(0, 8),
      };
    },
    staleTime: 60 * 1000,
  });

  const getRiskTone = (level: PrincipalOperationalRiskLevel) => {
    if (level === 'HIGH') {
      return 'border-rose-200 bg-gradient-to-r from-rose-50 to-red-50 text-rose-900';
    }
    if (level === 'MEDIUM') {
      return 'border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900';
    }
    return 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-900';
  };

  const quickActions = useMemo<PrincipalQuickActionItem[]>(() => {
    if (!data) return [];

    const budgetActions: PrincipalQuickActionItem[] = data.pendingBudgets
      .map((budget) => {
        const ageDays = daysSince(budget.createdAt);
        const severity: PrincipalQuickActionSeverity = ageDays > 2 ? 'HIGH' : ageDays > 0 ? 'MEDIUM' : 'LOW';
        return {
          key: `budget-${budget.id}`,
          type: 'BUDGET' as const,
          severity,
          title: `Persetujuan anggaran: ${budget.title}`,
          detail: `${budget.requester?.name || '-'} • Rp ${Math.trunc(Number(budget.totalAmount || 0)).toLocaleString(
            'id-ID',
          )}`,
          ageDays,
          actionPath: '/principal/finance/requests',
          actionLabel: 'Buka Keuangan',
          budgetId: budget.id,
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);

    const workProgramActions: PrincipalQuickActionItem[] = data.pendingWorkPrograms
      .map((program) => {
        const ageDays = daysSince(program.createdAt);
        const severity: PrincipalQuickActionSeverity = ageDays > 5 ? 'HIGH' : ageDays > 2 ? 'MEDIUM' : 'LOW';
        return {
          key: `workprogram-${program.id}`,
          type: 'WORK_PROGRAM' as const,
          severity,
          title: `Persetujuan program kerja: ${program.title}`,
          detail: `${String(program.additionalDuty || '-').replace(/_/g, ' ')} • ${
            program.academicYear?.name || '-'
          }`,
          ageDays,
          actionPath: `/principal/work-program-approvals?focusProgramId=${program.id}`,
          actionLabel: 'Buka Program Kerja',
          workProgramId: program.id,
        };
      })
      .sort((a, b) => b.ageDays - a.ageDays);

    const examActions: PrincipalQuickActionItem[] =
      data.unreportedRooms > 0 || data.absentParticipants > 0
        ? [
            {
              key: 'exam-followup',
              type: 'EXAM_REPORT',
              severity: data.unreportedRooms > 0 ? 'HIGH' : 'MEDIUM',
              title: 'Tindak lanjut berita acara ujian',
              detail: `${data.unreportedRooms} ruang belum melapor • ${data.absentParticipants} siswa tidak hadir`,
              ageDays: 0,
              actionPath: '/principal/exams/reports',
              actionLabel: 'Buka Berita Acara',
            },
          ]
        : [];

    const bpbkActions: PrincipalQuickActionItem[] =
      data.bpbkSummary.overdueCounselings > 0 || data.bpbkSummary.highRiskStudents > 0
        ? [
            {
              key: 'bpbk-followup',
              type: 'BP_BK',
              severity: data.bpbkSummary.overdueCounselings > 0 ? 'HIGH' : 'MEDIUM',
              title: 'Tindak lanjut kasus BP/BK',
              detail: `${data.bpbkSummary.highRiskStudents} siswa risiko tinggi • ${data.bpbkSummary.overdueCounselings} overdue`,
              ageDays: 0,
              actionPath: '/principal/monitoring/bpbk',
              actionLabel: 'Buka Ringkasan BP/BK',
            },
          ]
        : [];

    const teachingResourceActions: PrincipalQuickActionItem[] =
      data.teachingResourceSummary.submitted > 0
        ? [
            {
              key: 'teaching-resource-followup',
              type: 'TEACHING_RESOURCE',
              severity: data.teachingResourceSummary.submitted >= 10 ? 'HIGH' : 'MEDIUM',
              title: 'Review perangkat ajar pending',
              detail: `${data.teachingResourceSummary.submitted} menunggu review • ${data.teachingResourceSummary.approved} disetujui`,
              ageDays: 0,
              actionPath: '/principal/monitoring/operations#teaching-resource',
              actionLabel: 'Lihat Ringkasan',
            },
          ]
        : [];

    const all = [...budgetActions, ...workProgramActions, ...examActions, ...bpbkActions, ...teachingResourceActions];
    const severityRank: Record<PrincipalQuickActionSeverity, number> = {
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };
    return all
      .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.ageDays - a.ageDays)
      .slice(0, 8);
  }, [data]);

  const quickActionStats = useMemo(
    () => ({
      ALL: quickActions.length,
      BUDGET: quickActions.filter((item) => item.type === 'BUDGET').length,
      WORK_PROGRAM: quickActions.filter((item) => item.type === 'WORK_PROGRAM').length,
      EXAM_REPORT: quickActions.filter((item) => item.type === 'EXAM_REPORT').length,
      BP_BK: quickActions.filter((item) => item.type === 'BP_BK').length,
      TEACHING_RESOURCE: quickActions.filter((item) => item.type === 'TEACHING_RESOURCE').length,
    }),
    [quickActions],
  );

  const filteredQuickActions = useMemo(() => {
    if (quickActionFilter === 'ALL') return quickActions;
    return quickActions.filter((item) => item.type === quickActionFilter);
  }, [quickActions, quickActionFilter]);

  const quickBudgetMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      budgetRequestService.updateStatus(id, {
        status,
        rejectionReason:
          status === 'REJECTED' ? 'Ditolak melalui panel monitoring principal' : undefined,
      }),
    onSuccess: (_response, variables) => {
      toast.success(
        variables.status === 'APPROVED'
          ? 'Pengajuan anggaran disetujui'
          : 'Pengajuan anggaran ditolak',
      );
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      queryClient.invalidateQueries({ queryKey: ['principal-operational-monitoring'] });
      refetch();
    },
    onError: () => {
      toast.error('Gagal memproses pengajuan anggaran dari panel monitoring');
    },
  });

  const quickWorkProgramMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'APPROVED' | 'REJECTED' }) =>
      workProgramService.updateApprovalStatus(id, {
        status,
        feedback:
          status === 'REJECTED'
            ? 'Ditolak melalui panel monitoring principal'
            : 'Disetujui melalui panel monitoring principal',
      }),
    onSuccess: (_response, variables) => {
      toast.success(
        variables.status === 'APPROVED'
          ? 'Program kerja disetujui'
          : 'Program kerja ditolak',
      );
      queryClient.invalidateQueries({ queryKey: ['principal-operational-monitoring'] });
      refetch();
    },
    onError: () => {
      toast.error('Gagal memproses persetujuan program kerja dari panel monitoring');
    },
  });

  const handleQuickApprove = (item: PrincipalQuickActionItem) => {
    if (item.type === 'BUDGET' && item.budgetId) {
      quickBudgetMutation.mutate({ id: item.budgetId, status: 'APPROVED' });
      return;
    }
    if (item.type === 'WORK_PROGRAM' && item.workProgramId) {
      quickWorkProgramMutation.mutate({ id: item.workProgramId, status: 'APPROVED' });
    }
  };

  const handleQuickReject = (item: PrincipalQuickActionItem) => {
    if (item.type === 'BUDGET' && item.budgetId) {
      quickBudgetMutation.mutate({ id: item.budgetId, status: 'REJECTED' });
      return;
    }
    if (item.type === 'WORK_PROGRAM' && item.workProgramId) {
      quickWorkProgramMutation.mutate({ id: item.workProgramId, status: 'REJECTED' });
    }
  };

  const handleOpenQuickAction = (item: PrincipalQuickActionItem) => {
    if (item.type === 'WORK_PROGRAM' && item.workProgramId) {
      navigate(`/principal/work-program-approvals?focusProgramId=${item.workProgramId}`);
      return;
    }
    navigate(item.actionPath);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pusat Monitoring Operasional</h2>
          <p className="mt-1 text-sm text-gray-500">
            SLA persetujuan, risiko ujian, dan backlog keputusan Kepala Sekolah dalam satu layar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <input
            type="date"
            value={reportDate}
            onChange={(event) => setReportDate(event.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Muat Ulang
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : isError || !data ? (
        <div className="bg-white rounded-xl border border-rose-100 p-6 text-sm text-rose-700">
          Gagal memuat monitoring operasional principal.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-4">
            <Link
              to="/principal/finance/requests"
              className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-blue-700/80">Pengajuan Anggaran Pending</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">{data.pendingBudgetCount}</p>
              <p className="text-xs text-blue-700/80 mt-1">
                Rp {Math.trunc(data.pendingBudgetAmount).toLocaleString('id-ID')}
              </p>
            </Link>
            <Link
              to="/principal/work-program-approvals"
              className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-amber-700/80">Program Kerja Pending</p>
              <p className="text-2xl font-bold text-amber-900 mt-1">{data.pendingWorkProgramCount}</p>
              <p className="text-xs text-amber-700/80 mt-1">
                {data.overdueWorkProgramCount} melewati SLA 5 hari
              </p>
            </Link>
            <Link
              to="/principal/exams/reports"
              className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-red-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-rose-700/80">Ruang Belum Melapor</p>
              <p className="text-2xl font-bold text-rose-900 mt-1">{data.unreportedRooms}</p>
              <p className="text-xs text-rose-700/80 mt-1">
                dari {data.reportSummary.totalRooms} ruang aktif
              </p>
            </Link>
            <Link
              to="/principal/exams/reports"
              className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/90 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-slate-700">Siswa Tidak Hadir Ujian</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.absentParticipants}</p>
              <p className="text-xs text-slate-600 mt-1">{data.reportSummary.totalPresent} hadir tercatat</p>
            </Link>
            <Link
              to="/principal/monitoring/bpbk"
              className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-violet-700/80">Kasus BP/BK Risiko Tinggi</p>
              <p className="text-2xl font-bold text-violet-900 mt-1">{data.bpbkSummary.highRiskStudents}</p>
              <p className="text-xs text-violet-700/80 mt-1">
                {data.bpbkSummary.overdueCounselings} overdue • {data.bpbkSummary.openCounselings} kasus aktif
              </p>
            </Link>
            <Link
              id="teaching-resource"
              to="/principal/monitoring/operations#teaching-resource"
              className="rounded-xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-sky-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-cyan-700/80">Perangkat Ajar Pending Review</p>
              <p className="text-2xl font-bold text-cyan-900 mt-1">{data.teachingResourceSummary.submitted}</p>
              <p className="text-xs text-cyan-700/80 mt-1">
                {data.teachingResourceSummary.approved} disetujui • {data.teachingResourceSummary.rejected} revisi
              </p>
            </Link>
            <Link
              id="office-tu"
              to="/principal/monitoring/operations#office-tu"
              className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/90 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-slate-700">Surat TU Bulan Ini</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{data.officeSummary.monthlyLetters}</p>
              <p className="text-xs text-slate-600 mt-1">{data.officeSummary.totalLetters} arsip surat tercatat</p>
            </Link>
            <Link
              id="administration-tu-card"
              to="/principal/monitoring/operations#administration-tu"
              className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-100/85 p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-emerald-700/80">Administrasi Belum Lengkap</p>
              <p className="text-2xl font-bold text-emerald-900 mt-1">
                {data.administrationSummary.incompleteStudents + data.administrationSummary.incompleteTeachers}
              </p>
              <p className="text-xs text-emerald-700/80 mt-1">
                {data.administrationSummary.pendingPermissions} izin pending •{' '}
                {data.administrationSummary.administrationStaffCount + data.administrationSummary.financeStaffCount} staff TU
              </p>
            </Link>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-gray-500" />
                <h3 className="text-sm font-semibold text-gray-900">Panel Prioritas Tindakan 1 Klik</h3>
              </div>
              <span className="text-xs text-gray-500">Eksekusi cepat keputusan principal</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: 'ALL' as const, label: 'Semua' },
                  { key: 'BUDGET' as const, label: 'Anggaran' },
                  { key: 'WORK_PROGRAM' as const, label: 'Program Kerja' },
                  { key: 'EXAM_REPORT' as const, label: 'Ujian' },
                  { key: 'BP_BK' as const, label: 'BP/BK' },
                  { key: 'TEACHING_RESOURCE' as const, label: 'Perangkat Ajar' },
                ] as const).map((filterItem) => {
                const active = quickActionFilter === filterItem.key;
                const count = quickActionStats[filterItem.key];
                return (
                  <button
                    key={filterItem.key}
                    type="button"
                    onClick={() => setQuickActionFilter(filterItem.key)}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="h-3 w-3" />
                    <span>{filterItem.label}</span>
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{count}</span>
                  </button>
                );
              })}
            </div>

            {filteredQuickActions.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {quickActions.length === 0
                  ? 'Tidak ada antrian prioritas untuk ditindaklanjuti.'
                  : 'Tidak ada antrian pada kategori filter yang dipilih.'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredQuickActions.map((item) => {
                  const severityClasses =
                    item.severity === 'HIGH'
                      ? 'border-rose-200 bg-rose-50'
                      : item.severity === 'MEDIUM'
                      ? 'border-amber-200 bg-amber-50'
                      : 'border-slate-200 bg-slate-50';
                  return (
                    <div
                      key={item.key}
                      className={`rounded-lg border px-3 py-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${severityClasses}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                        <p className="text-xs text-gray-600">{item.detail}</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">Umur antrian: {item.ageDays} hari</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenQuickAction(item)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 bg-white text-xs text-gray-700 hover:bg-gray-50"
                        >
                          {item.actionLabel}
                        </button>
                        {item.type === 'BUDGET' || item.type === 'WORK_PROGRAM' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleQuickApprove(item)}
                              disabled={quickBudgetMutation.isPending || quickWorkProgramMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Setujui
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickReject(item)}
                              disabled={quickBudgetMutation.isPending || quickWorkProgramMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-rose-600 text-white text-xs hover:bg-rose-700 disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Tolak
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 md:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-gray-500" />
              <h3 className="text-sm font-semibold text-gray-900">Risiko Harian & Prioritas Tindakan</h3>
            </div>
            <div className="space-y-2">
              {data.risks.map((risk) => (
                <div
                  key={risk.id}
                  className={`rounded-lg border px-3 py-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between ${getRiskTone(risk.level)}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{risk.title}</p>
                    <p className="text-xs opacity-90">{risk.detail}</p>
                  </div>
                  {risk.actionPath ? (
                    <Link
                      to={risk.actionPath}
                      className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-md bg-white/70 hover:bg-white"
                    >
                      <AlertTriangle className="w-3 h-3" />
                      {risk.actionLabel || 'Tindak Lanjut'}
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Backlog Pengajuan Anggaran</h3>
                <Link to="/principal/finance/requests" className="text-xs text-blue-600 hover:underline">
                  Lihat Semua
                </Link>
              </div>
              <div className="max-h-[360px] overflow-auto">
                {data.pendingBudgets.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">Tidak ada pengajuan pending.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Judul</th>
                        <th className="px-4 py-2 text-left">Nominal</th>
                        <th className="px-4 py-2 text-left">Umur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.pendingBudgets.map((budget) => (
                        <tr key={budget.id}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{budget.title}</div>
                            <div className="text-xs text-gray-500">{budget.requester?.name || '-'}</div>
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            Rp {Math.trunc(Number(budget.totalAmount || 0)).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{daysSince(budget.createdAt)} hari</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Backlog Program Kerja</h3>
                <Link to="/principal/work-program-approvals" className="text-xs text-blue-600 hover:underline">
                  Lihat Semua
                </Link>
              </div>
              <div className="max-h-[360px] overflow-auto">
                {data.pendingWorkPrograms.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">Tidak ada program kerja pending.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Program</th>
                        <th className="px-4 py-2 text-left">Duty</th>
                        <th className="px-4 py-2 text-left">Umur</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.pendingWorkPrograms.map((program) => (
                        <tr key={program.id}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{program.title}</div>
                            <div className="text-xs text-gray-500">{program.academicYear?.name || '-'}</div>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{String(program.additionalDuty || '-').replace(/_/g, ' ')}</td>
                          <td className="px-4 py-2 text-gray-700 inline-flex items-center gap-1">
                            <Clock3 className="w-3 h-3 text-gray-400" />
                            {daysSince(program.createdAt)} hari
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div id="office-tu" className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Ringkasan Surat Tata Usaha</h3>
              <span className="text-xs text-gray-500">
                {data.officeSummary.byType.length} tipe • {data.officeSummary.totalLetters} total arsip
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-4">
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-wider text-slate-600">Surat Bulan Ini</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{data.officeSummary.monthlyLetters}</p>
                <p className="mt-1 text-xs text-slate-600">Aktivitas surat yang diterbitkan TU bulan berjalan.</p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wider text-blue-600">Jenis Surat Aktif</p>
                <div className="mt-2 space-y-2 text-sm text-blue-900">
                  {data.officeSummary.byType.length === 0 ? (
                    <p className="text-blue-700/80">Belum ada surat tercatat.</p>
                  ) : (
                    data.officeSummary.byType.map((row) => (
                      <div key={row.type} className="flex items-center justify-between">
                        <span>{row.type.replace(/_/g, ' ')}</span>
                        <span className="font-semibold">{row._count._all}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-600">Surat Terbaru</p>
                <div className="mt-2 space-y-2 text-sm text-emerald-900">
                  {data.officeSummary.latest.length === 0 ? (
                    <p className="text-emerald-700/80">Belum ada surat terbaru.</p>
                  ) : (
                    data.officeSummary.latest.slice(0, 4).map((letter) => (
                      <div key={letter.id} className="rounded-md border border-emerald-100 bg-white/70 px-3 py-2">
                        <p className="font-semibold">{letter.letterNumber}</p>
                        <p className="text-xs text-emerald-800">{letter.recipientName}</p>
                        <p className="text-[11px] text-emerald-700/80">{letter.purpose || letter.type.replace(/_/g, ' ')}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div id="administration-tu" className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Monitoring Administrasi TU</h3>
                <p className="text-xs text-gray-500">
                  Pantau kelengkapan data siswa, guru/staff, dan antrian perizinan administratif.
                </p>
              </div>
              <span className="text-xs text-gray-500">
                {data.administrationSummary.administrationStaffCount} staff administrasi •{' '}
                {data.administrationSummary.financeStaffCount} staff keuangan
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 p-4 border-b border-gray-100">
              <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
                <p className="text-xs uppercase tracking-wider text-amber-700">Siswa Belum Lengkap</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">{data.administrationSummary.incompleteStudents}</p>
                <p className="mt-1 text-xs text-amber-700/80">
                  Kelengkapan siswa {data.administrationSummary.studentCompletenessRate}%
                </p>
              </div>
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
                <p className="text-xs uppercase tracking-wider text-blue-700">Guru/Staff Belum Lengkap</p>
                <p className="mt-2 text-2xl font-bold text-blue-900">{data.administrationSummary.incompleteTeachers}</p>
                <p className="mt-1 text-xs text-blue-700/80">
                  Kelengkapan guru/staff {data.administrationSummary.teacherCompletenessRate}%
                </p>
              </div>
              <div className="rounded-lg border border-rose-100 bg-rose-50 p-4">
                <p className="text-xs uppercase tracking-wider text-rose-700">Perizinan Pending</p>
                <p className="mt-2 text-2xl font-bold text-rose-900">{data.administrationSummary.pendingPermissions}</p>
                <p className="mt-1 text-xs text-rose-700/80">Perlu sinkronisasi dengan wali kelas dan TU</p>
              </div>
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
                <p className="text-xs uppercase tracking-wider text-emerald-700">Total SDM TU</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">
                  {data.administrationSummary.administrationStaffCount + data.administrationSummary.financeStaffCount}
                </p>
                <p className="mt-1 text-xs text-emerald-700/80">
                  Admin {data.administrationSummary.administrationStaffCount} • Keuangan {data.administrationSummary.financeStaffCount}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 p-4">
              <div className="rounded-lg border border-amber-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/70">
                  <h4 className="text-sm font-semibold text-amber-900">Siswa Prioritas Dilengkapi</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.administrationIncompleteStudents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">Semua data siswa sudah lengkap.</div>
                  ) : (
                    data.administrationIncompleteStudents.map((row) => (
                      <div key={row.id} className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500">
                          {row.nis || '-'} • {row.className || 'Tanpa kelas'}
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          Kurang: {row.missing.join(', ')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-blue-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/70">
                  <h4 className="text-sm font-semibold text-blue-900">Guru/Staff Prioritas Dilengkapi</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.administrationIncompleteTeachers.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">Semua data guru/staff sudah lengkap.</div>
                  ) : (
                    data.administrationIncompleteTeachers.map((row) => (
                      <div key={row.id} className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                        <p className="text-xs text-gray-500">
                          {row.username} • {String(row.ptkType || 'PTK').replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-xs text-blue-700">
                          Kurang: {row.missing.join(', ')}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-rose-100 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-rose-100 bg-rose-50/70">
                  <h4 className="text-sm font-semibold text-rose-900">Perizinan Menunggu Tindak Lanjut</h4>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.administrationPendingPermissions.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-gray-500 text-center">Tidak ada perizinan yang pending.</div>
                  ) : (
                    data.administrationPendingPermissions.map((row) => (
                      <div key={row.id} className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">{row.studentName}</p>
                        <p className="text-xs text-gray-500">
                          {row.type === 'SICK' ? 'Sakit' : row.type === 'PERMISSION' ? 'Izin' : 'Lainnya'} •{' '}
                          {new Date(row.startDate).toLocaleDateString('id-ID')} -{' '}
                          {new Date(row.endDate).toLocaleDateString('id-ID')}
                        </p>
                        <p className="mt-1 text-xs text-rose-700">
                          {row.reason || 'Belum ada alasan terisi.'}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const PrincipalStudentsPage = () => {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('ALL');

  const studentsQuery = useQuery({
    queryKey: ['principal-students-page'],
    queryFn: () => userService.getUsers({ role: 'STUDENT', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const students = useMemo(() => studentsQuery.data?.data || [], [studentsQuery.data?.data]);

  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    students.forEach((student) => {
      if (student.studentClass?.id && student.studentClass?.name) {
        map.set(String(student.studentClass.id), student.studentClass.name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      if (classFilter !== 'ALL' && String(student.studentClass?.id || '') !== classFilter) {
        return false;
      }

      if (!normalizedSearch) return true;
      const haystacks = [
        student.name || '',
        student.nis || '',
        student.nisn || '',
        student.studentClass?.name || '',
        student.studentClass?.major?.name || '',
      ];
      return haystacks.some((item) => item.toLowerCase().includes(normalizedSearch));
    });
  }, [students, classFilter, normalizedSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Data Siswa</h2>
        <p className="mt-1 text-sm text-gray-500">Daftar siswa aktif untuk monitoring Kepala Sekolah.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, NIS, NISN, kelas"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-72"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Kelas</option>
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => studentsQuery.refetch()}
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
          <div className="py-10 text-center text-sm text-red-600">
            Gagal memuat data siswa.
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Tidak ada data siswa yang cocok dengan filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIS / NISN</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
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
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {student.studentClass?.name || '-'}
                      {student.studentClass?.major?.code ? ` (${student.studentClass.major.code})` : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {student.studentStatus || '-'} / {student.verificationStatus || '-'}
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
};

const PrincipalTeachersPage = () => {
  const [search, setSearch] = useState('');
  const [dutyFilter, setDutyFilter] = useState<string>('ALL');

  const teachersQuery = useQuery({
    queryKey: ['principal-teachers-page'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const teachers = useMemo(() => teachersQuery.data?.data || [], [teachersQuery.data?.data]);

  const dutyOptions = useMemo(() => {
    const duties = new Set<string>();
    teachers.forEach((teacher) => {
      (teacher.additionalDuties || []).forEach((duty) => {
        const normalized = normalizeDuty(duty);
        if (normalized) duties.add(normalized);
      });
    });
    return Array.from(duties.values()).sort((a, b) => a.localeCompare(b));
  }, [teachers]);

  const normalizedSearch = search.trim().toLowerCase();
  const filteredTeachers = useMemo(() => {
    return teachers.filter((teacher) => {
      if (dutyFilter !== 'ALL') {
        const hasDuty = (teacher.additionalDuties || []).some((duty) => normalizeDuty(duty) === dutyFilter);
        if (!hasDuty) return false;
      }

      if (!normalizedSearch) return true;
      const dutyText = (teacher.additionalDuties || []).join(' ');
      const haystacks = [teacher.name || '', teacher.username || '', teacher.email || '', dutyText];
      return haystacks.some((item) => item.toLowerCase().includes(normalizedSearch));
    });
  }, [teachers, dutyFilter, normalizedSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Data Guru</h2>
        <p className="mt-1 text-sm text-gray-500">Daftar guru untuk monitoring SDM oleh Kepala Sekolah.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari nama, username, email, duty"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-72"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={dutyFilter}
              onChange={(e) => setDutyFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Duty</option>
              {dutyOptions.map((duty) => (
                <option key={duty} value={duty}>
                  {duty.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => teachersQuery.refetch()}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Muat Ulang
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {teachersQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : teachersQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">Gagal memuat data guru.</div>
        ) : filteredTeachers.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Tidak ada data guru yang cocok dengan filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duty</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium">{teacher.name}</div>
                      <div className="text-xs text-gray-500">{teacher.verificationStatus || '-'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">@{teacher.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{teacher.email || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(teacher.additionalDuties || []).length
                        ? (teacher.additionalDuties || []).map((duty) => duty.replace(/_/g, ' ')).join(', ')
                        : '-'}
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
};

const PrincipalFinancePage = () => {
  const location = useLocation();
  const queryClient = useQueryClient();

  const isFinancePage = location.pathname.startsWith('/principal/finance');

  const { data: yearsData } = useQuery({
    queryKey: ['academic-years', 'principal-finance'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
    enabled: isFinancePage,
  });

  const academicYears: AcademicYear[] =
    yearsData?.data?.academicYears || yearsData?.academicYears || [];

  const activeYear = academicYears.find((y) => y.isActive) || academicYears[0];

  const [selectedYearId, setSelectedYearId] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'ALL',
  );
  const [search, setSearch] = useState('');
  const [selectedForApprove, setSelectedForApprove] = useState<BudgetRequest | null>(null);
  const [selectedForReject, setSelectedForReject] = useState<BudgetRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const effectiveYearId = useMemo(
    () => (selectedYearId === 'all' ? undefined : selectedYearId || activeYear?.id),
    [selectedYearId, activeYear],
  );

  const { data: budgetsData, isLoading } = useQuery({
    queryKey: ['budget-requests', 'principal', effectiveYearId],
    queryFn: () =>
      budgetRequestService.list({
        academicYearId: effectiveYearId,
        view: 'approver',
      }),
    enabled: isFinancePage && !!activeYear,
  });

  const { data: financeWriteOffsData, isLoading: isWriteOffsLoading } = useQuery({
    queryKey: ['principal-finance-write-offs'],
    queryFn: () => staffFinanceService.listWriteOffs({ pendingFor: 'PRINCIPAL', limit: 50 }),
    enabled: isFinancePage,
  });

  const { data: financePaymentReversalsData, isLoading: isPaymentReversalsLoading } = useQuery({
    queryKey: ['principal-finance-payment-reversals'],
    queryFn: () => staffFinanceService.listPaymentReversals({ pendingFor: 'PRINCIPAL', limit: 50 }),
    enabled: isFinancePage,
  });

  const { data: financeCashSessionsData, isLoading: isFinanceCashSessionsLoading } = useQuery({
    queryKey: ['principal-finance-cash-sessions'],
    queryFn: () => staffFinanceService.listCashSessions({ mine: false, limit: 8 }),
    enabled: isFinancePage,
  });

  const { data: financeCashSessionApprovalsData, isLoading: isFinanceCashSessionApprovalsLoading } = useQuery({
    queryKey: ['principal-finance-cash-session-approvals'],
    queryFn: () => staffFinanceService.listCashSessions({ pendingFor: 'PRINCIPAL', limit: 20 }),
    enabled: isFinancePage,
  });

  const { data: financeBankReconciliationsData, isLoading: isFinanceBankReconciliationsLoading } = useQuery({
    queryKey: ['principal-finance-bank-reconciliations'],
    queryFn: () => staffFinanceService.listBankReconciliations({ limit: 8 }),
    enabled: isFinancePage,
  });

  const { data: financeBudgetRealizationData, isLoading: isFinanceBudgetRealizationLoading } = useQuery({
    queryKey: ['principal-finance-budget-realization', effectiveYearId || 'none'],
    queryFn: () =>
      staffFinanceService.getBudgetRealizationSummary({
        academicYearId: effectiveYearId,
        limit: 8,
      }),
    enabled: isFinancePage,
  });

  const { data: financeGovernanceData, isLoading: isFinanceGovernanceLoading } = useQuery({
    queryKey: ['principal-finance-governance', effectiveYearId || 'none'],
    queryFn: () =>
      staffFinanceService.getGovernanceSummary({
        academicYearId: effectiveYearId,
        limit: 6,
      }),
    enabled: isFinancePage,
  });

  const { data: financeAuditData, isLoading: isFinanceAuditLoading } = useQuery({
    queryKey: ['principal-finance-audit'],
    queryFn: () =>
      staffFinanceService.getAuditSummary({
        days: 30,
        limit: 6,
      }),
    enabled: isFinancePage,
  });

  const { data: financeClosingPeriodsData, isLoading: isFinanceClosingPeriodsLoading } = useQuery({
    queryKey: ['principal-finance-closing-periods'],
    queryFn: () => staffFinanceService.listClosingPeriods({ limit: 8 }),
    enabled: isFinancePage,
  });

  const { data: financeClosingPeriodApprovalsData, isLoading: isFinanceClosingPeriodApprovalsLoading } = useQuery({
    queryKey: ['principal-finance-closing-period-approvals'],
    queryFn: () => staffFinanceService.listClosingPeriods({ pendingFor: 'PRINCIPAL', limit: 20 }),
    enabled: isFinancePage,
  });

  let budgets: BudgetRequest[] = budgetsData?.data || budgetsData || [];

  if (statusFilter !== 'ALL') {
    budgets = budgets.filter((b) => b.status === statusFilter);
  }

  const searchTerm = search.trim().toLowerCase();
  if (searchTerm) {
    budgets = budgets.filter((b) => {
      const title = (b.title || '').toLowerCase();
      const desc = (b.description || '').toLowerCase();
      const requester = (b.requester?.name || '').toLowerCase();
      return (
        title.includes(searchTerm) || desc.includes(searchTerm) || requester.includes(searchTerm)
      );
    });
  }

  const updateStatusMutation = useMutation({
    mutationFn: (params: { id: number; payload: UpdateBudgetRequestStatusPayload }) =>
      budgetRequestService.updateStatus(params.id, params.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-requests'] });
      toast.success('Status pengajuan anggaran diperbarui');
      setSelectedForApprove(null);
      setSelectedForReject(null);
      setRejectionReason('');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui status pengajuan');
    },
  });

  const principalWriteOffMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decideWriteOffAsPrincipal(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['principal-finance-write-offs'] });
      toast.success(payload.approved ? 'Write-off disetujui' : 'Write-off ditolak');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval write-off');
    },
  });

  const principalPaymentReversalMutation = useMutation({
    mutationFn: (payload: { requestId: number; approved: boolean }) =>
      staffFinanceService.decidePaymentReversalAsPrincipal(payload.requestId, {
        approved: payload.approved,
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['principal-finance-payment-reversals'] });
      toast.success(payload.approved ? 'Reversal pembayaran disetujui' : 'Reversal pembayaran ditolak');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval reversal pembayaran');
    },
  });

  const principalCashSessionDecisionMutation = useMutation({
    mutationFn: (payload: { sessionId: number; approved: boolean }) =>
      staffFinanceService.decideCashSessionAsPrincipal(payload.sessionId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Settlement kas ditolak oleh Kepala Sekolah',
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['principal-finance-cash-session-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['principal-finance-cash-sessions'] });
      toast.success(payload.approved ? 'Settlement kas disetujui' : 'Settlement kas ditolak');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses settlement kas');
    },
  });

  const principalClosingPeriodDecisionMutation = useMutation({
    mutationFn: (payload: { periodId: number; approved: boolean }) =>
      staffFinanceService.decideClosingPeriodAsPrincipal(payload.periodId, {
        approved: payload.approved,
        note: payload.approved ? undefined : 'Closing period ditolak oleh Kepala Sekolah',
      }),
    onSuccess: (_, payload) => {
      queryClient.invalidateQueries({ queryKey: ['principal-finance-closing-periods'] });
      queryClient.invalidateQueries({ queryKey: ['principal-finance-closing-period-approvals'] });
      toast.success(payload.approved ? 'Closing period disetujui' : 'Closing period ditolak');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memproses approval closing period');
    },
  });

  const handleApprove = () => {
    if (!selectedForApprove) return;
    updateStatusMutation.mutate({
      id: selectedForApprove.id,
      payload: { status: 'APPROVED' },
    });
  };

  const handleReject = () => {
    if (!selectedForReject) return;
    updateStatusMutation.mutate({
      id: selectedForReject.id,
      payload: {
        status: 'REJECTED',
        rejectionReason: rejectionReason || undefined,
      },
    });
  };

  if (!isFinancePage) {
    return <PrincipalHomePage />;
  }

  const totalAmount = budgets.reduce((sum, b) => sum + b.totalAmount, 0);
  const pendingPrincipalWriteOffs = financeWriteOffsData?.requests || [];
  const pendingPrincipalPaymentReversals = financePaymentReversalsData?.requests || [];
  const financeCashSessions = financeCashSessionsData?.sessions || [];
  const pendingPrincipalCashSessions = financeCashSessionApprovalsData?.sessions || [];
  const financeCashSessionSummary = financeCashSessionsData?.summary;
  const financeBankReconciliations = financeBankReconciliationsData?.reconciliations || [];
  const financeBankReconciliationSummary = financeBankReconciliationsData?.summary;
  const financeBudgetRealization = financeBudgetRealizationData || null;
  const financeGovernance = financeGovernanceData || null;
  const financeAudit = financeAuditData || null;
  const financeClosingPeriods = financeClosingPeriodsData?.periods || [];
  const financeClosingPeriodSummary = financeClosingPeriodsData?.summary;
  const pendingPrincipalClosingPeriods = financeClosingPeriodApprovalsData?.periods || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Laporan Pengajuan Anggaran</h2>
          <p className="mt-1 text-sm text-gray-500">
            Tinjau dan putuskan pengajuan anggaran yang diajukan oleh Wakasek dan unit lain.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari uraian, judul, atau pengaju..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-64"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED')
              }
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Status</option>
              <option value="PENDING">Menunggu</option>
              <option value="APPROVED">Disetujui</option>
              <option value="REJECTED">Ditolak</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Tahun Ajaran
            </span>
            <select
              value={selectedYearId === 'all' ? 'all' : String(selectedYearId || activeYear?.id || '')}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'all') {
                  setSelectedYearId('all');
                } else {
                  setSelectedYearId(Number(value));
                }
              }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="all">Semua</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                  {year.isActive ? ' (Aktif)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-1">
            Total Nominal Pengajuan
          </span>
          <span className="text-lg font-bold text-blue-600">
            Rp {totalAmount.toLocaleString('id-ID')}
          </span>
          <span className="text-[11px] text-gray-400 mt-0.5">
            {budgets.length} pengajuan ditemukan
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : budgets.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada pengajuan anggaran untuk filter ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    No
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Uraian / Kegiatan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit / Jabatan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pengaju
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    QTY
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Harga Satuan
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {budgets.map((budget, index) => (
                  <tr key={budget.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <div className="font-medium text-gray-900">{budget.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{budget.description}</div>
                      {budget.executionTime && (
                        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-[11px] text-blue-700 font-medium">
                          Jadwal: {budget.executionTime}
                        </div>
                      )}
                      {budget.brand && (
                        <div className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                          Merek: {budget.brand}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-50 text-[11px] text-gray-700 font-medium">
                        {budget.additionalDuty.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {budget.requester?.name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {budget.quantity}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      Rp {budget.unitPrice.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      Rp {budget.totalAmount.toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          budget.status === 'APPROVED'
                            ? 'bg-green-100 text-green-800'
                            : budget.status === 'REJECTED'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {budget.status === 'APPROVED'
                          ? 'Disetujui'
                          : budget.status === 'REJECTED'
                          ? 'Ditolak'
                          : 'Menunggu'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {budget.status === 'PENDING' ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => setSelectedForApprove(budget)}
                            disabled={updateStatusMutation.isPending}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Setujui
                          </button>
                          <button
                            onClick={() => {
                              setSelectedForReject(budget);
                              setRejectionReason('');
                            }}
                            disabled={updateStatusMutation.isPending}
                            className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Tidak ada aksi</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Governance Summary</h3>
            <p className="mt-1 text-xs text-gray-500">
              Ringkasan kontrol finance untuk melihat area risiko utama sebelum keputusan pimpinan diambil.
            </p>
          </div>
          {financeGovernance ? (
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPrincipalGovernanceRiskTone(financeGovernance.overview.riskLevel).className}`}>
              {getPrincipalGovernanceRiskTone(financeGovernance.overview.riskLevel).label}
            </span>
          ) : null}
        </div>

        {isFinanceGovernanceLoading ? (
          <div className="flex items-center justify-center py-10">
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
                {financeGovernance.overview.attentionItems} item perhatian • {formatFinanceCurrency(financeGovernance.overview.attentionAmount)}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-rose-700/80">Kolektibilitas</div>
                <div className="mt-2 text-lg font-bold text-rose-900">{financeGovernance.collection.criticalCount} kritis</div>
                <div className="mt-1 text-xs text-rose-800/80">
                  High {financeGovernance.collection.highPriorityCount} • overdue {formatFinanceCurrency(financeGovernance.collection.overdueOutstanding)}
                </div>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-sky-700/80">Treasury</div>
                <div className="mt-2 text-lg font-bold text-sky-900">
                  {financeGovernance.treasury.openCashSessions + financeGovernance.treasury.openBankReconciliations} terbuka
                </div>
                <div className="mt-1 text-xs text-sky-800/80">
                  Pending verifikasi {formatFinanceCurrency(financeGovernance.treasury.pendingBankVerificationAmount)}
                </div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-amber-700/80">Approval</div>
                <div className="mt-2 text-lg font-bold text-amber-900">{financeGovernance.approvals.totalPendingCount} menunggu</div>
                <div className="mt-1 text-xs text-amber-800/80">
                  Nilai approval {formatFinanceCurrency(financeGovernance.approvals.totalPendingAmount)}
                </div>
              </div>
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
                <div className="text-xs uppercase tracking-wider text-violet-700/80">Budget & Closing</div>
                <div className="mt-2 text-lg font-bold text-violet-900">
                  {financeGovernance.budgetControl.followUpCount + financeGovernance.closingControl.reviewCount} blocker
                </div>
                <div className="mt-1 text-xs text-violet-800/80">
                  Pending closing {formatFinanceCurrency(financeGovernance.closingControl.pendingVerificationAmount)}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h4 className="text-sm font-semibold text-gray-900">Antrian Prioritas</h4>
              </div>
              {!financeGovernance.followUpQueue.length ? (
                <div className="px-4 py-6 text-sm text-gray-500">Belum ada antrian governance yang memerlukan tindakan.</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {financeGovernance.followUpQueue.map((item) => (
                    <div key={item.key} className="px-4 py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getPrincipalGovernanceSeverityTone(item.severity).className}`}>
                            {item.severity}
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">{item.category}</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-gray-900">{item.title}</div>
                        <div className="mt-1 text-xs text-gray-500">{item.detail}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {item.referenceLabel ? `${item.referenceLabel} • ` : ''}
                          {item.updatedAt ? formatFinanceDate(item.updatedAt) : 'Perlu ditinjau'}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                        {formatFinanceCurrency(item.amount)}
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
          <h3 className="text-sm font-semibold text-gray-900">Audit Finance 30 Hari</h3>
          <p className="mt-1 text-xs text-gray-500">
            Ringkasan policy, approval sensitif, dan kontrol treasury terbaru untuk keputusan Kepala Sekolah.
          </p>
        </div>

        {isFinanceAuditLoading ? (
          <div className="flex items-center justify-center py-10">
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
                          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getPrincipalGovernanceSeverityTone(event.severity).className}`}>
                            {event.severity}
                          </span>
                          <span className="text-[11px] font-medium text-gray-500">{event.category}</span>
                        </div>
                        <div className="mt-2 text-sm font-semibold text-gray-900">{event.label}</div>
                        <div className="mt-1 text-xs text-gray-500">{event.summary}</div>
                        <div className="mt-1 text-xs text-gray-400">
                          {event.actor.label} • {formatFinanceDate(event.createdAt)}
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

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Settlement Kas Harian</h3>
            <p className="mt-1 text-xs text-gray-500">
              Monitoring sesi kas bendahara untuk memastikan expected closing dan selisih settlement tetap terkendali.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <div className="text-amber-700">Sesi terbuka</div>
              <div className="mt-1 font-semibold text-amber-900">{financeCashSessionSummary?.openCount || 0}</div>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="text-rose-700">Total selisih</div>
              <div className="mt-1 font-semibold text-rose-900">
                Rp {Math.round(financeCashSessionSummary?.totalVarianceAmount || 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2">
              <div className="text-sky-700">Pending Head TU</div>
              <div className="mt-1 font-semibold text-sky-900">{financeCashSessionSummary?.pendingHeadTuCount || 0}</div>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
              <div className="text-violet-700">Pending Kepsek</div>
              <div className="mt-1 font-semibold text-violet-900">{financeCashSessionSummary?.pendingPrincipalCount || 0}</div>
            </div>
          </div>
        </div>

        {isFinanceCashSessionsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : financeCashSessions.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada sesi kas harian yang tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sesi
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected Closing
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktual
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Selisih
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Approval
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {financeCashSessions.map((session: FinanceCashSession) => (
                  <tr key={session.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{session.sessionNo}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">{session.status === 'OPEN' ? 'Masih dibuka' : 'Sudah ditutup'}</div>
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
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                          session.approvalStatus === 'PENDING_PRINCIPAL'
                            ? 'bg-sky-50 text-sky-700 border border-sky-200'
                            : session.approvalStatus === 'PENDING_HEAD_TU'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : session.approvalStatus === 'REJECTED'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {session.approvalStatus === 'PENDING_PRINCIPAL'
                          ? 'Menunggu Kepsek'
                          : session.approvalStatus === 'PENDING_HEAD_TU'
                            ? 'Menunggu Head TU'
                            : session.approvalStatus === 'REJECTED'
                              ? 'Ditolak'
                              : session.approvalStatus === 'AUTO_APPROVED'
                                ? 'Auto Approved'
                                : 'Disetujui'}
                      </span>
                      {session.principalDecision.note ? (
                        <div className="mt-1 text-xs text-gray-500">{session.principalDecision.note}</div>
                      ) : session.headTuDecision.note ? (
                        <div className="mt-1 text-xs text-gray-500">{session.headTuDecision.note}</div>
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
              Monitoring transaksi bank non-tunai untuk melihat variance, statement gap, dan item yang belum matched.
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
              <div className="mt-1 font-semibold text-amber-900">
                Rp {Math.round(financeBankReconciliationSummary?.totalVarianceAmount || 0).toLocaleString('id-ID')}
              </div>
            </div>
            <div className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
              <div className="text-rose-700">Unmatched</div>
              <div className="mt-1 font-semibold text-rose-900">{financeBankReconciliationSummary?.totalUnmatchedStatementEntries || 0}</div>
            </div>
          </div>
        </div>

        {isFinanceBankReconciliationsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : financeBankReconciliations.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada rekonsiliasi bank yang tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rekonsiliasi
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected Closing
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Statement Closing
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variance
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
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
                        {new Date(reconciliation.periodStart).toLocaleDateString('id-ID')} - {new Date(reconciliation.periodEnd).toLocaleDateString('id-ID')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      Rp {Math.round(reconciliation.summary.expectedClosingBalance || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      Rp {Math.round(reconciliation.summary.statementComputedClosingBalance || 0).toLocaleString('id-ID')}
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-semibold ${Number(reconciliation.summary.varianceAmount || 0) === 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      Rp {Math.round(reconciliation.summary.varianceAmount || 0).toLocaleString('id-ID')}
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
              Monitoring anggaran approved, progres LPJ, actual spent, dan variance untuk melihat kesehatan realisasi finance sebelum periode ditutup.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="text-slate-700">Approved</div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatFinanceCurrency(financeBudgetRealization?.overview.approvedBudgetAmount || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="text-emerald-700">Actual</div>
              <div className="mt-1 font-semibold text-emerald-900">
                {formatFinanceCurrency(financeBudgetRealization?.overview.actualRealizedAmount || 0)}
              </div>
            </div>
            <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
              <div className="text-violet-700">Variance</div>
              <div className="mt-1 font-semibold text-violet-900">
                {formatFinanceCurrency(financeBudgetRealization?.overview.varianceAmount || 0)}
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

        {isFinanceBudgetRealizationLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : !financeBudgetRealization ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Ringkasan budget vs realization belum tersedia.
          </div>
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
                          {formatFinanceCurrency(row.approvedBudgetAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">
                          {formatFinanceCurrency(row.actualRealizedAmount)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-violet-700">
                          {formatFinanceCurrency(row.varianceAmount)}
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
                    const stageTone = getPrincipalBudgetProgressTone(row.stage);
                    return (
                      <div key={`principal-budget-${row.budgetId}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
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
                            <div className="mt-1 font-semibold text-slate-900">{formatFinanceCurrency(row.approvedBudgetAmount)}</div>
                          </div>
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
                            <div className="text-emerald-700">Actual</div>
                            <div className="mt-1 font-semibold text-emerald-900">{formatFinanceCurrency(row.actualRealizedAmount)}</div>
                          </div>
                          <div className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2">
                            <div className="text-violet-700">Variance</div>
                            <div className="mt-1 font-semibold text-violet-900">{formatFinanceCurrency(row.varianceAmount)}</div>
                          </div>
                        </div>
                        <div className="mt-2 text-[11px] text-slate-500">
                          {row.pendingSince ? `Sejak ${formatFinanceDate(row.pendingSince)}` : 'Belum ada tanggal stage'} • {row.daysInStage} hari
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
              Monitoring lock periode finance untuk melihat apakah snapshot kas, bank, dan outstanding sudah siap ditutup final.
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
                {formatFinanceCurrency(financeClosingPeriodSummary?.totalPendingVerificationAmount || 0)}
              </div>
            </div>
          </div>
        </div>

        {isFinanceClosingPeriodsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : financeClosingPeriods.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada closing period finance yang tercatat.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Periode
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Outstanding
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending / Unmatched
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Saldo Kas / Bank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {financeClosingPeriods.map((period: FinanceClosingPeriod) => (
                  <tr key={period.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{period.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {period.periodNo} • {formatFinanceDate(period.periodStart)} - {formatFinanceDate(period.periodEnd)}
                      </div>
                      {period.requestedBy?.name ? (
                        <div className="text-xs text-gray-500 mt-1">Diajukan {period.requestedBy.name}</div>
                      ) : null}
                      {period.headTuDecisionNote ? (
                        <div className="text-xs text-gray-500 mt-1">Review Head TU: {period.headTuDecisionNote}</div>
                      ) : null}
                      {period.principalDecisionNote ? (
                        <div className="text-xs text-gray-500 mt-1">Keputusan Kepsek: {period.principalDecisionNote}</div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      {formatFinanceCurrency(period.summary.outstandingAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      <div>{formatFinanceCurrency(period.summary.pendingVerificationAmount)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatFinanceCurrency(period.summary.unmatchedBankAmount)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      <div>{formatFinanceCurrency(period.summary.cashClosingBalance)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatFinanceCurrency(period.summary.bankClosingBalance)}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getPrincipalClosingPeriodStatusTone(period).className}`}>
                          {getPrincipalClosingPeriodStatusTone(period).label}
                        </span>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${getPrincipalClosingPeriodApprovalTone(period).className}`}>
                          {getPrincipalClosingPeriodApprovalTone(period).label}
                        </span>
                      </div>
                      {period.closedAt ? (
                        <div className="mt-1 text-xs text-emerald-700">
                          Locked {formatFinanceDate(period.closedAt)}
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
              Review closing period yang sudah lolos Head TU atau masuk ambang eskalasi Kepala Sekolah.
            </p>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {pendingPrincipalClosingPeriods.length} menunggu
          </span>
        </div>

        {isFinanceClosingPeriodApprovalsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : pendingPrincipalClosingPeriods.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada closing period yang menunggu persetujuan Kepala Sekolah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Periode
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Outstanding
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending / Unmatched
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingPrincipalClosingPeriods.map((period: FinanceClosingPeriod) => (
                  <tr key={period.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{period.label}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {period.periodNo} • {formatFinanceDate(period.periodStart)} - {formatFinanceDate(period.periodEnd)}
                      </div>
                      {period.headTuDecisionNote ? (
                        <div className="text-xs text-gray-500 mt-1">Review Head TU: {period.headTuDecisionNote}</div>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      {formatFinanceCurrency(period.summary.outstandingAmount)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-700">
                      <div>{formatFinanceCurrency(period.summary.pendingVerificationAmount)}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatFinanceCurrency(period.summary.unmatchedBankAmount)}
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
                            principalClosingPeriodDecisionMutation.mutate({ periodId: period.id, approved: false })
                          }
                          disabled={principalClosingPeriodDecisionMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            principalClosingPeriodDecisionMutation.mutate({ periodId: period.id, approved: true })
                          }
                          disabled={principalClosingPeriodDecisionMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Setujui
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
            <h3 className="text-sm font-semibold text-gray-900">Approval Settlement Kas</h3>
            <p className="mt-1 text-xs text-gray-500">
              Review settlement kas yang sudah lolos Head TU dan masuk ambang eskalasi Kepala Sekolah.
            </p>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {pendingPrincipalCashSessions.length} menunggu
          </span>
        </div>

        {isFinanceCashSessionApprovalsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : pendingPrincipalCashSessions.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada settlement kas yang menunggu persetujuan Kepala Sekolah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sesi
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expected
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aktual
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Selisih
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingPrincipalCashSessions.map((session: FinanceCashSession) => (
                  <tr key={session.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      <div className="font-semibold text-gray-900">{session.sessionNo}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(session.businessDate).toLocaleDateString('id-ID')} • {session.openedBy?.name || '-'}
                      </div>
                      {session.headTuDecision.note ? (
                        <div className="text-xs text-gray-500 mt-1">Review Head TU: {session.headTuDecision.note}</div>
                      ) : null}
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
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => principalCashSessionDecisionMutation.mutate({ sessionId: session.id, approved: false })}
                          disabled={principalCashSessionDecisionMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => principalCashSessionDecisionMutation.mutate({ sessionId: session.id, approved: true })}
                          disabled={principalCashSessionDecisionMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Setujui
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
            <h3 className="text-sm font-semibold text-gray-900">Approval Write-Off Piutang</h3>
            <p className="mt-1 text-xs text-gray-500">
              Review pengajuan penghapusan piutang yang sudah lolos review Kepala TU.
            </p>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {pendingPrincipalWriteOffs.length} menunggu
          </span>
        </div>

        {isWriteOffsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : pendingPrincipalWriteOffs.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada pengajuan write-off yang menunggu persetujuan Kepala Sekolah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pengajuan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Invoice
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nominal
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingPrincipalWriteOffs.map((request: FinanceWriteOffRequest) => (
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
                      <div className="text-xs text-emerald-700 mt-1">
                        Rekomendasi Rp {Math.round(Number(request.approvedAmount || request.requestedAmount)).toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => principalWriteOffMutation.mutate({ requestId: request.id, approved: false })}
                          disabled={principalWriteOffMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => principalWriteOffMutation.mutate({ requestId: request.id, approved: true })}
                          disabled={principalWriteOffMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Setujui
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
              Review pengajuan reversal pembayaran yang sudah lolos review Kepala TU.
            </p>
          </div>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            {pendingPrincipalPaymentReversals.length} menunggu
          </span>
        </div>

        {isPaymentReversalsLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : pendingPrincipalPaymentReversals.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada pengajuan reversal pembayaran yang menunggu persetujuan Kepala Sekolah.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pengajuan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pembayaran
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nominal
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingPrincipalPaymentReversals.map((request: FinancePaymentReversalRequest) => (
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
                      <div className="text-xs text-emerald-700 mt-1">
                        Alokasi Rp {Math.round(Number(request.approvedAllocatedAmount || request.requestedAllocatedAmount || 0)).toLocaleString('id-ID')} • kredit Rp {Math.round(Number(request.approvedCreditedAmount || request.requestedCreditedAmount || 0)).toLocaleString('id-ID')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => principalPaymentReversalMutation.mutate({ requestId: request.id, approved: false })}
                          disabled={principalPaymentReversalMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          Tolak
                        </button>
                        <button
                          type="button"
                          onClick={() => principalPaymentReversalMutation.mutate({ requestId: request.id, approved: true })}
                          disabled={principalPaymentReversalMutation.isPending}
                          className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Setujui
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

      {selectedForApprove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setSelectedForApprove(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-emerald-50/60">
              <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Setujui Pengajuan Anggaran</h3>
                <p className="text-xs text-gray-500">
                  Pengajuan akan disetujui dan diteruskan ke Staff Keuangan untuk proses realisasi.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedForApprove.title}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedForApprove.description}
                </div>
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setSelectedForApprove(null)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={updateStatusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {updateStatusMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Setujui
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedForReject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => {
            setSelectedForReject(null);
            setRejectionReason('');
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 bg-red-50/50">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Tolak Pengajuan Anggaran</h3>
                <p className="text-xs text-gray-500">
                  Berikan alasan penolakan agar pengaju dapat melakukan perbaikan.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <div className="text-sm font-medium text-gray-900">
                  {selectedForReject.title}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedForReject.description}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Alasan Penolakan (opsional)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/60"
                  placeholder="Contoh: Anggaran melebihi plafon, mohon disesuaikan kembali."
                />
              </div>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedForReject(null);
                  setRejectionReason('');
                }}
                className="px-4 py-2 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={updateStatusMutation.isPending}
                className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {updateStatusMutation.isPending && (
                  <Loader2 className="w-4 h-4 animate-spin" />
                )}
                Tolak Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const PrincipalExamReportsPage = () => {
  const [examTypeFilter, setExamTypeFilter] = useState<string>('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [absentModalRow, setAbsentModalRow] = useState<PrincipalProctorReportRow | null>(null);

  const { data: activeYearData } = useQuery({
    queryKey: ['principal-active-academic-year', 'exam-reports'],
    queryFn: academicYearService.getActiveSafe,
    staleTime: 1000 * 60 * 5,
  });

  const activeAcademicYearId = activeYearData?.data?.id;

  const reportsQuery = useQuery({
    queryKey: ['principal-exam-proctor-reports', activeAcademicYearId, examTypeFilter, selectedDate],
    enabled: Boolean(activeAcademicYearId),
    queryFn: async () => {
      const response = await api.get('/proctoring/reports', {
        params: {
          academicYearId: activeAcademicYearId,
          examType: examTypeFilter !== 'ALL' ? examTypeFilter : undefined,
          date: selectedDate || undefined,
        },
      });
      const payload = response?.data?.data || {};
      return {
        rows: Array.isArray(payload.rows) ? (payload.rows as PrincipalProctorReportRow[]) : [],
        summary: (payload.summary || {
          totalRooms: 0,
          totalExpected: 0,
          totalPresent: 0,
          totalAbsent: 0,
          reportedRooms: 0,
        }) as PrincipalProctorReportSummary,
      } as PrincipalProctorReportsResponse;
    },
  });

  const rows = reportsQuery.data?.rows || [];
  const summary = reportsQuery.data?.summary || {
    totalRooms: 0,
    totalExpected: 0,
    totalPresent: 0,
    totalAbsent: 0,
    reportedRooms: 0,
  };

  const examTypeOptions = useMemo(() => {
    const options = new Set<string>();
    rows.forEach((row) => {
      const examType = String(row.examType || '').trim().toUpperCase();
      if (examType) options.add(examType);
    });
    return Array.from(options.values()).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Monitoring Berita Acara Ujian</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pantau berita acara pengawas ruang secara real-time sebagai bahan monitoring Kepala Sekolah.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={examTypeFilter}
              onChange={(e) => setExamTypeFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Jenis Ujian</option>
              {examTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => reportsQuery.refetch()}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Muat Ulang
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-sky-100/85 p-4">
          <p className="text-xs text-blue-700/80 font-medium">Ruang Aktif</p>
          <p className="text-2xl font-bold text-blue-900">{summary.totalRooms}</p>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-100/85 p-4">
          <p className="text-xs text-emerald-700/80 font-medium">Sudah Melapor</p>
          <p className="text-2xl font-bold text-emerald-900">{summary.reportedRooms}</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-gradient-to-br from-slate-50 to-gray-100/90 p-4">
          <p className="text-xs text-slate-600 font-medium">Peserta Hadir</p>
          <p className="text-2xl font-bold text-slate-900">{summary.totalPresent}</p>
        </div>
        <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-red-100/85 p-4">
          <p className="text-xs text-rose-700/80 font-medium">Peserta Tidak Hadir</p>
          <p className="text-2xl font-bold text-rose-900">{summary.totalAbsent}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {reportsQuery.isLoading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          </div>
        ) : reportsQuery.isError ? (
          <div className="py-10 text-center text-sm text-red-600">Gagal memuat berita acara pengawas.</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            Belum ada berita acara pada filter saat ini.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Waktu</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruang</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kelas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kehadiran</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pengawas</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Catatan</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, index) => (
                  <tr key={`${row.room || '-'}-${row.startTime}-${index}`}>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="font-medium text-gray-900">
                        {new Date(row.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        {' - '}
                        {new Date(row.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(row.startTime).toLocaleDateString('id-ID', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                        {row.sessionLabel ? ` • ${row.sessionLabel}` : ''}
                        {row.examType ? ` • ${row.examType}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.room || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.classNames.length > 0 ? row.classNames.join(', ') : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="font-medium">{row.presentParticipants}/{row.totalParticipants}</div>
                      {row.absentParticipants > 0 && Array.isArray(row.absentStudents) && row.absentStudents.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setAbsentModalRow(row)}
                          className="text-xs text-rose-700 hover:text-rose-800 hover:underline focus:outline-none focus:ring-2 focus:ring-rose-300/60 rounded-sm mt-1"
                        >
                          Tidak hadir: <span className="font-semibold">{row.absentParticipants}</span>
                        </button>
                      ) : (
                        <div className="text-xs text-gray-500 mt-1">
                          Tidak hadir: <span className="font-semibold">{row.absentParticipants}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {row.report?.proctor?.name || <span className="text-amber-700">Belum submit</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="max-w-md whitespace-pre-wrap">
                        {row.report?.notes || row.report?.incident || '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {absentModalRow &&
        createPortal(
          <div
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setAbsentModalRow(null)}
          >
            <div
              className="w-full max-w-4xl max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-2xl border border-gray-200"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Daftar Siswa Tidak Hadir</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {absentModalRow.room || 'Belum ditentukan'} •{' '}
                    {new Date(absentModalRow.startTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} -{' '}
                    {new Date(absentModalRow.endTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} WIB
                    {absentModalRow.sessionLabel ? ` • ${absentModalRow.sessionLabel}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAbsentModalRow(null)}
                  className="inline-flex items-center justify-center rounded-md border border-gray-200 p-2 text-gray-600 hover:bg-gray-50"
                  aria-label="Tutup popup siswa tidak hadir"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto max-h-[calc(85vh-78px)]">
                {!Array.isArray(absentModalRow.absentStudents) || absentModalRow.absentStudents.length === 0 ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                    Tidak ada data siswa tidak hadir.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border border-gray-200 rounded-lg overflow-hidden">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 w-14">No</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Nama Siswa</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 w-40">Kelas</th>
                          <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Keterangan Tidak Hadir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {absentModalRow.absentStudents.map((student, index) => (
                          <tr key={`principal-absent-student-${student.id}-${index}`} className="align-top">
                            <td className="px-3 py-2 text-sm text-gray-700">{index + 1}</td>
                            <td className="px-3 py-2">
                              <div className="text-sm font-medium text-gray-900">{student.name}</div>
                              {student.nis ? <div className="text-xs text-gray-500">NIS: {student.nis}</div> : null}
                            </td>
                            <td className="px-3 py-2 text-sm text-gray-700">{student.className || '-'}</td>
                            <td className="px-3 py-2 text-sm text-gray-700">{student.absentReason || 'Tanpa keterangan.'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

const PrincipalBpBkMonitoringPage = () => {
  const [search, setSearch] = useState('');
  const [overdueStatus, setOverdueStatus] = useState<'ALL' | 'OPEN' | 'IN_PROGRESS'>('ALL');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['principal-bpbk-monitoring'],
    queryFn: async () => {
      let activeAcademicYear: { id: number; name: string } | null = null;
      try {
        const activeYearRes = await academicYearService.getActiveSafe();
        activeAcademicYear = activeYearRes?.data || null;
      } catch {
        activeAcademicYear = null;
      }

      const summaryRes = await api
        .get('/bpbk/principal-summary', {
          params: {
            academicYearId: activeAcademicYear?.id,
          },
        })
        .then((response) => response.data?.data || null)
        .catch(() => null);

      return {
        academicYear: activeAcademicYear || summaryRes?.academicYear || null,
        summary: (summaryRes?.summary || {
          totalCases: 0,
          negativeCases: 0,
          highRiskStudents: 0,
          openCounselings: 0,
          inProgressCounselings: 0,
          closedCounselings: 0,
          summonPendingCounselings: 0,
          overdueCounselings: 0,
        }) as PrincipalOperationalMonitoringData['bpbkSummary'],
        highRiskStudents: Array.isArray(summaryRes?.highRiskStudents)
          ? (summaryRes.highRiskStudents as PrincipalOperationalMonitoringData['bpbkHighRiskStudents'])
          : [],
        overdueCounselings: Array.isArray(summaryRes?.overdueCounselings)
          ? (summaryRes.overdueCounselings as PrincipalOperationalMonitoringData['bpbkOverdueCounselings'])
          : [],
      };
    },
    staleTime: 60 * 1000,
  });

  const normalizedSearch = search.trim().toLowerCase();

  const highRiskStudents = useMemo(() => {
    const rows = data?.highRiskStudents || [];
    if (!normalizedSearch) return rows;
    return rows.filter((row) => {
      const haystacks = [row.studentName, row.nis || '', row.nisn || '', row.className || ''];
      return haystacks.some((item) => item.toLowerCase().includes(normalizedSearch));
    });
  }, [data?.highRiskStudents, normalizedSearch]);

  const overdueCounselings = useMemo(() => {
    const rows = data?.overdueCounselings || [];
    const filteredByStatus =
      overdueStatus === 'ALL' ? rows : rows.filter((row) => row.status === overdueStatus);

    if (!normalizedSearch) return filteredByStatus;
    return filteredByStatus.filter((row) => {
      const haystacks = [row.student.name, row.student.nis || '', row.student.nisn || '', row.issueSummary || ''];
      return haystacks.some((item) => item.toLowerCase().includes(normalizedSearch));
    });
  }, [data?.overdueCounselings, overdueStatus, normalizedSearch]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Ringkasan BP/BK</h2>
        <p className="mt-1 text-sm text-gray-500">
          Monitoring risiko perilaku siswa dan tindak lanjut konseling lintas kelas.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari siswa, NIS/NISN, atau ringkasan kasus..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60 w-72"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={overdueStatus}
              onChange={(event) => setOverdueStatus(event.target.value as 'ALL' | 'OPEN' | 'IN_PROGRESS')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/60"
            >
              <option value="ALL">Semua Status Konseling</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
        >
          Muat Ulang
        </button>
      </div>

      {isLoading ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      ) : isError || !data ? (
        <div className="bg-white rounded-xl border border-rose-100 p-6 text-sm text-rose-700">
          Gagal memuat ringkasan BP/BK.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50 to-indigo-100/85 p-4">
              <p className="text-xs font-medium text-violet-700/80">Siswa Risiko Tinggi</p>
              <p className="text-2xl font-bold text-violet-900 mt-1">{data.summary.highRiskStudents}</p>
              <p className="text-xs text-violet-700/80 mt-1">
                Threshold poin negatif {'>='} 20 atau kasus {'>='} 3
              </p>
            </div>
            <div className="rounded-xl border border-rose-100 bg-gradient-to-br from-rose-50 to-red-100/85 p-4">
              <p className="text-xs font-medium text-rose-700/80">Konseling Overdue</p>
              <p className="text-2xl font-bold text-rose-900 mt-1">{data.summary.overdueCounselings}</p>
              <p className="text-xs text-rose-700/80 mt-1">OPEN/IN_PROGRESS lebih dari 7 hari</p>
            </div>
            <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50 to-orange-100/85 p-4">
              <p className="text-xs font-medium text-amber-700/80">Kasus Negatif</p>
              <p className="text-2xl font-bold text-amber-900 mt-1">{data.summary.negativeCases}</p>
              <p className="text-xs text-amber-700/80 mt-1">Total catatan perilaku negatif aktif</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-100/85 p-4">
              <p className="text-xs font-medium text-sky-700/80">Kasus Konseling Aktif</p>
              <p className="text-2xl font-bold text-sky-900 mt-1">
                {data.summary.openCounselings + data.summary.inProgressCounselings}
              </p>
              <p className="text-xs text-sky-700/80 mt-1">
                OPEN {data.summary.openCounselings} • IN_PROGRESS {data.summary.inProgressCounselings}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-semibold text-gray-900">Daftar Siswa Risiko Tinggi</h3>
              </div>
              <div className="max-h-[380px] overflow-auto">
                {highRiskStudents.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">Tidak ada siswa risiko tinggi.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Siswa</th>
                        <th className="px-4 py-2 text-left">Kelas</th>
                        <th className="px-4 py-2 text-right">Kasus</th>
                        <th className="px-4 py-2 text-right">Poin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {highRiskStudents.map((row) => (
                        <tr key={`risk-${row.studentId}`}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{row.studentName}</div>
                            <div className="text-xs text-gray-500">{row.nis || row.nisn || '-'}</div>
                          </td>
                          <td className="px-4 py-2 text-gray-700">{row.className || '-'}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{row.negativeCaseCount}</td>
                          <td className="px-4 py-2 text-right font-semibold text-rose-700">{row.totalNegativePoint}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                <Clock3 className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-semibold text-gray-900">Tindak Lanjut Konseling Overdue</h3>
              </div>
              <div className="max-h-[380px] overflow-auto">
                {overdueCounselings.length === 0 ? (
                  <div className="px-4 py-8 text-sm text-gray-500 text-center">
                    Tidak ada konseling overdue untuk filter saat ini.
                  </div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">Siswa</th>
                        <th className="px-4 py-2 text-left">Status</th>
                        <th className="px-4 py-2 text-left">Tgl Sesi</th>
                        <th className="px-4 py-2 text-left">Konselor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overdueCounselings.map((row) => (
                        <tr key={`overdue-${row.id}`}>
                          <td className="px-4 py-2">
                            <div className="font-medium text-gray-900">{row.student.name}</div>
                            <div className="text-xs text-gray-500 line-clamp-1">{row.issueSummary}</div>
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                row.status === 'OPEN'
                                  ? 'bg-rose-50 text-rose-700'
                                  : 'bg-amber-50 text-amber-700'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {row.sessionDate ? new Date(row.sessionDate).toLocaleDateString('id-ID') : '-'}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{row.counselor?.name || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export const PrincipalDashboard = () => {
  return (
    <Routes>
      <Route index element={<PrincipalHomePage />} />
      <Route path="dashboard" element={<PrincipalHomePage />} />
      <Route path="overview" element={<PrincipalHomePage />} />
      <Route path="monitoring" element={<Navigate to="monitoring/operations" replace />} />
      <Route path="monitoring/operations" element={<PrincipalOperationalMonitoringPage />} />
      <Route path="monitoring/bpbk" element={<PrincipalBpBkMonitoringPage />} />
      <Route path="monitoring/osis" element={<OsisElectionMonitoringPage />} />
      <Route path="academic" element={<Navigate to="academic/reports" replace />} />
      <Route path="academic/reports" element={<ReportCardsPage />} />
      <Route path="academic/attendance" element={<AttendanceRecapPage />} />
      <Route path="exams" element={<Navigate to="exams/reports" replace />} />
      <Route path="exams/reports" element={<PrincipalExamReportsPage />} />
      <Route path="attendance" element={<AttendanceRecapPage />} />
      <Route path="students" element={<PrincipalStudentsPage />} />
      <Route path="teachers" element={<PrincipalTeachersPage />} />
      <Route path="finance" element={<PrincipalFinancePage />} />
      <Route path="finance/requests" element={<PrincipalFinancePage />} />
      <Route path="work-program-approvals" element={<WorkProgramApprovalsPage />} />
      <Route path="work-programs" element={<Navigate to="work-program-approvals" replace />} />
      <Route path="approvals" element={<PrincipalFinancePage />} />
      <Route path="assigned-inventory" element={<InventoryHubPage />} />
      <Route path="assigned-inventory/:roomId" element={<InventoryDetailPage />} />
      <Route path="*" element={<Navigate to="dashboard" replace />} />
    </Routes>
  );
};
