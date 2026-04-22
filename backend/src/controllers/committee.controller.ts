import { CommitteeAssignmentMemberType, CommitteeEventStatus, CommitteeFeatureCode, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';
import {
  assertCommitteeRequesterAccess,
  assertHeadTuCommitteeAccess,
  assertPrincipalCommitteeAccess,
  buildCommitteeFeatureWebPath,
  buildCommitteeGroupLabel,
  COMMITTEE_FEATURE_DEFINITIONS,
  getActiveAcademicYearOrThrow,
  getCommitteeActorProfile,
  isCommitteeEditableByRequester,
  isHeadTuStaffProfile,
  normalizeCommitteeCode,
  normalizeProgramCode,
  normalizeRequesterDutyCode,
} from '../utils/committee';

const listCommitteeEventsQuerySchema = z.object({
  scope: z
    .enum(['MINE', 'REQUESTS', 'ASSIGNMENTS', 'PENDING_PRINCIPAL', 'HEAD_TU'])
    .optional()
    .default('MINE'),
  status: z.nativeEnum(CommitteeEventStatus).optional(),
  search: z.string().trim().optional(),
});

const committeeIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const assignmentIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
  assignmentId: z.coerce.number().int().positive(),
});

const createCommitteeEventSchema = z.object({
  code: z.string().trim().min(1, 'Kode kegiatan wajib diisi'),
  title: z.string().trim().min(1, 'Nama kegiatan wajib diisi'),
  description: z.string().trim().optional().nullable(),
  requesterDutyCode: z.string().trim().optional().nullable(),
  programCode: z.string().trim().optional().nullable(),
});

const updateCommitteeEventSchema = createCommitteeEventSchema.partial();

const submitCommitteeEventSchema = z.object({
  note: z.string().trim().optional().nullable(),
});

const principalDecisionSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().trim().optional().nullable(),
});

const issueCommitteeSkSchema = z.object({
  skNumber: z.string().trim().min(1, 'Nomor SK wajib diisi'),
  skIssuedAt: z
    .string()
    .trim()
    .min(1, 'Tanggal SK wajib diisi')
    .transform((value, ctx) => {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Tanggal SK tidak valid',
        });
        return z.NEVER;
      }
      return parsed;
    }),
  skNotes: z.string().trim().optional().nullable(),
});

const updateCommitteeLifecycleSchema = z.object({
  status: z.enum(['SELESAI', 'ARSIP']),
});

const COMMITTEE_ASSIGNMENT_MEMBER_TYPE_DEFINITIONS = [
  {
    code: 'TEACHER',
    label: 'Guru',
    memberType: CommitteeAssignmentMemberType.INTERNAL_USER,
    featureGrantEligible: true,
  },
  {
    code: 'STAFF',
    label: 'Staff TU',
    memberType: CommitteeAssignmentMemberType.INTERNAL_USER,
    featureGrantEligible: false,
  },
  {
    code: 'PRINCIPAL',
    label: 'Kepala Sekolah',
    memberType: CommitteeAssignmentMemberType.INTERNAL_USER,
    featureGrantEligible: false,
  },
  {
    code: 'EXTERNAL',
    label: 'Pembina Eksternal',
    memberType: CommitteeAssignmentMemberType.EXTERNAL_MEMBER,
    featureGrantEligible: false,
  },
] as const;

const upsertCommitteeAssignmentSchema = z.object({
  memberType: z.nativeEnum(CommitteeAssignmentMemberType).default(CommitteeAssignmentMemberType.INTERNAL_USER),
  userId: z.coerce.number().int().positive().optional().nullable(),
  externalName: z.string().trim().optional().nullable(),
  externalInstitution: z.string().trim().optional().nullable(),
  assignmentRole: z.string().trim().min(1, 'Peran anggota wajib diisi'),
  notes: z.string().trim().optional().nullable(),
  featureCodes: z.array(z.nativeEnum(CommitteeFeatureCode)).default([]),
}).superRefine((value, ctx) => {
  if (value.memberType === CommitteeAssignmentMemberType.INTERNAL_USER && !value.userId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['userId'],
      message: 'Pilih akun internal untuk anggota panitia.',
    });
  }

  if (value.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER && !String(value.externalName || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['externalName'],
      message: 'Nama anggota eksternal wajib diisi.',
    });
  }
});

const committeeEventDetailInclude = {
  academicYear: {
    select: {
      id: true,
      name: true,
      isActive: true,
    },
  },
  requestedBy: {
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      additionalDuties: true,
    },
  },
  principalDecisionBy: {
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
    },
  },
  skIssuedBy: {
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      ptkType: true,
    },
  },
  assignments: {
    where: {
      isActive: true,
    },
    orderBy: [
      {
        assignmentRole: 'asc' as const,
      },
      {
        createdAt: 'asc' as const,
      },
    ],
    select: {
      id: true,
      memberType: true,
      userId: true,
      externalName: true,
      externalInstitution: true,
      assignmentRole: true,
      notes: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          ptkType: true,
        },
      },
      featureGrants: {
        orderBy: {
          featureCode: 'asc' as const,
        },
        select: {
          id: true,
          featureCode: true,
          createdAt: true,
        },
      },
    },
  },
} satisfies Prisma.CommitteeEventInclude;

type CommitteeEventWithDetail = Prisma.CommitteeEventGetPayload<{
  include: typeof committeeEventDetailInclude;
}>;

type CommitteeAssignmentWithDetail = CommitteeEventWithDetail['assignments'][number];

type CommitteeNotificationRecipient = {
  userId: number;
  role: string;
  ptkType: string | null;
  assignment?: CommitteeAssignmentWithDetail | null;
};

const COMMITTEE_NOTIFICATION_FEATURE_PRIORITY: CommitteeFeatureCode[] = [
  CommitteeFeatureCode.EXAM_PROGRAM,
  CommitteeFeatureCode.EXAM_SCHEDULE,
  CommitteeFeatureCode.EXAM_ROOMS,
  CommitteeFeatureCode.EXAM_PROCTOR,
  CommitteeFeatureCode.EXAM_LAYOUT,
  CommitteeFeatureCode.EXAM_CARD,
];

async function getProgramLabelMap(academicYearId: number) {
  const rows = await prisma.examProgramConfig.findMany({
    where: {
      academicYearId,
      isActive: true,
    },
    select: {
      code: true,
      displayLabel: true,
      shortLabel: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  });

  const labelMap = new Map<string, string>();
  rows.forEach((row) => {
    const normalizedCode = normalizeProgramCode(row.code);
    if (!normalizedCode) return;
    labelMap.set(normalizedCode, String(row.displayLabel || row.shortLabel || row.code).trim() || normalizedCode);
  });
  return labelMap;
}

async function assertProgramCodeExists(academicYearId: number, programCode?: string | null) {
  const normalizedProgramCode = normalizeProgramCode(programCode);
  if (!normalizedProgramCode) return null;

  const config = await prisma.examProgramConfig.findUnique({
    where: {
      academicYearId_code: {
        academicYearId,
        code: normalizedProgramCode,
      },
    },
    select: {
      code: true,
      displayLabel: true,
      shortLabel: true,
      isActive: true,
    },
  });

  if (!config || !config.isActive) {
    throw new ApiError(400, 'Program ujian yang dipilih tidak ditemukan pada tahun ajaran aktif.');
  }

  return {
    code: normalizedProgramCode,
    label: String(config.displayLabel || config.shortLabel || config.code).trim() || normalizedProgramCode,
  };
}

function ensureRequesterDutyOwnership(profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>, requesterDutyCode?: string | null) {
  const normalizedDuty = normalizeRequesterDutyCode(requesterDutyCode);
  if (!normalizedDuty) return null;
  if (!profile.additionalDuties.includes(normalizedDuty)) {
    throw new ApiError(403, 'Anda tidak memiliki duty pengusul yang dipilih.');
  }
  return normalizedDuty;
}

async function getCommitteeEventByIdOrThrow(id: number) {
  const event = await prisma.committeeEvent.findUnique({
    where: { id },
    include: committeeEventDetailInclude,
  });

  if (!event) {
    throw new ApiError(404, 'Kegiatan kepanitiaan tidak ditemukan.');
  }

  return event;
}

function dedupeCommitteeNotificationRecipients(rows: CommitteeNotificationRecipient[]) {
  const recipientMap = new Map<number, CommitteeNotificationRecipient>();
  rows.forEach((row) => {
    if (!Number.isFinite(Number(row.userId)) || Number(row.userId) <= 0) return;
    const existing = recipientMap.get(Number(row.userId));
    if (!existing || (!existing.assignment && row.assignment)) {
      recipientMap.set(Number(row.userId), row);
    }
  });
  return Array.from(recipientMap.values());
}

async function listCommitteePrincipalNotificationRecipients() {
  const principals = await prisma.user.findMany({
    where: {
      role: 'PRINCIPAL',
    },
    select: {
      id: true,
      role: true,
      ptkType: true,
    },
  });

  return dedupeCommitteeNotificationRecipients(
    principals.map((principal) => ({
      userId: principal.id,
      role: principal.role,
      ptkType: principal.ptkType || null,
    })),
  );
}

async function listCommitteeHeadTuNotificationRecipients() {
  const staffs = await prisma.user.findMany({
    where: {
      role: 'STAFF',
    },
    select: {
      id: true,
      role: true,
      ptkType: true,
    },
  });

  return dedupeCommitteeNotificationRecipients(
    staffs
      .filter((staff) =>
        isHeadTuStaffProfile({
          role: staff.role,
          ptkType: staff.ptkType || null,
        }),
      )
      .map((staff) => ({
        userId: staff.id,
        role: staff.role,
        ptkType: staff.ptkType || null,
      })),
  );
}

function resolveCommitteeNotificationRoute(
  event: CommitteeEventWithDetail,
  recipient: CommitteeNotificationRecipient,
) {
  if (recipient.role === 'PRINCIPAL') {
    return '/principal/committee-approvals';
  }

  if (
    isHeadTuStaffProfile({
      role: recipient.role,
      ptkType: recipient.ptkType || null,
    })
  ) {
    return '/staff/head-tu/committees';
  }

  if (recipient.role === 'TEACHER') {
    const committeeLabel = buildCommitteeGroupLabel(event.title);
    const preferredFeatureCode = COMMITTEE_NOTIFICATION_FEATURE_PRIORITY.find((featureCode) =>
      recipient.assignment?.featureGrants.some((grant) => grant.featureCode === featureCode),
    );

    if (preferredFeatureCode) {
      return buildCommitteeFeatureWebPath({
        eventId: event.id,
        featureCode: preferredFeatureCode,
        committeeLabel,
      });
    }

    return '/teacher/committees';
  }

  return '/notifications';
}

function buildCommitteeNotificationRows(params: {
  recipients: CommitteeNotificationRecipient[];
  event: CommitteeEventWithDetail;
  actor: Awaited<ReturnType<typeof getCommitteeActorProfile>>;
  title: string;
  message: string;
  type: string;
  extraData?: Record<string, unknown>;
}) {
  const recipients = dedupeCommitteeNotificationRecipients(params.recipients);
  return recipients.map((recipient) => ({
    userId: recipient.userId,
    title: params.title,
    message: params.message,
    type: params.type,
    data: {
      module: 'COMMITTEE',
      route: resolveCommitteeNotificationRoute(params.event, recipient),
      committeeEventId: params.event.id,
      committeeCode: params.event.code,
      committeeTitle: params.event.title,
      status: params.event.status,
      actorId: params.actor.id,
      actorName: params.actor.name,
      actorRole: params.actor.role,
      ...(params.extraData || {}),
    },
  })) satisfies Prisma.NotificationCreateManyInput[];
}

async function safeCreateCommitteeNotifications(rows: Prisma.NotificationCreateManyInput[]) {
  if (rows.length === 0) return;

  try {
    await createManyInAppNotifications({
      data: rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[committee] gagal membuat notifikasi workflow: ${message}`);
  }
}

async function notifyCommitteeSubmitted(
  event: CommitteeEventWithDetail,
  actor: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
) {
  const principals = await listCommitteePrincipalNotificationRecipients();
  await safeCreateCommitteeNotifications(
    buildCommitteeNotificationRows({
      recipients: principals,
      event,
      actor,
      title: 'Pengajuan Kepanitiaan Baru',
      message: `${actor.name} mengajukan ${event.title} dan menunggu review Kepala Sekolah.`,
      type: 'COMMITTEE_SUBMISSION',
    }),
  );
}

async function notifyCommitteePrincipalDecision(params: {
  event: CommitteeEventWithDetail;
  actor: Awaited<ReturnType<typeof getCommitteeActorProfile>>;
  approved: boolean;
  feedback?: string | null;
}) {
  const requesterAssignment = params.event.assignments.find(
    (assignment) => assignment.userId === params.event.requestedById && assignment.isActive,
  );
  const requesterRecipients = dedupeCommitteeNotificationRecipients([
    {
      userId: params.event.requestedById,
      role: params.event.requestedBy.role,
      ptkType: null,
      assignment: requesterAssignment || null,
    },
  ]);

  if (params.approved) {
    const headTuRecipients = await listCommitteeHeadTuNotificationRecipients();
    await safeCreateCommitteeNotifications(
      buildCommitteeNotificationRows({
        recipients: headTuRecipients,
        event: params.event,
        actor: params.actor,
        title: 'Pengajuan Kepanitiaan Menunggu SK',
        message: `${params.event.title} telah disetujui Kepala Sekolah dan menunggu penerbitan SK Kepala TU.`,
        type: 'COMMITTEE_APPROVED',
      }),
    );

    await safeCreateCommitteeNotifications(
      buildCommitteeNotificationRows({
        recipients: requesterRecipients,
        event: params.event,
        actor: params.actor,
        title: 'Pengajuan Kepanitiaan Disetujui',
        message: `${params.event.title} telah disetujui Kepala Sekolah dan diteruskan ke Kepala TU untuk penerbitan SK.`,
        type: 'COMMITTEE_APPROVED',
      }),
    );
    return;
  }

  const feedbackSuffix = String(params.feedback || '').trim();
  await safeCreateCommitteeNotifications(
    buildCommitteeNotificationRows({
      recipients: requesterRecipients,
      event: params.event,
      actor: params.actor,
      title: 'Pengajuan Kepanitiaan Perlu Revisi',
      message: feedbackSuffix
        ? `${params.event.title} dikembalikan oleh Kepala Sekolah. Catatan: ${feedbackSuffix}`
        : `${params.event.title} dikembalikan oleh Kepala Sekolah untuk ditinjau ulang.`,
      type: 'COMMITTEE_REJECTED',
      extraData: feedbackSuffix
        ? {
            principalFeedback: feedbackSuffix,
          }
        : undefined,
    }),
  );
}

async function notifyCommitteeSkIssued(
  event: CommitteeEventWithDetail,
  actor: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
) {
  const requesterAssignment = event.assignments.find(
    (assignment) => assignment.userId === event.requestedById && assignment.isActive,
  );
  const internalRecipients = event.assignments
    .filter(
      (assignment) =>
        assignment.isActive &&
        assignment.memberType === CommitteeAssignmentMemberType.INTERNAL_USER &&
        Number.isFinite(Number(assignment.userId)) &&
        Number(assignment.userId) > 0 &&
        assignment.user,
    )
    .map((assignment) => ({
      userId: Number(assignment.userId),
      role: assignment.user?.role || 'TEACHER',
      ptkType: assignment.user?.ptkType || null,
      assignment,
    }));

  const recipients = dedupeCommitteeNotificationRecipients([
    ...internalRecipients,
    {
      userId: event.requestedById,
      role: event.requestedBy.role,
      ptkType: null,
      assignment: requesterAssignment || null,
    },
  ]);

  await safeCreateCommitteeNotifications(
    buildCommitteeNotificationRows({
      recipients,
      event,
      actor,
      title: 'SK Kepanitiaan Terbit',
      message: `${event.title} sudah aktif. Silakan lanjut bekerja sesuai assignment panitia Anda.`,
      type: 'COMMITTEE_SK_ISSUED',
      extraData: {
        skNumber: event.skNumber,
        skIssuedAt: event.skIssuedAt?.toISOString() || null,
      },
    }),
  );
}

function canReadCommitteeEvent(profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>, event: CommitteeEventWithDetail) {
  if (profile.role === 'ADMIN' || profile.role === 'PRINCIPAL' || isHeadTuStaffProfile(profile)) {
    return true;
  }
  if (profile.id === event.requestedById) {
    return true;
  }
  return event.assignments.some((assignment) => assignment.userId === profile.id && assignment.isActive);
}

function assertCommitteeRequestEditAccess(
  profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
  event: CommitteeEventWithDetail,
) {
  if (profile.role === 'ADMIN') return;
  if (profile.id !== event.requestedById) {
    throw new ApiError(403, 'Hanya pengusul yang dapat mengubah pengajuan ini.');
  }
  if (!isCommitteeEditableByRequester(event.status)) {
    throw new ApiError(400, 'Pengajuan ini sudah berjalan dan tidak dapat diubah oleh pengusul.');
  }
}

function canRequesterManageCommitteeAssignments(
  profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
  event: CommitteeEventWithDetail,
) {
  return profile.id === event.requestedById && isCommitteeEditableByRequester(event.status);
}

function canHeadTuManageCommitteeAssignments(
  profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
  event: CommitteeEventWithDetail,
) {
  const manageableStatuses = new Set<CommitteeEventStatus>([
    CommitteeEventStatus.MENUNGGU_SK_TU,
    CommitteeEventStatus.AKTIF,
    CommitteeEventStatus.SELESAI,
    CommitteeEventStatus.ARSIP,
  ]);

  return isHeadTuStaffProfile(profile) && manageableStatuses.has(event.status);
}

function assertCommitteeAssignmentManageAccess(
  profile: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
  event: CommitteeEventWithDetail,
) {
  if (profile.role === 'ADMIN') return;

  if (canRequesterManageCommitteeAssignments(profile, event)) {
    return;
  }

  if (canHeadTuManageCommitteeAssignments(profile, event)) {
    return;
  }

  if (profile.id === event.requestedById) {
    throw new ApiError(400, 'Rancangan panitia hanya dapat diubah saat status masih draft atau revisi.');
  }

  throw new ApiError(403, 'Pengelolaan anggota panitia hanya untuk pengusul draft atau Kepala TU sesuai tahap workflow.');
}

function assertCurrentAssignmentVisibility(event: CommitteeEventWithDetail, userId: number) {
  const assignment = event.assignments.find((item) => item.userId === userId && item.isActive);
  if (!assignment) {
    throw new ApiError(403, 'Anda tidak memiliki assignment panitia aktif pada kegiatan ini.');
  }
  return assignment;
}

function normalizeCommitteeMemberTypeLabel(assignment: CommitteeAssignmentWithDetail) {
  if (assignment.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER) {
    return 'Pembina Eksternal';
  }
  if (assignment.user?.role === 'PRINCIPAL') {
    return 'Kepala Sekolah';
  }
  if (assignment.user?.role === 'STAFF') {
    return 'Staff TU';
  }
  return 'Guru';
}

function buildCommitteeMemberDetail(assignment: CommitteeAssignmentWithDetail) {
  if (assignment.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER) {
    return String(assignment.externalInstitution || '').trim() || null;
  }
  if (!assignment.user) return null;
  if (assignment.user.role === 'STAFF') {
    return String(assignment.user.ptkType || assignment.user.username || '').trim() || null;
  }
  return String(assignment.user.username || '').trim() || null;
}

function buildCommitteeMemberLabel(assignment: CommitteeAssignmentWithDetail) {
  if (assignment.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER) {
    return String(assignment.externalName || '').trim() || 'Anggota Eksternal';
  }
  return assignment.user?.name || 'Anggota Internal';
}

async function getCommitteeEligibleInternalMember(userId: number) {
  const member = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      name: true,
      username: true,
      ptkType: true,
    },
  });

  if (!member) {
    throw new ApiError(404, 'Anggota panitia tidak ditemukan.');
  }

  if (!['TEACHER', 'STAFF', 'PRINCIPAL'].includes(member.role)) {
    throw new ApiError(400, 'Anggota panitia hanya dapat dipilih dari guru, kepala sekolah, atau staff TU.');
  }

  return member;
}

function assertFeatureGrantCompatibility(
  event: CommitteeEventWithDetail,
  featureCodes: CommitteeFeatureCode[],
  options: {
    memberType: CommitteeAssignmentMemberType;
    internalMemberRole?: string | null;
  },
) {
  if (featureCodes.length === 0) return;
  if (!normalizeProgramCode(event.programCode)) {
    throw new ApiError(400, 'Feature grant berbasis ujian memerlukan Program Ujian terkait pada kegiatan ini.');
  }
  if (options.memberType !== CommitteeAssignmentMemberType.INTERNAL_USER || options.internalMemberRole !== 'TEACHER') {
    throw new ApiError(400, 'Feature grant workspace saat ini hanya dapat diberikan kepada akun guru internal.');
  }
}

function mapCommitteeAssignmentForResponse(assignment: CommitteeAssignmentWithDetail) {
  return {
    id: assignment.id,
    memberType: assignment.memberType,
    userId: assignment.userId,
    externalName: assignment.externalName,
    externalInstitution: assignment.externalInstitution,
    memberLabel: buildCommitteeMemberLabel(assignment),
    memberTypeLabel: normalizeCommitteeMemberTypeLabel(assignment),
    memberDetail: buildCommitteeMemberDetail(assignment),
    workspaceEligible: Boolean(
      assignment.memberType === CommitteeAssignmentMemberType.INTERNAL_USER && assignment.user?.role === 'TEACHER',
    ),
    assignmentRole: assignment.assignmentRole,
    notes: assignment.notes,
    isActive: assignment.isActive,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
    user: assignment.user,
    featureGrants: assignment.featureGrants.map((feature) => ({
      id: feature.id,
      featureCode: feature.featureCode,
      label:
        COMMITTEE_FEATURE_DEFINITIONS.find((definition) => definition.code === feature.featureCode)?.label ||
        feature.featureCode,
    })),
  };
}

function countGrantedFeatureDefinitions(assignments: CommitteeAssignmentWithDetail[]) {
  const uniqueFeatureCodes = new Set<CommitteeFeatureCode>();
  assignments.forEach((assignment) => {
    assignment.featureGrants.forEach((feature) => {
      uniqueFeatureCodes.add(feature.featureCode);
    });
  });
  return uniqueFeatureCodes.size;
}

function mapCommitteeEventSummary(
  event: CommitteeEventWithDetail,
  actorId: number,
  programLabelMap: Map<string, string>,
) {
  const normalizedProgramCode = normalizeProgramCode(event.programCode);
  const activeAssignments = event.assignments.filter((assignment) => assignment.isActive);
  const myAssignment = activeAssignments.find((assignment) => assignment.userId === actorId) || null;

  return {
    id: event.id,
    code: event.code,
    title: event.title,
    description: event.description,
    requesterDutyCode: event.requesterDutyCode,
    programCode: normalizedProgramCode || null,
    programLabel: normalizedProgramCode ? programLabelMap.get(normalizedProgramCode) || normalizedProgramCode : null,
    status: event.status,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    startedAt: event.startedAt,
    endedAt: event.endedAt,
    academicYear: event.academicYear,
    requestedBy: event.requestedBy,
    principalDecision: {
      by: event.principalDecisionBy,
      at: event.principalDecisionAt,
      feedback: event.principalFeedback,
    },
    sk: {
      number: event.skNumber,
      issuedAt: event.skIssuedAt,
      notes: event.skNotes,
      issuedBy: event.skIssuedBy,
    },
    counts: {
      members: activeAssignments.length,
      grantedFeatures: countGrantedFeatureDefinitions(activeAssignments),
    },
    isRequester: event.requestedById === actorId,
    isAssigned: Boolean(myAssignment),
    myAssignment: myAssignment
      ? {
          id: myAssignment.id,
          memberType: myAssignment.memberType,
          assignmentRole: myAssignment.assignmentRole,
          notes: myAssignment.notes,
          featureCodes: myAssignment.featureGrants.map((feature) => feature.featureCode),
        }
      : null,
    membersPreview: activeAssignments.slice(0, 5).map((assignment) => ({
      id: assignment.id,
      memberType: assignment.memberType,
      memberLabel: buildCommitteeMemberLabel(assignment),
      memberTypeLabel: normalizeCommitteeMemberTypeLabel(assignment),
      memberDetail: buildCommitteeMemberDetail(assignment),
      assignmentRole: assignment.assignmentRole,
      featureCodes: assignment.featureGrants.map((feature) => feature.featureCode),
    })),
  };
}

function mapCommitteeEventDetail(
  event: CommitteeEventWithDetail,
  actor: Awaited<ReturnType<typeof getCommitteeActorProfile>>,
  programLabelMap: Map<string, string>,
) {
  const summary = mapCommitteeEventSummary(event, actor.id, programLabelMap);

  return {
    ...summary,
    assignments: event.assignments.map((assignment) => mapCommitteeAssignmentForResponse(assignment)),
    availableFeatures: COMMITTEE_FEATURE_DEFINITIONS,
    access: {
      canEditRequest: event.requestedById === actor.id && isCommitteeEditableByRequester(event.status),
      canPrincipalReview: event.status === CommitteeEventStatus.MENUNGGU_PERSETUJUAN_KEPSEK,
      canIssueSk: event.status === CommitteeEventStatus.MENUNGGU_SK_TU,
      canManageAssignments:
        actor.role === 'ADMIN' ||
        canRequesterManageCommitteeAssignments(actor, event) ||
        canHeadTuManageCommitteeAssignments(actor, event),
    },
  };
}

export const getCommitteeMeta = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(
    new ApiResponse(
      200,
      {
        featureDefinitions: COMMITTEE_FEATURE_DEFINITIONS,
        assignmentMemberTypes: COMMITTEE_ASSIGNMENT_MEMBER_TYPE_DEFINITIONS,
      },
      'Meta kepanitiaan berhasil diambil',
    ),
  );
});

export const listCommitteeEvents = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const query = listCommitteeEventsQuerySchema.parse(req.query);
  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const filters: Prisma.CommitteeEventWhereInput[] = [{ academicYearId: activeAcademicYear.id }];

  if (query.search) {
    filters.push({
      OR: [
        { code: { contains: query.search, mode: 'insensitive' } },
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
        { skNumber: { contains: query.search, mode: 'insensitive' } },
      ],
    });
  }

  if (query.scope === 'PENDING_PRINCIPAL') {
    await assertPrincipalCommitteeAccess(actor.id, { allowAdmin: true });
    filters.push({
      status: CommitteeEventStatus.MENUNGGU_PERSETUJUAN_KEPSEK,
    });
  } else if (query.scope === 'HEAD_TU') {
    await assertHeadTuCommitteeAccess(actor.id, { allowAdmin: true });
    filters.push({
      status: query.status || {
        in: [
          CommitteeEventStatus.MENUNGGU_SK_TU,
          CommitteeEventStatus.AKTIF,
          CommitteeEventStatus.SELESAI,
          CommitteeEventStatus.ARSIP,
        ],
      },
    });
  } else if (query.scope === 'REQUESTS') {
    await assertCommitteeRequesterAccess(actor.id, { allowAdmin: true });
    filters.push({ requestedById: actor.id });
    if (query.status) {
      filters.push({ status: query.status });
    }
  } else if (query.scope === 'ASSIGNMENTS') {
    await assertCommitteeRequesterAccess(actor.id, { allowAdmin: true });
    filters.push({
      assignments: {
        some: {
          userId: actor.id,
          isActive: true,
        },
      },
    });
    if (query.status) {
      filters.push({ status: query.status });
    }
  } else {
    if (actor.role !== 'ADMIN' && actor.role !== 'TEACHER') {
      throw new ApiError(403, 'Scope ini hanya tersedia untuk guru.');
    }
    filters.push({
      OR: [
        { requestedById: actor.id },
        {
          assignments: {
            some: {
              userId: actor.id,
              isActive: true,
            },
          },
        },
      ],
    });
    if (query.status) {
      filters.push({ status: query.status });
    }
  }

  const where: Prisma.CommitteeEventWhereInput = filters.length === 1 ? filters[0] : { AND: filters };

  const [events, programLabelMap] = await Promise.all([
    prisma.committeeEvent.findMany({
      where,
      include: committeeEventDetailInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
    getProgramLabelMap(activeAcademicYear.id),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        items: events.map((event) => mapCommitteeEventSummary(event, actor.id, programLabelMap)),
      },
      'Daftar kegiatan kepanitiaan berhasil diambil',
    ),
  );
});

export const getCommitteeEventDetail = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const params = committeeIdParamSchema.parse(req.params);
  const event = await getCommitteeEventByIdOrThrow(params.id);

  if (!canReadCommitteeEvent(actor, event)) {
    throw new ApiError(403, 'Anda tidak memiliki akses ke kegiatan ini.');
  }

  const programLabelMap = await getProgramLabelMap(event.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(event, actor, programLabelMap),
      },
      'Detail kegiatan kepanitiaan berhasil diambil',
    ),
  );
});

export const createCommitteeEvent = asyncHandler(async (req: Request, res: Response) => {
  const body = createCommitteeEventSchema.parse(req.body);
  const actor = await assertCommitteeRequesterAccess((req as any).user.id, { allowAdmin: true });
  const activeAcademicYear = await getActiveAcademicYearOrThrow();

  const normalizedCode = normalizeCommitteeCode(body.code);
  if (!normalizedCode) {
    throw new ApiError(400, 'Kode kegiatan tidak valid.');
  }

  const requesterDutyCode = ensureRequesterDutyOwnership(actor, body.requesterDutyCode);
  const program = await assertProgramCodeExists(activeAcademicYear.id, body.programCode);

  const existing = await prisma.committeeEvent.findUnique({
    where: {
      academicYearId_code: {
        academicYearId: activeAcademicYear.id,
        code: normalizedCode,
      },
    },
    select: { id: true },
  });

  if (existing) {
    throw new ApiError(409, 'Kode kegiatan sudah digunakan pada tahun ajaran aktif.');
  }

  const created = await prisma.committeeEvent.create({
    data: {
      academicYearId: activeAcademicYear.id,
      code: normalizedCode,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      requesterDutyCode,
      programCode: program?.code || null,
      requestedById: actor.id,
      status: CommitteeEventStatus.DRAFT,
    },
    include: committeeEventDetailInclude,
  });

  const programLabelMap = await getProgramLabelMap(activeAcademicYear.id);

  res.status(201).json(
    new ApiResponse(
      201,
      {
        item: mapCommitteeEventDetail(created, actor, programLabelMap),
      },
      'Pengajuan kegiatan kepanitiaan berhasil dibuat sebagai draft',
    ),
  );
});

export const updateCommitteeEvent = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const body = updateCommitteeEventSchema.parse(req.body);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await getCommitteeEventByIdOrThrow(params.id);

  assertCommitteeRequestEditAccess(actor, event);

  const normalizedCode = body.code ? normalizeCommitteeCode(body.code) : event.code;
  if (!normalizedCode) {
    throw new ApiError(400, 'Kode kegiatan tidak valid.');
  }

  const requesterDutyCode =
    body.requesterDutyCode !== undefined
      ? ensureRequesterDutyOwnership(actor, body.requesterDutyCode)
      : event.requesterDutyCode;
  const program =
    body.programCode !== undefined
      ? await assertProgramCodeExists(event.academicYearId, body.programCode)
      : normalizeProgramCode(event.programCode)
        ? {
            code: normalizeProgramCode(event.programCode),
          }
        : null;

  if (
    body.programCode !== undefined &&
    !program?.code &&
    event.assignments.some((assignment) => assignment.featureGrants.length > 0)
  ) {
    throw new ApiError(
      400,
      'Hapus dulu usulan feature workspace pada susunan panitia jika ingin melepas Program Ujian terkait.',
    );
  }

  if (normalizedCode !== event.code) {
    const existing = await prisma.committeeEvent.findUnique({
      where: {
        academicYearId_code: {
          academicYearId: event.academicYearId,
          code: normalizedCode,
        },
      },
      select: { id: true },
    });

    if (existing && existing.id !== event.id) {
      throw new ApiError(409, 'Kode kegiatan sudah digunakan pada tahun ajaran aktif.');
    }
  }

  const updated = await prisma.committeeEvent.update({
    where: { id: event.id },
    data: {
      code: normalizedCode,
      title: body.title?.trim() || event.title,
      description: body.description !== undefined ? body.description?.trim() || null : event.description,
      requesterDutyCode: requesterDutyCode || null,
      programCode: program?.code || null,
      status: event.status === CommitteeEventStatus.DITOLAK_KEPSEK ? CommitteeEventStatus.DRAFT : event.status,
      principalDecisionById: event.status === CommitteeEventStatus.DITOLAK_KEPSEK ? null : event.principalDecisionById,
      principalDecisionAt: event.status === CommitteeEventStatus.DITOLAK_KEPSEK ? null : event.principalDecisionAt,
      principalFeedback: event.status === CommitteeEventStatus.DITOLAK_KEPSEK ? null : event.principalFeedback,
    },
    include: committeeEventDetailInclude,
  });

  const programLabelMap = await getProgramLabelMap(updated.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(updated, actor, programLabelMap),
      },
      'Pengajuan kegiatan kepanitiaan berhasil diperbarui',
    ),
  );
});

export const submitCommitteeEvent = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  submitCommitteeEventSchema.parse(req.body);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await getCommitteeEventByIdOrThrow(params.id);

  assertCommitteeRequestEditAccess(actor, event);

  if (event.assignments.length === 0) {
    throw new ApiError(400, 'Tambahkan minimal satu anggota panitia sebelum draft diajukan ke Kepala Sekolah.');
  }

  const submitted = await prisma.committeeEvent.update({
    where: { id: event.id },
    data: {
      status: CommitteeEventStatus.MENUNGGU_PERSETUJUAN_KEPSEK,
      principalDecisionById: null,
      principalDecisionAt: null,
      principalFeedback: null,
      skNumber: null,
      skIssuedAt: null,
      skIssuedById: null,
      skNotes: null,
      startedAt: null,
      endedAt: null,
    },
    include: committeeEventDetailInclude,
  });

  await notifyCommitteeSubmitted(submitted, actor);

  const programLabelMap = await getProgramLabelMap(submitted.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(submitted, actor, programLabelMap),
      },
      'Pengajuan kepanitiaan berhasil diteruskan ke Kepala Sekolah',
    ),
  );
});

export const reviewCommitteeEventAsPrincipal = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const body = principalDecisionSchema.parse(req.body);
  const actor = await assertPrincipalCommitteeAccess((req as any).user.id, { allowAdmin: true });
  const event = await getCommitteeEventByIdOrThrow(params.id);

  if (event.status !== CommitteeEventStatus.MENUNGGU_PERSETUJUAN_KEPSEK) {
    throw new ApiError(400, 'Pengajuan ini tidak sedang menunggu persetujuan Kepala Sekolah.');
  }

  const updated = await prisma.committeeEvent.update({
    where: { id: event.id },
    data: {
      status: body.approved ? CommitteeEventStatus.MENUNGGU_SK_TU : CommitteeEventStatus.DITOLAK_KEPSEK,
      principalDecisionById: actor.id,
      principalDecisionAt: new Date(),
      principalFeedback: body.feedback?.trim() || null,
    },
    include: committeeEventDetailInclude,
  });

  await notifyCommitteePrincipalDecision({
    event: updated,
    actor,
    approved: body.approved,
    feedback: body.feedback,
  });

  const programLabelMap = await getProgramLabelMap(updated.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(updated, actor, programLabelMap),
      },
      body.approved
        ? 'Pengajuan kepanitiaan diteruskan ke Kepala TU untuk penerbitan SK'
        : 'Pengajuan kepanitiaan ditolak oleh Kepala Sekolah',
    ),
  );
});

export const issueCommitteeSk = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const body = issueCommitteeSkSchema.parse(req.body);
  const actor = await assertHeadTuCommitteeAccess((req as any).user.id, { allowAdmin: true });
  const event = await getCommitteeEventByIdOrThrow(params.id);

  if (event.status !== CommitteeEventStatus.MENUNGGU_SK_TU) {
    throw new ApiError(400, 'Kegiatan ini belum berada pada tahap penerbitan SK.');
  }

  if (event.assignments.length === 0) {
    throw new ApiError(400, 'Tambahkan minimal satu anggota panitia sebelum menerbitkan SK.');
  }

  const updated = await prisma.committeeEvent.update({
    where: { id: event.id },
    data: {
      status: CommitteeEventStatus.AKTIF,
      skNumber: body.skNumber.trim(),
      skIssuedAt: body.skIssuedAt,
      skIssuedById: actor.id,
      skNotes: body.skNotes?.trim() || null,
      startedAt: event.startedAt || body.skIssuedAt,
    },
    include: committeeEventDetailInclude,
  });

  await notifyCommitteeSkIssued(updated, actor);

  const programLabelMap = await getProgramLabelMap(updated.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(updated, actor, programLabelMap),
      },
      'SK kepanitiaan berhasil diterbitkan dan kegiatan dinyatakan aktif',
    ),
  );
});

export const updateCommitteeLifecycle = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const body = updateCommitteeLifecycleSchema.parse(req.body);
  const actor = await assertHeadTuCommitteeAccess((req as any).user.id, { allowAdmin: true });
  const event = await getCommitteeEventByIdOrThrow(params.id);
  const lifecycleStatuses = new Set<CommitteeEventStatus>([
    CommitteeEventStatus.AKTIF,
    CommitteeEventStatus.SELESAI,
    CommitteeEventStatus.ARSIP,
  ]);

  if (!lifecycleStatuses.has(event.status)) {
    throw new ApiError(400, 'Lifecycle kegiatan ini belum dapat diubah.');
  }

  const nextStatus =
    body.status === 'ARSIP'
      ? CommitteeEventStatus.ARSIP
      : CommitteeEventStatus.SELESAI;

  const updated = await prisma.committeeEvent.update({
    where: { id: event.id },
    data: {
      status: nextStatus,
      endedAt:
        nextStatus === CommitteeEventStatus.SELESAI || nextStatus === CommitteeEventStatus.ARSIP
          ? event.endedAt || new Date()
          : event.endedAt,
    },
    include: committeeEventDetailInclude,
  });

  const programLabelMap = await getProgramLabelMap(updated.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(updated, actor, programLabelMap),
      },
      nextStatus === CommitteeEventStatus.SELESAI
        ? 'Kegiatan kepanitiaan ditandai selesai'
        : 'Kegiatan kepanitiaan berhasil diarsipkan',
    ),
  );
});

export const createCommitteeAssignment = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const body = upsertCommitteeAssignmentSchema.parse(req.body);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await getCommitteeEventByIdOrThrow(params.id);
  const uniqueFeatureCodes = Array.from(new Set(body.featureCodes));

  assertCommitteeAssignmentManageAccess(actor, event);
  const internalMember =
    body.memberType === CommitteeAssignmentMemberType.INTERNAL_USER
      ? await getCommitteeEligibleInternalMember(body.userId as number)
      : null;
  assertFeatureGrantCompatibility(event, uniqueFeatureCodes, {
    memberType: body.memberType,
    internalMemberRole: internalMember?.role || null,
  });

  if (body.memberType === CommitteeAssignmentMemberType.INTERNAL_USER) {
    const existingAssignment = await prisma.committeeAssignment.findUnique({
      where: {
        committeeEventId_userId: {
          committeeEventId: event.id,
          userId: internalMember!.id,
        },
      },
      select: { id: true },
    });

    if (existingAssignment) {
      throw new ApiError(409, 'Akun internal tersebut sudah terdaftar sebagai anggota panitia pada kegiatan ini.');
    }
  }

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.committeeAssignment.create({
      data: {
        committeeEventId: event.id,
        memberType: body.memberType,
        userId: internalMember?.id || null,
        externalName:
          body.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER
            ? body.externalName?.trim() || null
            : null,
        externalInstitution:
          body.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER
            ? body.externalInstitution?.trim() || null
            : null,
        assignmentRole: body.assignmentRole.trim(),
        notes: body.notes?.trim() || null,
        createdById: actor.id,
        isActive: true,
      },
    });

    if (uniqueFeatureCodes.length > 0) {
      await tx.committeeFeatureGrant.createMany({
        data: uniqueFeatureCodes.map((featureCode) => ({
          assignmentId: assignment.id,
          featureCode,
        })),
      });
    }
  });

  const refreshed = await getCommitteeEventByIdOrThrow(event.id);
  const programLabelMap = await getProgramLabelMap(refreshed.academicYearId);

  res.status(201).json(
    new ApiResponse(
      201,
      {
        item: mapCommitteeEventDetail(refreshed, actor, programLabelMap),
      },
      'Anggota panitia berhasil ditambahkan',
    ),
  );
});

export const updateCommitteeAssignment = asyncHandler(async (req: Request, res: Response) => {
  const params = assignmentIdParamSchema.parse(req.params);
  const body = upsertCommitteeAssignmentSchema.parse(req.body);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await getCommitteeEventByIdOrThrow(params.id);
  const uniqueFeatureCodes = Array.from(new Set(body.featureCodes));

  assertCommitteeAssignmentManageAccess(actor, event);
  const internalMember =
    body.memberType === CommitteeAssignmentMemberType.INTERNAL_USER
      ? await getCommitteeEligibleInternalMember(body.userId as number)
      : null;
  assertFeatureGrantCompatibility(event, uniqueFeatureCodes, {
    memberType: body.memberType,
    internalMemberRole: internalMember?.role || null,
  });

  const currentAssignment = event.assignments.find((assignment) => assignment.id === params.assignmentId);
  if (!currentAssignment) {
    throw new ApiError(404, 'Assignment panitia tidak ditemukan.');
  }

  if (body.memberType === CommitteeAssignmentMemberType.INTERNAL_USER) {
    const duplicateAssignment = await prisma.committeeAssignment.findUnique({
      where: {
        committeeEventId_userId: {
          committeeEventId: event.id,
          userId: internalMember!.id,
        },
      },
      select: { id: true },
    });

    if (duplicateAssignment && duplicateAssignment.id !== currentAssignment.id) {
      throw new ApiError(409, 'Akun internal tersebut sudah memiliki assignment lain pada kegiatan ini.');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.committeeAssignment.update({
      where: {
        id: currentAssignment.id,
      },
      data: {
        memberType: body.memberType,
        userId: internalMember?.id || null,
        externalName:
          body.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER
            ? body.externalName?.trim() || null
            : null,
        externalInstitution:
          body.memberType === CommitteeAssignmentMemberType.EXTERNAL_MEMBER
            ? body.externalInstitution?.trim() || null
            : null,
        assignmentRole: body.assignmentRole.trim(),
        notes: body.notes?.trim() || null,
        createdById: actor.id,
      },
    });

    await tx.committeeFeatureGrant.deleteMany({
      where: {
        assignmentId: currentAssignment.id,
      },
    });

    if (uniqueFeatureCodes.length > 0) {
      await tx.committeeFeatureGrant.createMany({
        data: uniqueFeatureCodes.map((featureCode) => ({
          assignmentId: currentAssignment.id,
          featureCode,
        })),
      });
    }
  });

  const refreshed = await getCommitteeEventByIdOrThrow(event.id);
  const programLabelMap = await getProgramLabelMap(refreshed.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(refreshed, actor, programLabelMap),
      },
      'Assignment panitia berhasil diperbarui',
    ),
  );
});

export const deleteCommitteeAssignment = asyncHandler(async (req: Request, res: Response) => {
  const params = assignmentIdParamSchema.parse(req.params);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await getCommitteeEventByIdOrThrow(params.id);

  assertCommitteeAssignmentManageAccess(actor, event);

  const currentAssignment = event.assignments.find((assignment) => assignment.id === params.assignmentId);
  if (!currentAssignment) {
    throw new ApiError(404, 'Assignment panitia tidak ditemukan.');
  }

  await prisma.committeeAssignment.delete({
    where: {
      id: currentAssignment.id,
    },
  });

  const refreshed = await getCommitteeEventByIdOrThrow(event.id);
  const programLabelMap = await getProgramLabelMap(refreshed.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        item: mapCommitteeEventDetail(refreshed, actor, programLabelMap),
      },
      'Assignment panitia berhasil dihapus',
    ),
  );
});

export const getMyCommitteeSidebar = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getCommitteeActorProfile((req as any).user.id);

  if (!['TEACHER', 'ADMIN'].includes(actor.role)) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          groups: [],
        },
        'Sidebar kepanitiaan tidak tersedia untuk role ini',
      ),
    );
    return;
  }

  const activeAcademicYear = await getActiveAcademicYearOrThrow();
  const programLabelMap = await getProgramLabelMap(activeAcademicYear.id);
  const assignments = await prisma.committeeAssignment.findMany({
    where: {
      userId: actor.id,
      isActive: true,
      committeeEvent: {
        academicYearId: activeAcademicYear.id,
        status: CommitteeEventStatus.AKTIF,
      },
    },
    include: {
      committeeEvent: {
        select: {
          id: true,
          title: true,
          code: true,
          programCode: true,
          updatedAt: true,
        },
      },
      featureGrants: {
        orderBy: {
          featureCode: 'asc',
        },
        select: {
          featureCode: true,
        },
      },
    },
    orderBy: [
      {
        committeeEvent: {
          updatedAt: 'desc',
        },
      },
      {
        id: 'desc',
      },
    ],
  });

  const groups = assignments
    .map((assignment) => {
      const committeeLabel = buildCommitteeGroupLabel(assignment.committeeEvent.title);
      const normalizedProgramCode = normalizeProgramCode(assignment.committeeEvent.programCode);
      return {
        eventId: assignment.committeeEvent.id,
        eventCode: assignment.committeeEvent.code,
        label: committeeLabel,
        title: assignment.committeeEvent.title,
        programCode: normalizedProgramCode || null,
        programLabel: normalizedProgramCode ? programLabelMap.get(normalizedProgramCode) || normalizedProgramCode : null,
        items: assignment.featureGrants.map((grant) => {
          const definition = COMMITTEE_FEATURE_DEFINITIONS.find((item) => item.code === grant.featureCode)!;
          return {
            key: `committee-event-${assignment.committeeEvent.id}-${grant.featureCode.toLowerCase()}`,
            featureCode: grant.featureCode,
            label: definition.label,
            webPath: buildCommitteeFeatureWebPath({
              eventId: assignment.committeeEvent.id,
              featureCode: grant.featureCode,
              committeeLabel,
            }),
          };
        }),
      };
    })
    .filter((group) => group.items.length > 0);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeAcademicYear,
        groups,
      },
      'Sidebar kepanitiaan berhasil diambil',
    ),
  );
});

export const getCommitteeWorkspace = asyncHandler(async (req: Request, res: Response) => {
  const params = committeeIdParamSchema.parse(req.params);
  const actor = await getCommitteeActorProfile((req as any).user.id);
  const event = await prisma.committeeEvent.findUnique({
    where: {
      id: params.id,
    },
    include: committeeEventDetailInclude,
  });

  if (!event || event.status !== CommitteeEventStatus.AKTIF) {
    throw new ApiError(404, 'Workspace panitia tidak ditemukan atau belum aktif.');
  }

  const assignment = assertCurrentAssignmentVisibility(event, actor.id);
  const committeeLabel = buildCommitteeGroupLabel(event.title);
  const normalizedProgramCode = normalizeProgramCode(event.programCode);
  const programLabelMap = await getProgramLabelMap(event.academicYearId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        eventId: event.id,
        eventCode: event.code,
        title: event.title,
        label: committeeLabel,
        status: event.status,
        programCode: normalizedProgramCode || null,
        programLabel: normalizedProgramCode ? programLabelMap.get(normalizedProgramCode) || normalizedProgramCode : null,
        assignmentRole: assignment.assignmentRole,
        allowedFeatures: assignment.featureGrants.map((feature) =>
          COMMITTEE_FEATURE_DEFINITIONS.find((definition) => definition.code === feature.featureCode)!,
        ),
      },
      'Workspace panitia berhasil diambil',
    ),
  );
});
