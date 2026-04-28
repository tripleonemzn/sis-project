import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCircle2,
  ClipboardList,
  FileBadge2,
  Loader2,
  Pencil,
  PlusCircle,
  Save,
  Trash2,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  committeeService,
  type CommitteeAssignmentMemberKindCode,
  type CommitteeAssignmentMemberType,
  type CommitteeEventDetail,
  type CommitteeFeatureCode,
} from '../../services/committee.service';
import { userService } from '../../services/user.service';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDate,
  formatCommitteeDateTime,
  formatCommitteeMemberMeta,
  getCommitteeStatusTone,
} from '../../features/committee/committeeUi';

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

type SkFormState = {
  skNumber: string;
  skIssuedAt: string;
  skNotes: string;
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
    code: 'PRINCIPAL',
    label: 'Kepala Sekolah',
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

const emptyAssignmentForm = (): AssignmentFormState => ({
  assignmentId: null,
  memberKind: 'TEACHER',
  userId: '',
  externalName: '',
  externalInstitution: '',
  assignmentRole: '',
  notes: '',
  featureCodes: [],
});

const createDefaultSkForm = (): SkFormState => ({
  skNumber: '',
  skIssuedAt: new Date().toISOString().slice(0, 10),
  skNotes: '',
});

function deriveAssignmentMemberKind(
  assignment: CommitteeEventDetail['assignments'][number],
): CommitteeAssignmentMemberKindCode {
  if (assignment.memberType === 'EXTERNAL_MEMBER') {
    return 'EXTERNAL';
  }
  if (assignment.user?.role === 'PRINCIPAL') {
    return 'PRINCIPAL';
  }
  return assignment.user?.role === 'STAFF' ? 'STAFF' : 'TEACHER';
}

function getInternalMemberFieldCopy(memberKind: CommitteeAssignmentMemberKindCode) {
  if (memberKind === 'STAFF') {
    return {
      label: 'Staff TU',
      placeholder: 'Pilih staff TU',
    };
  }

  if (memberKind === 'PRINCIPAL') {
    return {
      label: 'Kepala Sekolah',
      placeholder: 'Pilih kepala sekolah',
    };
  }

  return {
    label: 'Guru',
    placeholder: 'Pilih guru',
  };
}

function QueueCard({
  label,
  count,
  toneClassName,
}: {
  label: string;
  count: number;
  toneClassName: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${toneClassName}`}>
      <div className="text-sm">{label}</div>
      <div className="mt-2 text-3xl font-bold">{count}</div>
    </div>
  );
}

export default function CommitteeHeadTuPage() {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(emptyAssignmentForm);
  const [skForm, setSkForm] = useState<SkFormState>(createDefaultSkForm());

  const listQuery = useQuery({
    queryKey: ['head-tu-committee-events'],
    queryFn: () => committeeService.list({ scope: 'HEAD_TU' }),
    staleTime: 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['head-tu-committee-detail', selectedEventId],
    queryFn: () => committeeService.getDetail(selectedEventId as number),
    enabled: Boolean(selectedEventId),
    staleTime: 30_000,
  });

  const metaQuery = useQuery({
    queryKey: ['head-tu-committee-meta'],
    queryFn: committeeService.getMeta,
    enabled: Boolean(selectedEventId),
    staleTime: 5 * 60 * 1000,
  });

  const teacherQuery = useQuery({
    queryKey: ['head-tu-committee-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    enabled: Boolean(selectedEventId),
    staleTime: 5 * 60 * 1000,
  });

  const staffQuery = useQuery({
    queryKey: ['head-tu-committee-staffs'],
    queryFn: () => userService.getUsers({ role: 'STAFF', limit: 10000 }),
    enabled: Boolean(selectedEventId),
    staleTime: 5 * 60 * 1000,
  });

  const principalQuery = useQuery({
    queryKey: ['head-tu-committee-principals'],
    queryFn: () => userService.getUsers({ role: 'PRINCIPAL', limit: 100 }),
    enabled: Boolean(selectedEventId),
    staleTime: 5 * 60 * 1000,
  });

  const items = listQuery.data?.data?.items || [];
  const detail = detailQuery.data?.data?.item || null;
  const featureDefinitions = metaQuery.data?.data?.featureDefinitions || [];
  const assignmentMemberTypes = metaQuery.data?.data?.assignmentMemberTypes || DEFAULT_ASSIGNMENT_MEMBER_TYPES;
  const teachers = teacherQuery.data?.data || [];
  const staffs = staffQuery.data?.data || [];
  const principals = principalQuery.data?.data || [];

  const activeMemberType = useMemo(
    () => assignmentMemberTypes.find((item) => item.code === assignmentForm.memberKind) || assignmentMemberTypes[0],
    [assignmentForm.memberKind, assignmentMemberTypes],
  );

  const internalMemberOptions = useMemo(() => {
    if (assignmentForm.memberKind === 'STAFF') {
      return staffs;
    }
    if (assignmentForm.memberKind === 'PRINCIPAL') {
      return principals;
    }
    return teachers;
  }, [assignmentForm.memberKind, principals, staffs, teachers]);

  const internalMemberFieldCopy = useMemo(
    () => getInternalMemberFieldCopy(assignmentForm.memberKind),
    [assignmentForm.memberKind],
  );

  useEffect(() => {
    if (selectedEventId && items.some((item) => item.id === selectedEventId)) return;
    setSelectedEventId(items[0]?.id || null);
  }, [items, selectedEventId]);

  useEffect(() => {
    if (!detail) return;
    setSkForm({
      skNumber: detail.sk.number || '',
      skIssuedAt: detail.sk.issuedAt ? String(detail.sk.issuedAt).slice(0, 10) : createDefaultSkForm().skIssuedAt,
      skNotes: detail.sk.notes || '',
    });
    setAssignmentForm(emptyAssignmentForm());
  }, [detail?.id]);

  const refreshCommitteeData = () => {
    queryClient.invalidateQueries({ queryKey: ['head-tu-committee-events'] });
    queryClient.invalidateQueries({ queryKey: ['head-tu-committee-detail', selectedEventId] });
    queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
    queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
  };

  const issueSkMutation = useMutation({
    mutationFn: () =>
      committeeService.issueSk(selectedEventId as number, {
        skNumber: skForm.skNumber.trim(),
        skIssuedAt: skForm.skIssuedAt,
        skNotes: skForm.skNotes.trim() || null,
      }),
    onSuccess: () => {
      toast.success('SK panitia berhasil diterbitkan.');
      refreshCommitteeData();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menerbitkan SK panitia');
    },
  });

  const lifecycleMutation = useMutation({
    mutationFn: (status: 'SELESAI' | 'ARSIP') => committeeService.updateLifecycle(selectedEventId as number, { status }),
    onSuccess: (_, status) => {
      toast.success(status === 'SELESAI' ? 'Kegiatan ditandai selesai.' : 'Kegiatan berhasil diarsipkan.');
      refreshCommitteeData();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal memperbarui lifecycle kepanitiaan');
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: () => {
      const payload = {
        memberType: activeMemberType.memberType as CommitteeAssignmentMemberType,
        userId: activeMemberType.memberType === 'INTERNAL_USER' ? Number(assignmentForm.userId) : null,
        externalName: activeMemberType.memberType === 'EXTERNAL_MEMBER' ? assignmentForm.externalName.trim() : null,
        externalInstitution:
          activeMemberType.memberType === 'EXTERNAL_MEMBER' ? assignmentForm.externalInstitution.trim() || null : null,
        assignmentRole: assignmentForm.assignmentRole.trim(),
        notes: assignmentForm.notes.trim() || null,
        featureCodes: assignmentForm.memberKind === 'TEACHER' ? assignmentForm.featureCodes : [],
      };

      if (assignmentForm.assignmentId) {
        return committeeService.updateAssignment(selectedEventId as number, assignmentForm.assignmentId, payload);
      }

      return committeeService.createAssignment(selectedEventId as number, payload);
    },
    onSuccess: () => {
      toast.success(assignmentForm.assignmentId ? 'Assignment panitia diperbarui.' : 'Anggota panitia ditambahkan.');
      setAssignmentForm(emptyAssignmentForm());
      refreshCommitteeData();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan assignment panitia');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) => committeeService.deleteAssignment(selectedEventId as number, assignmentId),
    onSuccess: () => {
      toast.success('Assignment panitia dihapus.');
      setAssignmentForm(emptyAssignmentForm());
      refreshCommitteeData();
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menghapus assignment panitia');
    },
  });

  const queue = useMemo(
    () => ({
      waitingSk: items.filter((item) => item.status === 'MENUNGGU_SK_TU'),
      active: items.filter((item) => item.status === 'AKTIF'),
      finished: items.filter((item) => item.status === 'SELESAI' || item.status === 'ARSIP'),
    }),
    [items],
  );

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
    if (!window.confirm('Hapus anggota panitia ini?')) return;
    deleteAssignmentMutation.mutate(assignmentId);
  };

  const canSaveAssignment =
    Boolean(detail?.access.canManageAssignments) &&
    Boolean(assignmentForm.assignmentRole.trim()) &&
    (activeMemberType.memberType === 'INTERNAL_USER'
      ? Boolean(assignmentForm.userId)
      : Boolean(assignmentForm.externalName.trim()));

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-xs font-semibold text-violet-700">
          <FileBadge2 className="h-4 w-4" />
          Workflow Kepala TU
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">SK Kepanitiaan dan Aktivasi Fitur</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Finalisasi susunan panitia lintas peran, terbitkan SK, lalu aktifkan feature workspace untuk guru internal yang memang
          perlu mengelola kegiatan ujian.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QueueCard label="Menunggu SK" count={queue.waitingSk.length} toneClassName="border-sky-200 bg-sky-50 text-sky-900" />
        <QueueCard label="Panitia Aktif" count={queue.active.length} toneClassName="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <QueueCard label="Selesai / Arsip" count={queue.finished.length} toneClassName="border-slate-200 bg-white text-slate-900" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-section-title font-semibold text-slate-900">Queue Kepanitiaan</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih kegiatan untuk menerbitkan SK atau menyempurnakan susunan panitia.</p>
            </div>
            <div className="text-sm font-medium text-slate-500">{items.length.toLocaleString('id-ID')} kegiatan</div>
          </div>
        </div>

        {listQuery.isLoading ? (
          <div className="flex min-h-[220px] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-slate-500">
            Belum ada kegiatan kepanitiaan pada queue Kepala TU.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[920px] w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-white">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Kegiatan</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Program</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Anggota</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Update</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => {
                  const selected = item.id === selectedEventId;
                  return (
                    <tr
                      key={`head-tu-committee-${item.id}`}
                      className={`transition-colors ${selected ? 'bg-blue-50/80' : 'bg-white hover:bg-slate-50'}`}
                    >
                      <td className="px-5 py-4 align-top">
                        <div className="font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.code}</div>
                      </td>
                      <td className="px-5 py-4 align-top text-slate-700">
                        {item.programLabel || item.programCode || 'Tanpa program ujian khusus'}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getCommitteeStatusTone(item.status)}`}>
                          {COMMITTEE_STATUS_LABELS[item.status]}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top text-slate-700">
                        {item.counts.members.toLocaleString('id-ID')} anggota
                      </td>
                      <td className="px-5 py-4 align-top text-slate-600">{formatCommitteeDate(item.updatedAt)}</td>
                      <td className="px-5 py-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedEventId(item.id)}
                          className={`inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            selected
                              ? 'border-blue-200 bg-blue-600 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {selected ? 'Terpilih' : 'Lihat Detail'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-6">
          {!detail ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
              Pilih kegiatan kepanitiaan dari panel kiri untuk melihat detail, menerbitkan SK, dan mengatur assignment anggota.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold text-slate-900">{detail.title}</h2>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(detail.status)}`}>
                        {COMMITTEE_STATUS_LABELS[detail.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {detail.code} • {detail.programLabel || detail.programCode || 'Tanpa program ujian khusus'}
                    </p>
                    {detail.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{detail.description}</p> : null}
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>Pengusul: {detail.requestedBy.name}</div>
                    <div>Approval Kepsek: {formatCommitteeDateTime(detail.principalDecision.at)}</div>
                    <div>SK: {detail.sk.number || 'Belum terbit'}</div>
                  </div>
                </div>

                {detail.principalDecision.feedback ? (
                  <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                    <div className="font-semibold">Catatan Kepala Sekolah</div>
                    <div className="mt-1">{detail.principalDecision.feedback}</div>
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Anggota Aktif</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{detail.assignments.length}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Feature Grant Aktif</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{detail.counts.grantedFeatures}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Tanggal SK</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatCommitteeDate(detail.sk.issuedAt)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr,1.15fr]">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-900">
                    <ClipboardList className="h-5 w-5 text-slate-500" />
                    <h3 className="text-lg font-semibold">Penerbitan SK</h3>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label htmlFor="committeeSkNumber" className="mb-1 block text-sm font-medium text-slate-700">
                        Nomor SK
                      </label>
                      <input
                        id="committeeSkNumber"
                        name="committeeSkNumber"
                        autoComplete="off"
                        value={skForm.skNumber}
                        onChange={(event) => setSkForm((current) => ({ ...current, skNumber: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        placeholder="Contoh: 012/TU/KPT/IV/2026"
                      />
                    </div>
                    <div>
                      <label htmlFor="committeeSkDate" className="mb-1 block text-sm font-medium text-slate-700">
                        Tanggal SK
                      </label>
                      <input
                        id="committeeSkDate"
                        name="committeeSkDate"
                        type="date"
                        value={skForm.skIssuedAt}
                        onChange={(event) => setSkForm((current) => ({ ...current, skIssuedAt: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="committeeSkNotes" className="mb-1 block text-sm font-medium text-slate-700">
                        Catatan SK
                      </label>
                      <textarea
                        id="committeeSkNotes"
                        name="committeeSkNotes"
                        rows={4}
                        value={skForm.skNotes}
                        onChange={(event) => setSkForm((current) => ({ ...current, skNotes: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
                        placeholder="Catatan tambahan penerbitan SK bila diperlukan."
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => issueSkMutation.mutate()}
                      disabled={!detail.access.canIssueSk || !skForm.skNumber.trim() || !skForm.skIssuedAt || issueSkMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {issueSkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileBadge2 className="h-4 w-4" />}
                      Terbitkan SK
                    </button>
                    <button
                      type="button"
                      onClick={() => lifecycleMutation.mutate('SELESAI')}
                      disabled={detail.status !== 'AKTIF' || lifecycleMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-emerald-200 disabled:text-emerald-300"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Tandai Selesai
                    </button>
                    <button
                      type="button"
                      onClick={() => lifecycleMutation.mutate('ARSIP')}
                      disabled={detail.status !== 'SELESAI' || lifecycleMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      <Archive className="h-4 w-4" />
                      Arsipkan
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-900">
                    <Users className="h-5 w-5 text-slate-500" />
                    <h3 className="text-lg font-semibold">Anggota Panitia & Feature Grant</h3>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
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

                      {activeMemberType.memberType === 'INTERNAL_USER' ? (
                        <div>
                          <label htmlFor="committeeMemberUser" className="mb-1 block text-sm font-medium text-slate-700">
                            {internalMemberFieldCopy.label}
                          </label>
                          <select
                            id="committeeMemberUser"
                            name="committeeMemberUser"
                            value={assignmentForm.userId}
                            onChange={(event) => setAssignmentForm((current) => ({ ...current, userId: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                          >
                            <option value="">{internalMemberFieldCopy.placeholder}</option>
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
                            onChange={(event) => setAssignmentForm((current) => ({ ...current, externalName: event.target.value }))}
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Nama lengkap anggota eksternal"
                          />
                        </div>
                      )}
                    </div>

                    {activeMemberType.memberType === 'EXTERNAL_MEMBER' ? (
                      <div>
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
                          placeholder="Instansi atau asal pembina eksternal"
                        />
                      </div>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor="committeeMemberRole" className="mb-1 block text-sm font-medium text-slate-700">
                          Peran dalam Panitia
                        </label>
                        <input
                          id="committeeMemberRole"
                          name="committeeMemberRole"
                          autoComplete="off"
                          value={assignmentForm.assignmentRole}
                          onChange={(event) => setAssignmentForm((current) => ({ ...current, assignmentRole: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="Contoh: Ketua, Sekretaris, Operator"
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

                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="text-sm font-semibold text-slate-900">Feature Grant Workspace</div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Hanya guru internal yang bisa menerima menu workspace. Kepala Sekolah, Staff TU, dan anggota eksternal
                        tetap tercatat sebagai bagian panitia tanpa menu workspace.
                      </p>

                      {assignmentForm.memberKind !== 'TEACHER' ? (
                        <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          Feature workspace tidak tersedia untuk jenis anggota ini.
                        </div>
                      ) : !detail.programCode ? (
                        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Kegiatan ini tidak memakai program ujian terkait, jadi tidak ada feature workspace yang perlu diaktifkan.
                        </div>
                      ) : (
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
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => assignmentMutation.mutate()}
                      disabled={!canSaveAssignment || assignmentMutation.isPending}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {assignmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {assignmentForm.assignmentId ? 'Perbarui Assignment' : 'Tambah Anggota'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentForm(emptyAssignmentForm())}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Reset Form
                    </button>
                  </div>

                  <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
                    {detail.assignments.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-slate-500">Belum ada anggota panitia pada kegiatan ini.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-[880px] w-full divide-y divide-slate-100 text-sm">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Anggota</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Jenis</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Peran</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Feature Grant</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Catatan</th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {detail.assignments.map((assignment) => (
                              <tr key={`head-tu-assignment-${assignment.id}`} className="align-top hover:bg-slate-50">
                                <td className="px-4 py-4">
                                  <div className="font-semibold text-slate-900">{assignment.memberLabel}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {formatCommitteeMemberMeta(assignment.memberTypeLabel, assignment.memberDetail)}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-slate-700">{assignment.memberTypeLabel}</td>
                                <td className="px-4 py-4 font-medium text-slate-800">{assignment.assignmentRole}</td>
                                <td className="px-4 py-4">
                                  <div className="flex flex-wrap gap-2">
                                    {assignment.featureGrants.length === 0 ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                        Tanpa feature workspace aktif
                                      </span>
                                    ) : (
                                      assignment.featureGrants.map((feature) => (
                                        <span
                                          key={`committee-feature-${assignment.id}-${feature.id}`}
                                          className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                        >
                                          {feature.label}
                                        </span>
                                      ))
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-4 text-slate-600">{assignment.notes || '-'}</td>
                                <td className="px-4 py-4">
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditAssignment(assignment)}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                      aria-label="Edit anggota panitia"
                                      title="Edit anggota"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteAssignment(assignment.id)}
                                      disabled={deleteAssignmentMutation.isPending}
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-rose-200 disabled:text-rose-300"
                                      aria-label="Hapus anggota panitia"
                                      title="Hapus anggota"
                                    >
                                      <Trash2 className="h-4 w-4" />
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
              </div>
            </>
          )}
      </section>
    </div>
  );
}
