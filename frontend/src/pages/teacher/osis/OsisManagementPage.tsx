import { type ReactNode, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarDays,
  Layers3,
  Loader2,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useActiveAcademicYear } from '../../../hooks/useActiveAcademicYear';
import { examService, type ExamProgram } from '../../../services/exam.service';
import {
  osisService,
  type OsisElectionPeriod,
  type OsisDivision,
  type OsisGradeTemplatesPayload,
  type OsisJoinRequest,
  type OsisManagementPeriod,
  type OsisMembership,
  type OsisPosition,
} from '../../../services/osis.service';

type Semester = 'ODD' | 'EVEN';

interface ReportProgramOption {
  code: string;
  label: string;
  baseType: string;
  gradeComponentType: string;
  fixedSemester: Semester | null;
  displayOrder: number;
}

type GradePredicate = 'SB' | 'B' | 'C' | 'K';
type OsisManagementSection = 'PERIOD' | 'STRUCTURE' | 'MEMBERS' | 'ASSESSMENTS';

const DEFAULT_GRADE_TEMPLATES: OsisGradeTemplatesPayload['templates'] = {
  SB: { label: 'Sangat Baik (SB)', description: '' },
  B: { label: 'Baik (B)', description: '' },
  C: { label: 'Cukup (C)', description: '' },
  K: { label: 'Kurang (K)', description: '' },
};

function normalizeProgramCode(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function isMidtermAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['MIDTERM', 'SBTS', 'PTS', 'UTS'].includes(code)) return true;
  return code.includes('MIDTERM');
}

function isFinalEvenAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAT', 'PAT', 'PSAT', 'FINAL_EVEN'].includes(code)) return true;
  return code.includes('EVEN');
}

function isFinalOddAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['SAS', 'PAS', 'PSAS', 'FINAL_ODD'].includes(code)) return true;
  return code.includes('ODD');
}

function isFinalAliasCode(raw: unknown): boolean {
  const code = normalizeProgramCode(raw);
  if (!code) return false;
  if (['FINAL', 'SAS', 'SAT', 'PAS', 'PAT', 'PSAS', 'PSAT', 'FINAL_EVEN', 'FINAL_ODD'].includes(code)) {
    return true;
  }
  return code.includes('FINAL');
}

function resolveReportSlot(
  program: ReportProgramOption | null | undefined,
  semester: Semester,
): 'SBTS' | 'SAS' | 'SAT' | '' {
  if (!program) return '';
  const componentType = normalizeProgramCode(program.gradeComponentType);
  if (isMidtermAliasCode(componentType)) return 'SBTS';
  if (isFinalAliasCode(componentType)) {
    const fixedSemester = program.fixedSemester || null;
    if (fixedSemester === 'EVEN') return 'SAT';
    if (fixedSemester === 'ODD') return 'SAS';
    return semester === 'EVEN' ? 'SAT' : 'SAS';
  }
  const baseType = normalizeProgramCode(program.baseType);
  if (isFinalEvenAliasCode(baseType)) return 'SAT';
  if (isFinalOddAliasCode(baseType)) return 'SAS';
  if (isFinalAliasCode(baseType)) return semester === 'EVEN' ? 'SAT' : 'SAS';
  if (isMidtermAliasCode(baseType)) return 'SBTS';
  return '';
}

function formatProgramSemesterLabel(fixedSemester: Semester | null): string {
  if (fixedSemester === 'ODD') return 'Semester Ganjil';
  if (fixedSemester === 'EVEN') return 'Semester Genap';
  return 'Semua Semester';
}

function toDateInputValue(raw?: string | null): string {
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toDateTimePayload(rawDate: string, endOfDay = false): string {
  if (!rawDate) return '';
  const suffix = endOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z';
  return `${rawDate}${suffix}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null) {
    const response = 'response' in error ? (error as { response?: unknown }).response : null;
    if (typeof response === 'object' && response !== null) {
      const data = 'data' in response ? (response as { data?: unknown }).data : null;
      if (typeof data === 'object' && data !== null) {
        const message = 'message' in data ? (data as { message?: unknown }).message : null;
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }
  }

  return fallback;
}

function formatDateLabel(raw?: string | null): string {
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getManagementStatusMeta(status?: string | null) {
  if (status === 'ACTIVE') {
    return {
      label: 'Aktif',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }
  if (status === 'CLOSED') {
    return {
      label: 'Ditutup',
      className: 'border-slate-200 bg-slate-100 text-slate-700',
    };
  }
  return {
    label: 'Draft',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  };
}

function getWorkflowMeta(period?: OsisManagementPeriod | null) {
  if (!period) {
    return {
      label: 'Belum dibuat',
      description: 'Buat periode kepengurusan setelah pemilihan selesai.',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  if (!period.electionPeriodId || period.electionPeriod?.status !== 'CLOSED') {
    return {
      label: 'Menunggu hasil pemilihan',
      description: 'Hubungkan periode ini ke pemilihan OSIS yang sudah ditutup.',
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (!period.transitionLabel || !period.transitionAt) {
    return {
      label: 'Menunggu transisi kepengurusan',
      description: 'Catat mubes, rapat kepengurusan, atau pelantikan sebelum program kerja dibuka.',
      className: 'border-blue-200 bg-blue-50 text-blue-700',
    };
  }

  if (period.status !== 'ACTIVE') {
    return {
      label: 'Siap diaktifkan',
      description: 'Semua tahap awal sudah lengkap. Aktifkan periode agar program kerja OSIS terbuka.',
      className: 'border-violet-200 bg-violet-50 text-violet-700',
    };
  }

  return {
    label: 'Siap untuk program kerja',
    description: 'Periode aktif dan transisi kepengurusan sudah lengkap.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  };
}

function previewStructureCode(rawCode?: string | null, rawName?: string | null): string {
  return String(rawCode || rawName || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function OsisFormModal(props: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClass?: string;
}) {
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/55 px-4 py-6">
      <div
        className={`max-h-[90vh] w-full overflow-hidden rounded-3xl bg-white shadow-2xl ${
          props.maxWidthClass || 'max-w-3xl'
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{props.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{props.description}</p>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            x
          </button>
        </div>
        <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 py-6">{props.children}</div>
      </div>
    </div>
  );
}

export const OsisManagementPage = () => {
  const queryClient = useQueryClient();
  const { data: activeAcademicYear, isLoading: isLoadingActiveAcademicYear } = useActiveAcademicYear();
  const [activeSection, setActiveSection] = useState<OsisManagementSection>('PERIOD');
  const [selectedPeriodIdState, setSelectedPeriodIdState] = useState<number | null>(null);
  const [eligibleSearch, setEligibleSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [semester, setSemester] = useState<Semester>('ODD');
  const [reportType, setReportType] = useState('');
  const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isMembershipModalOpen, setIsMembershipModalOpen] = useState(false);

  const [periodForm, setPeriodForm] = useState({
    id: null as number | null,
    electionPeriodId: '',
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    transitionLabel: '',
    transitionAt: '',
    transitionNotes: '',
    status: 'DRAFT' as 'DRAFT' | 'ACTIVE' | 'CLOSED',
  });
  const [divisionForm, setDivisionForm] = useState({
    id: null as number | null,
    name: '',
    code: '',
    description: '',
    displayOrder: '',
  });
  const [positionForm, setPositionForm] = useState({
    id: null as number | null,
    name: '',
    code: '',
    description: '',
    divisionId: '',
    displayOrder: '',
  });
  const [membershipForm, setMembershipForm] = useState({
    id: null as number | null,
    requestId: '' as string,
    studentId: '',
    positionId: '',
    divisionId: '',
    joinedAt: '',
    endedAt: '',
    isActive: true,
  });
  const [templateEdits, setTemplateEdits] = useState<Record<string, OsisGradeTemplatesPayload['templates']>>({});
  const [gradeEdits, setGradeEdits] = useState<Record<string, Record<number, { grade: string; description: string }>>>({});

  const selectedAcademicYearId = useMemo(() => {
    const academicYearId = Number(activeAcademicYear?.id || activeAcademicYear?.academicYearId || 0);
    return Number.isFinite(academicYearId) && academicYearId > 0 ? academicYearId : null;
  }, [activeAcademicYear?.academicYearId, activeAcademicYear?.id]);

  const { data: managementPeriodsResponse, isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['osis-management-periods', selectedAcademicYearId],
    queryFn: () => osisService.getManagementPeriods({ academicYearId: selectedAcademicYearId || undefined }),
    enabled: !!selectedAcademicYearId,
  });

  const { data: electionPeriodsResponse } = useQuery({
    queryKey: ['osis-election-periods-for-management', selectedAcademicYearId],
    queryFn: () => osisService.getPeriods(selectedAcademicYearId ? { academicYearId: selectedAcademicYearId } : undefined),
    enabled: !!selectedAcademicYearId,
  });

  const periods = useMemo<OsisManagementPeriod[]>(
    () => (managementPeriodsResponse?.data || []) as OsisManagementPeriod[],
    [managementPeriodsResponse],
  );

  const electionPeriods = useMemo(
    () => ((electionPeriodsResponse?.data || []) as OsisElectionPeriod[]).filter((period) => period.status === 'CLOSED'),
    [electionPeriodsResponse],
  );

  const selectedPeriod = useMemo(() => {
    if (!periods.length) return null;
    if (
      selectedPeriodIdState &&
      periods.some((period) => Number(period.id) === Number(selectedPeriodIdState))
    ) {
      return periods.find((period) => Number(period.id) === Number(selectedPeriodIdState)) || null;
    }
    return periods.find((period) => period.status === 'ACTIVE') || periods[0] || null;
  }, [periods, selectedPeriodIdState]);

  const { data: workProgramReadinessResponse } = useQuery({
    queryKey: ['osis-work-program-readiness', selectedAcademicYearId],
    queryFn: () => osisService.getWorkProgramReadiness(selectedAcademicYearId ? { academicYearId: selectedAcademicYearId } : undefined),
    enabled: !!selectedAcademicYearId,
  });

  const workProgramReadiness = workProgramReadinessResponse?.data || null;

  const { data: divisionsResponse } = useQuery({
    queryKey: ['osis-divisions', selectedPeriod?.id],
    queryFn: () => osisService.getDivisions({ periodId: selectedPeriod!.id }),
    enabled: !!selectedPeriod?.id,
  });

  const { data: positionsResponse } = useQuery({
    queryKey: ['osis-positions', selectedPeriod?.id],
    queryFn: () => osisService.getPositions({ periodId: selectedPeriod!.id }),
    enabled: !!selectedPeriod?.id,
  });

  const divisions = useMemo<OsisDivision[]>(
    () => ((divisionsResponse?.data || []) as OsisDivision[]).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [divisionsResponse],
  );

  const positions = useMemo<OsisPosition[]>(
    () => ((positionsResponse?.data || []) as OsisPosition[]).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [positionsResponse],
  );

  const { data: reportProgramsData } = useQuery({
    queryKey: ['osis-report-programs', selectedAcademicYearId],
    queryFn: async () => {
      if (!selectedAcademicYearId) return [];
      const response = await examService.getPrograms({
        academicYearId: selectedAcademicYearId,
        roleContext: 'teacher',
        includeInactive: false,
      });
      return (response?.data?.programs || []) as ExamProgram[];
    },
    enabled: !!selectedAcademicYearId,
  });

  const reportPrograms = useMemo<ReportProgramOption[]>(() => {
    const programs = Array.isArray(reportProgramsData) ? reportProgramsData : [];
    const options: ReportProgramOption[] = [];

    for (const program of programs) {
      const baseType = String(program.baseTypeCode || program.baseType || '').toUpperCase();
      const gradeComponentType = String(
        program.gradeComponentTypeCode || program.gradeComponentType || '',
      ).toUpperCase();
      const isReportComponent =
        isMidtermAliasCode(gradeComponentType) ||
        isFinalAliasCode(gradeComponentType) ||
        isMidtermAliasCode(baseType) ||
        isFinalAliasCode(baseType);
      if (!isReportComponent || !program.isActive) continue;

      const fixedSemester = (program.fixedSemester as Semester | null) || null;
      const baseLabel = String(program.shortLabel || program.label || program.code || baseType).trim();
      options.push({
        code: String(program.code || '').toUpperCase(),
        label: `${baseLabel} • ${formatProgramSemesterLabel(fixedSemester)}`,
        baseType,
        gradeComponentType,
        fixedSemester,
        displayOrder: Number(program.order ?? 0),
      });
    }

    return options.sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));
  }, [reportProgramsData]);

  const effectiveSelectedReportType = useMemo(() => {
    if (!reportPrograms.length) return '';
    const exists = reportPrograms.some((option) => option.code === reportType);
    return exists ? reportType : reportPrograms[0].code;
  }, [reportPrograms, reportType]);

  const selectedReportProgram = useMemo(
    () => reportPrograms.find((option) => option.code === effectiveSelectedReportType) || null,
    [reportPrograms, effectiveSelectedReportType],
  );

  const effectiveSemester = selectedReportProgram?.fixedSemester || semester;
  const selectedReportSlot = useMemo(
    () => resolveReportSlot(selectedReportProgram, effectiveSemester),
    [selectedReportProgram, effectiveSemester],
  );
  const effectiveReportType = useMemo(
    () =>
      selectedReportSlot ||
      effectiveSelectedReportType ||
      selectedReportProgram?.code ||
      selectedReportProgram?.baseType ||
      '',
    [
      effectiveSelectedReportType,
      selectedReportProgram,
      selectedReportSlot,
    ],
  );

  const { data: membershipsResponse, isLoading: isLoadingMemberships } = useQuery({
    queryKey: [
      'osis-memberships',
      selectedPeriod?.id,
      effectiveSemester,
      selectedReportProgram?.code,
      effectiveReportType,
    ],
    queryFn: () =>
      osisService.getMemberships({
        periodId: selectedPeriod!.id,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
      }),
    enabled: !!selectedPeriod?.id && !!effectiveSemester && !!effectiveReportType,
  });

  const memberships = useMemo<OsisMembership[]>(
    () => ((membershipsResponse?.data?.memberships || []) as OsisMembership[]),
    [membershipsResponse],
  );

  const { data: joinRequestsResponse, isLoading: isLoadingJoinRequests } = useQuery({
    queryKey: ['osis-join-requests', selectedAcademicYearId],
    queryFn: () =>
      osisService.getJoinRequests({
        academicYearId: selectedAcademicYearId || undefined,
        status: 'PENDING',
      }),
    enabled: !!selectedAcademicYearId,
  });

  const joinRequests = useMemo<OsisJoinRequest[]>(
    () => ((joinRequestsResponse?.data || []) as OsisJoinRequest[]),
    [joinRequestsResponse],
  );

  const { data: eligibleStudentsResponse } = useQuery({
    queryKey: ['osis-eligible-students', selectedAcademicYearId, eligibleSearch],
    queryFn: () =>
      osisService.getEligibleStudents({
        academicYearId: selectedAcademicYearId!,
        search: eligibleSearch || undefined,
      }),
    enabled: !!selectedAcademicYearId,
  });

  const eligibleStudents = useMemo(
    () => eligibleStudentsResponse?.data || [],
    [eligibleStudentsResponse],
  );

  const { data: gradeTemplatesResponse, isFetching: isFetchingTemplates } = useQuery({
    queryKey: [
      'osis-grade-templates',
      selectedAcademicYearId,
      effectiveSemester,
      selectedReportProgram?.code,
      effectiveReportType,
    ],
    queryFn: () =>
      osisService.getGradeTemplates({
        academicYearId: selectedAcademicYearId!,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
      }),
    enabled: !!selectedAcademicYearId && !!effectiveSemester && !!effectiveReportType,
  });

  const gradeTemplateContextKey = useMemo(
    () =>
      [
        selectedAcademicYearId || '',
        effectiveSemester,
        selectedReportProgram?.code || '',
        effectiveReportType || '',
      ].join(':'),
    [selectedAcademicYearId, effectiveSemester, selectedReportProgram?.code, effectiveReportType],
  );

  const serverGradeTemplates = useMemo(
    () => gradeTemplatesResponse?.data?.templates || DEFAULT_GRADE_TEMPLATES,
    [gradeTemplatesResponse],
  );

  const gradeTemplates = templateEdits[gradeTemplateContextKey] || serverGradeTemplates;

  const gradeOptions = useMemo(
    () =>
      (Object.keys(DEFAULT_GRADE_TEMPLATES) as GradePredicate[]).map((value) => ({
        value,
        label: gradeTemplates[value]?.label || DEFAULT_GRADE_TEMPLATES[value].label,
      })),
    [gradeTemplates],
  );

  const gradeEditContextKey = useMemo(
    () =>
      [
        selectedPeriod?.id || '',
        effectiveSemester,
        selectedReportProgram?.code || '',
        effectiveReportType || '',
      ].join(':'),
    [selectedPeriod?.id, effectiveSemester, selectedReportProgram?.code, effectiveReportType],
  );

  const localGradeEdits = gradeEdits[gradeEditContextKey] || {};

  const { mutateAsync: saveManagementPeriod, isPending: isSavingManagementPeriod } = useMutation({
    mutationFn: async () => {
      const payload = {
        academicYearId: selectedAcademicYearId!,
        electionPeriodId: periodForm.electionPeriodId ? Number(periodForm.electionPeriodId) : null,
        title: periodForm.title.trim(),
        description: periodForm.description.trim() || null,
        startAt: toDateTimePayload(periodForm.startAt),
        endAt: toDateTimePayload(periodForm.endAt, true),
        transitionLabel: periodForm.transitionLabel.trim() || null,
        transitionAt: periodForm.transitionAt ? toDateTimePayload(periodForm.transitionAt) : null,
        transitionNotes: periodForm.transitionNotes.trim() || null,
        status: periodForm.status,
      };

      if (periodForm.id) {
        return osisService.updateManagementPeriod(periodForm.id, payload);
      }
      return osisService.createManagementPeriod(payload);
    },
    onSuccess: async () => {
      toast.success(periodForm.id ? 'Periode OSIS diperbarui' : 'Periode OSIS dibuat');
      setIsPeriodModalOpen(false);
      setPeriodForm({
        id: null,
        electionPeriodId: '',
        title: '',
        description: '',
        startAt: '',
        endAt: '',
        transitionLabel: '',
        transitionAt: '',
        transitionNotes: '',
        status: 'DRAFT',
      });
      await queryClient.invalidateQueries({ queryKey: ['osis-management-periods'] });
      await queryClient.invalidateQueries({ queryKey: ['osis-work-program-readiness'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan periode OSIS'));
    },
  });

  const { mutateAsync: saveDivision, isPending: isSavingDivision } = useMutation({
    mutationFn: async () => {
      const payload = {
        periodId: selectedPeriod!.id,
        name: divisionForm.name.trim(),
        code: divisionForm.code.trim() || null,
        description: divisionForm.description.trim() || null,
        displayOrder: divisionForm.displayOrder ? Number(divisionForm.displayOrder) : undefined,
      };
      if (divisionForm.id) return osisService.updateDivision(divisionForm.id, payload);
      return osisService.createDivision(payload);
    },
    onSuccess: async () => {
      toast.success(divisionForm.id ? 'Divisi diperbarui' : 'Divisi ditambahkan');
      setIsDivisionModalOpen(false);
      setDivisionForm({ id: null, name: '', code: '', description: '', displayOrder: '' });
      await queryClient.invalidateQueries({ queryKey: ['osis-divisions'] });
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan divisi'));
    },
  });

  const { mutateAsync: savePosition, isPending: isSavingPosition } = useMutation({
    mutationFn: async () => {
      const payload = {
        periodId: selectedPeriod!.id,
        divisionId: positionForm.divisionId ? Number(positionForm.divisionId) : null,
        name: positionForm.name.trim(),
        code: positionForm.code.trim() || null,
        description: positionForm.description.trim() || null,
        displayOrder: positionForm.displayOrder ? Number(positionForm.displayOrder) : undefined,
      };
      if (positionForm.id) return osisService.updatePosition(positionForm.id, payload);
      return osisService.createPosition(payload);
    },
    onSuccess: async () => {
      toast.success(positionForm.id ? 'Jabatan diperbarui' : 'Jabatan ditambahkan');
      setIsPositionModalOpen(false);
      setPositionForm({ id: null, name: '', code: '', description: '', divisionId: '', displayOrder: '' });
      await queryClient.invalidateQueries({ queryKey: ['osis-positions'] });
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan jabatan'));
    },
  });

  const { mutateAsync: saveMembership, isPending: isSavingMembership } = useMutation({
    mutationFn: async () => {
      const selectedPosition = positions.find((position) => Number(position.id) === Number(membershipForm.positionId));
      const derivedDivisionId =
        membershipForm.divisionId
          ? Number(membershipForm.divisionId)
          : selectedPosition?.divisionId || null;

      const payload = {
        periodId: selectedPeriod!.id,
        studentId: Number(membershipForm.studentId),
        positionId: Number(membershipForm.positionId),
        divisionId: derivedDivisionId,
        joinedAt: membershipForm.joinedAt ? toDateTimePayload(membershipForm.joinedAt) : null,
        endedAt: membershipForm.endedAt ? toDateTimePayload(membershipForm.endedAt, true) : null,
        isActive: membershipForm.isActive,
        requestId: membershipForm.requestId ? Number(membershipForm.requestId) : null,
      };

      if (membershipForm.id) {
        return osisService.updateMembership(membershipForm.id, payload);
      }
      return osisService.createMembership(payload);
    },
    onSuccess: async () => {
      toast.success(membershipForm.id ? 'Anggota OSIS diperbarui' : 'Anggota OSIS ditambahkan');
      setIsMembershipModalOpen(false);
      setMembershipForm({
        id: null,
        requestId: '',
        studentId: '',
        positionId: '',
        divisionId: '',
        joinedAt: '',
        endedAt: '',
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
      await queryClient.invalidateQueries({ queryKey: ['osis-join-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['osis-management-periods'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan anggota OSIS'));
    },
  });

  const { mutateAsync: saveGradeTemplates, isPending: isSavingTemplates } = useMutation({
    mutationFn: async () =>
      osisService.saveGradeTemplates({
        academicYearId: selectedAcademicYearId!,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
        templates: gradeTemplates,
      }),
    onSuccess: async () => {
      toast.success('Template nilai OSIS disimpan');
      await queryClient.invalidateQueries({ queryKey: ['osis-grade-templates'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan template nilai OSIS'));
    },
  });

  const { mutateAsync: saveAssessment, isPending: isSavingAssessment } = useMutation({
    mutationFn: async (membershipId: number) => {
      const current = memberships.find((item) => item.id === membershipId);
      const edit = localGradeEdits[membershipId];
      const grade = edit?.grade ?? current?.currentAssessment?.grade ?? '';
      const description = edit?.description ?? current?.currentAssessment?.description ?? '';
      return osisService.upsertAssessment({
        membershipId,
        grade,
        description,
        semester: effectiveSemester,
        reportType: effectiveReportType || undefined,
        programCode: selectedReportProgram?.code || undefined,
      });
    },
    onSuccess: async () => {
      toast.success('Nilai OSIS disimpan');
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menyimpan nilai OSIS'));
    },
  });

  const { mutateAsync: rejectJoinRequest, isPending: isRejectingJoinRequest } = useMutation({
    mutationFn: async ({ id, note }: { id: number; note?: string | null }) =>
      osisService.rejectJoinRequest(id, { note }),
    onSuccess: async () => {
      toast.success('Pengajuan OSIS ditolak');
      await queryClient.invalidateQueries({ queryKey: ['osis-join-requests'] });
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Gagal menolak pengajuan OSIS'));
    },
  });

  const filteredMemberships = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return memberships;
    return memberships.filter((membership) => {
      const haystacks = [
        membership.student?.name || '',
        membership.student?.nis || '',
        membership.student?.nisn || '',
        membership.student?.studentClass?.name || '',
        membership.position?.name || '',
        membership.division?.name || membership.position?.division?.name || '',
      ];
      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [memberSearch, memberships]);

  const handleDeleteDivision = async (id: number) => {
    if (!confirm('Hapus divisi OSIS ini?')) return;
    try {
      await osisService.deleteDivision(id);
      toast.success('Divisi dihapus');
      await queryClient.invalidateQueries({ queryKey: ['osis-divisions'] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menghapus divisi'));
    }
  };

  const handleDeletePosition = async (id: number) => {
    if (!confirm('Hapus jabatan OSIS ini?')) return;
    try {
      await osisService.deletePosition(id);
      toast.success('Jabatan dihapus');
      await queryClient.invalidateQueries({ queryKey: ['osis-positions'] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menghapus jabatan'));
    }
  };

  const handleDeactivateMembership = async (id: number) => {
    if (!confirm('Nonaktifkan keanggotaan OSIS ini?')) return;
    try {
      await osisService.deleteMembership(id);
      toast.success('Keanggotaan dinonaktifkan');
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, 'Gagal menonaktifkan anggota'));
    }
  };

  const handleAssessmentChange = (membershipId: number, key: 'grade' | 'description', value: string) => {
    const membership = memberships.find((item) => item.id === membershipId);
    const existingGrade = localGradeEdits[membershipId]?.grade ?? membership?.currentAssessment?.grade ?? '';
    const existingDescription =
      localGradeEdits[membershipId]?.description ?? membership?.currentAssessment?.description ?? '';

    setGradeEdits((prev) => ({
      ...prev,
      [gradeEditContextKey]: {
        ...(prev[gradeEditContextKey] || {}),
        [membershipId]: {
          grade: key === 'grade' ? value.toUpperCase() : existingGrade,
          description:
            key === 'description'
              ? value
              : gradeTemplates[value.toUpperCase() as GradePredicate]?.description || existingDescription,
        },
      },
    }));
  };

  const resetPeriodForm = () =>
    setPeriodForm({
      id: null,
      electionPeriodId: '',
      title: '',
      description: '',
      startAt: '',
      endAt: '',
      transitionLabel: '',
      transitionAt: '',
      transitionNotes: '',
      status: 'DRAFT',
    });
  const resetDivisionForm = () =>
    setDivisionForm({ id: null, name: '', code: '', description: '', displayOrder: '' });
  const resetPositionForm = () =>
    setPositionForm({ id: null, name: '', code: '', description: '', divisionId: '', displayOrder: '' });
  const resetMembershipForm = () =>
    setMembershipForm({
      id: null,
      requestId: '',
      studentId: '',
      positionId: '',
      divisionId: '',
      joinedAt: '',
      endedAt: '',
      isActive: true,
    });

  const openCreatePeriodModal = () => {
    resetPeriodForm();
    setIsPeriodModalOpen(true);
  };

  const openEditPeriodModal = (period: OsisManagementPeriod) => {
    setSelectedPeriodIdState(period.id);
    setPeriodForm({
      id: period.id,
      electionPeriodId: period.electionPeriodId ? String(period.electionPeriodId) : '',
      title: period.title,
      description: period.description || '',
      startAt: toDateInputValue(period.startAt),
      endAt: toDateInputValue(period.endAt),
      transitionLabel: period.transitionLabel || '',
      transitionAt: toDateInputValue(period.transitionAt),
      transitionNotes: period.transitionNotes || '',
      status: period.status,
    });
    setIsPeriodModalOpen(true);
  };

  const openCreateDivisionModal = () => {
    resetDivisionForm();
    setIsDivisionModalOpen(true);
  };

  const openEditDivisionModal = (division: OsisDivision) => {
    setDivisionForm({
      id: division.id,
      name: division.name,
      code: division.code,
      description: division.description || '',
      displayOrder: division.displayOrder ? String(division.displayOrder) : '',
    });
    setIsDivisionModalOpen(true);
  };

  const openCreatePositionModal = () => {
    resetPositionForm();
    setIsPositionModalOpen(true);
  };

  const openEditPositionModal = (position: OsisPosition) => {
    setPositionForm({
      id: position.id,
      name: position.name,
      code: position.code,
      description: position.description || '',
      divisionId: position.divisionId ? String(position.divisionId) : '',
      displayOrder: position.displayOrder ? String(position.displayOrder) : '',
    });
    setIsPositionModalOpen(true);
  };

  const openCreateMembershipModal = () => {
    resetMembershipForm();
    setEligibleSearch('');
    setIsMembershipModalOpen(true);
  };

  const openMembershipFromRequest = (request: OsisJoinRequest) => {
    setEligibleSearch('');
    setMembershipForm({
      id: null,
      requestId: String(request.id),
      studentId: String(request.studentId),
      positionId: '',
      divisionId: '',
      joinedAt: toDateInputValue(request.requestedAt),
      endedAt: '',
      isActive: true,
    });
    setIsMembershipModalOpen(true);
  };

  const openEditMembershipModal = (membership: OsisMembership) => {
    setEligibleSearch('');
    setMembershipForm({
      id: membership.id,
      requestId: '',
      studentId: String(membership.studentId),
      positionId: String(membership.positionId),
      divisionId: membership.divisionId ? String(membership.divisionId) : '',
      joinedAt: toDateInputValue(membership.joinedAt),
      endedAt: toDateInputValue(membership.endedAt),
      isActive: membership.isActive,
    });
    setIsMembershipModalOpen(true);
  };

  const workflowReferencePeriod = selectedPeriod || workProgramReadiness?.latestManagementPeriod || null;
  const workflowMeta = getWorkflowMeta(workflowReferencePeriod);
  const activePeriodMeta = selectedPeriod ? getManagementStatusMeta(selectedPeriod.status) : null;

  if (isLoadingActiveAcademicYear) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Memuat konteks OSIS...</div>;
  }

  if (!selectedAcademicYearId) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-sm text-amber-700">
        Tahun ajaran aktif belum tersedia. Aktifkan tahun ajaran terlebih dahulu agar operasional OSIS tidak ambigu.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Struktur & Nilai OSIS</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Halaman ini disusun bertahap agar pembina OSIS lebih mudah mengikuti alur: pemilihan, transisi kepengurusan,
              pembentukan struktur, penempatan pengurus, lalu penilaian.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:min-w-[560px]">
            <select
              value={selectedPeriod?.id || ''}
              onChange={(e) => setSelectedPeriodIdState(Number(e.target.value || 0) || null)}
              disabled={!periods.length}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {periods.length === 0 ? (
                <option value="">Belum ada periode kepengurusan</option>
              ) : (
                periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.title} • {getManagementStatusMeta(period.status).label}
                  </option>
                ))
              )}
            </select>
            {activeSection === 'ASSESSMENTS' ? (
              <>
                <select
                  value={effectiveSemester}
                  onChange={(e) => setSemester(e.target.value as Semester)}
                  disabled={Boolean(selectedReportProgram?.fixedSemester)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  <option value="ODD">Semester Ganjil</option>
                  <option value="EVEN">Semester Genap</option>
                </select>
                <select
                  value={effectiveSelectedReportType}
                  onChange={(e) => setReportType(e.target.value)}
                  disabled={!reportPrograms.length}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                >
                  {reportPrograms.length === 0 ? (
                    <option value="">Belum ada program rapor aktif</option>
                  ) : (
                    reportPrograms.map((program) => (
                      <option key={program.code} value={program.code}>
                        {program.label}
                      </option>
                    ))
                  )}
                </select>
              </>
            ) : (
              <div className="md:col-span-2 flex flex-wrap gap-2">
                {activePeriodMeta ? (
                  <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${activePeriodMeta.className}`}>
                    Periode terpilih: {activePeriodMeta.label}
                  </span>
                ) : (
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                    Belum ada periode kepengurusan terpilih
                  </span>
                )}
                {selectedPeriod?.electionPeriod ? (
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Acuan pemilihan: {selectedPeriod.electionPeriod.title}
                  </span>
                ) : null}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Periode</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-emerald-900">{periods.length}</p>
            <p className="text-sm text-emerald-800">Periode kepengurusan pada tahun ajaran ini.</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Layers3 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Divisi</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-blue-900">{divisions.length}</p>
            <p className="text-sm text-blue-800">Bidang/divisi yang sudah tersusun di periode ini.</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Jabatan</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-violet-900">{positions.length}</p>
            <p className="text-sm text-violet-800">Jabatan pengurus yang tersedia untuk ditempatkan.</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <Users className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Pengurus</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-amber-900">{memberships.length}</p>
            <p className="text-sm text-amber-800">Siswa yang sudah ditempatkan ke struktur OSIS.</p>
          </div>
        </div>

        <div className={`mt-5 rounded-2xl border px-4 py-4 ${workflowMeta.className}`}>
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em]">
                <AlertTriangle className="h-4 w-4" />
                Alur OSIS Saat Ini
              </div>
              <p className="mt-2 text-lg font-semibold">{workflowMeta.label}</p>
              <p className="mt-1 text-sm">{workProgramReadiness?.message || workflowMeta.description}</p>
            </div>
            <div className="grid gap-2 text-xs md:min-w-[280px]">
              <div className="rounded-xl border border-white/50 bg-white/60 px-3 py-2">
                1. Pemilihan selesai: {workProgramReadiness?.latestClosedElection ? workProgramReadiness.latestClosedElection.title : 'Belum ada'}
              </div>
              <div className="rounded-xl border border-white/50 bg-white/60 px-3 py-2">
                2. Transisi kepengurusan:
                {' '}
                {workflowReferencePeriod?.transitionLabel && workflowReferencePeriod?.transitionAt
                  ? `${workflowReferencePeriod.transitionLabel} (${formatDateLabel(workflowReferencePeriod.transitionAt)})`
                  : 'Belum dicatat'}
              </div>
              <div className="rounded-xl border border-white/50 bg-white/60 px-3 py-2">
                3. Program kerja:
                {' '}
                {workProgramReadiness?.canCreatePrograms ? 'Sudah terbuka' : 'Masih terkunci'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {([
            ['PERIOD', 'Alur & Periode'],
            ['STRUCTURE', 'Divisi & Jabatan'],
            ['MEMBERS', 'Pengurus OSIS'],
            ['ASSESSMENTS', 'Nilai OSIS'],
          ] as Array<[OsisManagementSection, string]>).map(([section, label]) => (
            <button
              key={section}
              type="button"
              onClick={() => setActiveSection(section)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeSection === section
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeSection === 'PERIOD' ? (
        <div className="space-y-6">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Alur Kepengurusan OSIS</h2>
                <p className="text-sm text-slate-500">
                  Halaman utama cukup menampilkan ringkasan alur dan daftar periode. Form tambah/edit dipindahkan ke popup agar lebih ringan dibaca.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreatePeriodModal}
                className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="mr-2 h-4 w-4" />
                Tambah Periode
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Langkah 1</p>
                <p className="mt-2 font-semibold text-slate-900">Pemilihan OSIS</p>
                <p className="mt-1 text-sm text-slate-600">
                  {workProgramReadiness?.latestClosedElection
                    ? `${workProgramReadiness.latestClosedElection.title} selesai pada ${formatDateLabel(workProgramReadiness.latestClosedElection.endAt)}`
                    : 'Belum ada periode pemilihan OSIS yang difinalisasi.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Langkah 2</p>
                <p className="mt-2 font-semibold text-slate-900">Transisi Kepengurusan</p>
                <p className="mt-1 text-sm text-slate-600">
                  {workflowReferencePeriod?.transitionLabel && workflowReferencePeriod?.transitionAt
                    ? `${workflowReferencePeriod.transitionLabel} • ${formatDateLabel(workflowReferencePeriod.transitionAt)}`
                    : 'Catat dulu mubes, rapat kepengurusan baru, atau pelantikan.'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Langkah 3</p>
                <p className="mt-2 font-semibold text-slate-900">Program Kerja</p>
                <p className="mt-1 text-sm text-slate-600">
                  {workProgramReadiness?.canCreatePrograms
                    ? 'Program kerja OSIS sudah bisa dibuat pada periode aktif.'
                    : 'Program kerja masih menunggu langkah 1 dan 2 selesai.'}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Daftar Periode Kepengurusan</h2>
                <p className="text-sm text-slate-500">Pilih periode untuk mengelola struktur, anggota, nilai, dan kesiapan program kerja OSIS.</p>
              </div>
              {selectedPeriod ? (
                <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                  <div className="font-semibold uppercase tracking-wide">Periode Aktif Di Halaman</div>
                  <div className="mt-1 text-sm font-semibold">{selectedPeriod.title}</div>
                </div>
              ) : null}
            </div>

            {isLoadingPeriods ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                Memuat periode OSIS...
              </div>
            ) : periods.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Belum ada periode kepengurusan. Klik tombol <span className="font-semibold">Tambah Periode</span> untuk mulai menyusun alur OSIS.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Periode</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Pemilihan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Transisi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {periods.map((period) => {
                      const periodStatusMeta = getManagementStatusMeta(period.status);
                      const periodWorkflowMeta = getWorkflowMeta(period);
                      return (
                        <tr
                          key={period.id}
                          className={Number(selectedPeriod?.id) === Number(period.id) ? 'bg-blue-50/60' : ''}
                        >
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900">{period.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {formatDateLabel(period.startAt)} s.d. {formatDateLabel(period.endAt)}
                            </div>
                            {period.description ? (
                              <div className="mt-1 text-xs text-slate-600">{period.description}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {period.electionPeriod?.title || 'Belum dihubungkan'}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {period.transitionLabel && period.transitionAt
                              ? `${period.transitionLabel} • ${formatDateLabel(period.transitionAt)}`
                              : 'Belum dicatat'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-col items-start gap-2">
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${periodStatusMeta.className}`}>
                                {periodStatusMeta.label}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${periodWorkflowMeta.className}`}>
                                {periodWorkflowMeta.label}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedPeriodIdState(period.id)}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                Pilih
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditPeriodModal(period)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                                title="Edit periode"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeSection === 'STRUCTURE' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Divisi OSIS</h2>
                <p className="text-sm text-slate-500">Halaman utama hanya menampilkan daftar divisi. Tambah/edit divisi dilakukan lewat popup.</p>
              </div>
              <button
                type="button"
                onClick={openCreateDivisionModal}
                disabled={!selectedPeriod?.id}
                className="inline-flex items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="mr-2 h-4 w-4" />
                Tambah Divisi
              </button>
            </div>

            {!selectedPeriod?.id ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Pilih periode kepengurusan terlebih dahulu sebelum mengatur divisi OSIS.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Divisi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Kode</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Urutan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Ringkasan</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {divisions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                          Belum ada divisi pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      divisions.map((division) => (
                        <tr key={division.id}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900">{division.name}</div>
                            <div className="mt-1 text-xs text-slate-500">Jabatan {division._count?.positions || 0}</div>
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">{division.code}</td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {division.displayOrder > 0 ? division.displayOrder : 'Otomatis'}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {division.description || '-'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditDivisionModal(division)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                                title="Edit divisi"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDivision(division.id)}
                                className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                                title="Hapus divisi"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Jabatan OSIS</h2>
                <p className="text-sm text-slate-500">Jabatan ditampilkan sebagai daftar hasil. Tambah/edit dilakukan lewat popup agar halaman tetap ringkas.</p>
              </div>
              <button
                type="button"
                onClick={openCreatePositionModal}
                disabled={!selectedPeriod?.id}
                className="inline-flex items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="mr-2 h-4 w-4" />
                Tambah Jabatan
              </button>
            </div>

            {!selectedPeriod?.id ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Pilih periode kepengurusan terlebih dahulu sebelum mengatur jabatan OSIS.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Jabatan</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Divisi</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Kode</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Urutan</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {positions.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                          Belum ada jabatan pada periode ini.
                        </td>
                      </tr>
                    ) : (
                      positions.map((position) => (
                        <tr key={position.id}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900">{position.name}</div>
                            {position.description ? (
                              <div className="mt-1 text-xs text-slate-500">{position.description}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {position.division?.name || 'Tanpa divisi khusus'}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">{position.code}</td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {position.displayOrder > 0 ? position.displayOrder : 'Otomatis'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => openEditPositionModal(position)}
                                className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                                title="Edit jabatan"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeletePosition(position.id)}
                                className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                                title="Hapus jabatan"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeSection === 'MEMBERS' ? (
        <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pengajuan Masuk OSIS</h2>
                <p className="text-sm text-slate-500">Siswa yang mengajukan OSIS akan diarahkan ke form anggota setelah Anda menentukan jabatannya.</p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                {joinRequests.length} pending
              </span>
            </div>

            {isLoadingJoinRequests ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                Memuat pengajuan OSIS...
              </div>
            ) : joinRequests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Belum ada pengajuan OSIS dari siswa.
              </div>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((request) => (
                  <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{request.student?.name || 'Siswa'}</p>
                        <p className="text-xs text-slate-500">
                          {request.student?.studentClass?.name || '-'} • {request.student?.nis || '-'}
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          {request.ekskul?.name || 'OSIS'} • Diajukan {formatDateLabel(request.requestedAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openMembershipFromRequest(request)}
                          className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          Proses ke Form Anggota
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const note = window.prompt('Catatan penolakan (opsional):', request.note || '');
                            if (note === null) return;
                            await rejectJoinRequest({ id: request.id, note });
                          }}
                          disabled={isRejectingJoinRequest}
                          className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Tolak
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Penempatan Pengurus</h3>
                  <p className="text-xs text-slate-500">Tambah atau edit penempatan pengurus melalui popup agar halaman utama tetap fokus pada daftar hasil.</p>
                </div>
                <button
                  type="button"
                  onClick={openCreateMembershipModal}
                  disabled={!selectedPeriod?.id || positions.length === 0}
                  className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Tambah Pengurus
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {positions.length === 0
                  ? 'Tambahkan jabatan terlebih dahulu sebelum menempatkan pengurus OSIS.'
                  : 'Pengajuan siswa bisa langsung diproses ke popup penempatan agar pembina tinggal memilih jabatan dan divisinya.'}
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Daftar Pengurus OSIS</h2>
                <p className="text-sm text-slate-500">Kelola siswa yang sudah ditempatkan ke struktur OSIS.</p>
              </div>
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Cari pengurus..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-sm"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Siswa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Jabatan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Divisi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Masa Tugas</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {isLoadingMemberships ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        Memuat pengurus OSIS...
                      </td>
                    </tr>
                  ) : filteredMemberships.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                        Belum ada pengurus OSIS untuk periode terpilih.
                      </td>
                    </tr>
                  ) : (
                    filteredMemberships.map((membership) => (
                      <tr key={membership.id} className={!membership.isActive ? 'bg-slate-50/70' : ''}>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-900">{membership.student.name}</div>
                          <div className="text-xs text-slate-500">
                            {membership.student.studentClass?.name || '-'} • {membership.student.nis || '-'}
                          </div>
                          {!membership.isActive ? (
                            <span className="mt-2 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                              Nonaktif
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700">{membership.position?.name || '-'}</td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700">
                          {membership.division?.name || membership.position?.division?.name || '-'}
                        </td>
                        <td className="px-4 py-3 align-top text-sm text-slate-700">
                          {formatDateLabel(membership.joinedAt)}
                          {membership.endedAt ? ` • ${formatDateLabel(membership.endedAt)}` : ' • Aktif'}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEditMembershipModal(membership)}
                              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                              title="Edit anggota"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeactivateMembership(membership.id)}
                              className="rounded-lg border border-amber-200 p-2 text-amber-700 hover:bg-amber-50"
                              title="Nonaktifkan anggota"
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      {activeSection === 'ASSESSMENTS' ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Template Nilai OSIS</h2>
                <p className="text-sm text-slate-500">Sesuaikan bahasa predikat dan deskripsi agar selaras dengan rapor non-akademik sekolah.</p>
              </div>
              <button
                type="button"
                onClick={() => saveGradeTemplates()}
                disabled={isSavingTemplates || isFetchingTemplates || !selectedAcademicYearId || !effectiveReportType}
                className="inline-flex items-center rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingTemplates ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                Simpan Template
              </button>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              Slot rapor aktif untuk nilai OSIS saat ini adalah
              {' '}
              <span className="font-semibold">{selectedReportSlot || effectiveReportType || '-'}</span>.
              Pilihan semester dan program rapor ada di kanan atas header halaman ini.
            </div>

            <div className="grid gap-3">
              {gradeOptions.map((option) => (
                <div key={option.value} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="text"
                    value={gradeTemplates[option.value]?.label || ''}
                    onChange={(e) =>
                      setTemplateEdits((prev) => ({
                        ...prev,
                        [gradeTemplateContextKey]: {
                          ...(prev[gradeTemplateContextKey] || DEFAULT_GRADE_TEMPLATES),
                          [option.value]: {
                            ...(prev[gradeTemplateContextKey]?.[option.value] || gradeTemplates[option.value]),
                            label: e.target.value,
                          },
                        },
                      }))
                    }
                    className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"
                  />
                  <textarea
                    rows={2}
                    value={gradeTemplates[option.value]?.description || ''}
                    onChange={(e) =>
                      setTemplateEdits((prev) => ({
                        ...prev,
                        [gradeTemplateContextKey]: {
                          ...(prev[gradeTemplateContextKey] || DEFAULT_GRADE_TEMPLATES),
                          [option.value]: {
                            ...(prev[gradeTemplateContextKey]?.[option.value] || gradeTemplates[option.value]),
                            description: e.target.value,
                          },
                        },
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs"
                    placeholder={`Template deskripsi ${option.value}`}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Penilaian Pengurus OSIS</h2>
                <p className="text-sm text-slate-500">Nilai siswa per periode, semester, dan slot rapor aktif.</p>
              </div>
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Cari pengurus..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-sm"
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Siswa</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Jabatan</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Divisi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Predikat</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Deskripsi</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {isLoadingMemberships ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                        Memuat pengurus OSIS...
                      </td>
                    </tr>
                  ) : filteredMemberships.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        Belum ada pengurus OSIS untuk periode terpilih.
                      </td>
                    </tr>
                  ) : (
                    filteredMemberships.map((membership) => {
                      const currentEdit = localGradeEdits[membership.id];
                      const gradeValue = currentEdit?.grade ?? membership.currentAssessment?.grade ?? '';
                      const descriptionValue =
                        currentEdit?.description ?? membership.currentAssessment?.description ?? '';

                      return (
                        <tr key={membership.id} className={!membership.isActive ? 'bg-slate-50/70' : ''}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-slate-900">{membership.student.name}</div>
                            <div className="text-xs text-slate-500">
                              {membership.student.studentClass?.name || '-'} • {membership.student.nis || '-'}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">{membership.position?.name || '-'}</td>
                          <td className="px-4 py-3 align-top text-sm text-slate-700">
                            {membership.division?.name || membership.position?.division?.name || '-'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <select
                              value={gradeValue}
                              onChange={(e) => handleAssessmentChange(membership.id, 'grade', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                            >
                              <option value="">Pilih Predikat</option>
                              {gradeOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <textarea
                              rows={2}
                              value={descriptionValue}
                              onChange={(e) => handleAssessmentChange(membership.id, 'description', e.target.value)}
                              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                              placeholder="Deskripsi kontribusi siswa..."
                            />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => saveAssessment(membership.id)}
                                disabled={isSavingAssessment || !gradeValue}
                                className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                title="Simpan nilai"
                              >
                                <Save className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}

      <OsisFormModal
        open={isPeriodModalOpen}
        title={periodForm.id ? 'Edit Periode Kepengurusan' : 'Tambah Periode Kepengurusan'}
        description="Hubungkan periode kepengurusan ke hasil pemilihan dan catat transisi sebelum program kerja OSIS dibuka."
        onClose={() => {
          setIsPeriodModalOpen(false);
          resetPeriodForm();
        }}
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Periode Kepengurusan</label>
            <input
              type="text"
              value={periodForm.title}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Contoh: Kepengurusan OSIS 2026/2027"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Periode Pemilihan Yang Menjadi Acuan</label>
            <select
              value={periodForm.electionPeriodId}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, electionPeriodId: e.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">Pilih hasil pemilihan OSIS yang sudah ditutup</option>
              {electionPeriods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.title} • selesai {formatDateLabel(period.endAt)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Hanya pemilihan OSIS yang sudah selesai/final yang bisa dipakai sebagai dasar kepengurusan baru.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi Umum Periode</label>
            <textarea
              rows={3}
              value={periodForm.description}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Ringkasan periode, fokus kepengurusan, atau catatan umum..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Mulai Periode</label>
              <input
                type="date"
                value={periodForm.startAt}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, startAt: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Selesai Periode</label>
              <input
                type="date"
                value={periodForm.endAt}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, endAt: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-blue-900">Tahap Transisi Kepengurusan</h3>
              <p className="text-xs text-blue-800">
                Gunakan nama kegiatan yang paling sesuai dengan proses sekolah Anda, misalnya Mubes OSIS, rapat kepengurusan baru, atau pelantikan.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Nama Kegiatan Transisi</label>
                <input
                  type="text"
                  value={periodForm.transitionLabel}
                  onChange={(e) => setPeriodForm((prev) => ({ ...prev, transitionLabel: e.target.value }))}
                  placeholder="Contoh: Mubes OSIS / Rapat Kepengurusan Baru"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tanggal Kegiatan Transisi</label>
                <input
                  type="date"
                  value={periodForm.transitionAt}
                  onChange={(e) => setPeriodForm((prev) => ({ ...prev, transitionAt: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Catatan Transisi (Opsional)</label>
              <textarea
                rows={2}
                value={periodForm.transitionNotes}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, transitionNotes: e.target.value }))}
                placeholder="Contoh: hasil rapat awal, pembagian fokus bidang, atau keputusan penting..."
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Status Periode</label>
            <select
              value={periodForm.status}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, status: e.target.value as typeof prev.status }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Aktif</option>
              <option value="CLOSED">Ditutup</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Status aktif hanya dipakai jika pemilihan dan transisi kepengurusan sudah selesai dicatat.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsPeriodModalOpen(false);
                resetPeriodForm();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => saveManagementPeriod()}
              disabled={
                isSavingManagementPeriod ||
                !selectedAcademicYearId ||
                !periodForm.title.trim() ||
                !periodForm.startAt ||
                !periodForm.endAt
              }
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingManagementPeriod ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {periodForm.id ? 'Simpan Perubahan Periode' : 'Simpan Periode'}
            </button>
          </div>
        </div>
      </OsisFormModal>

      <OsisFormModal
        open={isDivisionModalOpen}
        title={divisionForm.id ? 'Edit Divisi OSIS' : 'Tambah Divisi OSIS'}
        description="Tambahkan bidang/divisi melalui popup, lalu hasilnya langsung muncul di daftar divisi."
        onClose={() => {
          setIsDivisionModalOpen(false);
          resetDivisionForm();
        }}
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Divisi</label>
            <input
              type="text"
              value={divisionForm.name}
              onChange={(e) => setDivisionForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Contoh: Divisi Kedisiplinan"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Kode Singkat</label>
              <input
                type="text"
                value={divisionForm.code}
                onChange={(e) => setDivisionForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Otomatis jika dikosongkan"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Sistem akan membuat kode otomatis dari nama divisi jika kolom ini dikosongkan.
                {previewStructureCode(divisionForm.code, divisionForm.name)
                  ? ` Preview: ${previewStructureCode(divisionForm.code, divisionForm.name)}`
                  : ''}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Urutan Tampil</label>
              <input
                type="number"
                min={0}
                value={divisionForm.displayOrder}
                onChange={(e) => setDivisionForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                placeholder="Kosongkan jika ingin otomatis"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Kosongkan jika Anda belum perlu mengatur urutan tampil secara manual.</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi Divisi</label>
            <textarea
              rows={3}
              value={divisionForm.description}
              onChange={(e) => setDivisionForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Ringkasan tugas pokok divisi ini..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsDivisionModalOpen(false);
                resetDivisionForm();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => saveDivision()}
              disabled={isSavingDivision || !selectedPeriod?.id || !divisionForm.name.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingDivision ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {divisionForm.id ? 'Simpan Divisi' : 'Simpan Divisi'}
            </button>
          </div>
        </div>
      </OsisFormModal>

      <OsisFormModal
        open={isPositionModalOpen}
        title={positionForm.id ? 'Edit Jabatan OSIS' : 'Tambah Jabatan OSIS'}
        description="Tambahkan jabatan melalui popup agar daftar jabatan tetap menjadi fokus utama halaman."
        onClose={() => {
          setIsPositionModalOpen(false);
          resetPositionForm();
        }}
      >
        <div className="grid gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Jabatan</label>
            <input
              type="text"
              value={positionForm.name}
              onChange={(e) => setPositionForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Contoh: Ketua Divisi Kedisiplinan"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Divisi Terkait</label>
              <select
                value={positionForm.divisionId}
                onChange={(e) => setPositionForm((prev) => ({ ...prev, divisionId: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Tanpa divisi khusus</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Urutan Tampil</label>
              <input
                type="number"
                min={0}
                value={positionForm.displayOrder}
                onChange={(e) => setPositionForm((prev) => ({ ...prev, displayOrder: e.target.value }))}
                placeholder="Kosongkan jika ingin otomatis"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">Kosongkan jika urutan jabatan belum perlu diatur manual.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Kode Singkat</label>
              <input
                type="text"
                value={positionForm.code}
                onChange={(e) => setPositionForm((prev) => ({ ...prev, code: e.target.value }))}
                placeholder="Otomatis jika dikosongkan"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-slate-500">
                Sistem akan membuat kode otomatis dari nama jabatan jika kolom ini dikosongkan.
                {previewStructureCode(positionForm.code, positionForm.name)
                  ? ` Preview: ${previewStructureCode(positionForm.code, positionForm.name)}`
                  : ''}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Deskripsi Jabatan</label>
              <textarea
                rows={3}
                value={positionForm.description}
                onChange={(e) => setPositionForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Tugas inti dari jabatan ini..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsPositionModalOpen(false);
                resetPositionForm();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => savePosition()}
              disabled={isSavingPosition || !selectedPeriod?.id || !positionForm.name.trim()}
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingPosition ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {positionForm.id ? 'Simpan Jabatan' : 'Simpan Jabatan'}
            </button>
          </div>
        </div>
      </OsisFormModal>

      <OsisFormModal
        open={isMembershipModalOpen}
        title={membershipForm.id ? 'Edit Penempatan Pengurus' : membershipForm.requestId ? 'Proses Pengajuan OSIS' : 'Tambah Pengurus OSIS'}
        description="Tempatkan siswa ke jabatan dan divisi yang sesuai. Setelah disimpan, daftar pengurus akan langsung diperbarui."
        onClose={() => {
          setIsMembershipModalOpen(false);
          resetMembershipForm();
          setEligibleSearch('');
        }}
        maxWidthClass="max-w-2xl"
      >
        <div className="grid gap-3">
          {membershipForm.requestId ? (
            <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs text-blue-800">
              Form ini sedang memproses pengajuan siswa. Saat pengurus disimpan, status pengajuan OSIS akan otomatis disetujui.
            </div>
          ) : null}

          <input
            type="text"
            value={eligibleSearch}
            onChange={(e) => setEligibleSearch(e.target.value)}
            placeholder="Cari siswa aktif..."
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={membershipForm.studentId}
            onChange={(e) =>
              setMembershipForm((prev) => ({
                ...prev,
                studentId: e.target.value,
                requestId:
                  prev.requestId && String(prev.studentId) !== String(e.target.value)
                    ? ''
                    : prev.requestId,
              }))
            }
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Pilih siswa aktif</option>
            {eligibleStudents.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} • {student.studentClass?.name || '-'}
              </option>
            ))}
          </select>
          <select
            value={membershipForm.positionId}
            onChange={(e) => setMembershipForm((prev) => ({ ...prev, positionId: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Pilih jabatan</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name} {position.division?.name ? `• ${position.division.name}` : ''}
              </option>
            ))}
          </select>
          <select
            value={membershipForm.divisionId}
            onChange={(e) => setMembershipForm((prev) => ({ ...prev, divisionId: e.target.value }))}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">Ikuti divisi dari jabatan / kosong</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="date"
              value={membershipForm.joinedAt}
              onChange={(e) => setMembershipForm((prev) => ({ ...prev, joinedAt: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={membershipForm.endedAt}
              onChange={(e) => setMembershipForm((prev) => ({ ...prev, endedAt: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={membershipForm.isActive}
              onChange={(e) => setMembershipForm((prev) => ({ ...prev, isActive: e.target.checked }))}
            />
            Status aktif
          </label>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setIsMembershipModalOpen(false);
                resetMembershipForm();
                setEligibleSearch('');
              }}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => saveMembership()}
              disabled={
                isSavingMembership ||
                !selectedPeriod?.id ||
                !membershipForm.studentId ||
                !membershipForm.positionId
              }
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingMembership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {membershipForm.id ? 'Simpan Perubahan Anggota' : 'Simpan Pengurus'}
            </button>
          </div>
        </div>
      </OsisFormModal>
    </div>
  );
};

export default OsisManagementPage;
