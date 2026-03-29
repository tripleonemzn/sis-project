import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
import { academicYearService } from '../../../services/academicYear.service';
import { examService, type ExamProgram } from '../../../services/exam.service';
import {
  osisService,
  type OsisDivision,
  type OsisGradeTemplatesPayload,
  type OsisManagementPeriod,
  type OsisMembership,
  type OsisPosition,
} from '../../../services/osis.service';

type Semester = 'ODD' | 'EVEN';

interface AcademicYear {
  id: number;
  name: string;
  isActive: boolean;
}

interface ReportProgramOption {
  code: string;
  label: string;
  baseType: string;
  gradeComponentType: string;
  fixedSemester: Semester | null;
  displayOrder: number;
}

type GradePredicate = 'SB' | 'B' | 'C' | 'K';

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

export const OsisManagementPage = () => {
  const queryClient = useQueryClient();
  const [selectedAcademicYearIdState, setSelectedAcademicYearIdState] = useState<number | null>(null);
  const [selectedPeriodIdState, setSelectedPeriodIdState] = useState<number | null>(null);
  const [eligibleSearch, setEligibleSearch] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [semester, setSemester] = useState<Semester>('ODD');
  const [reportType, setReportType] = useState('');

  const [periodForm, setPeriodForm] = useState({
    id: null as number | null,
    title: '',
    description: '',
    startAt: '',
    endAt: '',
    status: 'DRAFT' as 'DRAFT' | 'ACTIVE' | 'CLOSED',
  });
  const [divisionForm, setDivisionForm] = useState({
    id: null as number | null,
    name: '',
    code: '',
    description: '',
    displayOrder: 0,
  });
  const [positionForm, setPositionForm] = useState({
    id: null as number | null,
    name: '',
    code: '',
    description: '',
    divisionId: '',
    displayOrder: 0,
  });
  const [membershipForm, setMembershipForm] = useState({
    id: null as number | null,
    studentId: '',
    positionId: '',
    divisionId: '',
    joinedAt: '',
    endedAt: '',
    isActive: true,
  });
  const [templateEdits, setTemplateEdits] = useState<Record<string, OsisGradeTemplatesPayload['templates']>>({});
  const [gradeEdits, setGradeEdits] = useState<Record<string, Record<number, { grade: string; description: string }>>>({});

  const { data: academicYearData } = useQuery({
    queryKey: ['academic-years', 'osis-management'],
    queryFn: () => academicYearService.list({ page: 1, limit: 100 }),
  });

  const academicYears = useMemo<AcademicYear[]>(
    () =>
      (academicYearData?.data?.academicYears || academicYearData?.academicYears || []) as AcademicYear[],
    [academicYearData],
  );

  const activeAcademicYear = useMemo(
    () => academicYears.find((year) => year.isActive) || academicYears[0] || null,
    [academicYears],
  );

  const selectedAcademicYearId = useMemo(() => {
    if (
      selectedAcademicYearIdState &&
      academicYears.some((year) => Number(year.id) === Number(selectedAcademicYearIdState))
    ) {
      return selectedAcademicYearIdState;
    }
    return activeAcademicYear?.id || null;
  }, [academicYears, activeAcademicYear?.id, selectedAcademicYearIdState]);

  const { data: managementPeriodsResponse, isLoading: isLoadingPeriods } = useQuery({
    queryKey: ['osis-management-periods', selectedAcademicYearId],
    queryFn: () => osisService.getManagementPeriods({ academicYearId: selectedAcademicYearId || undefined }),
    enabled: !!selectedAcademicYearId,
  });

  const periods = useMemo<OsisManagementPeriod[]>(
    () => (managementPeriodsResponse?.data || []) as OsisManagementPeriod[],
    [managementPeriodsResponse],
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
        title: periodForm.title.trim(),
        description: periodForm.description.trim() || null,
        startAt: toDateTimePayload(periodForm.startAt),
        endAt: toDateTimePayload(periodForm.endAt, true),
        status: periodForm.status,
      };

      if (periodForm.id) {
        return osisService.updateManagementPeriod(periodForm.id, payload);
      }
      return osisService.createManagementPeriod(payload);
    },
    onSuccess: async () => {
      toast.success(periodForm.id ? 'Periode OSIS diperbarui' : 'Periode OSIS dibuat');
      setPeriodForm({ id: null, title: '', description: '', startAt: '', endAt: '', status: 'DRAFT' });
      await queryClient.invalidateQueries({ queryKey: ['osis-management-periods'] });
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
        displayOrder: Number(divisionForm.displayOrder || 0),
      };
      if (divisionForm.id) return osisService.updateDivision(divisionForm.id, payload);
      return osisService.createDivision(payload);
    },
    onSuccess: async () => {
      toast.success(divisionForm.id ? 'Divisi diperbarui' : 'Divisi ditambahkan');
      setDivisionForm({ id: null, name: '', code: '', description: '', displayOrder: 0 });
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
        displayOrder: Number(positionForm.displayOrder || 0),
      };
      if (positionForm.id) return osisService.updatePosition(positionForm.id, payload);
      return osisService.createPosition(payload);
    },
    onSuccess: async () => {
      toast.success(positionForm.id ? 'Jabatan diperbarui' : 'Jabatan ditambahkan');
      setPositionForm({ id: null, name: '', code: '', description: '', divisionId: '', displayOrder: 0 });
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
      };

      if (membershipForm.id) {
        return osisService.updateMembership(membershipForm.id, payload);
      }
      return osisService.createMembership(payload);
    },
    onSuccess: async () => {
      toast.success(membershipForm.id ? 'Anggota OSIS diperbarui' : 'Anggota OSIS ditambahkan');
      setMembershipForm({
        id: null,
        studentId: '',
        positionId: '',
        divisionId: '',
        joinedAt: '',
        endedAt: '',
        isActive: true,
      });
      await queryClient.invalidateQueries({ queryKey: ['osis-memberships'] });
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
    setPeriodForm({ id: null, title: '', description: '', startAt: '', endAt: '', status: 'DRAFT' });
  const resetDivisionForm = () =>
    setDivisionForm({ id: null, name: '', code: '', description: '', displayOrder: 0 });
  const resetPositionForm = () =>
    setPositionForm({ id: null, name: '', code: '', description: '', divisionId: '', displayOrder: 0 });
  const resetMembershipForm = () =>
    setMembershipForm({
      id: null,
      studentId: '',
      positionId: '',
      divisionId: '',
      joinedAt: '',
      endedAt: '',
      isActive: true,
    });

  if (!selectedAcademicYearId && academicYears.length > 0) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500">Memuat konteks OSIS...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Struktur & Nilai OSIS</h1>
            <p className="text-sm text-slate-600">
              Kelola periode kepengurusan, divisi, jabatan, anggota, dan penilaian OSIS secara terpisah dari ekskul.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedAcademicYearId || ''}
              onChange={(e) => {
                setSelectedAcademicYearIdState(Number(e.target.value || 0) || null);
                setSelectedPeriodIdState(null);
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
            >
              {academicYears.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name} {year.isActive ? '(Aktif)' : ''}
                </option>
              ))}
            </select>
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
                    {period.title} • {period.status}
                  </option>
                ))
              )}
            </select>
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
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-700">
              <CalendarDays className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Periode</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-emerald-900">{periods.length}</p>
            <p className="text-sm text-emerald-800">Periode kepengurusan di tahun ajaran terpilih.</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-700">
              <Layers3 className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Divisi</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-blue-900">{divisions.length}</p>
            <p className="text-sm text-blue-800">Divisi aktif pada periode yang dipilih.</p>
          </div>
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-violet-700">
              <ShieldCheck className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Jabatan</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-violet-900">{positions.length}</p>
            <p className="text-sm text-violet-800">Jabatan yang dapat dipakai untuk struktur OSIS.</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <Users className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Pengurus</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-amber-900">{memberships.length}</p>
            <p className="text-sm text-amber-800">Anggota/pengurus OSIS pada periode aktif.</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.35fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Periode Kepengurusan</h2>
              <p className="text-sm text-slate-500">Buat atau perbarui periode kepengurusan OSIS per tahun ajaran.</p>
            </div>
            <button type="button" onClick={resetPeriodForm} className="text-sm font-medium text-blue-700 hover:text-blue-800">
              Periode Baru
            </button>
          </div>

          <div className="grid gap-3">
            <input
              type="text"
              value={periodForm.title}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Contoh: Kepengurusan OSIS 2026/2027"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <textarea
              rows={3}
              value={periodForm.description}
              onChange={(e) => setPeriodForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Keterangan singkat periode kepengurusan..."
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="date"
                value={periodForm.startAt}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, startAt: e.target.value }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={periodForm.endAt}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, endAt: e.target.value }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <select
                value={periodForm.status}
                onChange={(e) => setPeriodForm((prev) => ({ ...prev, status: e.target.value as typeof prev.status }))}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Aktif</option>
                <option value="CLOSED">Ditutup</option>
              </select>
            </div>
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
              className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSavingManagementPeriod ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {periodForm.id ? 'Simpan Perubahan Periode' : 'Buat Periode'}
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {isLoadingPeriods ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                Memuat periode OSIS...
              </div>
            ) : periods.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Belum ada periode kepengurusan untuk tahun ajaran ini.
              </div>
            ) : (
              periods.map((period) => (
                <div
                  key={period.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    Number(selectedPeriod?.id) === Number(period.id)
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{period.title}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {toDateInputValue(period.startAt)} s.d. {toDateInputValue(period.endAt)} • {period.status}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Divisi {period._count?.divisions || 0} • Jabatan {period._count?.positions || 0} • Pengurus {period._count?.memberships || 0}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPeriodIdState(period.id);
                          setPeriodForm({
                            id: period.id,
                            title: period.title,
                            description: period.description || '',
                            startAt: toDateInputValue(period.startAt),
                            endAt: toDateInputValue(period.endAt),
                            status: period.status,
                          });
                        }}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        title="Edit periode"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Divisi OSIS</h2>
                    <p className="text-sm text-slate-500">Atur bidang/divisi secara dinamis tanpa hardcode.</p>
                  </div>
                  <button type="button" onClick={resetDivisionForm} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                    Divisi Baru
                  </button>
                </div>
                <div className="grid gap-3">
                  <input
                    type="text"
                    value={divisionForm.name}
                    onChange={(e) => setDivisionForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nama divisi"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="text"
                      value={divisionForm.code}
                      onChange={(e) => setDivisionForm((prev) => ({ ...prev, code: e.target.value }))}
                      placeholder="Kode (opsional)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={divisionForm.displayOrder}
                      onChange={(e) => setDivisionForm((prev) => ({ ...prev, displayOrder: Number(e.target.value || 0) }))}
                      placeholder="Urutan tampil"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    rows={2}
                    value={divisionForm.description}
                    onChange={(e) => setDivisionForm((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Deskripsi singkat divisi"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => saveDivision()}
                    disabled={isSavingDivision || !selectedPeriod?.id || !divisionForm.name.trim()}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingDivision ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    {divisionForm.id ? 'Simpan Divisi' : 'Tambah Divisi'}
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {divisions.map((division) => (
                    <div key={division.id} className="flex items-start justify-between rounded-2xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{division.name}</p>
                        <p className="text-xs text-slate-500">
                          {division.code} • Urutan {division.displayOrder} • Jabatan {division._count?.positions || 0}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setDivisionForm({
                              id: division.id,
                              name: division.name,
                              code: division.code,
                              description: division.description || '',
                              displayOrder: division.displayOrder,
                            })
                          }
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteDivision(division.id)}
                          className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Jabatan OSIS</h2>
                    <p className="text-sm text-slate-500">Topang struktur ketua, wakil, sekretaris, bendahara, dan bidang.</p>
                  </div>
                  <button type="button" onClick={resetPositionForm} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                    Jabatan Baru
                  </button>
                </div>
                <div className="grid gap-3">
                  <input
                    type="text"
                    value={positionForm.name}
                    onChange={(e) => setPositionForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Nama jabatan"
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      value={positionForm.divisionId}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, divisionId: e.target.value }))}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      <option value="">Tanpa divisi khusus</option>
                      {divisions.map((division) => (
                        <option key={division.id} value={division.id}>
                          {division.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={positionForm.displayOrder}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, displayOrder: Number(e.target.value || 0) }))}
                      placeholder="Urutan tampil"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <input
                      type="text"
                      value={positionForm.code}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, code: e.target.value }))}
                      placeholder="Kode (opsional)"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <textarea
                      rows={2}
                      value={positionForm.description}
                      onChange={(e) => setPositionForm((prev) => ({ ...prev, description: e.target.value }))}
                      placeholder="Deskripsi jabatan"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => savePosition()}
                    disabled={isSavingPosition || !selectedPeriod?.id || !positionForm.name.trim()}
                    className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingPosition ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    {positionForm.id ? 'Simpan Jabatan' : 'Tambah Jabatan'}
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {positions.map((position) => (
                    <div key={position.id} className="flex items-start justify-between rounded-2xl border border-slate-200 px-4 py-3">
                      <div>
                        <p className="font-medium text-slate-900">{position.name}</p>
                        <p className="text-xs text-slate-500">
                          {position.code} • {position.division?.name || 'Lintas organisasi'} • Anggota {position._count?.memberships || 0}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPositionForm({
                              id: position.id,
                              name: position.name,
                              code: position.code,
                              description: position.description || '',
                              divisionId: position.divisionId ? String(position.divisionId) : '',
                              displayOrder: position.displayOrder,
                            })
                          }
                          className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePosition(position.id)}
                          className="rounded-lg border border-rose-200 p-2 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pengurus & Nilai OSIS</h2>
                <p className="text-sm text-slate-500">
                  Daftarkan siswa ke struktur OSIS dan nilai mereka sesuai program rapor aktif.
                </p>
              </div>
              <button type="button" onClick={resetMembershipForm} className="text-sm font-medium text-blue-700 hover:text-blue-800">
                Anggota Baru
              </button>
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
              <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-3">
                  <input
                    type="text"
                    value={eligibleSearch}
                    onChange={(e) => setEligibleSearch(e.target.value)}
                    placeholder="Cari siswa..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={membershipForm.studentId}
                    onChange={(e) => setMembershipForm((prev) => ({ ...prev, studentId: e.target.value }))}
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
                  <button
                    type="button"
                    onClick={() => saveMembership()}
                    disabled={
                      isSavingMembership ||
                      !selectedPeriod?.id ||
                      !membershipForm.studentId ||
                      !membershipForm.positionId
                    }
                    className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingMembership ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                    {membershipForm.id ? 'Simpan Perubahan Anggota' : 'Tambah Pengurus'}
                  </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Template Nilai OSIS</h3>
                      <p className="text-xs text-slate-500">Per semester dan program rapor.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => saveGradeTemplates()}
                      disabled={isSavingTemplates || isFetchingTemplates || !selectedAcademicYearId || !effectiveReportType}
                      className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSavingTemplates ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
                      Simpan
                    </button>
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
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                    placeholder="Cari pengurus..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm md:max-w-sm"
                  />
                  <p className="text-xs text-slate-500">
                    Slot rapor aktif: <span className="font-semibold text-slate-700">{selectedReportSlot || effectiveReportType || '-'}</span>
                  </p>
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
                                    onClick={() =>
                                      setMembershipForm({
                                        id: membership.id,
                                        studentId: String(membership.studentId),
                                        positionId: String(membership.positionId),
                                        divisionId: membership.divisionId ? String(membership.divisionId) : '',
                                        joinedAt: toDateInputValue(membership.joinedAt),
                                        endedAt: toDateInputValue(membership.endedAt),
                                        isActive: membership.isActive,
                                      })
                                    }
                                    className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                                    title="Edit anggota"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => saveAssessment(membership.id)}
                                    disabled={isSavingAssessment || !gradeValue}
                                    className="rounded-lg border border-blue-200 p-2 text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    title="Simpan nilai"
                                  >
                                    <Save className="h-4 w-4" />
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
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default OsisManagementPage;
