import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  ClipboardList,
  Loader2,
  Pencil,
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
import { authService } from '../../services/auth.service';
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

type CommitteeListResponse = Awaited<ReturnType<typeof committeeService.list>>;
type CommitteeDetailResponse = Awaited<ReturnType<typeof committeeService.getDetail>>;

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

const WAKASEK_REQUESTER_DUTIES = new Set([
  'WAKASEK_KURIKULUM',
  'WAKASEK_KESISWAAN',
  'WAKASEK_SARPRAS',
  'WAKASEK_HUMAS',
]);

const CURRICULUM_COMMITTEE_DUTIES = new Set(['WAKASEK_KURIKULUM']);

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
  if (assignment.memberType === 'EXTERNAL_MEMBER') return 'EXTERNAL';
  if (assignment.user?.role === 'PRINCIPAL') return 'PRINCIPAL';
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

function hasCurriculumCommitteeDuty(additionalDuties?: string[] | null) {
  return (additionalDuties || []).some((duty) => CURRICULUM_COMMITTEE_DUTIES.has(String(duty || '').trim().toUpperCase()));
}

function hasCommitteeRequesterDuty(additionalDuties?: string[] | null) {
  return (additionalDuties || []).some((duty) => WAKASEK_REQUESTER_DUTIES.has(String(duty || '').trim().toUpperCase()));
}

function EventCard({
  event,
  managing,
  onEdit,
  onManage,
  onSubmit,
  submitting,
}: {
  event: CommitteeEventSummary;
  managing: boolean;
  onEdit: (event: CommitteeEventSummary) => void;
  onManage: (event: CommitteeEventSummary) => void;
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
          <div className="text-xs uppercase tracking-wide text-slate-500">Fitur Workspace Unik</div>
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
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Anggota</th>
                    <th className="px-4 py-3 font-semibold">Jenis</th>
                    <th className="px-4 py-3 font-semibold">Peran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {event.membersPreview.map((member) => (
                    <tr key={`committee-member-preview-${member.id}`} className="align-top">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{member.memberLabel}</div>
                        <div className="mt-1 text-xs text-slate-500">{member.memberDetail || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{member.memberTypeLabel}</td>
                      <td className="px-4 py-4 text-slate-700">{member.assignmentRole}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <>
            <button
              type="button"
              onClick={() => onEdit(event)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Save className="h-4 w-4" />
              Edit Draft
            </button>
            <button
              type="button"
              onClick={() => onManage(event)}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                managing
                  ? 'border border-blue-300 bg-blue-50 text-blue-700'
                  : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Users className="h-4 w-4" />
              {managing ? 'Popup Susunan Panitia Aktif' : 'Kelola Susunan Panitia'}
            </button>
          </>
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

function CommitteeAssignmentModal({
  event,
  detail,
  loading,
  assignmentForm,
  setAssignmentForm,
  memberTypes,
  featureDefinitions,
  teachers,
  staffs,
  principals,
  saving,
  deleting,
  onSave,
  onDelete,
  onStartEdit,
  onClose,
}: {
  event: CommitteeEventSummary;
  detail: CommitteeEventDetail | null;
  loading: boolean;
  assignmentForm: AssignmentFormState;
  setAssignmentForm: React.Dispatch<React.SetStateAction<AssignmentFormState>>;
  memberTypes: typeof DEFAULT_ASSIGNMENT_MEMBER_TYPES | Array<{
    code: CommitteeAssignmentMemberKindCode;
    label: string;
    memberType: CommitteeAssignmentMemberType;
    featureGrantEligible: boolean;
  }>;
  featureDefinitions: CommitteeEventDetail['availableFeatures'];
  teachers: Array<{ id: number; name: string }>;
  staffs: Array<{ id: number; name: string }>;
  principals: Array<{ id: number; name: string }>;
  saving: boolean;
  deleting: boolean;
  onSave: () => void;
  onDelete: (assignmentId: number) => void;
  onStartEdit: (assignment: CommitteeEventDetail['assignments'][number]) => void;
  onClose: () => void;
}) {
  const activeMemberType = memberTypes.find((item) => item.code === assignmentForm.memberKind) || memberTypes[0];
  const isInternalMember = activeMemberType.memberType === 'INTERNAL_USER';
  const internalMemberOptions =
    assignmentForm.memberKind === 'STAFF'
      ? staffs
      : assignmentForm.memberKind === 'PRINCIPAL'
        ? principals
        : teachers;
  const internalMemberFieldCopy = getInternalMemberFieldCopy(assignmentForm.memberKind);
  const supportsWorkspaceGrant = assignmentForm.memberKind === 'TEACHER';
  const canSaveAssignment =
    Boolean(detail?.access.canManageAssignments) &&
    Boolean(assignmentForm.assignmentRole.trim()) &&
    (isInternalMember ? Boolean(assignmentForm.userId) : Boolean(assignmentForm.externalName.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
      <div
        className="flex max-h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(eventClick) => eventClick.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
          <div>
            <h2 className="text-section-title font-semibold text-gray-900">Kelola Susunan Panitia</h2>
            <p className="mt-1 text-body text-gray-500">
              {event.title} • {event.code}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup popup susunan panitia"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : !detail ? (
            <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Detail draft tidak berhasil dimuat. Tutup popup lalu buka lagi.
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[0.95fr,1.2fr]">
              <section className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Form Anggota Panitia</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Popup ini mengikuti standar modal operasional: rapi, fokus, dan tidak tertutup saat area luar diklik.
                      </p>
                    </div>
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getCommitteeStatusTone(detail.status)}`}>
                      {COMMITTEE_STATUS_LABELS[detail.status]}
                    </span>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div>
                      <label htmlFor={`committee-member-kind-${event.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                        Jenis Anggota
                      </label>
                      <select
                        id={`committee-member-kind-${event.id}`}
                        name={`committee-member-kind-${event.id}`}
                        value={assignmentForm.memberKind}
                        onChange={(currentEvent) =>
                          setAssignmentForm((current) => ({
                            ...current,
                            memberKind: currentEvent.target.value as CommitteeAssignmentMemberKindCode,
                            userId: '',
                            externalName: '',
                            externalInstitution: '',
                            featureCodes: currentEvent.target.value === 'TEACHER' ? current.featureCodes : [],
                          }))
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                      >
                        {memberTypes.map((item) => (
                          <option key={`${event.id}-${item.code}`} value={item.code}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {isInternalMember ? (
                      <div>
                        <label htmlFor={`committee-member-user-${event.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                          {internalMemberFieldCopy.label}
                        </label>
                        <select
                          id={`committee-member-user-${event.id}`}
                          name={`committee-member-user-${event.id}`}
                          value={assignmentForm.userId}
                          onChange={(currentEvent) =>
                            setAssignmentForm((current) => ({ ...current, userId: currentEvent.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">{internalMemberFieldCopy.placeholder}</option>
                          {internalMemberOptions.map((member) => (
                            <option key={`${event.id}-${member.id}`} value={member.id}>
                              {member.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <>
                        <div>
                          <label htmlFor={`committee-external-name-${event.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                            Nama Pembina Eksternal
                          </label>
                          <input
                            id={`committee-external-name-${event.id}`}
                            name={`committee-external-name-${event.id}`}
                            autoComplete="off"
                            value={assignmentForm.externalName}
                            onChange={(currentEvent) =>
                              setAssignmentForm((current) => ({ ...current, externalName: currentEvent.target.value }))
                            }
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Nama lengkap anggota eksternal"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor={`committee-external-institution-${event.id}`}
                            className="mb-1 block text-sm font-medium text-slate-700"
                          >
                            Instansi / Asal <span className="text-slate-400">(Opsional)</span>
                          </label>
                          <input
                            id={`committee-external-institution-${event.id}`}
                            name={`committee-external-institution-${event.id}`}
                            autoComplete="off"
                            value={assignmentForm.externalInstitution}
                            onChange={(currentEvent) =>
                              setAssignmentForm((current) => ({ ...current, externalInstitution: currentEvent.target.value }))
                            }
                            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            placeholder="Instansi atau asal pembina eksternal"
                          />
                        </div>
                      </>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <label htmlFor={`committee-member-role-${event.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                          Peran dalam Panitia
                        </label>
                        <input
                          id={`committee-member-role-${event.id}`}
                          name={`committee-member-role-${event.id}`}
                          autoComplete="off"
                          value={assignmentForm.assignmentRole}
                          onChange={(currentEvent) =>
                            setAssignmentForm((current) => ({ ...current, assignmentRole: currentEvent.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="Contoh: Ketua, Sekretaris, Anggota Ruang"
                        />
                      </div>
                      <div>
                        <label htmlFor={`committee-member-notes-${event.id}`} className="mb-1 block text-sm font-medium text-slate-700">
                          Catatan Tugas <span className="text-slate-400">(Opsional)</span>
                        </label>
                        <input
                          id={`committee-member-notes-${event.id}`}
                          name={`committee-member-notes-${event.id}`}
                          autoComplete="off"
                          value={assignmentForm.notes}
                          onChange={(currentEvent) =>
                            setAssignmentForm((current) => ({ ...current, notes: currentEvent.target.value }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                          placeholder="Catatan singkat tanggung jawab anggota"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="text-sm font-semibold text-slate-900">Usulan Feature Workspace</div>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      Statistik dan preview card akan langsung ikut berubah dari hasil simpan ini tanpa polling tambahan.
                    </p>

                    {supportsWorkspaceGrant ? (
                      detail.programCode ? (
                        <div className="mt-4 grid gap-2">
                          {featureDefinitions.map((feature) => {
                            const checked = assignmentForm.featureCodes.includes(feature.code);
                            return (
                              <label
                                key={`${event.id}-${feature.code}`}
                                htmlFor={`committee-feature-${event.id}-${feature.code}`}
                                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 hover:border-slate-300"
                              >
                                <input
                                  id={`committee-feature-${event.id}-${feature.code}`}
                                  name={`committee-feature-${event.id}-${feature.code}`}
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(currentEvent) =>
                                    setAssignmentForm((current) => ({
                                      ...current,
                                      featureCodes: currentEvent.target.checked
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
                          Kegiatan ini belum terkait program ujian, jadi feature workspace ujian belum bisa diusulkan.
                        </div>
                      )
                    ) : (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        Workspace ujian saat ini hanya bisa diusulkan untuk akun guru internal. Kepala Sekolah, Staff TU, dan
                        pembina eksternal tetap bisa dicatat sebagai anggota panitia tanpa menu workspace.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={onSave}
                      disabled={!canSaveAssignment || saving}
                      className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
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
                </div>
              </section>

              <section className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Anggota Saat Ini</h3>
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        Setiap simpan anggota langsung memperbarui preview card dan statistik di halaman ini.
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>{detail.counts.members} anggota</div>
                      <div>{detail.counts.grantedFeatures} fitur workspace unik</div>
                    </div>
                  </div>

                  <div className="mt-5">
                    {detail.assignments.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
                        Belum ada anggota panitia pada draft ini.
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-2xl border border-slate-200">
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-slate-200 text-sm">
                            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Anggota</th>
                                <th className="px-4 py-3 font-semibold">Peran</th>
                                <th className="px-4 py-3 font-semibold">Catatan</th>
                                <th className="px-4 py-3 font-semibold">Usulan Feature</th>
                                <th className="px-4 py-3 text-right font-semibold">Aksi</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                              {detail.assignments.map((assignment) => (
                                <tr key={`committee-assignment-${event.id}-${assignment.id}`} className="align-top">
                                  <td className="px-4 py-4">
                                    <div className="font-semibold text-slate-900">{assignment.memberLabel}</div>
                                    <div className="mt-1 text-xs text-slate-500">
                                      {formatCommitteeMemberMeta(assignment.memberTypeLabel, assignment.memberDetail)}
                                    </div>
                                  </td>
                                  <td className="px-4 py-4 text-slate-700">{assignment.assignmentRole}</td>
                                  <td className="px-4 py-4 text-slate-600">{assignment.notes || '-'}</td>
                                  <td className="px-4 py-4">
                                    {assignment.featureGrants.length === 0 ? (
                                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                                        Tanpa usulan feature workspace
                                      </span>
                                    ) : (
                                      <div className="flex flex-wrap gap-2">
                                        {assignment.featureGrants.map((feature) => (
                                          <span
                                            key={`committee-feature-grant-${event.id}-${assignment.id}-${feature.id}`}
                                            className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                                          >
                                            {feature.label}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </td>
                                  <td className="px-4 py-4">
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => onStartEdit(assignment)}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                                        aria-label="Edit anggota panitia"
                                        title="Edit anggota"
                                      >
                                        <Pencil className="h-4 w-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => onDelete(assignment.id)}
                                        disabled={deleting}
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
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommitteeEventsPage() {
  const queryClient = useQueryClient();
  const { data: activeAcademicYear } = useActiveAcademicYear();
  const [form, setForm] = useState<CommitteeFormState>(() => createEmptyFormState());
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(() => createEmptyAssignmentForm());
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [managingEventId, setManagingEventId] = useState<number | null>(null);

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: authService.getMe,
    staleTime: 5 * 60 * 1000,
  });

  const committeeQuery = useQuery({
    queryKey: ['committee-teacher-events'],
    queryFn: () => committeeService.list({ scope: 'MINE' }),
    staleTime: 60_000,
  });

  const committeeMetaQuery = useQuery({
    queryKey: ['committee-teacher-meta'],
    queryFn: committeeService.getMeta,
    enabled: Boolean(managingEventId),
    staleTime: 5 * 60 * 1000,
  });

  const managingDetailQuery = useQuery({
    queryKey: ['committee-teacher-detail', managingEventId],
    queryFn: () => committeeService.getDetail(managingEventId as number),
    enabled: Boolean(managingEventId),
    staleTime: 30_000,
  });

  const canPickExamProgram = useMemo(
    () => hasCurriculumCommitteeDuty(meQuery.data?.data?.additionalDuties || []),
    [meQuery.data?.data?.additionalDuties],
  );
  const canCreateCommittee = useMemo(
    () => hasCommitteeRequesterDuty(meQuery.data?.data?.additionalDuties || []),
    [meQuery.data?.data?.additionalDuties],
  );

  const examProgramsQuery = useQuery({
    queryKey: ['committee-exam-programs', activeAcademicYear?.id || 'none'],
    queryFn: () => examService.getPrograms({ academicYearId: activeAcademicYear?.id, roleContext: 'teacher' }),
    enabled: Boolean(activeAcademicYear?.id && canPickExamProgram),
    staleTime: 5 * 60 * 1000,
  });

  const teacherQuery = useQuery({
    queryKey: ['committee-teacher-member-options'],
    queryFn: () => userService.getUsers({ role: 'TEACHER', limit: 10000 }),
    enabled: Boolean(managingEventId),
    staleTime: 5 * 60 * 1000,
  });

  const staffQuery = useQuery({
    queryKey: ['committee-staff-member-options'],
    queryFn: () => userService.getUsers({ role: 'STAFF', limit: 10000 }),
    enabled: Boolean(managingEventId),
    staleTime: 5 * 60 * 1000,
  });

  const principalQuery = useQuery({
    queryKey: ['committee-principal-member-options'],
    queryFn: () => userService.getUsers({ role: 'PRINCIPAL', limit: 100 }),
    enabled: Boolean(managingEventId),
    staleTime: 5 * 60 * 1000,
  });

  const events = committeeQuery.data?.data?.items || [];
  const requestedEvents = events.filter((event) => event.isRequester);
  const assignedActiveEvents = events.filter(
    (event) => event.isAssigned && event.status === 'AKTIF' && event.myAssignment?.featureCodes?.length,
  );
  const managedEvent = requestedEvents.find((event) => event.id === managingEventId) || null;
  const managingDetail = managingDetailQuery.data?.data?.item || null;
  const assignmentMemberTypes =
    committeeMetaQuery.data?.data?.assignmentMemberTypes || DEFAULT_ASSIGNMENT_MEMBER_TYPES;
  const featureDefinitions = committeeMetaQuery.data?.data?.featureDefinitions || [];
  const teachers = teacherQuery.data?.data || [];
  const staffs = staffQuery.data?.data || [];
  const principals = principalQuery.data?.data || [];
  const examPrograms = useMemo(
    () => (examProgramsQuery.data?.data?.programs || []).filter((program) => program.isActive),
    [examProgramsQuery.data?.data?.programs],
  );

  const stats = {
    requested: requestedEvents.length,
    pending:
      requestedEvents.filter((event) => event.status === 'MENUNGGU_PERSETUJUAN_KEPSEK' || event.status === 'MENUNGGU_SK_TU')
        .length,
    activeAssignments: assignedActiveEvents.length,
    rejected: requestedEvents.filter((event) => event.status === 'DITOLAK_KEPSEK').length,
  };

  const patchCommitteeCaches = (item: CommitteeEventDetail, options?: { prepend?: boolean }) => {
    queryClient.setQueryData<CommitteeListResponse | undefined>(['committee-teacher-events'], (current) => {
      if (!current?.data) return current;
      const existingItems = current.data.items || [];
      const index = existingItems.findIndex((event) => event.id === item.id);
      const nextItems = [...existingItems];
      if (index >= 0) {
        nextItems[index] = item;
      } else if (options?.prepend) {
        nextItems.unshift(item);
      } else {
        nextItems.push(item);
      }
      return {
        ...current,
        data: {
          ...current.data,
          items: nextItems,
        },
      };
    });

    queryClient.setQueryData<CommitteeDetailResponse>(
      ['committee-teacher-detail', item.id],
      () =>
        ({
          data: {
            item,
          },
        }) as CommitteeDetailResponse,
    );
  };

  const openNewDraftModal = () => {
    setForm(createEmptyFormState());
    setIsFormOpen(true);
  };

  const closeDraftModal = () => {
    setIsFormOpen(false);
    setForm(createEmptyFormState());
  };

  const handleEdit = (event: CommitteeEventSummary) => {
    setForm({
      eventId: event.id,
      title: event.title,
      code: event.code,
      programCode: event.programCode || '',
      description: event.description || '',
    });
    setIsFormOpen(true);
  };

  const handleOpenManage = (event: CommitteeEventSummary) => {
    setAssignmentForm(createEmptyAssignmentForm());
    setManagingEventId(event.id);
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
      patchCommitteeCaches(saved, { prepend: !variables.eventId });
      setIsFormOpen(false);
      setForm(createEmptyFormState());
      toast.success(
        variables.eventId
          ? 'Draft kepanitiaan diperbarui.'
          : 'Draft kepanitiaan dibuat. Lanjutkan susunan panitia dari card draft.',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan draft kepanitiaan');
    },
  });

  const submitMutation = useMutation({
    mutationFn: (eventId: number) => committeeService.submit(eventId),
    onSuccess: (response, eventId) => {
      patchCommitteeCaches(response.data.item);
      if (managingEventId === eventId) {
        setManagingEventId(null);
        setAssignmentForm(createEmptyAssignmentForm());
      }
      toast.success('Pengajuan kepanitiaan diteruskan ke Kepala Sekolah.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal mengajukan kepanitiaan');
    },
  });

  const assignmentMutation = useMutation({
    mutationFn: () => {
      const activeMemberType =
        assignmentMemberTypes.find((item) => item.code === assignmentForm.memberKind) || assignmentMemberTypes[0];
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
        return committeeService.updateAssignment(managingEventId as number, assignmentForm.assignmentId, payload);
      }

      return committeeService.createAssignment(managingEventId as number, payload);
    },
    onSuccess: (response) => {
      patchCommitteeCaches(response.data.item);
      setAssignmentForm(createEmptyAssignmentForm());
      toast.success(
        assignmentForm.assignmentId ? 'Rancangan anggota panitia diperbarui.' : 'Anggota panitia ditambahkan ke draft.',
      );
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menyimpan rancangan anggota panitia');
    },
  });

  const deleteAssignmentMutation = useMutation({
    mutationFn: (assignmentId: number) => committeeService.deleteAssignment(managingEventId as number, assignmentId),
    onSuccess: (response) => {
      patchCommitteeCaches(response.data.item);
      setAssignmentForm(createEmptyAssignmentForm());
      toast.success('Anggota panitia dihapus dari draft.');
    },
    onError: (error: unknown) => {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError?.response?.data?.message || 'Gagal menghapus anggota panitia');
    },
  });

  const handleSaveDraft = () => {
    saveMutation.mutate({
      eventId: form.eventId,
      title: form.title.trim(),
      code: form.code.trim(),
      description: form.description.trim() || null,
      programCode: canPickExamProgram ? form.programCode || null : form.programCode || undefined,
    });
  };

  const handleDeleteAssignment = (assignmentId: number) => {
    if (!window.confirm('Hapus anggota panitia ini dari draft?')) return;
    deleteAssignmentMutation.mutate(assignmentId);
  };

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
              Popup draft menyimpan data inti kegiatan, lalu susunan panitia dikelola melalui popup khusus dari card draft yang dipilih.
            </p>
          </div>
          {canCreateCommittee ? (
            <button
              type="button"
              onClick={openNewDraftModal}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <PlusCircle className="h-4 w-4" />
              Draft Baru
            </button>
          ) : null}
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
              <p className="mt-1 text-sm text-slate-500">
                Statistik card dan preview susunan panitia akan ikut berubah langsung dari hasil simpan anggota tanpa refetch agresif.
              </p>
            </div>
            <ClipboardList className="h-5 w-5 text-slate-400" />
          </div>

          <div className="mt-5 space-y-4">
            {committeeQuery.isLoading ? (
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
                  managing={managingEventId === event.id}
                  onEdit={handleEdit}
                  onManage={handleOpenManage}
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
            <div className="font-semibold text-slate-900">1. Simpan Draft</div>
            <div className="mt-1">Popup menyimpan data inti kegiatan lalu menutup otomatis.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">2. Kelola Susunan</div>
            <div className="mt-1">Dari card draft, buka popup susunan panitia untuk tambah atau edit anggota.</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">3. Ajukan</div>
            <div className="mt-1">Setelah susunan panitia siap, draft baru diajukan ke Kepala Sekolah.</div>
          </div>
        </div>
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
          <div
            className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(eventClick) => eventClick.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-section-title font-semibold text-gray-900">
                  {form.eventId ? 'Perbarui Draft Kepanitiaan' : 'Buat Draft Kepanitiaan'}
                </h2>
                <p className="mt-1 text-body text-gray-500">
                  Popup ini hanya menyimpan data inti kegiatan. Pengaturan anggota dilanjutkan dari card draft setelah popup ditutup.
                </p>
              </div>
              <button
                type="button"
                onClick={closeDraftModal}
                className="rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Tutup popup draft kepanitiaan"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="committeeTitle" className="mb-1 block text-sm font-medium text-slate-700">
                    Nama Kegiatan
                  </label>
                  <input
                    id="committeeTitle"
                    name="committeeTitle"
                    autoComplete="off"
                    value={form.title}
                    onChange={(eventInput) => setForm((current) => ({ ...current, title: eventInput.target.value }))}
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
                    onChange={(eventInput) =>
                      setForm((current) => ({ ...current, code: eventInput.target.value.toUpperCase() }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm uppercase focus:border-blue-500 focus:outline-none"
                    placeholder="Contoh: SBTS_GENAP"
                  />
                </div>

                {canPickExamProgram ? (
                  <div>
                    <label htmlFor="committeeProgram" className="mb-1 block text-sm font-medium text-slate-700">
                        Program Ujian Terkait <span className="text-slate-400">(Opsional)</span>
                    </label>
                    <select
                      id="committeeProgram"
                      name="committeeProgram"
                      value={form.programCode}
                      onChange={(eventInput) => setForm((current) => ({ ...current, programCode: eventInput.target.value }))}
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
                      Field ini hanya tampil untuk Wakasek Kurikulum agar konteks kepanitiaan ujian tidak membingungkan role lain.
                    </p>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="committeeDescription" className="mb-1 block text-sm font-medium text-slate-700">
                    Deskripsi / Catatan
                  </label>
                  <textarea
                    id="committeeDescription"
                    name="committeeDescription"
                    rows={5}
                    value={form.description}
                    onChange={(eventInput) =>
                      setForm((current) => ({ ...current, description: eventInput.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm leading-6 focus:border-blue-500 focus:outline-none"
                    placeholder="Tuliskan konteks kegiatan, kebutuhan panitia, atau catatan untuk review."
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <button
                type="button"
                onClick={closeDraftModal}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={!form.title.trim() || !form.code.trim() || saveMutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {form.eventId ? 'Simpan Perubahan' : 'Simpan Draft'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {managedEvent ? (
        <CommitteeAssignmentModal
          event={managedEvent}
          detail={managingDetail}
          loading={managingDetailQuery.isLoading}
          assignmentForm={assignmentForm}
          setAssignmentForm={setAssignmentForm}
          memberTypes={assignmentMemberTypes}
          featureDefinitions={featureDefinitions}
          teachers={teachers}
          staffs={staffs}
          principals={principals}
          saving={assignmentMutation.isPending}
          deleting={deleteAssignmentMutation.isPending}
          onSave={() => assignmentMutation.mutate()}
          onDelete={handleDeleteAssignment}
          onStartEdit={handleStartEditAssignment}
          onClose={() => {
            setManagingEventId(null);
            setAssignmentForm(createEmptyAssignmentForm());
          }}
        />
      ) : null}
    </div>
  );
}
