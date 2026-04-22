import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Briefcase, ClipboardList, Loader2, PlusCircle, Save, Send, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { authService } from '../../services/auth.service';
import { committeeService, type CommitteeEventSummary, type CommitteeFeatureCode } from '../../services/committee.service';
import { examService } from '../../services/exam.service';
import { useActiveAcademicYear } from '../../hooks/useActiveAcademicYear';
import {
  COMMITTEE_STATUS_LABELS,
  formatCommitteeDate,
  formatCommitteeDateTime,
  getCommitteeStatusTone,
  humanizeRequesterDuty,
} from '../../features/committee/committeeUi';

type CommitteeFormState = {
  eventId: number | null;
  title: string;
  code: string;
  requesterDutyCode: string;
  programCode: string;
  description: string;
};

const emptyFormState: CommitteeFormState = {
  eventId: null,
  title: '',
  code: '',
  requesterDutyCode: '',
  programCode: '',
  description: '',
};

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
  const canSubmit = event.status === 'DRAFT' || event.status === 'DITOLAK_KEPSEK';
  const canOpenWorkspace = event.status === 'AKTIF' && event.myAssignment && event.myAssignment.featureCodes.length > 0;

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
          <div>Pengusul sebagai {humanizeRequesterDuty(event.requesterDutyCode)}</div>
        </div>
      </div>

      {event.description ? <p className="mt-4 text-sm leading-6 text-slate-600">{event.description}</p> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Anggota Aktif</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{event.counts.members}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">Feature Grant</div>
          <div className="mt-1 text-lg font-bold text-slate-900">{event.counts.grantedFeatures}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-slate-500">SK Panitia</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">{event.sk.number || 'Belum terbit'}</div>
          <div className="mt-1 text-xs text-slate-500">{formatCommitteeDate(event.sk.issuedAt)}</div>
        </div>
      </div>

      {event.principalDecision.feedback ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <div className="font-semibold">Catatan Kepala Sekolah</div>
          <div className="mt-1">{event.principalDecision.feedback}</div>
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
            disabled={submitting}
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
  const [form, setForm] = useState<CommitteeFormState>(emptyFormState);

  const meQuery = useQuery({
    queryKey: ['committee-teacher-me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const committeeQuery = useQuery({
    queryKey: ['committee-teacher-events'],
    queryFn: () => committeeService.list({ scope: 'MINE' }),
    staleTime: 60_000,
  });

  const examProgramsQuery = useQuery({
    queryKey: ['committee-exam-programs', activeAcademicYear?.id || 'none'],
    queryFn: () => examService.getPrograms({ academicYearId: activeAcademicYear?.id, roleContext: 'teacher' }),
    enabled: Boolean(activeAcademicYear?.id),
    staleTime: 5 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        code: form.code.trim(),
        description: form.description.trim() || null,
        requesterDutyCode: form.requesterDutyCode || null,
        programCode: form.programCode || null,
      };
      if (form.eventId) {
        return committeeService.update(form.eventId, payload);
      }
      return committeeService.create(payload);
    },
    onSuccess: () => {
      toast.success(form.eventId ? 'Draft kepanitiaan diperbarui.' : 'Draft kepanitiaan dibuat.');
      setForm(emptyFormState);
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
      queryClient.invalidateQueries({ queryKey: ['committee-sidebar'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan draft kepanitiaan');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (eventId: number) => committeeService.submit(eventId),
    onSuccess: () => {
      toast.success('Pengajuan kepanitiaan diteruskan ke Kepala Sekolah.');
      queryClient.invalidateQueries({ queryKey: ['committee-teacher-events'] });
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengajukan kepanitiaan');
    },
  });

  const events = committeeQuery.data?.data?.items || [];
  const requestedEvents = events.filter((event) => event.isRequester);
  const assignedActiveEvents = events.filter(
    (event) => event.isAssigned && event.status === 'AKTIF' && event.myAssignment?.featureCodes?.length,
  );

  const availableDuties = useMemo(() => {
    return (meQuery.data?.data?.additionalDuties || []).map((item) => ({
      value: item,
      label: humanizeRequesterDuty(item),
    }));
  }, [meQuery.data?.data?.additionalDuties]);

  const examPrograms = useMemo(() => {
    return (examProgramsQuery.data?.data?.programs || []).filter((program) => program.isActive);
  }, [examProgramsQuery.data?.data?.programs]);

  const stats = {
    requested: requestedEvents.length,
    pending:
      requestedEvents.filter((event) => event.status === 'MENUNGGU_PERSETUJUAN_KEPSEK' || event.status === 'MENUNGGU_SK_TU')
        .length,
    activeAssignments: assignedActiveEvents.length,
    rejected: requestedEvents.filter((event) => event.status === 'DITOLAK_KEPSEK').length,
  };

  const handleEdit = (event: CommitteeEventSummary) => {
    setForm({
      eventId: event.id,
      title: event.title,
      code: event.code,
      requesterDutyCode: event.requesterDutyCode || '',
      programCode: event.programCode || '',
      description: event.description || '',
    });
  };

  const isLoading = committeeQuery.isLoading || meQuery.isLoading;

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
              Ajukan panitia kegiatan dari tahun ajaran aktif, pantau keputusan Kepala Sekolah, dan buka workspace panitia yang
              sudah aktif sesuai feature grant per anggota.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForm(emptyFormState)}
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

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {form.eventId ? 'Perbarui Draft Kepanitiaan' : 'Buat Draft Kepanitiaan'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Tahun ajaran mengikuti header aktif. Tidak ada selector tahun tambahan di layar ini.
              </p>
            </div>
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
                placeholder="Contoh: SBTS_Genap"
              />
            </div>

            <div>
              <label htmlFor="committeeDuty" className="mb-1 block text-sm font-medium text-slate-700">
                Ajukan Sebagai
              </label>
              <select
                id="committeeDuty"
                name="committeeDuty"
                value={form.requesterDutyCode}
                onChange={(event) => setForm((current) => ({ ...current, requesterDutyCode: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Guru</option>
                {availableDuties.map((duty) => (
                  <option key={duty.value} value={duty.value}>
                    {duty.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="committeeProgram" className="mb-1 block text-sm font-medium text-slate-700">
                Program Ujian Terkait
              </label>
              <select
                id="committeeProgram"
                name="committeeProgram"
                value={form.programCode}
                onChange={(event) => setForm((current) => ({ ...current, programCode: event.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Tanpa program khusus</option>
                {examPrograms.map((program) => (
                  <option key={program.code} value={program.code}>
                    {program.label}
                  </option>
                ))}
              </select>
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

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!form.title.trim() || !form.code.trim() || saveMutation.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.eventId ? 'Simpan Perubahan' : 'Simpan Draft'}
            </button>
            <button
              type="button"
              onClick={() => setForm(emptyFormState)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Form
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Workspace Panitia Aktif</h2>
                <p className="mt-1 text-sm text-slate-500">Hanya event yang benar-benar di-grant kepada Anda yang muncul di sini.</p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
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
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pengajuan Saya</h2>
                <p className="mt-1 text-sm text-slate-500">Pantau status review, revisi, dan penerbitan SK panitia.</p>
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
                    submitting={submitMutation.isPending}
                  />
                ))
              )}
            </div>
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
            <div className="font-semibold text-slate-900">1. Guru / Duty</div>
            <div className="mt-1">Simpan draft lalu ajukan panitia kegiatan dari tahun ajaran aktif.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">2. Kepala Sekolah</div>
            <div className="mt-1">Memberi persetujuan atau catatan revisi sebelum diteruskan ke Kepala TU.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">3. Kepala TU</div>
            <div className="mt-1">Menerbitkan SK, menentukan anggota, lalu memberi feature grant per orang.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

