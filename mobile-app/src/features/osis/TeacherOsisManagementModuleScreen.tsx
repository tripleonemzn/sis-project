import { useMemo, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppLoadingScreen } from '../../components/AppLoadingScreen';
import { MobileActiveAcademicYearNotice } from '../../components/MobileActiveAcademicYearNotice';
import { MobileMenuTabBar } from '../../components/MobileMenuTabBar';
import { MobileSelectField } from '../../components/MobileSelectField';
import { MobileSummaryCard as SummaryCard } from '../../components/MobileSummaryCard';
import { QueryStateView } from '../../components/QueryStateView';
import { useAuth } from '../auth/AuthProvider';
import { BRAND_COLORS } from '../../config/brand';
import { academicYearApi } from '../academicYear/academicYearApi';
import { getStandardPagePadding } from '../../lib/ui/pageLayout';
import { notifyApiError, notifySuccess } from '../../lib/ui/feedback';
import {
  osisApi,
  type MobileOsisDivision,
  type MobileOsisGradeTemplatesPayload,
  type MobileOsisJoinRequest,
  type MobileOsisMembership,
  type MobileOsisPosition,
} from './osisApi';

type SemesterFilter = 'ODD' | 'EVEN';

type ManagementPeriodFormState = {
  title: string;
  description: string;
  electionPeriodId: string;
  startAt: string;
  endAt: string;
  transitionLabel: string;
  transitionAt: string;
  transitionNotes: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
};

type DivisionFormState = {
  id?: number;
  name: string;
  code: string;
  description: string;
  displayOrder: string;
};

type PositionFormState = {
  id?: number;
  divisionId: string;
  name: string;
  code: string;
  description: string;
  displayOrder: string;
};

type MembershipFormState = {
  id?: number;
  studentId: string;
  positionId: string;
  divisionId: string;
  joinedAt: string;
  endedAt: string;
  isActive: boolean;
  requestId?: number | null;
};

type AssessmentDraftState = {
  membershipId: number;
  grade: string;
  description: string;
};

function normalizeDuty(value?: string) {
  return String(value || '').trim().toUpperCase();
}

function hasOsisDuty(duties?: string[]) {
  return Array.isArray(duties) && duties.some((duty) => normalizeDuty(duty) === 'PEMBINA_OSIS');
}

function todayDateInput() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toInputDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toInputDateTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const normalized = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return normalized.toISOString().slice(0, 16);
}

function toIsoDate(value: string, endOfDay = false) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const suffix = endOfDay ? 'T23:59:59.000Z' : 'T00:00:00.000Z';
  return new Date(`${raw}${suffix}`).toISOString();
}

function toIsoDateTime(value: string) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
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

function createDefaultPeriodForm(): ManagementPeriodFormState {
  const start = new Date();
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    title: '',
    description: '',
    electionPeriodId: '',
    startAt: toInputDate(start.toISOString()),
    endAt: toInputDate(end.toISOString()),
    transitionLabel: '',
    transitionAt: '',
    transitionNotes: '',
    status: 'DRAFT',
  };
}

function createDefaultDivisionForm(): DivisionFormState {
  return {
    name: '',
    code: '',
    description: '',
    displayOrder: '',
  };
}

function createDefaultPositionForm(): PositionFormState {
  return {
    divisionId: '',
    name: '',
    code: '',
    description: '',
    displayOrder: '',
  };
}

function createDefaultMembershipForm(): MembershipFormState {
  return {
    studentId: '',
    positionId: '',
    divisionId: '',
    joinedAt: todayDateInput(),
    endedAt: '',
    isActive: true,
    requestId: null,
  };
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#dbe7fb',
        borderRadius: 16,
        padding: 14,
        gap: 12,
      }}
    >
      <View>
        <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800', fontSize: 16 }}>{title}</Text>
        {subtitle ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#475569', fontWeight: '700', fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  multiline = false,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#94a3b8"
      multiline={multiline}
      style={{
        borderWidth: 1,
        borderColor: '#d6e2f7',
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: multiline ? 12 : 10,
        color: BRAND_COLORS.textDark,
        minHeight: multiline ? 92 : undefined,
        textAlignVertical: multiline ? 'top' : 'center',
        backgroundColor: '#fff',
      }}
    />
  );
}

function resolveReadinessTone(stage?: string | null) {
  switch (stage) {
    case 'READY':
      return { bg: '#ecfdf5', border: '#a7f3d0', text: '#166534' };
    case 'NEEDS_ACTIVE_PERIOD':
    case 'NEEDS_TRANSITION':
      return { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' };
    case 'NEEDS_ELECTION':
    case 'NEEDS_ELECTION_LINK':
    case 'NEEDS_MANAGEMENT_PERIOD':
      return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
    default:
      return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
  }
}

function resolveRequestStatusTone(status?: string | null) {
  if (status === 'APPROVED') return { bg: '#ecfdf5', border: '#a7f3d0', text: '#166534' };
  if (status === 'REJECTED') return { bg: '#fff1f2', border: '#fecdd3', text: '#be123c' };
  return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
}

function resolveManagementStatusTone(status?: string | null) {
  if (status === 'ACTIVE') return { bg: '#ecfdf5', border: '#a7f3d0', text: '#166534' };
  if (status === 'CLOSED') return { bg: '#f8fafc', border: '#cbd5e1', text: '#475569' };
  return { bg: '#fff7ed', border: '#fdba74', text: '#c2410c' };
}

export function TeacherOsisManagementModuleScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const { isAuthenticated, isLoading, user } = useAuth();
  const pagePadding = getStandardPagePadding(insets, { bottom: 120 });

  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [semester, setSemester] = useState<SemesterFilter>('EVEN');
  const [periodFormVisible, setPeriodFormVisible] = useState(false);
  const [periodMode, setPeriodMode] = useState<'create' | 'edit'>('create');
  const [periodForm, setPeriodForm] = useState<ManagementPeriodFormState>(createDefaultPeriodForm());
  const [divisionFormVisible, setDivisionFormVisible] = useState(false);
  const [divisionForm, setDivisionForm] = useState<DivisionFormState>(createDefaultDivisionForm());
  const [positionFormVisible, setPositionFormVisible] = useState(false);
  const [positionForm, setPositionForm] = useState<PositionFormState>(createDefaultPositionForm());
  const [membershipFormVisible, setMembershipFormVisible] = useState(false);
  const [membershipForm, setMembershipForm] = useState<MembershipFormState>(createDefaultMembershipForm());
  const [studentSearch, setStudentSearch] = useState('');
  const [assessmentDraft, setAssessmentDraft] = useState<AssessmentDraftState | null>(null);
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<MobileOsisGradeTemplatesPayload['templates']>({
    SB: { label: 'Sangat Baik (SB)', description: '' },
    B: { label: 'Baik (B)', description: '' },
    C: { label: 'Cukup (C)', description: '' },
    K: { label: 'Kurang (K)', description: '' },
  });

  const activeYearQuery = useQuery({
    queryKey: ['mobile-osis-management-active-year'],
    enabled: isAuthenticated && user?.role === 'TEACHER' && hasOsisDuty(user?.additionalDuties),
    queryFn: () => academicYearApi.getActive({ allowStaleOnError: true }),
    staleTime: 5 * 60 * 1000,
  });

  const electionPeriodsQuery = useQuery({
    queryKey: ['mobile-osis-management-election-periods', activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getPeriods(activeYearQuery.data?.id ? { academicYearId: activeYearQuery.data.id } : undefined),
  });

  const managementPeriodsQuery = useQuery({
    queryKey: ['mobile-osis-management-periods', activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getManagementPeriods(activeYearQuery.data?.id ? { academicYearId: activeYearQuery.data.id } : undefined),
  });

  const managementPeriods = useMemo(() => managementPeriodsQuery.data || [], [managementPeriodsQuery.data]);
  const effectiveSelectedPeriodId =
    selectedPeriodId && managementPeriods.some((period) => period.id === selectedPeriodId)
      ? selectedPeriodId
      : managementPeriods[0]?.id || null;
  const selectedPeriod = useMemo(
    () => managementPeriods.find((period) => period.id === effectiveSelectedPeriodId) || null,
    [effectiveSelectedPeriodId, managementPeriods],
  );

  const readinessQuery = useQuery({
    queryKey: ['mobile-osis-work-program-readiness', activeYearQuery.data?.id || 'none'],
    enabled: isAuthenticated && Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getWorkProgramReadiness(activeYearQuery.data?.id || null),
  });

  const divisionsQuery = useQuery({
    queryKey: ['mobile-osis-divisions', selectedPeriod?.id || 'none'],
    enabled: Boolean(selectedPeriod?.id),
    queryFn: () => osisApi.getDivisions({ periodId: selectedPeriod!.id }),
  });

  const positionsQuery = useQuery({
    queryKey: ['mobile-osis-positions', selectedPeriod?.id || 'none'],
    enabled: Boolean(selectedPeriod?.id),
    queryFn: () => osisApi.getPositions({ periodId: selectedPeriod!.id }),
  });

  const membershipsQuery = useQuery({
    queryKey: ['mobile-osis-memberships', selectedPeriod?.id || 'none', semester],
    enabled: Boolean(selectedPeriod?.id),
    queryFn: () => osisApi.getMemberships({ periodId: selectedPeriod!.id, semester }),
  });

  const joinRequestsQuery = useQuery({
    queryKey: ['mobile-osis-join-requests', activeYearQuery.data?.id || 'none'],
    enabled: Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getJoinRequests({ academicYearId: activeYearQuery.data!.id }),
  });

  const eligibleStudentsQuery = useQuery({
    queryKey: ['mobile-osis-management-eligible-students', activeYearQuery.data?.id || 'none', studentSearch],
    enabled: Boolean(activeYearQuery.data?.id),
    queryFn: () =>
      osisApi.getEligibleStudents({
        academicYearId: activeYearQuery.data!.id,
        search: studentSearch.trim() || undefined,
      }),
  });

  const gradeTemplatesQuery = useQuery({
    queryKey: ['mobile-osis-grade-templates', activeYearQuery.data?.id || 'none', semester],
    enabled: Boolean(activeYearQuery.data?.id),
    queryFn: () => osisApi.getGradeTemplates({ academicYearId: activeYearQuery.data!.id, semester }),
  });

  const positions = useMemo(() => positionsQuery.data || [], [positionsQuery.data]);
  const divisions = useMemo(() => divisionsQuery.data || [], [divisionsQuery.data]);
  const memberships = useMemo(() => membershipsQuery.data?.memberships || [], [membershipsQuery.data?.memberships]);
  const effectiveTemplateDraft = templateDirty
    ? templateDraft
    : (gradeTemplatesQuery.data?.templates || templateDraft);
  const selectedStudent = useMemo(
    () => eligibleStudentsQuery.data?.find((student) => student.id === Number(membershipForm.studentId)) || null,
    [eligibleStudentsQuery.data, membershipForm.studentId],
  );
  const selectedPosition = useMemo(
    () => positions.find((position) => position.id === Number(membershipForm.positionId)) || null,
    [membershipForm.positionId, positions],
  );
  const osisModuleItems = useMemo(
    () => [
      { key: 'management', label: 'Struktur & Nilai', iconName: 'users' as const },
      { key: 'election', label: 'Pemilihan OSIS', iconName: 'clipboard' as const },
      { key: 'vote', label: 'Pemungutan Suara', iconName: 'check-square' as const },
      { key: 'inventory', label: 'Inventaris OSIS', iconName: 'package' as const },
    ],
    [],
  );
  const managementPeriodOptions = useMemo(
    () => managementPeriods.map((period) => ({ value: String(period.id), label: period.title })),
    [managementPeriods],
  );
  const electionPeriodOptions = useMemo(
    () => [
      { value: '', label: 'Tanpa Tautan' },
      ...((electionPeriodsQuery.data || [])
        .filter((period) => period.status === 'CLOSED')
        .map((period) => ({ value: String(period.id), label: period.title }))),
    ],
    [electionPeriodsQuery.data],
  );
  const managementStatusOptions = useMemo(
    () => [
      { value: 'DRAFT', label: 'Draft' },
      { value: 'ACTIVE', label: 'Aktif' },
      { value: 'CLOSED', label: 'Closed' },
    ],
    [],
  );
  const divisionOptions = useMemo(
    () => [
      { value: '', label: 'Tanpa Divisi' },
      ...divisions.map((division) => ({ value: String(division.id), label: division.name })),
    ],
    [divisions],
  );
  const semesterOptions = useMemo(
    () => [
      { value: 'ODD', label: 'Semester Ganjil' },
      { value: 'EVEN', label: 'Semester Genap' },
    ],
    [],
  );
  const membershipPositionOptions = useMemo(
    () => positions.map((position) => ({ value: String(position.id), label: position.name })),
    [positions],
  );
  const assessmentGradeOptions = useMemo(
    () => [
      { value: 'SB', label: 'Sangat Baik (SB)' },
      { value: 'B', label: 'Baik (B)' },
      { value: 'C', label: 'Cukup (C)' },
      { value: 'K', label: 'Kurang (K)' },
    ],
    [],
  );

  const refreshManagementData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-management-periods'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-divisions'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-positions'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-memberships'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-join-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-grade-templates'] }),
      queryClient.invalidateQueries({ queryKey: ['mobile-osis-work-program-readiness'] }),
    ]);
  };

  const savePeriodMutation = useMutation({
    mutationFn: async () => {
      const academicYearId = activeYearQuery.data?.id;
      if (!academicYearId) throw new Error('Tahun ajaran aktif belum tersedia.');
      const payload = {
        academicYearId,
        electionPeriodId: periodForm.electionPeriodId ? Number(periodForm.electionPeriodId) : null,
        title: periodForm.title.trim(),
        description: periodForm.description.trim() || null,
        startAt: toIsoDate(periodForm.startAt),
        endAt: toIsoDate(periodForm.endAt, true),
        transitionLabel: periodForm.transitionLabel.trim() || null,
        transitionAt: periodForm.transitionAt ? toIsoDateTime(periodForm.transitionAt) : null,
        transitionNotes: periodForm.transitionNotes.trim() || null,
        status: periodForm.status,
      };
      if (!payload.title) throw new Error('Judul periode wajib diisi.');
      if (!payload.startAt || !payload.endAt) throw new Error('Tanggal periode belum valid.');
      if (periodMode === 'edit' && selectedPeriod?.id) {
        return osisApi.updateManagementPeriod(selectedPeriod.id, payload);
      }
      return osisApi.createManagementPeriod(payload);
    },
    onSuccess: async (saved) => {
      notifySuccess(periodMode === 'edit' ? 'Periode kepengurusan diperbarui.' : 'Periode kepengurusan dibuat.');
      setPeriodFormVisible(false);
      if (saved?.id) setSelectedPeriodId(saved.id);
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan periode kepengurusan OSIS.'),
  });

  const saveDivisionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode kepengurusan terlebih dahulu.');
      const payload = {
        periodId: selectedPeriod.id,
        name: divisionForm.name.trim(),
        code: divisionForm.code.trim() || null,
        description: divisionForm.description.trim() || null,
        displayOrder: divisionForm.displayOrder ? Number(divisionForm.displayOrder) : undefined,
      };
      if (!payload.name) throw new Error('Nama divisi wajib diisi.');
      if (divisionForm.id) {
        return osisApi.updateDivision(divisionForm.id, payload);
      }
      return osisApi.createDivision(payload);
    },
    onSuccess: async () => {
      notifySuccess(divisionForm.id ? 'Divisi diperbarui.' : 'Divisi ditambahkan.');
      setDivisionFormVisible(false);
      setDivisionForm(createDefaultDivisionForm());
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan divisi OSIS.'),
  });

  const savePositionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode kepengurusan terlebih dahulu.');
      const payload = {
        periodId: selectedPeriod.id,
        divisionId: positionForm.divisionId ? Number(positionForm.divisionId) : null,
        name: positionForm.name.trim(),
        code: positionForm.code.trim() || null,
        description: positionForm.description.trim() || null,
        displayOrder: positionForm.displayOrder ? Number(positionForm.displayOrder) : undefined,
      };
      if (!payload.name) throw new Error('Nama jabatan wajib diisi.');
      if (positionForm.id) {
        return osisApi.updatePosition(positionForm.id, payload);
      }
      return osisApi.createPosition(payload);
    },
    onSuccess: async () => {
      notifySuccess(positionForm.id ? 'Jabatan diperbarui.' : 'Jabatan ditambahkan.');
      setPositionFormVisible(false);
      setPositionForm(createDefaultPositionForm());
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan jabatan OSIS.'),
  });

  const saveMembershipMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPeriod?.id) throw new Error('Pilih periode kepengurusan terlebih dahulu.');
      const studentId = Number(membershipForm.studentId);
      const positionId = Number(membershipForm.positionId);
      if (!Number.isFinite(studentId) || studentId <= 0) throw new Error('Pilih siswa anggota.');
      if (!Number.isFinite(positionId) || positionId <= 0) throw new Error('Pilih jabatan anggota.');
      const payload = {
        periodId: selectedPeriod.id,
        studentId,
        positionId,
        divisionId: membershipForm.divisionId ? Number(membershipForm.divisionId) : null,
        joinedAt: membershipForm.joinedAt ? toIsoDate(membershipForm.joinedAt) : null,
        endedAt: membershipForm.endedAt ? toIsoDate(membershipForm.endedAt, true) : null,
        isActive: membershipForm.isActive,
        requestId: membershipForm.requestId || null,
      };
      if (membershipForm.id) {
        return osisApi.updateMembership(membershipForm.id, payload);
      }
      return osisApi.createMembership(payload);
    },
    onSuccess: async () => {
      notifySuccess(membershipForm.id ? 'Anggota OSIS diperbarui.' : 'Anggota OSIS ditambahkan.');
      setMembershipFormVisible(false);
      setMembershipForm(createDefaultMembershipForm());
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan anggota OSIS.'),
  });

  const rejectJoinRequestMutation = useMutation({
    mutationFn: ({ id, note }: { id: number; note?: string }) => osisApi.rejectJoinRequest(id, { note: note || null }),
    onSuccess: async () => {
      notifySuccess('Pengajuan OSIS ditolak.');
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menolak pengajuan OSIS.'),
  });

  const saveTemplatesMutation = useMutation({
    mutationFn: async () => {
      const academicYearId = activeYearQuery.data?.id;
      if (!academicYearId) throw new Error('Tahun ajaran aktif belum tersedia.');
      return osisApi.saveGradeTemplates({
        academicYearId,
        semester,
        templates: templateDraft,
      });
    },
    onSuccess: async () => {
      notifySuccess('Template nilai OSIS diperbarui.');
      setTemplateDirty(false);
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan template nilai OSIS.'),
  });

  const assessmentMutation = useMutation({
    mutationFn: async () => {
      if (!assessmentDraft) throw new Error('Pilih anggota yang akan dinilai.');
      return osisApi.upsertAssessment({
        membershipId: assessmentDraft.membershipId,
        grade: assessmentDraft.grade,
        description: assessmentDraft.description.trim(),
        semester,
      });
    },
    onSuccess: async () => {
      notifySuccess('Penilaian OSIS disimpan.');
      setAssessmentDraft(null);
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menyimpan penilaian OSIS.'),
  });

  const deleteDivisionMutation = useMutation({
    mutationFn: (id: number) => osisApi.deleteDivision(id),
    onSuccess: async () => {
      notifySuccess('Divisi dihapus.');
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menghapus divisi OSIS.'),
  });

  const deletePositionMutation = useMutation({
    mutationFn: (id: number) => osisApi.deletePosition(id),
    onSuccess: async () => {
      notifySuccess('Jabatan dihapus.');
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menghapus jabatan OSIS.'),
  });

  const deleteMembershipMutation = useMutation({
    mutationFn: (id: number) => osisApi.deleteMembership(id),
    onSuccess: async () => {
      notifySuccess('Keanggotaan OSIS dihapus.');
      await refreshManagementData();
    },
    onError: (error) => notifyApiError(error, 'Gagal menghapus keanggotaan OSIS.'),
  });

  const stats = useMemo(() => {
    const periods = managementPeriodsQuery.data || [];
    return {
      totalPeriods: periods.length,
      activePeriods: periods.filter((period) => period.status === 'ACTIVE').length,
      totalDivisions: divisions.length,
      totalPositions: positions.length,
      totalMembers: memberships.length,
      pendingRequests: (joinRequestsQuery.data || []).filter((item) => item.status === 'PENDING').length,
    };
  }, [divisions.length, joinRequestsQuery.data, managementPeriodsQuery.data, memberships.length, positions.length]);

  const openCreatePeriod = () => {
    setPeriodMode('create');
    setPeriodForm(createDefaultPeriodForm());
    setPeriodFormVisible(true);
  };

  const openEditPeriod = () => {
    if (!selectedPeriod) return;
    setPeriodMode('edit');
    setPeriodForm({
      title: selectedPeriod.title,
      description: selectedPeriod.description || '',
      electionPeriodId: selectedPeriod.electionPeriodId ? String(selectedPeriod.electionPeriodId) : '',
      startAt: toInputDate(selectedPeriod.startAt),
      endAt: toInputDate(selectedPeriod.endAt),
      transitionLabel: selectedPeriod.transitionLabel || '',
      transitionAt: toInputDateTime(selectedPeriod.transitionAt),
      transitionNotes: selectedPeriod.transitionNotes || '',
      status: selectedPeriod.status,
    });
    setPeriodFormVisible(true);
  };

  const openEditDivision = (division: MobileOsisDivision) => {
    setDivisionFormVisible(true);
    setDivisionForm({
      id: division.id,
      name: division.name,
      code: division.code || '',
      description: division.description || '',
      displayOrder: String(division.displayOrder || ''),
    });
  };

  const openEditPosition = (position: MobileOsisPosition) => {
    setPositionFormVisible(true);
    setPositionForm({
      id: position.id,
      divisionId: position.divisionId ? String(position.divisionId) : '',
      name: position.name,
      code: position.code || '',
      description: position.description || '',
      displayOrder: String(position.displayOrder || ''),
    });
  };

  const openEditMembership = (membership: MobileOsisMembership) => {
    setMembershipFormVisible(true);
    setMembershipForm({
      id: membership.id,
      studentId: String(membership.studentId),
      positionId: String(membership.positionId),
      divisionId:
        membership.divisionId
        ? String(membership.divisionId)
        : membership.position?.divisionId
          ? String(membership.position.divisionId)
          : '',
      joinedAt: toInputDate(membership.joinedAt),
      endedAt: toInputDate(membership.endedAt),
      isActive: membership.isActive,
      requestId: null,
    });
  };

  const prepareJoinRequestAcceptance = (request: MobileOsisJoinRequest) => {
    setMembershipFormVisible(true);
    setMembershipForm({
      ...createDefaultMembershipForm(),
      studentId: request.studentId ? String(request.studentId) : '',
      requestId: request.id,
    });
  };

  if (isLoading) return <AppLoadingScreen message="Memuat struktur OSIS..." />;
  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (user?.role !== 'TEACHER' || !hasOsisDuty(user?.additionalDuties)) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: '#f8fafc' }} contentContainerStyle={pagePadding}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: BRAND_COLORS.textDark, marginBottom: 8 }}>
          Struktur & Nilai OSIS
        </Text>
        <QueryStateView type="error" message="Halaman ini khusus pembina OSIS." />
      </ScrollView>
    );
  }

  const readinessTone = resolveReadinessTone(readinessQuery.data?.stage);
  const selectedPeriodTone = resolveManagementStatusTone(selectedPeriod?.status);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#f8fafc' }}
      contentContainerStyle={pagePadding}
      refreshControl={
        <RefreshControl
          refreshing={
            activeYearQuery.isFetching
            || electionPeriodsQuery.isFetching
            || managementPeriodsQuery.isFetching
            || divisionsQuery.isFetching
            || positionsQuery.isFetching
            || membershipsQuery.isFetching
            || joinRequestsQuery.isFetching
            || gradeTemplatesQuery.isFetching
          }
          onRefresh={() => {
            void activeYearQuery.refetch();
            void electionPeriodsQuery.refetch();
            void managementPeriodsQuery.refetch();
            void readinessQuery.refetch();
            void divisionsQuery.refetch();
            void positionsQuery.refetch();
            void membershipsQuery.refetch();
            void joinRequestsQuery.refetch();
            void gradeTemplatesQuery.refetch();
          }}
        />
      }
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: BRAND_COLORS.textDark, marginBottom: 6 }}>
        Struktur & Nilai OSIS
      </Text>
      <Text style={{ color: BRAND_COLORS.textMuted, marginBottom: 12 }}>
        Kelola periode kepengurusan, struktur organisasi, anggota, pengajuan masuk, dan penilaian OSIS.
      </Text>

      <MobileActiveAcademicYearNotice
        name={activeYearQuery.data?.name}
        semester={activeYearQuery.data?.semester}
        helperText="Operasional OSIS di mobile dikunci ke tahun ajaran aktif yang tampil di header aplikasi."
      />

      <View
        style={{
          backgroundColor: '#fff',
          borderWidth: 1,
          borderColor: '#dbe7fb',
          borderRadius: 14,
          padding: 8,
          marginBottom: 12,
        }}
      >
        <MobileMenuTabBar
          items={osisModuleItems}
          activeKey="management"
          onChange={(key) => {
            if (key === 'election') router.push('/teacher/osis/election' as never);
            if (key === 'vote') router.push('/teacher/osis/vote' as never);
            if (key === 'inventory') router.push('/teacher/osis/inventory' as never);
          }}
          minTabWidth={86}
          maxTabWidth={112}
          compact
        />
      </View>

      <SectionCard title="Kesiapan OSIS" subtitle={activeYearQuery.data?.name || 'Tahun ajaran aktif belum ditemukan'}>
        <View style={{ backgroundColor: readinessTone.bg, borderWidth: 1, borderColor: readinessTone.border, borderRadius: 12, padding: 12 }}>
          <Text style={{ color: readinessTone.text, fontWeight: '800' }}>{readinessQuery.data?.stage || 'UNKNOWN'}</Text>
          <Text style={{ color: readinessTone.text, marginTop: 4 }}>{readinessQuery.data?.message || 'Belum ada status readiness.'}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <SummaryCard title="Periode" value={String(stats.totalPeriods)} subtitle="Kepengurusan OSIS" iconName="calendar" accentColor="#2563eb" />
          <SummaryCard title="Aktif" value={String(stats.activePeriods)} subtitle="Status ACTIVE" iconName="check-circle" accentColor="#059669" />
          <SummaryCard title="Divisi" value={String(stats.totalDivisions)} subtitle="Pada periode terpilih" iconName="layout" accentColor="#7c3aed" />
          <SummaryCard title="Jabatan" value={String(stats.totalPositions)} subtitle="Struktur organisasi" iconName="briefcase" accentColor="#d97706" />
          <SummaryCard title="Anggota" value={String(stats.totalMembers)} subtitle="Per semester terpilih" iconName="users" accentColor="#0f766e" />
          <SummaryCard title="Pengajuan" value={String(stats.pendingRequests)} subtitle="Menunggu tindak lanjut" iconName="inbox" accentColor="#c2410c" />
        </View>
      </SectionCard>

      <SectionCard title="Periode Kepengurusan" subtitle="Hubungkan hasil pemilihan, catat transisi, lalu aktifkan periode OSIS.">
        <MobileSelectField
          label="Periode Kepengurusan"
          value={selectedPeriod ? String(selectedPeriod.id) : ''}
          options={managementPeriodOptions}
          onChange={(next) => setSelectedPeriodId(next ? Number(next) : null)}
          placeholder="Pilih periode kepengurusan"
        />

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={openCreatePeriod}
            style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '800' }}>Buat Periode</Text>
          </Pressable>
          <Pressable
            disabled={!selectedPeriod}
            onPress={openEditPeriod}
            style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', backgroundColor: selectedPeriod ? '#fff' : '#e2e8f0', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: selectedPeriod ? BRAND_COLORS.navy : '#94a3b8', fontWeight: '800' }}>Edit Periode</Text>
          </Pressable>
        </View>

        {selectedPeriod ? (
          <View style={{ backgroundColor: selectedPeriodTone.bg, borderWidth: 1, borderColor: selectedPeriodTone.border, borderRadius: 12, padding: 12, gap: 6 }}>
            <Text style={{ color: selectedPeriodTone.text, fontWeight: '800' }}>{selectedPeriod.title}</Text>
            <Text style={{ color: selectedPeriodTone.text }}>
              {formatDate(selectedPeriod.startAt)} - {formatDate(selectedPeriod.endAt)} • {selectedPeriod.status}
            </Text>
            <Text style={{ color: selectedPeriodTone.text }}>
              Pemilihan: {selectedPeriod.electionPeriod?.title || 'Belum dihubungkan'}
            </Text>
            {selectedPeriod.transitionLabel ? (
              <Text style={{ color: selectedPeriodTone.text }}>
                {selectedPeriod.transitionLabel} • {selectedPeriod.transitionAt ? formatDate(selectedPeriod.transitionAt) : 'Tanggal belum dicatat'}
              </Text>
            ) : null}
            {selectedPeriod.description ? <Text style={{ color: selectedPeriodTone.text }}>{selectedPeriod.description}</Text> : null}
          </View>
        ) : null}

        {periodFormVisible ? (
          <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>
              {periodMode === 'edit' ? 'Edit Periode Kepengurusan' : 'Periode Kepengurusan Baru'}
            </Text>
            <Field label="Judul Periode">
              <Input value={periodForm.title} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, title: value }))} placeholder="Contoh: Kepengurusan OSIS 2025/2026" />
            </Field>
            <Field label="Deskripsi">
              <Input value={periodForm.description} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, description: value }))} placeholder="Catatan singkat periode kepengurusan" multiline />
            </Field>
            <Field label="Hubungkan ke Periode Pemilihan">
              <MobileSelectField
                value={periodForm.electionPeriodId}
                options={electionPeriodOptions}
                onChange={(next) => setPeriodForm((prev) => ({ ...prev, electionPeriodId: next || '' }))}
                placeholder="Pilih periode pemilihan"
              />
            </Field>
            <Field label="Mulai">
              <Input value={periodForm.startAt} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, startAt: value }))} placeholder="YYYY-MM-DD" />
            </Field>
            <Field label="Selesai">
              <Input value={periodForm.endAt} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, endAt: value }))} placeholder="YYYY-MM-DD" />
            </Field>
            <Field label="Label Transisi">
              <Input value={periodForm.transitionLabel} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, transitionLabel: value }))} placeholder="Contoh: Pelantikan Pengurus" />
            </Field>
            <Field label="Tanggal/Waktu Transisi">
              <Input value={periodForm.transitionAt} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, transitionAt: value }))} placeholder="YYYY-MM-DDTHH:MM" />
            </Field>
            <Field label="Catatan Transisi">
              <Input value={periodForm.transitionNotes} onChangeText={(value) => setPeriodForm((prev) => ({ ...prev, transitionNotes: value }))} placeholder="Catatan mubes / pelantikan / serah terima" multiline />
            </Field>
            <Field label="Status">
              <MobileSelectField
                value={periodForm.status}
                options={managementStatusOptions}
                onChange={(next) => setPeriodForm((prev) => ({ ...prev, status: (next as ManagementPeriodFormState['status']) || 'DRAFT' }))}
                placeholder="Pilih status periode"
              />
            </Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setPeriodFormVisible(false)} style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
              </Pressable>
              <Pressable disabled={savePeriodMutation.isPending} onPress={() => savePeriodMutation.mutate()} style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{savePeriodMutation.isPending ? 'Menyimpan...' : 'Simpan Periode'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard title="Divisi & Jabatan" subtitle="Bangun struktur organisasi inti untuk periode kepengurusan terpilih.">
        {!selectedPeriod ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Pilih periode kepengurusan terlebih dahulu.</Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => { setDivisionForm(createDefaultDivisionForm()); setDivisionFormVisible((prev) => !prev); }} style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>{divisionFormVisible ? 'Tutup Form Divisi' : 'Tambah Divisi'}</Text>
              </Pressable>
              <Pressable onPress={() => { setPositionForm(createDefaultPositionForm()); setPositionFormVisible((prev) => !prev); }} style={{ flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>{positionFormVisible ? 'Tutup Form Jabatan' : 'Tambah Jabatan'}</Text>
              </Pressable>
            </View>

            {divisionFormVisible ? (
              <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{divisionForm.id ? 'Edit Divisi' : 'Divisi Baru'}</Text>
                <Field label="Nama Divisi">
                  <Input value={divisionForm.name} onChangeText={(value) => setDivisionForm((prev) => ({ ...prev, name: value }))} placeholder="Contoh: Hubungan Masyarakat" />
                </Field>
                <Field label="Kode">
                  <Input value={divisionForm.code} onChangeText={(value) => setDivisionForm((prev) => ({ ...prev, code: value }))} placeholder="Contoh: HUMAS" />
                </Field>
                <Field label="Deskripsi">
                  <Input value={divisionForm.description} onChangeText={(value) => setDivisionForm((prev) => ({ ...prev, description: value }))} placeholder="Ringkasan tugas divisi" multiline />
                </Field>
                <Field label="Urutan Tampil">
                  <Input value={divisionForm.displayOrder} onChangeText={(value) => setDivisionForm((prev) => ({ ...prev, displayOrder: value }))} placeholder="Contoh: 1" />
                </Field>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setDivisionFormVisible(false)} style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
                  </Pressable>
                  <Pressable disabled={saveDivisionMutation.isPending} onPress={() => saveDivisionMutation.mutate()} style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{saveDivisionMutation.isPending ? 'Menyimpan...' : 'Simpan Divisi'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {positionFormVisible ? (
              <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{positionForm.id ? 'Edit Jabatan' : 'Jabatan Baru'}</Text>
                <Field label="Divisi">
                  <MobileSelectField
                    value={positionForm.divisionId}
                    options={divisionOptions}
                    onChange={(next) => setPositionForm((prev) => ({ ...prev, divisionId: next || '' }))}
                    placeholder="Pilih divisi"
                  />
                </Field>
                <Field label="Nama Jabatan">
                  <Input value={positionForm.name} onChangeText={(value) => setPositionForm((prev) => ({ ...prev, name: value }))} placeholder="Contoh: Ketua OSIS" />
                </Field>
                <Field label="Kode">
                  <Input value={positionForm.code} onChangeText={(value) => setPositionForm((prev) => ({ ...prev, code: value }))} placeholder="Contoh: KETUA" />
                </Field>
                <Field label="Deskripsi">
                  <Input value={positionForm.description} onChangeText={(value) => setPositionForm((prev) => ({ ...prev, description: value }))} placeholder="Ringkasan jabatan" multiline />
                </Field>
                <Field label="Urutan Tampil">
                  <Input value={positionForm.displayOrder} onChangeText={(value) => setPositionForm((prev) => ({ ...prev, displayOrder: value }))} placeholder="Contoh: 1" />
                </Field>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setPositionFormVisible(false)} style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
                  </Pressable>
                  <Pressable disabled={savePositionMutation.isPending} onPress={() => savePositionMutation.mutate()} style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{savePositionMutation.isPending ? 'Menyimpan...' : 'Simpan Jabatan'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              {divisions.map((division) => (
                <View key={division.id} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{division.name}</Text>
                      <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                        {division.code || 'Tanpa kode'} • {division._count?.positions || 0} jabatan • {division._count?.memberships || 0} anggota
                      </Text>
                      {division.description ? <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>{division.description}</Text> : null}
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => openEditDivision(division)} style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      disabled={deleteDivisionMutation.isPending}
                      onPress={() =>
                        Alert.alert('Hapus Divisi', `Hapus divisi ${division.name}?`, [
                          { text: 'Batal', style: 'cancel' },
                          { text: 'Hapus', style: 'destructive', onPress: () => deleteDivisionMutation.mutate(division.id) },
                        ])
                      }
                      style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '800' }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {positions.map((position) => (
                <View key={position.id} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{position.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted }}>
                    {position.code || 'Tanpa kode'} • Divisi: {position.division?.name || 'Umum'} • {position._count?.memberships || 0} anggota
                  </Text>
                  {position.description ? <Text style={{ color: BRAND_COLORS.textMuted }}>{position.description}</Text> : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => openEditPosition(position)} style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      disabled={deletePositionMutation.isPending}
                      onPress={() =>
                        Alert.alert('Hapus Jabatan', `Hapus jabatan ${position.name}?`, [
                          { text: 'Batal', style: 'cancel' },
                          { text: 'Hapus', style: 'destructive', onPress: () => deletePositionMutation.mutate(position.id) },
                        ])
                      }
                      style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '800' }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </SectionCard>

      <SectionCard title="Anggota & Pengajuan Masuk" subtitle="Terima pengajuan, tetapkan jabatan, atau koreksi susunan anggota OSIS.">
        {!selectedPeriod ? (
          <Text style={{ color: BRAND_COLORS.textMuted }}>Pilih periode kepengurusan terlebih dahulu.</Text>
        ) : (
          <>
            <MobileSelectField
              label="Semester"
              value={semester}
              options={semesterOptions}
              onChange={(next) => setSemester((next as SemesterFilter) || 'EVEN')}
              placeholder="Pilih semester"
            />
            <Pressable onPress={() => { setMembershipForm(createDefaultMembershipForm()); setMembershipFormVisible((prev) => !prev); }} style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>{membershipFormVisible ? 'Tutup Form Anggota' : 'Tambah Anggota OSIS'}</Text>
            </Pressable>

            {membershipFormVisible ? (
              <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
                <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{membershipForm.id ? 'Edit Anggota OSIS' : 'Anggota OSIS Baru'}</Text>
                <Field label="Cari Siswa">
                  <Input value={studentSearch} onChangeText={setStudentSearch} placeholder="Cari nama, NIS, atau NISN siswa" />
                </Field>
                <Field label="Pilih Siswa">
                  <View style={{ gap: 8 }}>
                    {selectedStudent ? (
                      <View style={{ backgroundColor: '#e9f1ff', borderRadius: 10, padding: 10 }}>
                        <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>{selectedStudent.name}</Text>
                        <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                          {selectedStudent.studentClass?.name || '-'} • {selectedStudent.nis || selectedStudent.nisn || '-'}
                        </Text>
                      </View>
                    ) : null}
                    {(eligibleStudentsQuery.data || []).slice(0, 12).map((student) => {
                      const active = Number(membershipForm.studentId) === student.id;
                      return (
                        <Pressable
                          key={student.id}
                          onPress={() => setMembershipForm((prev) => ({ ...prev, studentId: String(student.id) }))}
                          style={{
                            borderWidth: 1,
                            borderColor: active ? BRAND_COLORS.blue : '#d6e2f7',
                            backgroundColor: active ? '#e9f1ff' : '#fff',
                            borderRadius: 10,
                            padding: 10,
                          }}
                        >
                          <Text style={{ color: active ? BRAND_COLORS.navy : BRAND_COLORS.textDark, fontWeight: '700' }}>
                            {student.name}
                          </Text>
                          <Text style={{ color: BRAND_COLORS.textMuted, marginTop: 4 }}>
                            {student.studentClass?.name || '-'} • {student.nis || student.nisn || '-'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
                <Field label="Pilih Jabatan">
                  <MobileSelectField
                    value={membershipForm.positionId}
                    options={membershipPositionOptions}
                    onChange={(next) => {
                      const position = positions.find((item) => String(item.id) === String(next));
                      setMembershipForm((prev) => ({
                        ...prev,
                        positionId: next || '',
                        divisionId: position?.divisionId ? String(position.divisionId) : '',
                      }));
                    }}
                    placeholder="Pilih jabatan OSIS"
                  />
                </Field>
                <Field label="Divisi">
                  <Input value={selectedPosition?.division?.name || divisions.find((division) => division.id === Number(membershipForm.divisionId))?.name || '-'} onChangeText={() => {}} placeholder="Dipilih otomatis dari jabatan" />
                </Field>
                <Field label="Tanggal Bergabung">
                  <Input value={membershipForm.joinedAt} onChangeText={(value) => setMembershipForm((prev) => ({ ...prev, joinedAt: value }))} placeholder="YYYY-MM-DD" />
                </Field>
                <Field label="Tanggal Berakhir">
                  <Input value={membershipForm.endedAt} onChangeText={(value) => setMembershipForm((prev) => ({ ...prev, endedAt: value }))} placeholder="Opsional • YYYY-MM-DD" />
                </Field>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>Keanggotaan Aktif</Text>
                  <Switch value={membershipForm.isActive} onValueChange={(value) => setMembershipForm((prev) => ({ ...prev, isActive: value }))} />
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Pressable onPress={() => setMembershipFormVisible(false)} style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
                  </Pressable>
                  <Pressable disabled={saveMembershipMutation.isPending} onPress={() => saveMembershipMutation.mutate()} style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>{saveMembershipMutation.isPending ? 'Menyimpan...' : 'Simpan Anggota'}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={{ gap: 10 }}>
              {(joinRequestsQuery.data || []).map((request) => {
                const tone = resolveRequestStatusTone(request.status);
                return (
                  <View key={request.id} style={{ borderWidth: 1, borderColor: tone.border, backgroundColor: tone.bg, borderRadius: 12, padding: 12, gap: 8 }}>
                    <Text style={{ color: tone.text, fontWeight: '800' }}>
                      {request.student?.name || 'Siswa'} • {request.status}
                    </Text>
                    <Text style={{ color: tone.text }}>
                      {request.student?.studentClass?.name || '-'} • {request.student?.nis || request.student?.nisn || '-'}
                    </Text>
                    <Text style={{ color: tone.text }}>
                      Pengajuan: {formatDate(request.requestedAt)} • Ekskul: {request.ekskul?.name || 'OSIS'}
                    </Text>
                    {request.note ? <Text style={{ color: tone.text }}>Catatan: {request.note}</Text> : null}
                    {request.status === 'PENDING' ? (
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable onPress={() => prepareJoinRequestAcceptance(request)} style={{ flex: 1, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                          <Text style={{ color: '#fff', fontWeight: '800' }}>Terima & Atur Jabatan</Text>
                        </Pressable>
                        <Pressable
                          disabled={rejectJoinRequestMutation.isPending}
                          onPress={() =>
                            Alert.alert('Tolak Pengajuan', `Tolak pengajuan ${request.student?.name || 'siswa'}?`, [
                              { text: 'Batal', style: 'cancel' },
                              { text: 'Tolak', style: 'destructive', onPress: () => rejectJoinRequestMutation.mutate({ id: request.id }) },
                            ])
                          }
                          style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#be123c', fontWeight: '800' }}>Tolak</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {memberships.map((membership) => (
                <View key={membership.id} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 8 }}>
                  <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{membership.student.name}</Text>
                  <Text style={{ color: BRAND_COLORS.textMuted }}>
                    {membership.position?.name || '-'} • {membership.division?.name || membership.position?.division?.name || 'Tanpa divisi'}
                  </Text>
                  <Text style={{ color: BRAND_COLORS.textMuted }}>
                    Bergabung {formatDate(membership.joinedAt)} {membership.endedAt ? `• selesai ${formatDate(membership.endedAt)}` : ''}
                  </Text>
                  {membership.currentAssessment ? (
                    <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '700' }}>
                      Nilai aktif: {membership.currentAssessment.grade} • {membership.currentAssessment.description || 'Tanpa catatan'}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={() => openEditMembership(membership)} style={{ flex: 1, borderWidth: 1, borderColor: '#c7d6f5', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: BRAND_COLORS.navy, fontWeight: '800' }}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => setAssessmentDraft({ membershipId: membership.id, grade: membership.currentAssessment?.grade || 'B', description: membership.currentAssessment?.description || '' })} style={{ flex: 1, backgroundColor: '#2563eb', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Nilai</Text>
                    </Pressable>
                    <Pressable
                      disabled={deleteMembershipMutation.isPending}
                      onPress={() =>
                        Alert.alert('Hapus Keanggotaan', `Hapus anggota ${membership.student.name}?`, [
                          { text: 'Batal', style: 'cancel' },
                          { text: 'Hapus', style: 'destructive', onPress: () => deleteMembershipMutation.mutate(membership.id) },
                        ])
                      }
                      style={{ flex: 1, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fff1f2', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#be123c', fontWeight: '800' }}>Hapus</Text>
                    </Pressable>
                  </View>
                </View>
              ))}

              {!memberships.length && !(joinRequestsQuery.data || []).length ? (
                <Text style={{ color: BRAND_COLORS.textMuted }}>Belum ada anggota atau pengajuan OSIS pada periode ini.</Text>
              ) : null}
            </View>
          </>
        )}
      </SectionCard>

      <SectionCard title="Template Nilai & Penilaian" subtitle="Atur template predikat dan isi nilai anggota OSIS untuk semester terpilih.">
        <MobileSelectField
          label="Semester"
          value={semester}
          options={semesterOptions}
          onChange={(next) => setSemester((next as SemesterFilter) || 'EVEN')}
          placeholder="Pilih semester"
        />

        <View style={{ gap: 10 }}>
          {(['SB', 'B', 'C', 'K'] as const).map((predicate) => (
            <View key={predicate} style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 8 }}>
              <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>{predicate}</Text>
              <Input
                value={effectiveTemplateDraft[predicate].label}
                onChangeText={(value) =>
                  {
                    setTemplateDirty(true);
                    setTemplateDraft((prev) => ({
                      ...prev,
                      [predicate]: { ...effectiveTemplateDraft[predicate], label: value },
                    }));
                  }
                }
                placeholder={`Label ${predicate}`}
              />
              <Input
                value={effectiveTemplateDraft[predicate].description}
                onChangeText={(value) =>
                  {
                    setTemplateDirty(true);
                    setTemplateDraft((prev) => ({
                      ...prev,
                      [predicate]: { ...effectiveTemplateDraft[predicate], description: value },
                    }));
                  }
                }
                placeholder={`Deskripsi ${predicate}`}
                multiline
              />
            </View>
          ))}
        </View>

        <Pressable disabled={saveTemplatesMutation.isPending} onPress={() => saveTemplatesMutation.mutate()} style={{ backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800' }}>{saveTemplatesMutation.isPending ? 'Menyimpan Template...' : 'Simpan Template Nilai'}</Text>
        </Pressable>

        {assessmentDraft ? (
          <View style={{ borderWidth: 1, borderColor: '#dbe7fb', borderRadius: 12, padding: 12, gap: 10 }}>
            <Text style={{ color: BRAND_COLORS.textDark, fontWeight: '800' }}>Input Penilaian</Text>
            <Field label="Predikat">
              <MobileSelectField
                value={assessmentDraft.grade}
                options={assessmentGradeOptions}
                onChange={(next) => setAssessmentDraft((prev) => (prev ? { ...prev, grade: next || 'B' } : prev))}
                placeholder="Pilih predikat"
              />
            </Field>
            <Field label="Deskripsi Penilaian">
              <Input
                value={assessmentDraft.description}
                onChangeText={(value) => setAssessmentDraft((prev) => (prev ? { ...prev, description: value } : prev))}
                placeholder="Catatan penilaian anggota OSIS"
                multiline
              />
            </Field>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => setAssessmentDraft(null)} style={{ flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: BRAND_COLORS.textMuted, fontWeight: '800' }}>Batal</Text>
              </Pressable>
              <Pressable disabled={assessmentMutation.isPending} onPress={() => assessmentMutation.mutate()} style={{ flex: 1, backgroundColor: BRAND_COLORS.blue, borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '800' }}>{assessmentMutation.isPending ? 'Menyimpan...' : 'Simpan Penilaian'}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {gradeTemplatesQuery.isLoading ? <QueryStateView type="loading" message="Memuat template nilai OSIS..." /> : null}
      </SectionCard>
    </ScrollView>
  );
}
