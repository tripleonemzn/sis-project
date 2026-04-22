import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Loader2,
  PlusCircle,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  committeeService,
  type CommitteeAssignmentMemberKindCode,
  type CommitteeAssignmentMemberType,
  type CommitteeEventDetail,
  type CommitteeEventSummary,
  type CommitteeFeatureCode,
} from '../../services/committee.service';
import { examService } from '../../services/exam.service';
import { userService } from '../../services/user.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDate,
  formatCommitteeDateTime,
  formatCommitteeMemberMeta,
  getCommitteeStatusTone,
} from '../../features/committee/committeeUi';

type CommitteeFormState = {
  eventId: number | null;
  title: string;
  code: string;
  programCode: string;
  description: string;
};

type AssignmentFormState = {
  assignmentId: number | null;
  memberKind: CommitteeAssignmentMemberKindCode;
  userId: string;
  externalName: string;
  externalInstitution: string;
  assignmentRole: string;
  notes: string;
  featureCodes: CommitteeFeatureCode[];
};

const DEFAULT_ASSIGNMENT_MEMBER_TYPES = [
  {
    code: 'TEACHER',
    label: 'Guru',
    memberType: 'INTERNAL_USER',
    featureGrantEligible: true,
  },
  {
    code: 'STAFF',
    label: 'Staff TU',
    memberType: 'INTERNAL_USER',
    featureGrantEligible: false,
  },
  {
    code: 'EXTERNAL',
    label: 'Pembina Eksternal',
    memberType: 'EXTERNAL_MEMBER',
    featureGrantEligible: false,
  },
] as const;

function createEmptyFormState(): CommitteeFormState {
  return {
    eventId: null,
    title: '',
    code: '',
    programCode: '',
    description: '',
  };
}

function createEmptyAssignmentForm(): AssignmentFormState {
  return {
    assignmentId: null,
    memberKind: 'TEACHER',
    userId: '',
    externalName: '',
    externalInstitution: '',
    assignmentRole: '',
    notes: '',
    featureCodes: [],
  };
}

function getWorkspaceSection(featureCode: CommitteeFeatureCode) {
  if (featureCode === 'EXAM_PROGRAM') return 'program';
  if (featureCode === 'EXAM_SCHEDULE') return 'jadwal';
  if (featureCode === 'EXAM_ROOMS') return 'ruang';
  if (featureCode === 'EXAM_PROCTOR') return 'mengawas';
  if (featureCode === 'EXAM_LAYOUT') return 'denah';
  return 'kartu';
}

function buildWorkspacePath(event: CommitteeEventSummary) {
  const firstFeature = event.myAssignment?.featureCodes?.[0];
  const section = getWorkspaceSection(firstFeature || 'EXAM_PROGRAM');
  const label = encodeURIComponent(event.title.toUpperCase().startsWith('PANITIA') ? event.title : `Panitia ${event.title}`);
  return `/teacher/committee-events/${event.id}/exams?section=${section}&committeeLabel=${label}`;
}

function deriveAssignmentMemberKind(
  assignment: CommitteeEventDetail['assignments'][number],
): CommitteeAssignmentMemberKindCode {
  if (assignment.memberType === 'EXTERNAL_MEMBER') {
    return 'EXTERNAL';
  }
  return assignment.user?.role === 'STAFF' ? 'STAFF' : 'TEACHER';
}

function EventCard({
  event,
  onEdit,
  onSubmit,
  submitting,
}: {
  event: CommitteeEventSummary;
  onEdit: (event: CommitteeEventSummary) => void;
  onSubmit: (eventId: number) => void;
  submitting: boolean;
}) {
  const canEdit = event.status === 'DRAFT' || event.status === 'DITOLAK_KEPSEK';
  const canSubmit = canEdit;
  const canOpenWorkspace = event.status === 'AKTIF' && event.myAssignment && event.myAssignment.featureCodes.length > 0;
  const submitBlockedByMembers = canSubmit && event.counts.members === 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-900">{event.title}</h3>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(event.status)}`}>
              {COMMITTEE_STATUS_LABELS[event.status]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {event.code} • {event.programLabel || event.programCode || 'Tanpa program ujian khusus'}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Dibuat {formatCommitteeDateTime(event.createdAt)}</div>
          <div>Update terakhir {formatCommitteeDateTime(event.updatedAt)}</div>
        </div>
      </div>

      {event.description ? <p className="mt-4 text-sm leading-6 text-slate-600">{event.description}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Anggota Aktif</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{event.counts.members}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Usulan Feature Grant</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{event.counts.grantedFeatures}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">SK Panitia</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{event.sk.number || 'Belum terbit'}</div>
          <div className="mt-1 text-xs text-slate-500">{formatCommitteeDate(event.sk.issuedAt)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-slate-500">Preview Susunan Panitia</div>
        {event.membersPreview.length === 0 ? (
          <div className="mt-2 text-sm text-slate-500">Draft ini belum memiliki anggota panitia.</div>
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {event.membersPreview.map((member) => (
              <div key={`committee-member-preview-${member.id}`} className="rounded-xl border border-white bg-white px-3 py-3">
                <div className="text-sm font-semibold text-slate-900">{member.memberLabel}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatCommitteeMemberMeta(member.memberTypeLabel, member.memberDetail) || member.assignmentRole}
                </div>
                <div className="mt-2 text-xs font-medium text-slate-600">{member.assignmentRole}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {event.principalDecision.feedback ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-semibold">Catatan Kepala Sekolah</div>
          <div className="mt-1">{event.principalDecision.feedback}</div>
        </div>
      ) : null}

      {submitBlockedByMembers ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Tambahkan minimal satu anggota panitia pada draft ini sebelum diajukan ke Kepala Sekolah.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        {canEdit ? (
          <button
            type="button"
            onClick={() => onEdit(event)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Save className="h-4 w-4" />
            Edit Draft
          </button>
        ) : null}
        {canSubmit ? (
          <button
            type="button"
            onClick={() => onSubmit(event.id)}
            disabled={submitting || submitBlockedByMembers}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Ajukan ke Kepsek
          </button>
        ) : null}
        {canOpenWorkspace ? (
          <Link
            to={buildWorkspacePath(event)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            <ArrowRight className="h-4 w-4" />
            Buka Workspace Panitia
          </Link>
        ) : null}
      </div>
    </article>
  );
}

export default function CommitteeEventsPage() {
  const queryClient = useQueryClient();
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [form, setForm] = useState<CommitteeFormState>(() => createEmptyFormState());
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(() => createEmptyAssignmentForm());
  const [isFormOpen, setIsFormOpen] = useState(false);

  const committeeQuery = useQuery({
    queryKey: ['committee-teacher-events'],
    queryFn: () => committeeService.list({ scope: 'MINE' }),
    staleTime: 60_000,
  });

  const committeeMetaQuery = useQuery({
    queryKey: ['committee-teacher-meta'],
    queryFn: committeeService.getMeta,
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const eventDetailQuery = useQuery({
    queryKey: ['committee-teacher-detail', form.eventId],
    queryFn: () => committeeService.getDetail(form.eventId as number),
    enabled: Boolean(isFormOpen && form.eventId),
    staleTime: 30_000,
  });

  const examProgramsQuery = useQuery({
    queryKey: ['committee-exam-programs', activeAcademicYear?.id || 'none'],
    queryFn: () => examService.getPrograms({ academicYearId: activeAcademicYear?.id, roleContext: 'teacher' }),
    enabled: Boolean(activeAcademicYear?.id),
    staleTime: 5 * 60 * 1000,
  });

  const teacherQuery = useQuery({
    queryKey: ['committee-teacher-member-options'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const staffQuery = useQuery({
    queryKey: ['committee-staff-member-options'],
    queryFn: () => userService.getUsers({ role: 'STAFF', limit: 10000 }),
    enabled: isFormOpen,
    staleTime: 5 * 60 * 1000,
  });

  const assignmentMemberTypes =
    committeeMetaQuery.data?.data?.assignmentMemberTypes || DEFAULT_ASSIGNMENT_MEMBER_TYPES;
  const featureDefinitions = committeeMetaQuery.data?.data?.featureDefinitions || [];
  const detail = eventDetailQuery.data?.data?.item || null;
  const teachers = teacherQuery.data?.data || [];
  const staffs = staffQuery.data?.data || [];

  const assignmentMemberType = useMemo(
    () => assignmentMemberTypes.find((item) => item.code === assignmentForm.memberKind) || assignmentMemberTypes[0],
    [assignmentForm.memberKind, assignmentMemberTypes],
  );

  const internalMemberOptions = useMemo(() => {
    if (assignmentForm.memberKind === 'STAFF') {
      return staffs;
    }
    return teachers;
  }, [assignmentForm.memberKind, staffs, teachers]);

  const examPrograms = useMemo(() => {
    return (examProgramsQuery.data?.data?.programs || []).filter((program) => program.isActive);
  }, [examProgramsQuery.data?.data?.programs]);

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      eventId: number | null;
      title: string;
      code: string;
      description?: string | null;
      programCode?: string | null;
    }) => {
      if (payload.eventId) {
        return committeeService.update(payload.eventId, payload);
      }
      return committeeService.create(payload);
    },
    onSuccess: (response, variables) => {
      const saved = response.data.item;
      toast.success(variables.eventId ? 'Draft kepanitiaan diperbarui.' : 'Draft kepanitiaan dibuat. Lanjutkan dengan menyusun panitia.');
      setForm({
        eventId: saved.id,
        title: saved.title,
        code: saved.code,
        programCode: saved.programCode || '',
        description: saved.description || '',
      });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-detail', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan draft kepanitiaan');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (eventId: number) => committeeService.submit(eventId),
    onSuccess: (response, eventId) => {
      toast.success('Pengajuan kepanitiaan diteruskan ke Kepala Sekolah.');
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-detail', eventId] });
      if (form.eventId === eventId) {
        setIsFormOpen(false);
        setForm(createEmptyFormState());
        setAssignmentForm(createEmptyAssignmentForm());
      }
      if (response.data.item.status !== 'DRAFT') {
        queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
      }
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengajukan kepanitiaan');
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: () => {
      const payload = {
        memberType: assignmentMemberType.memberType as CommitteeAssignmentMemberType,
        userId: assignmentMemberType.memberType === 'INTERNAL_USER' ? Number(assignmentForm.userId) : null,
        externalName: assignmentMemberType.memberType === 'EXTERNAL_MEMBER' ? assignmentForm.externalName.trim() : null,
        externalInstitution:
          assignmentMemberType.memberType === 'EXTERNAL_MEMBER' ? assignmentForm.externalInstitution.trim() || null : null,
        assignmentRole: assignmentForm.assignmentRole.trim(),
        notes: assignmentForm.notes.trim() || null,
        featureCodes: assignmentMemberType.code === 'TEACHER' ? assignmentForm.featureCodes : [],
      };

      if (assignmentForm.assignmentId) {
        return committeeService.updateAssignment(form.eventId as number, assignmentForm.assignmentId, payload);
      }

      return committeeService.createAssignment(form.eventId as number, payload);
    },
    onSuccess: () => {
      toast.success(assignmentForm.assignmentId ? 'Rancangan anggota panitia diperbarui.' : 'Anggota panitia ditambahkan ke draft.');
      setAssignmentForm(createEmptyAssignmentForm());
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-detail', form.eventId] });
      queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan rancangan anggota panitia');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) => committeeService.deleteAssignment(form.eventId as number, assignmentId),
    onSuccess: () => {
      toast.success('Anggota panitia dihapus dari draft.');
      setAssignmentForm(createEmptyAssignmentForm());
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-detail', form.eventId] });
      queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menghapus anggota panitia');
    },
  });

  const events = committeeQuery.data?.data?.items || [];
  const requestedEvents = events.filter((event) => event.isRequester);
  const assignedActiveEvents = events.filter(
    (event) => event.isAssigned && event.status === 'AKTIF' && event.myAssignment?.featureCodes?.length,
  );

  const stats = {
    requested: requestedEvents.length,
    pending:
      requestedEvents.filter((event) => event.status === 'MENUNGGU_PERSETUJUAN_KEPSEK' || event.status === 'MENUNGGU_SK_TU')
        .length,
    activeAssignments: assignedActiveEvents.length,
    rejected: requestedEvents.filter((event) => event.status === 'DITOLAK_KEPSEK').length,
  };

  const openNewDraftModal = () => {
    setForm(createEmptyFormState());
    setAssignmentForm(createEmptyAssignmentForm());
    setIsFormOpen(true);
  };

  const closeDraftModal = () => {
    setIsFormOpen(false);
    setForm(createEmptyFormState());
    setAssignmentForm(createEmptyAssignmentForm());
  };

  const handleSaveDraft = () => {
    saveMutation.mutate({
      eventId: form.eventId,
      title: form.title.trim(),
      code: form.code.trim(),
      description: form.description.trim() || null,
      programCode: form.programCode || null,
    });
  };

  const handleEdit = (event: CommitteeEventSummary) => {
    setForm({
      eventId: event.id,
      title: event.title,
      code: event.code,
      programCode: event.programCode || '',
      description: event.description || '',
    });
    setAssignmentForm(createEmptyAssignmentForm());
    setIsFormOpen(true);
  };

  const handleStartEditAssignment = (assignment: CommitteeEventDetail['assignments'][number]) => {
    setAssignmentForm({
      assignmentId: assignment.id,
      memberKind: deriveAssignmentMemberKind(assignment),
      userId: assignment.userId ? String(assignment.userId) : '',
      externalName: assignment.externalName || '',
      externalInstitution: assignment.externalInstitution || '',
      assignmentRole: assignment.assignmentRole,
      notes: assignment.notes || '',
      featureCodes: assignment.featureGrants.map((feature) => feature.featureCode),
    });
  };

  const handleDeleteAssignment = (assignmentId: number) => {
    if (!window.confirm('Hapus anggota panitia ini dari draft?')) return;
    deleteAssignmentMutation.mutate(assignmentId);
  };

  const isAssignmentInternal = assignmentMemberType.memberType === 'INTERNAL_USER';
  const supportsWorkspaceGrant = assignmentMemberType.code === 'TEACHER';
  const canSaveAssignment =
    Boolean(form.eventId) &&
    Boolean(assignmentForm.assignmentRole.trim()) &&
    (isAssignmentInternal ? Boolean(assignmentForm.userId) : Boolean(assignmentForm.externalName.trim()));
  const canSubmitCurrentDraft = Boolean(detail?.access.canEditRequest) && (detail?.counts.members || 0) > 0;

  const isLoading = committeeQuery.isLoading;

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-sky-50 via-white to-emerald-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3 py-1 text-xs font-semibold text-sky-700">
              <Briefcase className="h-4 w-4" />
              Kepanitiaan Kegiatan
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Pengajuan Panitia dan Penugasan Event</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Susun draft kepanitiaan, tentukan anggota lintas guru, staff TU, atau pembina eksternal, lalu ajukan untuk review
              Kepala Sekolah. Feature workspace yang diusulkan tetap baru aktif setelah approval dan SK terbit.
            </p>
          </div>
          <button
            type="button"
            onClick={openNewDraftModal}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <PlusCircle className="h-4 w-4" />
            Draft Baru
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-500">Pengajuan Saya</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{stats.requested}</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="text-sm text-amber-700">Menunggu Approval / SK</div>
          <div className="mt-2 text-3xl font-bold text-amber-900">{stats.pending}</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
          <div className="text-sm text-emerald-700">Workspace Aktif</div>
          <div className="mt-2 text-3xl font-bold text-emerald-900">{stats.activeAssignments}</div>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
          <div className="text-sm text-rose-700">Perlu Revisi</div>
          <div className="mt-2 text-3xl font-bold text-rose-900">{stats.rejected}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Workspace Panitia Aktif</h2>
              <p className="mt-1 text-sm text-slate-500">Hanya event yang benar-benar di-grant ke akun Anda yang muncul di sini.</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-4 grid gap-3">
            {assignedActiveEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                Belum ada workspace panitia aktif yang digrant ke akun Anda.
              </div>
            ) : (
              assignedActiveEvents.map((event) => (
                <Link
                  key={`committee-workspace-${event.id}`}
                  to={buildWorkspacePath(event)}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition hover:border-emerald-300 hover:bg-emerald-100"
                >
                  <div className="text-sm font-semibold text-emerald-900">{event.title}</div>
                  <div className="mt-1 text-xs text-emerald-700">{event.myAssignment?.assignmentRole || 'Anggota Panitia'}</div>
                  <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-emerald-700">
                    Buka workspace
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Pengajuan Saya</h2>
              <p className="mt-1 text-sm text-slate-500">Pantau draft, revisi, approval, dan penerbitan SK panitia.</p>
            </div>
            <ClipboardList className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 space-y-4">
            {isLoading ? (
              <div className="flex min-h-[180px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : requestedEvents.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                Belum ada pengajuan kepanitiaan pada tahun ajaran aktif.
              </div>
            ) : (
              requestedEvents.map((event) => (
                <EventCard
                  key={`committee-request-${event.id}`}
                  event={event}
                  onEdit={handleEdit}
                  onSubmit={(eventId) => submitMutation.mutate(eventId)}
                  submitting={submitMutation.isPending && submitMutation.variables === event.id}
                />
              ))
            )}
          </div>
        </section>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-slate-900">
          <Users className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold">Catatan Alur</h2>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">1. Pengusul</div>
            <div className="mt-1">Simpan draft, susun panitia lintas peran, lalu ajukan saat rancangan sudah siap.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">2. Kepala Sekolah</div>
            <div className="mt-1">Menilai konteks kegiatan dan susunan panitia sebelum diteruskan ke Kepala TU.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">3. Kepala TU</div>
            <div className="mt-1">Menerbitkan SK. Usulan feature workspace baru aktif sesudah tahap ini selesai.</div>
          </div>
        </div>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={closeDraftModal}>
          <div
            className="flex max-h-[82vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {form.eventId ? 'Perbarui Draft Kepanitiaan' : 'Buat Draft Kepanitiaan'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Simpan draft lebih dulu, lalu lanjutkan menyusun panitia dan usulan fitur pada tahun ajaran aktif.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDraftModal}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                aria-label="Tutup popup draft kepanitiaan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="grid gap-6 xl:grid-cols-[0.95fr,1.2fr]">
                <section className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Data Draft</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Isi konteks kegiatan. Program ujian hanya perlu dipilih jika panitia ini memang akan memakai workspace
                          ujian.
                        </p>
                      </div>
                      {detail ? (
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(detail.status)}`}>
                          {COMMITTEE_STATUS_LABELS[detail.status]}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 space-y-4">
                      <div>
                        <label htmlFor="committeeTitle" className="mb-1 block text-sm font-medium text-slate-700">
                          Nama Kegiatan
                        </label>
                        <input
                          id="committeeTitle"
                          name="committeeTitle"
                          autoComplete="off"
                          value={form.title}
                          onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="Contoh: SBTS Semester Genap"
                        />
                      </div>

                      <div>
                        <label htmlFor="committeeCode" className="mb-1 block text-sm font-medium text-slate-700">
                          Kode Kegiatan
                        </label>
                        <input
                          id="committeeCode"
                          name="committeeCode"
                          autoComplete="off"
                          value={form.code}
                          onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm uppercase focus:border-blue-500 focus:outline-none"
                          placeholder="Contoh: SBTS_GENAP"
                        />
                      </div>

                      <div>
                        <label htmlFor="committeeProgram" className="mb-1 block text-sm font-medium text-slate-700">
                          Program Ujian Terkait <span className="text-slate-400">(Opsional)</span>
                        </label>
                        <select
                          id="committeeProgram"
                          name="committeeProgram"
                          value={form.programCode}
                          onChange={(event) => setForm((current) => ({ ...current, programCode: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">Tanpa program khusus</option>
                          {examPrograms.map((program) => (
                            <option key={program.code} value={program.code}>
                              {program.label}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          Isi hanya jika kegiatan ini membutuhkan workspace ujian seperti program, jadwal, ruang, mengawas, denah,
                          atau kartu ujian.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="committeeDescription" className="mb-1 block text-sm font-medium text-slate-700">
                          Deskripsi / Catatan
                        </label>
                        <textarea
                          id="committeeDescription"
                          name="committeeDescription"
                          rows={5}
                          value={form.description}
                          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
                          placeholder="Tuliskan konteks kegiatan, kebutuhan panitia, atau catatan untuk review."
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2 text-slate-900">
                      <ShieldCheck className="h-5 w-5 text-sky-600" />
                      <h3 className="text-sm font-semibold">Tahap Aktivasi Fitur</h3>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">
                      Anda sudah boleh mengusulkan fitur workspace sejak draft. Namun akses nyata ke menu panitia baru aktif
                      setelah pengajuan disetujui Kepala Sekolah dan SK diterbitkan oleh Kepala TU.
                    </p>
                    {detail ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
                        Draft ini saat ini memiliki {detail.counts.members} anggota dan {detail.counts.grantedFeatures} usulan
                        feature grant.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-5">
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900">Susunan Panitia Draft</h3>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Pilih anggota panitia lintas guru, staff TU, atau pembina eksternal. Pengusul tidak perlu memilih
                          “ajukan sebagai” lagi.
                        </p>
                      </div>
                      <Users className="h-5 w-5 text-slate-400" />
                    </div>

                    {!form.eventId ? (
                      <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        Simpan draft terlebih dahulu agar susunan panitia bisa mulai ditambahkan.
                      </div>
                    ) : eventDetailQuery.isLoading ? (
                      <div className="mt-5 flex min-h-[240px] items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                      </div>
                    ) : detail ? (
                      <>
                        <div className="mt-5 grid gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor="committeeMemberKind" className="mb-1 block text-sm font-medium text-slate-700">
                              Jenis Anggota
                            </label>
                            <select
                              id="committeeMemberKind"
                              name="committeeMemberKind"
                              value={assignmentForm.memberKind}
                              onChange={(event) =>
                                setAssignmentForm((current) => ({
                                  ...current,
                                  memberKind: event.target.value as CommitteeAssignmentMemberKindCode,
                                  userId: '',
                                  externalName: '',
                                  externalInstitution: '',
                                  featureCodes: event.target.value === 'TEACHER' ? current.featureCodes : [],
                                }))
                              }
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                              {assignmentMemberTypes.map((item) => (
                                <option key={item.code} value={item.code}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {isAssignmentInternal ? (
                            <div>
                              <label htmlFor="committeeMemberUser" className="mb-1 block text-sm font-medium text-slate-700">
                                {assignmentForm.memberKind === 'STAFF' ? 'Staff TU' : 'Guru'}
                              </label>
                              <select
                                id="committeeMemberUser"
                                name="committeeMemberUser"
                                value={assignmentForm.userId}
                                onChange={(event) => setAssignmentForm((current) => ({ ...current, userId: event.target.value }))}
                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                              >
                                <option value="">
                                  {assignmentForm.memberKind === 'STAFF' ? 'Pilih staff TU' : 'Pilih guru'}
                                </option>
                                {internalMemberOptions.map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label htmlFor="committeeExternalName" className="mb-1 block text-sm font-medium text-slate-700">
                                Nama Pembina Eksternal
                              </label>
                              <input
                                id="committeeExternalName"
                                name="committeeExternalName"
                                autoComplete="off"
                                value={assignmentForm.externalName}
                                onChange={(event) =>
                                  setAssignmentForm((current) => ({ ...current, externalName: event.target.value }))
                                }
                                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="Nama lengkap anggota eksternal"
                              />
                            </div>
                          )}
                        </div>

                        {!isAssignmentInternal ? (
                          <div className="mt-4">
                            <label htmlFor="committeeExternalInstitution" className="mb-1 block text-sm font-medium text-slate-700">
                              Instansi / Asal <span className="text-slate-400">(Opsional)</span>
                            </label>
                            <input
                              id="committeeExternalInstitution"
                              name="committeeExternalInstitution"
                              autoComplete="off"
                              value={assignmentForm.externalInstitution}
                              onChange={(event) =>
                                setAssignmentForm((current) => ({ ...current, externalInstitution: event.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                              placeholder="Misalnya: Pembina industri, orang tua, narasumber mitra"
                            />
                          </div>
                        ) : null}

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                          <div>
                            <label htmlFor="committeeMemberRole" className="mb-1 block text-sm font-medium text-slate-700">
                              Peran dalam Panitia
                            </label>
                            <input
                              id="committeeMemberRole"
                              name="committeeMemberRole"
                              autoComplete="off"
                              value={assignmentForm.assignmentRole}
                              onChange={(event) =>
                                setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))
                              }
                              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                              placeholder="Contoh: Ketua, Sekretaris, Anggota Ruang"
                            />
                          </div>
                          <div>
                            <label htmlFor="committeeMemberNotes" className="mb-1 block text-sm font-medium text-slate-700">
                              Catatan Tugas <span className="text-slate-400">(Opsional)</span>
                            </label>
                            <input
                              id="committeeMemberNotes"
                              name="committeeMemberNotes"
                              autoComplete="off"
                              value={assignmentForm.notes}
                              onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                              placeholder="Catatan singkat tanggung jawab anggota"
                            />
                          </div>
                        </div>

                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                          <div className="text-sm font-semibold text-slate-900">Usulan Feature Workspace</div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            Usulan ini baru benar-benar aktif setelah approval dan SK selesai.
                          </p>

                          {supportsWorkspaceGrant ? (
                            detail.programCode ? (
                              <div className="mt-4 grid gap-2">
                                {featureDefinitions.map((feature) => {
                                  const checked = assignmentForm.featureCodes.includes(feature.code);
                                  return (
                                    <label
                                      key={feature.code}
                                      htmlFor={`committee-feature-${feature.code}`}
                                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 hover:border-slate-300"
                                    >
                                      <input
                                        id={`committee-feature-${feature.code}`}
                                        name={`committee-feature-${feature.code}`}
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(event) =>
                                          setAssignmentForm((current) => ({
                                            ...current,
                                            featureCodes: event.target.checked
                                              ? [...current.featureCodes, feature.code]
                                              : current.featureCodes.filter((item) => item !== feature.code),
                                          }))
                                        }
                                        className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                      />
                                      <div>
                                        <div className="text-sm font-semibold text-slate-900">{feature.label}</div>
                                        <div className="text-xs leading-5 text-slate-500">{feature.description}</div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                Pilih <span className="font-semibold">Program Ujian Terkait</span> pada draft jika kegiatan ini
                                memang membutuhkan workspace ujian.
                              </div>
                            )
                          ) : (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                              Workspace ujian saat ini hanya bisa diusulkan untuk akun guru internal. Staff TU dan pembina
                              eksternal tetap bisa dicatat sebagai anggota panitia tanpa menu workspace.
                            </div>
                          )}
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => assignmentMutation.mutate()}
                            disabled={!canSaveAssignment || assignmentMutation.isPending}
                            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                          >
                            {assignmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {assignmentForm.assignmentId ? 'Perbarui Anggota' : 'Tambah Anggota'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setAssignmentForm(createEmptyAssignmentForm())}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <PlusCircle className="h-4 w-4" />
                            Reset Form
                          </button>
                        </div>

                        <div className="mt-6 space-y-3">
                          {detail.assignments.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                              Belum ada anggota panitia pada draft ini.
                            </div>
                          ) : (
                            detail.assignments.map((assignment) => (
                              <article
                                key={`committee-assignment-${assignment.id}`}
                                className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-semibold text-slate-900">{assignment.memberLabel}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {formatCommitteeMemberMeta(assignment.memberTypeLabel, assignment.memberDetail)}
                                    </div>
                                    <div className="mt-2 text-sm text-slate-700">{assignment.assignmentRole}</div>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditAssignment(assignment)}
                                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                      <Save className="h-3.5 w-3.5" />
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAssignment(assignment.id)}
                                      disabled={deleteAssignmentMutation.isPending}
                                      className="inline-flex items-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                      Hapus
                                    </button>
                                  </div>
                                </div>

                                {assignment.notes ? (
                                  <div className="mt-3 rounded-xl border border-white bg-white px-3 py-2 text-sm text-slate-600">
                                    {assignment.notes}
                                  </div>
                                ) : null}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {assignment.featureGrants.length === 0 ? (
                                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500">
                                      Tanpa usulan feature workspace
                                    </span>
                                  ) : (
                                    assignment.featureGrants.map((feature) => (
                                      <span
                                        key={`committee-feature-grant-${assignment.id}-${feature.id}`}
                                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                      >
                                        {feature.label}
                                      </span>
                                    ))
                                  )}
                                </div>
                              </article>
                            ))
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-5 rounded-xl border border-dashed border-rose-300 bg-rose-50 px-4 py-6 text-sm text-rose-700">
                        Detail draft tidak berhasil dimuat. Tutup popup lalu buka ulang draft ini.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
              {form.eventId ? (
                <button
                  type="button"
                  onClick={() => submitMutation.mutate(form.eventId as number)}
                  disabled={!canSubmitCurrentDraft || submitMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-emerald-200 disabled:text-emerald-300"
                >
                  {submitMutation.isPending && submitMutation.variables === form.eventId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Ajukan ke Kepsek
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeDraftModal}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!form.title.trim() || !form.code.trim() || saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.eventId ? 'Simpan Perubahan' : 'Simpan Draft'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
