import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, CheckCircle2, ClipboardList, FileBadge2, Loader2, PlusCircle, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { committeeService, type CommitteeEventDetail, type CommitteeFeatureCode } from '../../services/committee.service';
import { userService } from '../../services/user.service';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDate,
  formatCommitteeDateTime,
  getCommitteeStatusTone,
} from '../../features/committee/committeeUi';

type AssignmentFormState = {
  assignmentId: number | null;
  userId: string;
  assignmentRole: string;
  notes: string;
  featureCodes: CommitteeFeatureCode[];
};

type SkFormState = {
  skNumber: string;
  skIssuedAt: string;
  skNotes: string;
};

const emptyAssignmentForm: AssignmentFormState = {
  assignmentId: null,
  userId: '',
  assignmentRole: '',
  notes: '',
  featureCodes: [],
};

const createDefaultSkForm = (): SkFormState => ({
  skNumber: '',
  skIssuedAt: new Date().toISOString().slice(0, 10),
  skNotes: '',
});

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
    staleTime: 5 * 60 * 1000,
  });

  const teacherQuery = useQuery({
    queryKey: ['head-tu-committee-teachers'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    staleTime: 5 * 60 * 1000,
  });

  const items = listQuery.data?.data?.items || [];
  const detail = detailQuery.data?.data?.item || null;
  const featureDefinitions = metaQuery.data?.data?.featureDefinitions || [];
  const teachers = teacherQuery.data?.data || [];

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
    setAssignmentForm(emptyAssignmentForm);
  }, [detail?.id]);

  const refreshCommitteeData = () => {
    queryClient.invalidateQueries({ queryKey: ['head-tu-committee-events'] });
    queryClient.invalidateQueries({ queryKey: ['head-tu-committee-detail', selectedEventId] });
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
        userId: Number(assignmentForm.userId),
        assignmentRole: assignmentForm.assignmentRole.trim(),
        notes: assignmentForm.notes.trim() || null,
        featureCodes: assignmentForm.featureCodes,
      };

      if (assignmentForm.assignmentId) {
        return committeeService.updateAssignment(selectedEventId as number, assignmentForm.assignmentId, payload);
      }

      return committeeService.createAssignment(selectedEventId as number, payload);
    },
    onSuccess: () => {
      toast.success(assignmentForm.assignmentId ? 'Assignment panitia diperbarui.' : 'Anggota panitia ditambahkan.');
      setAssignmentForm(emptyAssignmentForm);
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
      setAssignmentForm(emptyAssignmentForm);
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

  const handleStartEditAssignment = (event: CommitteeEventDetail['assignments'][number]) => {
    setAssignmentForm({
      assignmentId: event.id,
      userId: String(event.userId),
      assignmentRole: event.assignmentRole,
      notes: event.notes || '',
      featureCodes: event.featureGrants.map((feature) => feature.featureCode),
    });
  };

  return (
    <div className="space-y-6 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-violet-50 via-white to-sky-50 p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white/80 px-3 py-1 text-xs font-semibold text-violet-700">
          <FileBadge2 className="h-4 w-4" />
          Workflow Kepala TU
        </div>
        <h1 className="mt-3 text-2xl font-bold text-slate-900">SK Kepanitiaan dan Feature Grant</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Terbitkan SK setelah approval Kepala Sekolah, susun anggota panitia, lalu grant fitur per orang agar menu panitia aktif
          otomatis di akun guru terkait.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <QueueCard label="Menunggu SK" count={queue.waitingSk.length} toneClassName="border-sky-200 bg-sky-50 text-sky-900" />
        <QueueCard label="Panitia Aktif" count={queue.active.length} toneClassName="border-emerald-200 bg-emerald-50 text-emerald-900" />
        <QueueCard label="Selesai / Arsip" count={queue.finished.length} toneClassName="border-slate-200 bg-white text-slate-900" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Queue Kepanitiaan</h2>
              <p className="mt-1 text-sm text-slate-500">Pilih kegiatan untuk menerbitkan SK atau mengatur anggota panitia.</p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {listQuery.isLoading ? (
              <div className="flex min-h-[220px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                Belum ada kegiatan kepanitiaan pada queue Kepala TU.
              </div>
            ) : (
              items.map((item) => (
                <button
                  key={`head-tu-committee-${item.id}`}
                  type="button"
                  onClick={() => setSelectedEventId(item.id)}
                  className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                    item.id === selectedEventId
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-semibold text-slate-900">{item.title}</div>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getCommitteeStatusTone(item.status)}`}>
                      {COMMITTEE_STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{item.code} • {item.programLabel || item.programCode || 'Tanpa program ujian khusus'}</div>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{item.counts.members} anggota</span>
                    <span>Update {formatCommitteeDate(item.updatedAt)}</span>
                  </div>
                </button>
              ))
            )}
          </div>
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
                    <div className="text-xs uppercase tracking-wide text-slate-500">Feature Grant</div>
                    <div className="mt-1 text-lg font-bold text-slate-900">{detail.counts.grantedFeatures}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-xs uppercase tracking-wide text-slate-500">Tanggal SK</div>
                    <div className="mt-1 text-sm font-semibold text-slate-900">{formatCommitteeDate(detail.sk.issuedAt)}</div>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[1fr,1.1fr]">
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
                    <div>
                      <label htmlFor="committeeMemberUser" className="mb-1 block text-sm font-medium text-slate-700">
                        Guru
                      </label>
                      <select
                        id="committeeMemberUser"
                        name="committeeMemberUser"
                        value={assignmentForm.userId}
                        onChange={(event) => setAssignmentForm((current) => ({ ...current, userId: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">Pilih guru</option>
                        {teachers.map((teacher) => (
                          <option key={teacher.id} value={teacher.id}>
                            {teacher.name}
                          </option>
                        ))}
                      </select>
                    </div>

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
                        placeholder="Contoh: Ketua, Sekretaris, Anggota"
                      />
                    </div>

                    <div>
                      <label htmlFor="committeeMemberNotes" className="mb-1 block text-sm font-medium text-slate-700">
                        Catatan Assignment
                      </label>
                      <textarea
                        id="committeeMemberNotes"
                        name="committeeMemberNotes"
                        rows={3}
                        value={assignmentForm.notes}
                        onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
                        placeholder="Catatan internal per anggota bila diperlukan."
                      />
                    </div>

                    <div>
                      <div className="mb-2 text-sm font-medium text-slate-700">Feature Grant</div>
                      <div className="grid gap-2">
                        {featureDefinitions.map((feature) => {
                          const checked = assignmentForm.featureCodes.includes(feature.code);
                          return (
                            <label
                              key={feature.code}
                              htmlFor={`committee-feature-${feature.code}`}
                              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-3 hover:bg-slate-50"
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
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => assignmentMutation.mutate()}
                      disabled={
                        !detail.access.canManageAssignments ||
                        !assignmentForm.userId ||
                        !assignmentForm.assignmentRole.trim() ||
                        assignmentMutation.isPending
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {assignmentMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {assignmentForm.assignmentId ? 'Perbarui Assignment' : 'Tambah Anggota'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAssignmentForm(emptyAssignmentForm)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <PlusCircle className="h-4 w-4" />
                      Reset Form
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-900">
                  <ShieldCheck className="h-5 w-5 text-slate-500" />
                  <h3 className="text-lg font-semibold">Daftar Anggota Aktif</h3>
                </div>
                <div className="mt-5 space-y-3">
                  {detail.assignments.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                      Belum ada anggota panitia. Tambahkan minimal satu anggota sebelum menerbitkan SK.
                    </div>
                  ) : (
                    detail.assignments.map((assignment) => (
                      <article key={`committee-assignment-${assignment.id}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">{assignment.user.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{assignment.assignmentRole}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditAssignment(assignment)}
                              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteAssignmentMutation.mutate(assignment.id)}
                              disabled={deleteAssignmentMutation.isPending}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-rose-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Hapus
                            </button>
                          </div>
                        </div>

                        {assignment.notes ? <div className="mt-3 text-sm text-slate-600">{assignment.notes}</div> : null}

                        <div className="mt-3 flex flex-wrap gap-2">
                          {assignment.featureGrants.length === 0 ? (
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-500">
                              Belum ada feature grant
                            </span>
                          ) : (
                            assignment.featureGrants.map((feature) => (
                              <span
                                key={`committee-feature-grant-${assignment.id}-${feature.featureCode}`}
                                className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
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
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

