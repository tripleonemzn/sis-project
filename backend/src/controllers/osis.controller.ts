import { Request, Response } from 'express';
import {
  AdditionalDuty,
  OsisElectionStatus,
  OsisJoinRequestStatus,
  OsisManagementStatus,
  Prisma,
  Semester,
} from '@prisma/client';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { osisManagementService } from '../services/osisManagement.service';
import { createManyInAppNotifications } from '../services/mobilePushNotification.service';

const listPeriodsSchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

const createPeriodSchema = z.object({
  academicYearId: z.number().int(),
  title: z.string().min(1, 'Judul wajib diisi'),
  description: z.string().optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  status: z.nativeEnum(OsisElectionStatus).default('DRAFT'),
  allowQuickCount: z.boolean().default(true),
});

const updatePeriodSchema = createPeriodSchema.partial();

const createCandidateSchema = z.object({
  studentId: z.number().int(),
  candidateNumber: z.number().int().min(1),
  vision: z.string().optional().nullable(),
  mission: z.string().optional().nullable(),
  youtubeUrl: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
});

const updateCandidateSchema = createCandidateSchema.partial();

const voteSchema = z.object({
  electionId: z.number().int(),
  candidateId: z.number().int(),
});

const createManagementPeriodSchema = z.object({
  academicYearId: z.number().int(),
  electionPeriodId: z.number().int().optional().nullable(),
  title: z.string().min(1, 'Judul periode wajib diisi'),
  description: z.string().optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  transitionLabel: z.string().optional().nullable(),
  transitionAt: z.string().optional().nullable(),
  transitionNotes: z.string().optional().nullable(),
  status: z.nativeEnum(OsisManagementStatus).default('DRAFT'),
});

const updateManagementPeriodSchema = createManagementPeriodSchema.partial();

const createDivisionSchema = z.object({
  periodId: z.number().int(),
  name: z.string().min(1, 'Nama divisi wajib diisi'),
  code: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
});

const updateDivisionSchema = createDivisionSchema.omit({ periodId: true }).partial();

const createPositionSchema = z.object({
  periodId: z.number().int(),
  divisionId: z.number().int().optional().nullable(),
  name: z.string().min(1, 'Nama jabatan wajib diisi'),
  code: z.string().trim().optional().nullable(),
  description: z.string().optional().nullable(),
  displayOrder: z.number().int().optional(),
});

const updatePositionSchema = createPositionSchema.omit({ periodId: true }).partial();

const createMembershipSchema = z.object({
  periodId: z.number().int(),
  studentId: z.number().int(),
  positionId: z.number().int(),
  divisionId: z.number().int().optional().nullable(),
  joinedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  requestId: z.number().int().optional().nullable(),
});

const updateMembershipSchema = createMembershipSchema.omit({ periodId: true }).partial();

const membershipQuerySchema = z.object({
  periodId: z.coerce.number().int(),
  semester: z.nativeEnum(Semester).optional(),
  reportType: z.string().optional(),
  programCode: z.string().optional(),
});

const osisGradeTemplateQuerySchema = z.object({
  academicYearId: z.coerce.number().int(),
  semester: z.nativeEnum(Semester),
  reportType: z.string().optional(),
  programCode: z.string().optional(),
});

const saveOsisGradeTemplateSchema = osisGradeTemplateQuerySchema.extend({
  templates: z.object({
    SB: z
      .object({
        label: z.string().optional().default(''),
        description: z.string().optional().default(''),
      })
      .optional()
      .default({ label: '', description: '' }),
    B: z
      .object({
        label: z.string().optional().default(''),
        description: z.string().optional().default(''),
      })
      .optional()
      .default({ label: '', description: '' }),
    C: z
      .object({
        label: z.string().optional().default(''),
        description: z.string().optional().default(''),
      })
      .optional()
      .default({ label: '', description: '' }),
    K: z
      .object({
        label: z.string().optional().default(''),
        description: z.string().optional().default(''),
      })
      .optional()
      .default({ label: '', description: '' }),
  }),
});

const upsertAssessmentSchema = z.object({
  membershipId: z.coerce.number().int(),
  grade: z.string(),
  description: z.string(),
  semester: z.nativeEnum(Semester),
  reportType: z.string().optional(),
  programCode: z.string().optional(),
});

const periodIdSchema = z.object({
  id: z.coerce.number().int(),
});

const candidateIdSchema = z.object({
  id: z.coerce.number().int(),
});

const recordIdSchema = z.object({
  id: z.coerce.number().int(),
});

const osisJoinRequestStatusSchema = z.preprocess((value) => {
  if (typeof value === 'string') return value.trim().toUpperCase();
  return value;
}, z.nativeEnum(OsisJoinRequestStatus));

const studentJoinStatusSchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
});

const createStudentJoinRequestSchema = z.object({
  ekskulId: z.number().int(),
  academicYearId: z.number().int().optional(),
});

const joinRequestQuerySchema = z.object({
  academicYearId: z.coerce.number().int().optional(),
  status: osisJoinRequestStatusSchema.optional(),
});

const updateJoinRequestStatusSchema = z.object({
  note: z.string().optional().nullable(),
});

const ACTIVE_OSIS_ELECTION_CACHE_TTL_MS = 30 * 1000;
const activeOsisElectionCache = new Map<string, { expiresAt: number; payload: unknown }>();

const toDate = (value?: string | null) => {
  if (!value) throw new ApiError(400, 'Tanggal wajib diisi');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, 'Format tanggal tidak valid');
  return date;
};

const normalizeYoutubeUrl = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  return trimmed;
};

const getAuthUser = (req: Request) => {
  const user = (req as any).user as { id: number; role: string } | undefined;
  if (!user?.id) throw new ApiError(401, 'Tidak memiliki otorisasi');
  return user;
};

const buildActiveOsisElectionCacheKey = (actorId: number, actorRole: string) =>
  `${Number(actorId) || 0}:${String(actorRole || '').trim().toUpperCase() || 'UNKNOWN'}`;

const getActiveOsisElectionCache = (key: string) => {
  const cached = activeOsisElectionCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    activeOsisElectionCache.delete(key);
    return null;
  }
  return cached.payload;
};

const setActiveOsisElectionCache = (key: string, payload: unknown) => {
  activeOsisElectionCache.set(key, {
    expiresAt: Date.now() + ACTIVE_OSIS_ELECTION_CACHE_TTL_MS,
    payload,
  });
};

const invalidateActiveOsisElectionCache = () => {
  activeOsisElectionCache.clear();
};

const getActorAccess = async (req: Request) => {
  const authUser = getAuthUser(req);
  if (authUser.role === 'ADMIN' || authUser.role === 'PRINCIPAL') {
    return {
      ...authUser,
      duties: [] as AdditionalDuty[],
    };
  }

  const actor = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      additionalDuties: true,
    },
  });

  return {
    ...authUser,
    duties: actor?.additionalDuties || [],
  };
};

const canManageOsisElection = (actor: { role: string; duties: AdditionalDuty[] }) =>
  actor.role === 'ADMIN' ||
  (actor.role === 'TEACHER' && actor.duties.includes('PEMBINA_OSIS'));

const canMonitorOsisElection = (actor: { role: string; duties: AdditionalDuty[] }) =>
  canManageOsisElection(actor) ||
  actor.role === 'PRINCIPAL' ||
  (actor.role === 'TEACHER' &&
    (actor.duties.includes('WAKASEK_KESISWAAN') ||
      actor.duties.includes('SEKRETARIS_KESISWAAN')));

const assertCanMonitorOsisElection = async (req: Request) => {
  const actor = await getActorAccess(req);
  if (!canMonitorOsisElection(actor)) {
    throw new ApiError(403, 'Anda tidak memiliki akses untuk memantau pemilihan OSIS');
  }
  return actor;
};

const assertCanManageOsisElection = async (req: Request) => {
  const actor = await getActorAccess(req);
  if (!canManageOsisElection(actor)) {
    throw new ApiError(403, 'Anda tidak memiliki akses untuk mengelola pemilihan OSIS');
  }
  return actor;
};

const getStakeholderNotificationReceivers = async () => {
  const receivers = await prisma.user.findMany({
    where: {
      OR: [
        { role: 'PRINCIPAL' },
        {
          role: 'TEACHER',
          additionalDuties: {
            hasSome: [AdditionalDuty.WAKASEK_KESISWAAN, AdditionalDuty.SEKRETARIS_KESISWAAN],
          },
        },
      ],
    },
    select: { id: true },
  });
  return receivers;
};

const notifyElectionStatusChange = async (
  period: {
    id: number;
    title: string;
    status: OsisElectionStatus;
    startAt: Date;
    endAt: Date;
  },
  title: string,
  message: string,
) => {
  const receivers = await getStakeholderNotificationReceivers();
  if (!receivers.length) return;
  await createManyInAppNotifications({
    data: receivers.map((receiver) => ({
      userId: receiver.id,
      title,
      message,
      type: 'OSIS_ELECTION',
      data: {
        electionId: period.id,
        electionTitle: period.title,
        status: period.status,
        startAt: period.startAt,
        endAt: period.endAt,
      },
    })),
  });
};

const getEligibleOsisVoterWhere = (academicYearId: number): Prisma.UserWhereInput => ({
  OR: [
    {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId,
      },
    },
    { role: 'TEACHER' },
    { role: 'STAFF' },
  ],
});

const canVoteInOsisElection = (actor: { role: string }) =>
  actor.role === 'STUDENT' ||
  actor.role === 'TEACHER' ||
  actor.role === 'STAFF';

const buildQuickCount = async (period: {
  academicYearId: number;
  candidates: Array<{
    id: number;
    candidateNumber: number;
    student: { id: number; name: string; nis: string | null; studentClass: { name: string } | null };
    _count: { votes: number };
  }>;
      _count: { votes: number };
  }) => {
  const totalVotes = period._count.votes;
  const totalEligibleVoters = await prisma.user.count({
    where: getEligibleOsisVoterWhere(period.academicYearId),
  });
  const remainingVoters = Math.max(totalEligibleVoters - totalVotes, 0);
  const turnoutPercentage =
    totalEligibleVoters > 0 ? Number(((totalVotes / totalEligibleVoters) * 100).toFixed(2)) : 0;
  const sortedByVotes = [...period.candidates].sort((a, b) => {
    if (b._count.votes !== a._count.votes) return b._count.votes - a._count.votes;
    return a.candidateNumber - b.candidateNumber;
  });
  const topVotes = sortedByVotes[0]?._count.votes || 0;
  const tiedTopCandidates = sortedByVotes.filter((candidate) => candidate._count.votes === topVotes && topVotes > 0);

  const candidates = period.candidates
    .sort((a, b) => a.candidateNumber - b.candidateNumber)
    .map((candidate) => {
      const rank =
        sortedByVotes.findIndex((sortedCandidate) => sortedCandidate.id === candidate.id) + 1;
      const isTopVotes = candidate._count.votes === topVotes && topVotes > 0;
      return {
        id: candidate.id,
        candidateNumber: candidate.candidateNumber,
        studentId: candidate.student.id,
        studentName: candidate.student.name,
        nis: candidate.student.nis,
        className: candidate.student.studentClass?.name || '-',
        votes: candidate._count.votes,
        percentage: totalVotes > 0 ? Number(((candidate._count.votes / totalVotes) * 100).toFixed(2)) : 0,
        rank,
        isLeading: isTopVotes,
        isWinner: isTopVotes && tiedTopCandidates.length === 1,
      };
    });

  const winner =
    tiedTopCandidates.length === 1
      ? {
          candidateId: tiedTopCandidates[0].id,
          candidateNumber: tiedTopCandidates[0].candidateNumber,
          studentId: tiedTopCandidates[0].student.id,
          studentName: tiedTopCandidates[0].student.name,
          className: tiedTopCandidates[0].student.studentClass?.name || '-',
          votes: tiedTopCandidates[0]._count.votes,
          percentage: totalVotes > 0 ? Number(((tiedTopCandidates[0]._count.votes / totalVotes) * 100).toFixed(2)) : 0,
        }
      : null;

  return {
    totalVotes,
    totalEligibleVoters,
    remainingVoters,
    turnoutPercentage,
    candidates,
    winner,
    hasTie: tiedTopCandidates.length > 1,
    tiedCandidateIds: tiedTopCandidates.map((candidate) => candidate.id),
  };
};

export const getOsisManagementPeriods = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const { academicYearId } = listPeriodsSchema.parse(req.query);
  const periods = await osisManagementService.listManagementPeriods(academicYearId);

  res
    .status(200)
    .json(new ApiResponse(200, periods, 'Data periode kepengurusan OSIS berhasil diambil'));
});

export const getOsisWorkProgramReadiness = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const { academicYearId } = listPeriodsSchema.parse(req.query);
  const readiness = await osisManagementService.getWorkProgramReadiness(academicYearId);

  res
    .status(200)
    .json(new ApiResponse(200, readiness, 'Status kesiapan program kerja OSIS berhasil diambil'));
});

export const createOsisManagementPeriod = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const authUser = getAuthUser(req);
  const body = createManagementPeriodSchema.parse(req.body);
  const period = await osisManagementService.createManagementPeriod(authUser.id, {
    academicYearId: body.academicYearId,
    electionPeriodId: body.electionPeriodId,
    title: body.title,
    description: body.description,
    startAt: toDate(body.startAt),
    endAt: toDate(body.endAt),
    transitionLabel: body.transitionLabel,
    transitionAt: body.transitionAt ? toDate(body.transitionAt) : null,
    transitionNotes: body.transitionNotes,
    status: body.status,
  });

  res
    .status(201)
    .json(new ApiResponse(201, period, 'Periode kepengurusan OSIS berhasil dibuat'));
});

export const updateOsisManagementPeriod = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = periodIdSchema.parse(req.params);
  const body = updateManagementPeriodSchema.parse(req.body);

  const period = await osisManagementService.updateManagementPeriod(id, {
    academicYearId: body.academicYearId,
    electionPeriodId: body.electionPeriodId,
    title: body.title,
    description: body.description,
    startAt: body.startAt ? toDate(body.startAt) : undefined,
    endAt: body.endAt ? toDate(body.endAt) : undefined,
    transitionLabel: body.transitionLabel,
    transitionAt:
      body.transitionAt === undefined
        ? undefined
        : body.transitionAt
          ? toDate(body.transitionAt)
          : null,
    transitionNotes: body.transitionNotes,
    status: body.status,
  });

  res
    .status(200)
    .json(new ApiResponse(200, period, 'Periode kepengurusan OSIS berhasil diperbarui'));
});

export const getOsisDivisions = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const { periodId } = membershipQuerySchema.pick({ periodId: true }).parse(req.query);
  const divisions = await osisManagementService.listDivisions(periodId);

  res.status(200).json(new ApiResponse(200, divisions, 'Data divisi OSIS berhasil diambil'));
});

export const createOsisDivision = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const body = createDivisionSchema.parse(req.body);
  const division = await osisManagementService.createDivision({
    periodId: body.periodId,
    name: body.name,
    code: body.code || undefined,
    description: body.description,
    displayOrder: body.displayOrder,
  });

  res.status(201).json(new ApiResponse(201, division, 'Divisi OSIS berhasil dibuat'));
});

export const updateOsisDivision = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const body = updateDivisionSchema.parse(req.body);
  const division = await osisManagementService.updateDivision(id, {
    ...body,
    code: body.code ?? undefined,
  });

  res.status(200).json(new ApiResponse(200, division, 'Divisi OSIS berhasil diperbarui'));
});

export const deleteOsisDivision = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const division = await osisManagementService.deleteDivision(id);

  res.status(200).json(new ApiResponse(200, division, 'Divisi OSIS berhasil dihapus'));
});

export const getOsisPositions = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const { periodId } = membershipQuerySchema.pick({ periodId: true }).parse(req.query);
  const positions = await osisManagementService.listPositions(periodId);

  res.status(200).json(new ApiResponse(200, positions, 'Data jabatan OSIS berhasil diambil'));
});

export const createOsisPosition = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const body = createPositionSchema.parse(req.body);
  const position = await osisManagementService.createPosition({
    periodId: body.periodId,
    divisionId: body.divisionId,
    name: body.name,
    code: body.code || undefined,
    description: body.description,
    displayOrder: body.displayOrder,
  });

  res.status(201).json(new ApiResponse(201, position, 'Jabatan OSIS berhasil dibuat'));
});

export const updateOsisPosition = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const body = updatePositionSchema.parse(req.body);
  const position = await osisManagementService.updatePosition(id, {
    ...body,
    code: body.code ?? undefined,
  });

  res.status(200).json(new ApiResponse(200, position, 'Jabatan OSIS berhasil diperbarui'));
});

export const deleteOsisPosition = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const position = await osisManagementService.deletePosition(id);

  res.status(200).json(new ApiResponse(200, position, 'Jabatan OSIS berhasil dihapus'));
});

export const getOsisMemberships = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const query = membershipQuerySchema.parse(req.query);
  const memberships = await osisManagementService.listMemberships(query);

  res
    .status(200)
    .json(new ApiResponse(200, memberships, 'Data keanggotaan OSIS berhasil diambil'));
});

export const getStudentOsisJoinStatus = asyncHandler(async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const query = studentJoinStatusSchema.parse(req.query);
  const status = await osisManagementService.getStudentJoinStatus(authUser.id, query.academicYearId);

  res.status(200).json(new ApiResponse(200, status, 'Status OSIS siswa berhasil diambil'));
});

export const createStudentOsisJoinRequest = asyncHandler(async (req: Request, res: Response) => {
  const authUser = getAuthUser(req);
  const body = createStudentJoinRequestSchema.parse(req.body);
  const request = await osisManagementService.createJoinRequest(authUser.id, {
    ekskulId: body.ekskulId,
    academicYearId: body.academicYearId,
  });

  res.status(201).json(new ApiResponse(201, request, 'Pengajuan OSIS berhasil dikirim'));
});

export const getOsisJoinRequests = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const query = joinRequestQuerySchema.parse(req.query);
  const requests = await osisManagementService.listJoinRequests(query);

  res.status(200).json(new ApiResponse(200, requests, 'Daftar pengajuan OSIS berhasil diambil'));
});

export const rejectOsisJoinRequest = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const authUser = getAuthUser(req);
  const { id } = recordIdSchema.parse(req.params);
  const body = updateJoinRequestStatusSchema.parse(req.body);
  const request = await osisManagementService.rejectJoinRequest(authUser.id, id, body.note);

  res.status(200).json(new ApiResponse(200, request, 'Pengajuan OSIS berhasil ditolak'));
});

export const createOsisMembership = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const authUser = getAuthUser(req);
  const body = createMembershipSchema.parse(req.body);
  const membership = await osisManagementService.createMembership(authUser.id, {
    periodId: body.periodId,
    studentId: body.studentId,
    positionId: body.positionId,
    divisionId: body.divisionId,
    joinedAt: body.joinedAt ? toDate(body.joinedAt) : undefined,
    endedAt: body.endedAt ? toDate(body.endedAt) : undefined,
    isActive: body.isActive,
    requestId: body.requestId,
  });

  res.status(201).json(new ApiResponse(201, membership, 'Anggota OSIS berhasil ditambahkan'));
});

export const updateOsisMembership = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const body = updateMembershipSchema.parse(req.body);
  const membership = await osisManagementService.updateMembership(id, {
    studentId: body.studentId,
    positionId: body.positionId,
    divisionId: body.divisionId,
    joinedAt: body.joinedAt ? toDate(body.joinedAt) : body.joinedAt === null ? null : undefined,
    endedAt: body.endedAt ? toDate(body.endedAt) : body.endedAt === null ? null : undefined,
    isActive: body.isActive,
  });

  res.status(200).json(new ApiResponse(200, membership, 'Anggota OSIS berhasil diperbarui'));
});

export const deleteOsisMembership = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = recordIdSchema.parse(req.params);
  const membership = await osisManagementService.deactivateMembership(id);

  res
    .status(200)
    .json(new ApiResponse(200, membership, 'Keanggotaan OSIS berhasil dinonaktifkan'));
});

export const getOsisGradeTemplates = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const query = osisGradeTemplateQuerySchema.parse(req.query);
  const templates = await osisManagementService.getGradeTemplates(query);

  res
    .status(200)
    .json(new ApiResponse(200, templates, 'Template nilai OSIS berhasil diambil'));
});

export const saveOsisGradeTemplates = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const body = saveOsisGradeTemplateSchema.parse(req.body);
  const templates = await osisManagementService.saveGradeTemplates(body);

  res
    .status(200)
    .json(new ApiResponse(200, templates, 'Template nilai OSIS berhasil disimpan'));
});

export const upsertOsisAssessment = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const authUser = getAuthUser(req);
  const body = upsertAssessmentSchema.parse(req.body);
  const assessment = await osisManagementService.upsertAssessment(authUser.id, body);

  res.status(200).json(new ApiResponse(200, assessment, 'Nilai OSIS berhasil disimpan'));
});

export const getOsisElectionPeriods = asyncHandler(async (req: Request, res: Response) => {
  const authUser = await assertCanMonitorOsisElection(req);
  const query = listPeriodsSchema.parse(req.query);

  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  const academicYearId = query.academicYearId || activeAcademicYear?.id;

  const periods = await prisma.osisElectionPeriod.findMany({
    where: academicYearId ? { academicYearId } : undefined,
    orderBy: [{ academicYear: { name: 'desc' } }, { startAt: 'desc' }, { id: 'desc' }],
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      candidates: {
        orderBy: { candidateNumber: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, periods, `Data pemilihan OSIS berhasil diambil oleh ${authUser.role}`));
});

export const createOsisElectionPeriod = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const authUser = getAuthUser(req);
  const body = createPeriodSchema.parse(req.body);
  const startAt = toDate(body.startAt);
  const endAt = toDate(body.endAt);

  if (endAt <= startAt) {
    throw new ApiError(400, 'Tanggal selesai harus setelah tanggal mulai');
  }

  const period = await prisma.osisElectionPeriod.create({
    data: {
      academicYearId: body.academicYearId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      startAt,
      endAt,
      status: body.status,
      allowQuickCount: body.allowQuickCount,
      createdById: authUser.id,
    },
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      candidates: true,
      _count: { select: { votes: true } },
    },
  });

  invalidateActiveOsisElectionCache();

  res.status(201).json(new ApiResponse(201, period, 'Periode pemilihan OSIS berhasil dibuat'));
});

export const updateOsisElectionPeriod = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = periodIdSchema.parse(req.params);
  const body = updatePeriodSchema.parse(req.body);

  const existing = await prisma.osisElectionPeriod.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Periode pemilihan tidak ditemukan');

  const startAt = body.startAt ? toDate(body.startAt) : existing.startAt;
  const endAt = body.endAt ? toDate(body.endAt) : existing.endAt;

  if (endAt <= startAt) {
    throw new ApiError(400, 'Tanggal selesai harus setelah tanggal mulai');
  }

  const period = await prisma.osisElectionPeriod.update({
    where: { id },
    data: {
      academicYearId: body.academicYearId ?? existing.academicYearId,
      title: body.title?.trim() ?? existing.title,
      description:
        body.description !== undefined ? body.description?.trim() || null : existing.description,
      startAt,
      endAt,
      status: body.status ?? existing.status,
      allowQuickCount: body.allowQuickCount ?? existing.allowQuickCount,
    },
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      candidates: {
        orderBy: { candidateNumber: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });

  if (body.status && body.status !== existing.status) {
    if (body.status === 'PUBLISHED') {
      await notifyElectionStatusChange(
        period,
        'Pemilihan OSIS Dibuka',
        `Periode "${period.title}" sudah dipublikasikan dan siap dipantau.`,
      );
    } else if (body.status === 'CLOSED') {
      await notifyElectionStatusChange(
        period,
        'Pemilihan OSIS Ditutup',
        `Periode "${period.title}" telah ditutup dan hasil final sudah tersedia.`,
      );
    }
  }

  invalidateActiveOsisElectionCache();

  res.status(200).json(new ApiResponse(200, period, 'Periode pemilihan OSIS berhasil diperbarui'));
});

export const finalizeOsisElectionPeriod = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = periodIdSchema.parse(req.params);
  const existing = await prisma.osisElectionPeriod.findUnique({
    where: { id },
    include: {
      candidates: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });

  if (!existing) throw new ApiError(404, 'Periode pemilihan tidak ditemukan');
  if (existing.status === 'CLOSED') {
    return res.status(200).json(new ApiResponse(200, existing, 'Periode sudah ditutup sebelumnya'));
  }
  if (!existing.candidates.length) {
    throw new ApiError(400, 'Minimal harus ada satu calon aktif untuk menutup pemilihan');
  }

  const period = await prisma.osisElectionPeriod.update({
    where: { id },
    data: {
      status: 'CLOSED',
      endAt: existing.endAt > new Date() ? new Date() : existing.endAt,
    },
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { id: true, name: true, username: true } },
      candidates: {
        orderBy: { candidateNumber: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });

  await notifyElectionStatusChange(
    period,
    'Pemilihan OSIS Ditutup',
    `Periode "${period.title}" telah difinalisasi dan hasil akhir siap dipantau.`,
  );

  invalidateActiveOsisElectionCache();

  res.status(200).json(new ApiResponse(200, period, 'Periode pemilihan OSIS berhasil difinalisasi'));
});

export const getEligibleOsisStudents = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const academicYearId = z.coerce.number().int().parse(req.query.academicYearId);
  const search = String(req.query.search || '').trim();

  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId,
      },
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { nis: { contains: search, mode: Prisma.QueryMode.insensitive } },
              { nisn: { contains: search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    },
    orderBy: [{ studentClass: { name: 'asc' } }, { name: 'asc' }],
    take: 100,
    select: {
      id: true,
      name: true,
      nis: true,
      nisn: true,
      studentClass: { select: { id: true, name: true } },
    },
  });

  res.status(200).json(new ApiResponse(200, students, 'Daftar siswa eligible berhasil diambil'));
});

export const createOsisElectionCandidate = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id: electionId } = periodIdSchema.parse(req.params);
  const body = createCandidateSchema.parse(req.body);

  const period = await prisma.osisElectionPeriod.findUnique({
    where: { id: electionId },
    select: { id: true, academicYearId: true },
  });
  if (!period) throw new ApiError(404, 'Periode pemilihan tidak ditemukan');

  const student = await prisma.user.findFirst({
    where: {
      id: body.studentId,
      role: 'STUDENT',
      studentStatus: 'ACTIVE',
      studentClass: {
        academicYearId: period.academicYearId,
      },
    },
    select: { id: true },
  });
  if (!student) throw new ApiError(400, 'Calon harus siswa aktif pada tahun ajaran yang sama');

  const candidate = await prisma.osisElectionCandidate.create({
    data: {
      electionId,
      studentId: body.studentId,
      candidateNumber: body.candidateNumber,
      vision: body.vision?.trim() || null,
      mission: body.mission?.trim() || null,
      youtubeUrl: normalizeYoutubeUrl(body.youtubeUrl),
      isActive: body.isActive ?? true,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nis: true,
          studentClass: { select: { name: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });

  invalidateActiveOsisElectionCache();

  res.status(201).json(new ApiResponse(201, candidate, 'Calon ketua OSIS berhasil ditambahkan'));
});

export const updateOsisElectionCandidate = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = candidateIdSchema.parse(req.params);
  const body = updateCandidateSchema.parse(req.body);

  const existing = await prisma.osisElectionCandidate.findUnique({
    where: { id },
    include: { election: { select: { academicYearId: true } } },
  });
  if (!existing) throw new ApiError(404, 'Calon tidak ditemukan');

  if (body.studentId) {
    const student = await prisma.user.findFirst({
      where: {
        id: body.studentId,
        role: 'STUDENT',
        studentStatus: 'ACTIVE',
        studentClass: {
          academicYearId: existing.election.academicYearId,
        },
      },
      select: { id: true },
    });
    if (!student) throw new ApiError(400, 'Calon harus siswa aktif pada tahun ajaran yang sama');
  }

  const candidate = await prisma.osisElectionCandidate.update({
    where: { id },
    data: {
      studentId: body.studentId ?? existing.studentId,
      candidateNumber: body.candidateNumber ?? existing.candidateNumber,
      vision: body.vision !== undefined ? body.vision?.trim() || null : existing.vision,
      mission: body.mission !== undefined ? body.mission?.trim() || null : existing.mission,
      youtubeUrl:
        body.youtubeUrl !== undefined ? normalizeYoutubeUrl(body.youtubeUrl) : existing.youtubeUrl,
      isActive: body.isActive ?? existing.isActive,
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          nis: true,
          studentClass: { select: { name: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });

  invalidateActiveOsisElectionCache();

  res.status(200).json(new ApiResponse(200, candidate, 'Calon ketua OSIS berhasil diperbarui'));
});

export const deleteOsisElectionCandidate = asyncHandler(async (req: Request, res: Response) => {
  await assertCanManageOsisElection(req);
  const { id } = candidateIdSchema.parse(req.params);
  const existing = await prisma.osisElectionCandidate.findUnique({
    where: { id },
    select: { id: true, _count: { select: { votes: true } } },
  });
  if (!existing) throw new ApiError(404, 'Calon tidak ditemukan');
  if (existing._count.votes > 0) {
    throw new ApiError(400, 'Calon tidak dapat dihapus karena sudah menerima suara');
  }
  await prisma.osisElectionCandidate.delete({ where: { id } });
  invalidateActiveOsisElectionCache();
  res.status(200).json(new ApiResponse(200, null, 'Calon ketua OSIS berhasil dihapus'));
});

export const getOsisElectionQuickCount = asyncHandler(async (req: Request, res: Response) => {
  await assertCanMonitorOsisElection(req);
  const { id } = periodIdSchema.parse(req.params);
  const period = await prisma.osisElectionPeriod.findUnique({
    where: { id },
    include: {
      candidates: {
        where: { isActive: true },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      _count: { select: { votes: true } },
    },
  });
  if (!period) throw new ApiError(404, 'Periode pemilihan tidak ditemukan');
  res.status(200).json(new ApiResponse(200, await buildQuickCount(period), 'Quick count berhasil diambil'));
});

export const getActiveStudentOsisElection = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getActorAccess(req);
  if (!canVoteInOsisElection(actor)) {
    return res.status(200).json(new ApiResponse(200, null, 'Role ini tidak memiliki akses pemungutan suara OSIS'));
  }
  const cacheKey = buildActiveOsisElectionCacheKey(actor.id, actor.role);
  const cachedPayload = getActiveOsisElectionCache(cacheKey);
  if (cachedPayload) {
    return res
      .status(200)
      .json(new ApiResponse(200, cachedPayload, 'Data pemilihan OSIS aktif berhasil diambil'));
  }
  const now = new Date();

  const election = await prisma.osisElectionPeriod.findFirst({
    where: {
      status: 'PUBLISHED',
      startAt: { lte: now },
      endAt: { gte: now },
      candidates: { some: { isActive: true } },
    },
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      candidates: {
        where: { isActive: true },
        orderBy: { candidateNumber: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              photo: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      votes: {
        where: { voterId: actor.id },
        select: { id: true, candidateId: true, createdAt: true },
        take: 1,
      },
      _count: { select: { votes: true } },
    },
  });

  if (!election) {
    return res.status(200).json(new ApiResponse(200, null, 'Belum ada pemilihan OSIS aktif'));
  }

  const quickCount = election.allowQuickCount ? await buildQuickCount(election) : null;
  const payload = {
    ...election,
    myVote: election.votes[0] || null,
    quickCount,
  };
  setActiveOsisElectionCache(cacheKey, payload);

  res.status(200).json(new ApiResponse(200, payload, 'Data pemilihan OSIS aktif berhasil diambil'));
});

export const getActiveOsisElection = getActiveStudentOsisElection;

export const getLatestStudentOsisElection = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getActorAccess(req);
  if (!canVoteInOsisElection(actor)) {
    return res.status(200).json(new ApiResponse(200, null, 'Role ini tidak memiliki akses riwayat pemungutan suara OSIS'));
  }
  const election = await prisma.osisElectionPeriod.findFirst({
    where: {
      status: { in: ['PUBLISHED', 'CLOSED'] },
      candidates: { some: { isActive: true } },
    },
    orderBy: [{ endAt: 'desc' }, { id: 'desc' }],
    include: {
      academicYear: { select: { id: true, name: true, isActive: true } },
      candidates: {
        where: { isActive: true },
        orderBy: { candidateNumber: 'asc' },
        include: {
          student: {
            select: {
              id: true,
              name: true,
              nis: true,
              photo: true,
              studentClass: { select: { name: true } },
            },
          },
          _count: { select: { votes: true } },
        },
      },
      votes: {
        where: { voterId: actor.id },
        select: { id: true, candidateId: true, createdAt: true },
        take: 1,
      },
      _count: { select: { votes: true } },
    },
  });

  if (!election) {
    return res.status(200).json(new ApiResponse(200, null, 'Belum ada riwayat pemilihan OSIS'));
  }

  const quickCount = await buildQuickCount(election);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...election,
        myVote: election.votes[0] || null,
        quickCount,
      },
      'Riwayat pemilihan OSIS berhasil diambil',
    ),
  );
});

export const getLatestOsisElection = getLatestStudentOsisElection;

export const submitOsisElectionVote = asyncHandler(async (req: Request, res: Response) => {
  const actor = await getActorAccess(req);
  if (!canVoteInOsisElection(actor)) {
    throw new ApiError(403, 'Role ini tidak memiliki hak memilih pada pemilihan OSIS');
  }
  const body = voteSchema.parse(req.body);
  const now = new Date();

  const election = await prisma.osisElectionPeriod.findUnique({
    where: { id: body.electionId },
    include: {
      candidates: {
        where: { id: body.candidateId, isActive: true },
        select: { id: true },
      },
    },
  });

  if (!election) throw new ApiError(404, 'Pemilihan OSIS tidak ditemukan');
  if (election.status !== 'PUBLISHED') throw new ApiError(400, 'Pemilihan OSIS belum dibuka');
  if (election.startAt > now || election.endAt < now) {
    throw new ApiError(400, 'Waktu pemilihan OSIS sudah tidak aktif');
  }
  if (election.candidates.length === 0) {
    throw new ApiError(400, 'Calon yang dipilih tidak valid');
  }

  const existingVote = await prisma.osisElectionVote.findUnique({
    where: {
      electionId_voterId: {
        electionId: body.electionId,
        voterId: actor.id,
      },
    },
  });
  if (existingVote) throw new ApiError(400, 'Anda sudah memberikan suara');

  const vote = await prisma.osisElectionVote.create({
    data: {
      electionId: body.electionId,
      candidateId: body.candidateId,
      voterId: actor.id,
    },
  });

  invalidateActiveOsisElectionCache();

  res.status(201).json(new ApiResponse(201, vote, 'Suara berhasil dikirim'));
});
