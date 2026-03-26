import {
  JobApplicationAssessmentStageCode,
  JobApplicationStatus,
  Prisma,
  SelectionAssessmentSource,
  VerificationStatus,
} from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AuthRequest } from '../types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

type JobAssessmentStageDefinition = {
  code: JobApplicationAssessmentStageCode;
  title: string;
  weight: number;
  passingScore: number;
  sourceType: SelectionAssessmentSource;
};

const JOB_ASSESSMENT_STAGE_DEFINITIONS: JobAssessmentStageDefinition[] = [
  {
    code: JobApplicationAssessmentStageCode.DOCUMENT_SCREENING,
    title: 'Screening Dokumen',
    weight: 15,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.MANUAL,
  },
  {
    code: JobApplicationAssessmentStageCode.ONLINE_TEST,
    title: 'Tes Online / CBT',
    weight: 35,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.EXAM,
  },
  {
    code: JobApplicationAssessmentStageCode.INTERNAL_INTERVIEW,
    title: 'Interview Internal BKK',
    weight: 20,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.MANUAL,
  },
  {
    code: JobApplicationAssessmentStageCode.PARTNER_INTERVIEW,
    title: 'Interview Mitra Industri',
    weight: 30,
    passingScore: 70,
    sourceType: SelectionAssessmentSource.PARTNER,
  },
];

const applicantUserSelect = {
  id: true,
  name: true,
  username: true,
  phone: true,
  email: true,
  address: true,
  verificationStatus: true,
} satisfies Prisma.UserSelect;

const applicantProfileSelect = {
  id: true,
  userId: true,
  headline: true,
  phone: true,
  email: true,
  address: true,
  educationLevel: true,
  graduationYear: true,
  schoolName: true,
  major: true,
  skills: true,
  experienceSummary: true,
  cvUrl: true,
  portfolioUrl: true,
  linkedinUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobApplicantProfileSelect;

const ownApplicationSelect = {
  id: true,
  vacancyId: true,
  status: true,
  appliedAt: true,
  updatedAt: true,
  reviewedAt: true,
  shortlistedAt: true,
  partnerInterviewAt: true,
  finalizedAt: true,
} satisfies Prisma.JobApplicationSelect;

const myApplicationListSelect = {
  id: true,
  status: true,
  coverLetter: true,
  expectedSalary: true,
  source: true,
  reviewerNotes: true,
  partnerReferenceCode: true,
  partnerDecisionNotes: true,
  appliedAt: true,
  reviewedAt: true,
  shortlistedAt: true,
  partnerInterviewAt: true,
  finalizedAt: true,
  createdAt: true,
  updatedAt: true,
  vacancy: {
    select: {
      id: true,
      title: true,
      companyName: true,
      registrationLink: true,
      deadline: true,
      isOpen: true,
      industryPartner: {
        select: {
          id: true,
          name: true,
          city: true,
          sector: true,
        },
      },
    },
  },
  profile: {
    select: {
      id: true,
      educationLevel: true,
      graduationYear: true,
      schoolName: true,
      major: true,
      cvUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
    },
  },
  assessments: {
    select: {
      id: true,
      stageCode: true,
      title: true,
      sourceType: true,
      score: true,
      maxScore: true,
      weight: true,
      passingScore: true,
      notes: true,
      assessedAt: true,
      evaluatorId: true,
      evaluator: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: {
      stageCode: 'asc',
    },
  },
} satisfies Prisma.JobApplicationSelect;

const reviewApplicationSelect = {
  id: true,
  status: true,
  coverLetter: true,
  expectedSalary: true,
  source: true,
  reviewerNotes: true,
  partnerReferenceCode: true,
  partnerHandoffNotes: true,
  partnerDecisionNotes: true,
  appliedAt: true,
  reviewedAt: true,
  shortlistedAt: true,
  partnerInterviewAt: true,
  finalizedAt: true,
  createdAt: true,
  updatedAt: true,
  applicant: {
    select: applicantUserSelect,
  },
  profile: {
    select: {
      id: true,
      educationLevel: true,
      graduationYear: true,
      schoolName: true,
      major: true,
      skills: true,
      experienceSummary: true,
      cvUrl: true,
      portfolioUrl: true,
      linkedinUrl: true,
      updatedAt: true,
    },
  },
  assessments: {
    select: {
      id: true,
      stageCode: true,
      title: true,
      sourceType: true,
      score: true,
      maxScore: true,
      weight: true,
      passingScore: true,
      notes: true,
      assessedAt: true,
      evaluatorId: true,
      evaluator: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: {
      stageCode: 'asc',
    },
  },
  vacancy: {
    select: {
      id: true,
      title: true,
      companyName: true,
      deadline: true,
      isOpen: true,
      industryPartner: {
        select: {
          id: true,
          name: true,
          city: true,
          sector: true,
        },
      },
    },
  },
} satisfies Prisma.JobApplicationSelect;

type ApplicantUser = Prisma.UserGetPayload<{ select: typeof applicantUserSelect }>;
type ApplicantProfileRow = Prisma.JobApplicantProfileGetPayload<{ select: typeof applicantProfileSelect }>;
type OwnApplicationRow = Prisma.JobApplicationGetPayload<{ select: typeof ownApplicationSelect }>;
type MyApplicationRow = Prisma.JobApplicationGetPayload<{ select: typeof myApplicationListSelect }>;
type ReviewApplicationRow = Prisma.JobApplicationGetPayload<{ select: typeof reviewApplicationSelect }>;
type ApplicationAssessmentSnapshot = Pick<MyApplicationRow, 'assessments'>;

type VacancyRow = Prisma.JobVacancyGetPayload<{
  include: {
    industryPartner: true;
    _count: {
      select: {
        applications: true;
      };
    };
  };
}>;

function getAuthUser(req: Request) {
  return (req as Request & { user?: { id?: number | string; role?: string } }).user;
}

function getAuthUserId(req: Request): number {
  const userId = Number(getAuthUser(req)?.id || 0);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }
  return userId;
}

function getAuthUserRole(req: Request): string {
  return String(getAuthUser(req)?.role || '').trim().toUpperCase();
}

async function assertVerifiedBkkApplicant(applicantId: number) {
  const applicant = await prisma.user.findUnique({
    where: { id: applicantId },
    select: {
      id: true,
      verificationStatus: true,
    },
  });

  if (!applicant) {
    throw new ApiError(404, 'Pelamar tidak ditemukan.');
  }

  if (applicant.verificationStatus !== VerificationStatus.VERIFIED) {
    throw new ApiError(
      403,
      'Akun pelamar BKK belum diverifikasi admin. Lengkapi profil lalu tunggu verifikasi sebelum melamar atau mengikuti tes.',
    );
  }
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeOptionalUrl(value: unknown, fieldLabel: string): string | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  if (!/^https?:\/\//i.test(normalized)) {
    throw new ApiError(400, `${fieldLabel} harus berupa URL http/https yang valid.`);
  }
  return normalized;
}

function normalizeOptionalYear(value: unknown): number | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1950 || parsed > 2100) {
    throw new ApiError(400, 'Tahun lulus tidak valid.');
  }
  return parsed;
}

function normalizeOptionalScore(value: unknown, fieldLabel: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1000) {
    throw new ApiError(400, `${fieldLabel} tidak valid.`);
  }
  return Number(parsed.toFixed(2));
}

function normalizeOptionalPositiveNumber(value: unknown, fieldLabel: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${fieldLabel} tidak valid.`);
  }
  return Number(parsed.toFixed(2));
}

function normalizeOptionalDate(value: unknown, fieldLabel: string): Date | null {
  const normalized = normalizeOptionalText(value);
  if (!normalized) return null;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(400, `${fieldLabel} tidak valid.`);
  }
  return date;
}

type JobAssessmentWriteInput = {
  stageCode: JobApplicationAssessmentStageCode;
  score: number | null;
  maxScore: number | null;
  weight: number | null;
  passingScore: number | null;
  notes: string | null;
  assessedAt: Date | null;
};

function parseJobAssessmentPayload(body: unknown): JobAssessmentWriteInput[] {
  const rawItems = Array.isArray((body as { items?: unknown[] } | null)?.items)
    ? (((body as { items?: unknown[] }).items || []) as unknown[])
    : [];
  if (rawItems.length === 0) {
    throw new ApiError(400, 'Daftar tahapan seleksi BKK wajib diisi.');
  }

  const seenCodes = new Set<JobApplicationAssessmentStageCode>();
  return rawItems.map((rawItem, index) => {
    const item = (rawItem || {}) as Record<string, unknown>;
    const stageCode = String(item.stageCode || '').trim().toUpperCase() as JobApplicationAssessmentStageCode;
    if (!JOB_ASSESSMENT_STAGE_DEFINITIONS.some((definition) => definition.code === stageCode)) {
      throw new ApiError(400, `Tahap seleksi BKK baris ${index + 1} tidak didukung.`);
    }
    if (seenCodes.has(stageCode)) {
      throw new ApiError(400, `Tahap ${stageCode} dikirim lebih dari satu kali.`);
    }
    seenCodes.add(stageCode);

    const score = normalizeOptionalScore(item.score, `Skor ${stageCode}`);
    const maxScore = normalizeOptionalPositiveNumber(item.maxScore, `Nilai maksimum ${stageCode}`);
    const weight = normalizeOptionalPositiveNumber(item.weight, `Bobot ${stageCode}`);
    const passingScore = normalizeOptionalScore(item.passingScore, `Ambang lulus ${stageCode}`);
    const notes = normalizeOptionalText(item.notes);
    const assessedAt = normalizeOptionalDate(item.assessedAt, `Tanggal penilaian ${stageCode}`);

    if (score !== null && maxScore !== null && score > maxScore) {
      throw new ApiError(400, `Skor ${stageCode} tidak boleh melebihi nilai maksimum.`);
    }

    return {
      stageCode,
      score,
      maxScore,
      weight,
      passingScore,
      notes,
      assessedAt,
    };
  });
}

function normalizePagination(page: unknown, limit: unknown) {
  const pageNum = Math.max(DEFAULT_PAGE, Number.parseInt(String(page || DEFAULT_PAGE), 10) || DEFAULT_PAGE);
  const limitNum = Math.min(
    MAX_LIMIT,
    Math.max(DEFAULT_LIMIT, Number.parseInt(String(limit || DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
  );
  return {
    pageNum,
    limitNum,
    skip: (pageNum - 1) * limitNum,
  };
}

function hasOwn(body: unknown, key: string): boolean {
  return typeof body === 'object' && body !== null && Object.prototype.hasOwnProperty.call(body, key);
}

function isApplicantProfileReady(user: ApplicantUser, profile: ApplicantProfileRow | null) {
  const effectivePhone = normalizeOptionalText(profile?.phone ?? user.phone);
  const effectiveEmail = normalizeOptionalText(profile?.email ?? user.email);
  const effectiveAddress = normalizeOptionalText(profile?.address ?? user.address);
  const missingFields: string[] = [];

  if (!normalizeOptionalText(user.name)) missingFields.push('nama pelamar');
  if (!effectivePhone) missingFields.push('nomor telepon');
  if (!effectiveEmail) missingFields.push('email aktif');
  if (!effectiveAddress) missingFields.push('alamat domisili');
  if (!normalizeOptionalText(profile?.educationLevel)) missingFields.push('jenjang pendidikan');
  if (!normalizeOptionalText(profile?.schoolName)) missingFields.push('asal sekolah');
  if (!normalizeOptionalText(profile?.major)) missingFields.push('jurusan / kompetensi');

  return {
    isReady: missingFields.length === 0,
    missingFields,
  };
}

function serializeApplicantProfile(user: ApplicantUser, profile: ApplicantProfileRow | null) {
  const readiness = isApplicantProfileReady(user, profile);
  return {
    id: profile?.id || null,
    userId: user.id,
    name: user.name,
    username: user.username,
    verificationStatus: user.verificationStatus,
    headline: profile?.headline || null,
    phone: profile?.phone ?? user.phone ?? null,
    email: profile?.email ?? user.email ?? null,
    address: profile?.address ?? user.address ?? null,
    educationLevel: profile?.educationLevel || null,
    graduationYear: profile?.graduationYear ?? null,
    schoolName: profile?.schoolName || null,
    major: profile?.major || null,
    skills: profile?.skills || null,
    experienceSummary: profile?.experienceSummary || null,
    cvUrl: profile?.cvUrl || null,
    portfolioUrl: profile?.portfolioUrl || null,
    linkedinUrl: profile?.linkedinUrl || null,
    createdAt: profile?.createdAt || null,
    updatedAt: profile?.updatedAt || null,
    completeness: readiness,
  };
}

function serializeVacancy(row: VacancyRow, ownApplication: OwnApplicationRow | null) {
  const now = Date.now();
  const deadlineMs = row.deadline ? new Date(row.deadline).getTime() : null;
  const isExpired = Number.isFinite(deadlineMs) ? Number(deadlineMs) < now : false;

  return {
    id: row.id,
    title: row.title,
    companyName: row.companyName,
    description: row.description,
    requirements: row.requirements,
    registrationLink: row.registrationLink,
    deadline: row.deadline,
    isOpen: row.isOpen,
    industryPartnerId: row.industryPartnerId,
    industryPartner: row.industryPartner,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    applicationCount: row._count?.applications || 0,
    myApplication: ownApplication
      ? {
          id: ownApplication.id,
          status: ownApplication.status,
          appliedAt: ownApplication.appliedAt,
          reviewedAt: ownApplication.reviewedAt,
          shortlistedAt: ownApplication.shortlistedAt,
          partnerInterviewAt: ownApplication.partnerInterviewAt,
          finalizedAt: ownApplication.finalizedAt,
          updatedAt: ownApplication.updatedAt,
        }
      : null,
    isExpired,
    canApplyInApp: row.isOpen && !isExpired && !ownApplication,
  };
}

function buildApplicationSummary(rows: Array<{ status: JobApplicationStatus }>) {
  const counts = {
    total: rows.length,
    submitted: 0,
    reviewing: 0,
    shortlisted: 0,
    partnerInterview: 0,
    interview: 0,
    hired: 0,
    accepted: 0,
    rejected: 0,
    withdrawn: 0,
  };

  rows.forEach((row) => {
    switch (row.status) {
      case JobApplicationStatus.SUBMITTED:
        counts.submitted += 1;
        break;
      case JobApplicationStatus.REVIEWING:
        counts.reviewing += 1;
        break;
      case JobApplicationStatus.SHORTLISTED:
        counts.shortlisted += 1;
        break;
      case JobApplicationStatus.PARTNER_INTERVIEW:
        counts.partnerInterview += 1;
        break;
      case JobApplicationStatus.INTERVIEW:
        counts.interview += 1;
        break;
      case JobApplicationStatus.HIRED:
        counts.hired += 1;
        counts.accepted += 1;
        break;
      case JobApplicationStatus.ACCEPTED:
        counts.accepted += 1;
        break;
      case JobApplicationStatus.REJECTED:
        counts.rejected += 1;
        break;
      case JobApplicationStatus.WITHDRAWN:
        counts.withdrawn += 1;
        break;
      default:
        break;
    }
  });

  return counts;
}

function buildJobApplicationAssessmentBoard(row: ApplicationAssessmentSnapshot) {
  const assessmentMap = new Map(row.assessments.map((item) => [item.stageCode, item]));
  const items = JOB_ASSESSMENT_STAGE_DEFINITIONS.map((definition) => {
    const stored = assessmentMap.get(definition.code) || null;
    const maxScore = typeof stored?.maxScore === 'number' ? Number(stored.maxScore) : 100;
    const normalizedScore =
      typeof stored?.score === 'number' && Number.isFinite(stored.score)
        ? Number(((stored.score / Math.max(maxScore || 100, 1)) * 100).toFixed(2))
        : null;
    const weight =
      typeof stored?.weight === 'number' && Number.isFinite(stored.weight)
        ? Number(stored.weight)
        : definition.weight;
    const passingScore =
      typeof stored?.passingScore === 'number' && Number.isFinite(stored.passingScore)
        ? Number(stored.passingScore)
        : definition.passingScore;
    const completed = normalizedScore !== null;
    const passed = completed ? normalizedScore >= passingScore : null;

    return {
      code: definition.code,
      title: stored?.title || definition.title,
      sourceType: stored?.sourceType || definition.sourceType,
      score: normalizedScore,
      rawScore: typeof stored?.score === 'number' ? Number(stored.score) : null,
      maxScore,
      weight,
      passingScore,
      notes: stored?.notes || null,
      assessedAt: stored?.assessedAt ? stored.assessedAt.toISOString() : null,
      completed,
      passed,
      evaluator: stored?.evaluator
        ? {
            id: stored.evaluator.id,
            name: stored.evaluator.name,
            role: stored.evaluator.role,
          }
        : null,
    };
  });

  const completedItems = items.filter((item) => item.completed && typeof item.score === 'number');
  const totalWeight = completedItems.reduce((sum, item) => sum + Number(item.weight || 0), 0);
  const weightedAverage =
    totalWeight > 0
      ? Number(
          (
            completedItems.reduce((sum, item) => sum + Number(item.score || 0) * Number(item.weight || 0), 0) /
            totalWeight
          ).toFixed(2),
        )
      : null;

  const incompleteStages = items.filter((item) => !item.completed).map((item) => item.title);
  const failedStages = items.filter((item) => item.passed === false).map((item) => item.title);

  let recommendation: 'INCOMPLETE' | 'PASS' | 'FAIL' = 'INCOMPLETE';
  if (incompleteStages.length === 0) {
    recommendation =
      weightedAverage !== null && weightedAverage >= 70 && failedStages.length === 0 ? 'PASS' : 'FAIL';
  }

  return {
    items,
    summary: {
      totalStages: items.length,
      completedStages: items.filter((item) => item.completed).length,
      weightedAverage,
      incompleteStages,
      failedStages,
      recommendation,
      passThreshold: 70,
    },
  };
}

function serializeReviewApplication(row: ReviewApplicationRow) {
  return {
    ...row,
    assessmentBoard: buildJobApplicationAssessmentBoard(row),
  };
}

function serializeMyApplication(row: MyApplicationRow) {
  return {
    ...row,
    assessmentBoard: buildJobApplicationAssessmentBoard(row),
  };
}

function normalizeShortlistBatchReportRows(rows: ReviewApplicationRow[]) {
  const serializedApplications = rows.map((row) => serializeReviewApplication(row));
  const firstRow = rows[0];
  if (!firstRow) {
    throw new ApiError(404, 'Batch shortlist tidak ditemukan.');
  }

  const partnerReferenceCode = firstRow.partnerReferenceCode || '-';
  const shortlistedAt = firstRow.shortlistedAt || firstRow.reviewedAt || firstRow.updatedAt;
  const summary = buildApplicationSummary(
    rows.map((row) => ({
      status: row.status,
    })),
  );

  return {
    partnerReferenceCode,
    shortlistedAt,
    vacancy: {
      id: firstRow.vacancy.id,
      title: firstRow.vacancy.title,
      companyName: firstRow.vacancy.companyName,
      isOpen: firstRow.vacancy.isOpen,
      deadline: firstRow.vacancy.deadline,
      industryPartner: firstRow.vacancy.industryPartner,
    },
    partnerHandoffNotes: firstRow.partnerHandoffNotes || null,
    total: serializedApplications.length,
    summary,
    applications: serializedApplications,
  };
}

export const getShortlistBatches = asyncHandler(async (req: Request, res: Response) => {
  const vacancyId = Number.parseInt(String(req.query.vacancyId || ''), 10);
  const normalizedSearch = normalizeOptionalText(req.query.search);

  const where: Prisma.JobApplicationWhereInput = {
    partnerReferenceCode: {
      not: null,
    },
    shortlistedAt: {
      not: null,
    },
    status: {
      in: [
        JobApplicationStatus.SHORTLISTED,
        JobApplicationStatus.PARTNER_INTERVIEW,
        JobApplicationStatus.HIRED,
        JobApplicationStatus.ACCEPTED,
      ],
    },
  };

  if (Number.isFinite(vacancyId) && vacancyId > 0) {
    where.vacancyId = vacancyId;
  }

  if (normalizedSearch) {
    where.OR = [
      {
        partnerReferenceCode: {
          contains: normalizedSearch,
          mode: 'insensitive',
        },
      },
      {
        vacancy: {
          title: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        vacancy: {
          companyName: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        vacancy: {
          industryPartner: {
            is: {
              name: {
                contains: normalizedSearch,
                mode: 'insensitive',
              },
            },
          },
        },
      },
    ];
  }

  const rows = await prisma.jobApplication.findMany({
    where,
    select: {
      id: true,
      status: true,
      partnerReferenceCode: true,
      partnerHandoffNotes: true,
      shortlistedAt: true,
      updatedAt: true,
      vacancy: {
        select: {
          id: true,
          title: true,
          companyName: true,
          industryPartner: {
            select: {
              id: true,
              name: true,
              city: true,
              sector: true,
            },
          },
        },
      },
    },
    orderBy: [{ shortlistedAt: 'desc' }, { updatedAt: 'desc' }],
  });

  const grouped = new Map<
    string,
    {
      vacancyId: number;
      partnerReferenceCode: string;
      shortlistedAt: Date | null;
      updatedAt: Date;
      partnerHandoffNotes: string | null;
      vacancy: {
        id: number;
        title: string;
        companyName: string | null;
        industryPartner:
          | {
              id: number;
              name: string;
              city: string | null;
              sector: string | null;
            }
          | null;
      };
      statuses: JobApplicationStatus[];
      total: number;
    }
  >();

  rows.forEach((row) => {
    const referenceCode = row.partnerReferenceCode || '';
    if (!referenceCode) return;
    const key = `${row.vacancy.id}::${referenceCode}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        vacancyId: row.vacancy.id,
        partnerReferenceCode: referenceCode,
        shortlistedAt: row.shortlistedAt,
        updatedAt: row.updatedAt,
        partnerHandoffNotes: row.partnerHandoffNotes || null,
        vacancy: row.vacancy,
        statuses: [row.status],
        total: 1,
      });
      return;
    }

    current.total += 1;
    current.statuses.push(row.status);
    if (!current.shortlistedAt && row.shortlistedAt) {
      current.shortlistedAt = row.shortlistedAt;
    }
    if ((row.updatedAt?.getTime?.() || 0) > (current.updatedAt?.getTime?.() || 0)) {
      current.updatedAt = row.updatedAt;
    }
    if (!current.partnerHandoffNotes && row.partnerHandoffNotes) {
      current.partnerHandoffNotes = row.partnerHandoffNotes;
    }
  });

  const batches = Array.from(grouped.values())
    .map((batch) => {
      const summary = buildApplicationSummary(
        batch.statuses.map((status) => ({
          status,
        })),
      );

      return {
        vacancyId: batch.vacancyId,
        partnerReferenceCode: batch.partnerReferenceCode,
        shortlistedAt: batch.shortlistedAt?.toISOString() || null,
        updatedAt: batch.updatedAt.toISOString(),
        partnerHandoffNotes: batch.partnerHandoffNotes,
        total: batch.total,
        summary,
        vacancy: batch.vacancy,
      };
    })
    .sort((left, right) => String(right.shortlistedAt || right.updatedAt).localeCompare(String(left.shortlistedAt || left.updatedAt)));

  res.status(200).json(new ApiResponse(200, { batches }, 'Batch shortlist berhasil diambil'));
});

export const getShortlistBatchReport = asyncHandler(async (req: Request, res: Response) => {
  const vacancyId = Number.parseInt(String(req.query.vacancyId || ''), 10);
  const partnerReferenceCode = normalizeOptionalText(req.query.partnerReferenceCode);

  if (!Number.isFinite(vacancyId) || vacancyId <= 0) {
    throw new ApiError(400, 'Lowongan batch report tidak valid.');
  }
  if (!partnerReferenceCode) {
    throw new ApiError(400, 'Kode batch shortlist wajib diisi.');
  }

  const rows = (await prisma.jobApplication.findMany({
    where: {
      vacancyId,
      partnerReferenceCode,
    },
    select: reviewApplicationSelect,
    orderBy: [{ shortlistedAt: 'asc' }, { id: 'asc' }],
  })) as ReviewApplicationRow[];

  if (rows.length === 0) {
    throw new ApiError(404, 'Batch shortlist tidak ditemukan.');
  }

  const report = normalizeShortlistBatchReportRows(rows);
  res.status(200).json(new ApiResponse(200, report, 'Laporan batch shortlist berhasil diambil'));
});

async function loadApplicantProfile(userId: number) {
  const [user, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: applicantUserSelect,
    }),
    prisma.jobApplicantProfile.findUnique({
      where: { userId },
      select: applicantProfileSelect,
    }),
  ]);

  if (!user) {
    throw new ApiError(404, 'Pelamar tidak ditemukan.');
  }

  return {
    user,
    profile,
    serialized: serializeApplicantProfile(user, profile),
  };
}

async function attachOwnApplications(vacancies: VacancyRow[], applicantId: number | null) {
  if (!applicantId || vacancies.length === 0) {
    return vacancies.map((row) => serializeVacancy(row, null));
  }

  const ownApplications = await prisma.jobApplication.findMany({
    where: {
      applicantId,
      vacancyId: {
        in: vacancies.map((row) => row.id),
      },
    },
    select: ownApplicationSelect,
  });
  const ownApplicationMap = new Map(ownApplications.map((row) => [row.vacancyId, row]));
  return vacancies.map((row) => serializeVacancy(row, ownApplicationMap.get(row.id) || null));
}

function buildVacancyWhere(req: Request): Prisma.JobVacancyWhereInput {
  const { search, isOpen } = req.query;
  const where: Prisma.JobVacancyWhereInput = {};
  const normalizedSearch = normalizeOptionalText(search);

  if (typeof isOpen !== 'undefined') {
    where.isOpen = String(isOpen).toLowerCase() === 'true';
  }

  if (normalizedSearch) {
    where.OR = [
      { title: { contains: normalizedSearch, mode: 'insensitive' } },
      { companyName: { contains: normalizedSearch, mode: 'insensitive' } },
      {
        industryPartner: {
          is: {
            name: { contains: normalizedSearch, mode: 'insensitive' },
          },
        },
      },
    ];
  }

  return where;
}

// Partners
export const getPartners = asyncHandler(async (req: Request, res: Response) => {
  const { pageNum, limitNum, skip } = normalizePagination(req.query.page, req.query.limit);
  const { search, status } = req.query;

  const where: Prisma.IndustryPartnerWhereInput = {};
  if (status) where.cooperationStatus = String(status) as Prisma.EnumCooperationStatusFilter['equals'];

  const normalizedSearch = normalizeOptionalText(search);
  if (normalizedSearch) {
    where.name = { contains: normalizedSearch, mode: 'insensitive' };
  }

  const [total, partners] = await Promise.all([
    prisma.industryPartner.count({ where }),
    prisma.industryPartner.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { partners, total, page: pageNum, totalPages: Math.ceil(total / limitNum) },
        'Data mitra berhasil diambil',
      ),
    );
});

export const createPartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const partner = await prisma.industryPartner.create({
    data: req.body,
  });
  res.status(201).json(new ApiResponse(201, partner, 'Mitra berhasil ditambahkan'));
});

export const updatePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const partner = await prisma.industryPartner.update({
    where: { id: Number(id) },
    data: req.body,
  });
  res.status(200).json(new ApiResponse(200, partner, 'Mitra berhasil diperbarui'));
});

export const deletePartner = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await prisma.industryPartner.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Mitra berhasil dihapus'));
});

// Vacancies (BKK)
export const getVacancies = asyncHandler(async (req: Request, res: Response) => {
  const { pageNum, limitNum, skip } = normalizePagination(req.query.page, req.query.limit);
  const where = buildVacancyWhere(req);
  const authRole = getAuthUserRole(req);
  const applicantId = authRole === 'UMUM' ? getAuthUserId(req) : null;

  const [total, vacancyRows] = await Promise.all([
    prisma.jobVacancy.count({ where }),
    prisma.jobVacancy.findMany({
      where,
      include: {
        industryPartner: true,
        _count: {
          select: {
            applications: true,
          },
        },
      },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const vacancies = await attachOwnApplications(vacancyRows, applicantId);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        vacancies,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
      },
      'Lowongan berhasil diambil',
    ),
  );
});

export const getVacancyById = asyncHandler(async (req: Request, res: Response) => {
  const vacancyId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(vacancyId) || vacancyId <= 0) {
    throw new ApiError(400, 'ID lowongan tidak valid.');
  }

  const authRole = getAuthUserRole(req);
  const applicantId = authRole === 'UMUM' ? getAuthUserId(req) : null;
  const vacancy = await prisma.jobVacancy.findUnique({
    where: { id: vacancyId },
    include: {
      industryPartner: true,
      _count: {
        select: {
          applications: true,
        },
      },
    },
  });

  if (!vacancy) {
    throw new ApiError(404, 'Lowongan tidak ditemukan.');
  }

  const [serialized] = await attachOwnApplications([vacancy], applicantId);
  res.status(200).json(new ApiResponse(200, serialized, 'Detail lowongan berhasil diambil'));
});

export const createVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const vacancy = await prisma.jobVacancy.create({
    data: req.body,
  });
  res.status(201).json(new ApiResponse(201, vacancy, 'Lowongan berhasil ditambahkan'));
});

export const updateVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const vacancy = await prisma.jobVacancy.update({
    where: { id: Number(id) },
    data: req.body,
  });
  res.status(200).json(new ApiResponse(200, vacancy, 'Lowongan berhasil diperbarui'));
});

export const deleteVacancy = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  await prisma.jobVacancy.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Lowongan berhasil dihapus'));
});

export const getMyApplicantProfile = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = getAuthUserId(req);
  const payload = await loadApplicantProfile(applicantId);
  res.status(200).json(new ApiResponse(200, payload.serialized, 'Profil pelamar berhasil diambil'));
});

export const upsertMyApplicantProfile = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = getAuthUserId(req);
  const body = (req.body || {}) as Record<string, unknown>;

  const userUpdate: Prisma.UserUpdateInput = {};
  const profileUpdate: Prisma.JobApplicantProfileUncheckedUpdateInput = {};
  let shouldUpsertProfile = false;

  if (hasOwn(body, 'name')) {
    const name = normalizeOptionalText(body.name);
    if (!name) {
      throw new ApiError(400, 'Nama pelamar wajib diisi.');
    }
    userUpdate.name = name;
  }

  if (hasOwn(body, 'phone')) {
    const phone = normalizeOptionalText(body.phone);
    userUpdate.phone = phone;
    profileUpdate.phone = phone;
    shouldUpsertProfile = true;
  }

  if (hasOwn(body, 'email')) {
    const email = normalizeOptionalText(body.email);
    userUpdate.email = email;
    profileUpdate.email = email;
    shouldUpsertProfile = true;
  }

  if (hasOwn(body, 'address')) {
    const address = normalizeOptionalText(body.address);
    userUpdate.address = address;
    profileUpdate.address = address;
    shouldUpsertProfile = true;
  }

  if (hasOwn(body, 'headline')) {
    profileUpdate.headline = normalizeOptionalText(body.headline);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'educationLevel')) {
    profileUpdate.educationLevel = normalizeOptionalText(body.educationLevel);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'graduationYear')) {
    profileUpdate.graduationYear = normalizeOptionalYear(body.graduationYear);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'schoolName')) {
    profileUpdate.schoolName = normalizeOptionalText(body.schoolName);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'major')) {
    profileUpdate.major = normalizeOptionalText(body.major);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'skills')) {
    profileUpdate.skills = normalizeOptionalText(body.skills);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'experienceSummary')) {
    profileUpdate.experienceSummary = normalizeOptionalText(body.experienceSummary);
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'cvUrl')) {
    profileUpdate.cvUrl = normalizeOptionalUrl(body.cvUrl, 'URL CV');
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'portfolioUrl')) {
    profileUpdate.portfolioUrl = normalizeOptionalUrl(body.portfolioUrl, 'URL portofolio');
    shouldUpsertProfile = true;
  }
  if (hasOwn(body, 'linkedinUrl')) {
    profileUpdate.linkedinUrl = normalizeOptionalUrl(body.linkedinUrl, 'URL LinkedIn');
    shouldUpsertProfile = true;
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({
        where: { id: applicantId },
        data: userUpdate,
      });
    }

    if (shouldUpsertProfile) {
      await tx.jobApplicantProfile.upsert({
        where: { userId: applicantId },
        create: {
          userId: applicantId,
          headline: typeof profileUpdate.headline === 'string' ? profileUpdate.headline : null,
          phone: typeof profileUpdate.phone === 'string' ? profileUpdate.phone : null,
          email: typeof profileUpdate.email === 'string' ? profileUpdate.email : null,
          address: typeof profileUpdate.address === 'string' ? profileUpdate.address : null,
          educationLevel: typeof profileUpdate.educationLevel === 'string' ? profileUpdate.educationLevel : null,
          graduationYear:
            typeof profileUpdate.graduationYear === 'number' ? profileUpdate.graduationYear : null,
          schoolName: typeof profileUpdate.schoolName === 'string' ? profileUpdate.schoolName : null,
          major: typeof profileUpdate.major === 'string' ? profileUpdate.major : null,
          skills: typeof profileUpdate.skills === 'string' ? profileUpdate.skills : null,
          experienceSummary:
            typeof profileUpdate.experienceSummary === 'string' ? profileUpdate.experienceSummary : null,
          cvUrl: typeof profileUpdate.cvUrl === 'string' ? profileUpdate.cvUrl : null,
          portfolioUrl: typeof profileUpdate.portfolioUrl === 'string' ? profileUpdate.portfolioUrl : null,
          linkedinUrl: typeof profileUpdate.linkedinUrl === 'string' ? profileUpdate.linkedinUrl : null,
        },
        update: profileUpdate,
      });
    }
  });

  const payload = await loadApplicantProfile(applicantId);
  res.status(200).json(new ApiResponse(200, payload.serialized, 'Profil pelamar berhasil diperbarui'));
});

export const applyToVacancy = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = getAuthUserId(req);
  const vacancyId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(vacancyId) || vacancyId <= 0) {
    throw new ApiError(400, 'ID lowongan tidak valid.');
  }

  await assertVerifiedBkkApplicant(applicantId);

  const [vacancy, applicantState, existingApplication] = await Promise.all([
    prisma.jobVacancy.findUnique({
      where: { id: vacancyId },
      include: {
        industryPartner: true,
        _count: {
          select: {
            applications: true,
          },
        },
      },
    }),
    loadApplicantProfile(applicantId),
    prisma.jobApplication.findUnique({
      where: {
        applicantId_vacancyId: {
          applicantId,
          vacancyId,
        },
      },
      select: myApplicationListSelect,
    }),
  ]);

  if (!vacancy) {
    throw new ApiError(404, 'Lowongan tidak ditemukan.');
  }
  if (!vacancy.isOpen) {
    throw new ApiError(400, 'Lowongan ini sudah ditutup.');
  }
  if (vacancy.deadline && new Date(vacancy.deadline).getTime() < Date.now()) {
    throw new ApiError(400, 'Batas waktu lowongan ini sudah berakhir.');
  }
  if (existingApplication) {
    throw new ApiError(409, 'Anda sudah melamar pada lowongan ini.');
  }
  if (!applicantState.serialized.completeness.isReady) {
    throw new ApiError(
      400,
      `Profil pelamar belum lengkap. Lengkapi: ${applicantState.serialized.completeness.missingFields.join(', ')}.`,
    );
  }

  const coverLetter = normalizeOptionalText(req.body?.coverLetter);
  const expectedSalary = normalizeOptionalText(req.body?.expectedSalary);
  const source = normalizeOptionalText(req.body?.source) || 'IN_APP';

  const application = await prisma.jobApplication.create({
    data: {
      applicantId,
      vacancyId,
      profileId: applicantState.profile?.id || null,
      coverLetter,
      expectedSalary,
      source,
      status: JobApplicationStatus.SUBMITTED,
      appliedAt: new Date(),
    },
    select: myApplicationListSelect,
  });

  res.status(201).json(new ApiResponse(201, application, 'Lamaran berhasil dikirim'));
});

export const getMyApplications = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = getAuthUserId(req);
  const rows = await prisma.jobApplication.findMany({
    where: { applicantId },
    select: myApplicationListSelect,
    orderBy: { appliedAt: 'desc' },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        applications: rows.map((row) => serializeMyApplication(row)),
        summary: buildApplicationSummary(rows),
      },
      'Lamaran berhasil diambil',
    ),
  );
});

export const withdrawMyApplication = asyncHandler(async (req: Request, res: Response) => {
  const applicantId = getAuthUserId(req);
  const applicationId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    throw new ApiError(400, 'ID lamaran tidak valid.');
  }

  const existing = await prisma.jobApplication.findFirst({
    where: {
      id: applicationId,
      applicantId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Lamaran tidak ditemukan.');
  }
  const blockedStatuses: JobApplicationStatus[] = [
    JobApplicationStatus.SHORTLISTED,
    JobApplicationStatus.PARTNER_INTERVIEW,
    JobApplicationStatus.HIRED,
    JobApplicationStatus.ACCEPTED,
    JobApplicationStatus.REJECTED,
    JobApplicationStatus.WITHDRAWN,
  ];
  if (blockedStatuses.includes(existing.status)) {
    throw new ApiError(400, 'Lamaran ini tidak dapat dibatalkan.');
  }

  const application = await prisma.jobApplication.update({
    where: { id: applicationId },
    data: {
      status: JobApplicationStatus.WITHDRAWN,
      reviewerNotes: normalizeOptionalText(req.body?.reviewerNotes) || 'Dibatalkan oleh pelamar.',
      reviewedAt: new Date(),
    },
    select: myApplicationListSelect,
  });

  res.status(200).json(new ApiResponse(200, serializeMyApplication(application), 'Lamaran berhasil dibatalkan'));
});

export const getApplications = asyncHandler(async (req: Request, res: Response) => {
  const { pageNum, limitNum, skip } = normalizePagination(req.query.page, req.query.limit);
  const normalizedSearch = normalizeOptionalText(req.query.search);
  const normalizedStatus = String(req.query.status || '').trim().toUpperCase();
  const vacancyId = Number.parseInt(String(req.query.vacancyId || ''), 10);

  const where: Prisma.JobApplicationWhereInput = {};
  if (normalizedStatus && normalizedStatus !== 'ALL') {
    if (!Object.values(JobApplicationStatus).includes(normalizedStatus as JobApplicationStatus)) {
      throw new ApiError(400, 'Status lamaran tidak valid.');
    }
    where.status = normalizedStatus as JobApplicationStatus;
  }
  if (Number.isFinite(vacancyId) && vacancyId > 0) {
    where.vacancyId = vacancyId;
  }
  if (normalizedSearch) {
    where.OR = [
      {
        applicant: {
          name: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        applicant: {
          username: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        vacancy: {
          title: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        vacancy: {
          companyName: {
            contains: normalizedSearch,
            mode: 'insensitive',
          },
        },
      },
      {
        profile: {
          is: {
            schoolName: {
              contains: normalizedSearch,
              mode: 'insensitive',
            },
          },
        },
      },
    ];
  }

  const [total, rows, allRowsForSummary] = await Promise.all([
    prisma.jobApplication.count({ where }),
    prisma.jobApplication.findMany({
      where,
      select: reviewApplicationSelect,
      skip,
      take: limitNum,
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
    }),
    prisma.jobApplication.findMany({
      where,
      select: {
        status: true,
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        applications: rows.map((row) => serializeReviewApplication(row)),
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        summary: buildApplicationSummary(allRowsForSummary),
      },
      'Daftar lamaran berhasil diambil',
    ),
  );
});

export const updateApplicationStatus = asyncHandler(async (req: Request, res: Response) => {
  const applicationId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    throw new ApiError(400, 'ID lamaran tidak valid.');
  }

  const status = String(req.body?.status || '').trim().toUpperCase();
  if (!status) {
    throw new ApiError(400, 'Status lamaran wajib diisi.');
  }
  const allowedStatuses: JobApplicationStatus[] = [
    JobApplicationStatus.REVIEWING,
    JobApplicationStatus.SHORTLISTED,
    JobApplicationStatus.PARTNER_INTERVIEW,
    JobApplicationStatus.HIRED,
    JobApplicationStatus.INTERVIEW,
    JobApplicationStatus.ACCEPTED,
    JobApplicationStatus.REJECTED,
  ];
  if (!allowedStatuses.includes(status as JobApplicationStatus)) {
    throw new ApiError(400, 'Status lamaran tidak didukung untuk petugas BKK.');
  }

  const nextStatus = status as JobApplicationStatus;
  const reviewerNotes = normalizeOptionalText(req.body?.reviewerNotes);
  const reviewedAt = new Date();
  const data: Prisma.JobApplicationUpdateInput = {
    status: nextStatus,
    reviewedAt,
  };

  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'reviewerNotes')) {
    data.reviewerNotes = reviewerNotes;
  }

  if (nextStatus === JobApplicationStatus.SHORTLISTED) {
    data.shortlistedAt = reviewedAt;
  }
  if (nextStatus === JobApplicationStatus.PARTNER_INTERVIEW) {
    data.partnerInterviewAt = reviewedAt;
  }
  if (
    nextStatus === JobApplicationStatus.HIRED ||
    nextStatus === JobApplicationStatus.ACCEPTED ||
    nextStatus === JobApplicationStatus.REJECTED
  ) {
    data.finalizedAt = reviewedAt;
  }

  const application = await prisma.jobApplication.update({
    where: { id: applicationId },
    data,
    select: reviewApplicationSelect,
  });

  res.status(200).json(new ApiResponse(200, serializeReviewApplication(application), 'Status lamaran berhasil diperbarui'));
});

export const updateApplicationPartnerArchive = asyncHandler(async (req: Request, res: Response) => {
  const applicationId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    throw new ApiError(400, 'ID lamaran tidak valid.');
  }

  const data: Prisma.JobApplicationUpdateInput = {};
  if (hasOwn(req.body, 'partnerReferenceCode')) {
    data.partnerReferenceCode = normalizeOptionalText(req.body?.partnerReferenceCode);
  }
  if (hasOwn(req.body, 'partnerHandoffNotes')) {
    data.partnerHandoffNotes = normalizeOptionalText(req.body?.partnerHandoffNotes);
  }
  if (hasOwn(req.body, 'partnerDecisionNotes')) {
    data.partnerDecisionNotes = normalizeOptionalText(req.body?.partnerDecisionNotes);
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, 'Minimal satu arsip handoff mitra harus diisi.');
  }

  const application = await prisma.jobApplication.update({
    where: { id: applicationId },
    data,
    select: reviewApplicationSelect,
  });

  res
    .status(200)
    .json(new ApiResponse(200, serializeReviewApplication(application), 'Arsip handoff mitra berhasil diperbarui'));
});

export const batchShortlistApplications = asyncHandler(async (req: Request, res: Response) => {
  const vacancyId = Number.parseInt(String(req.body?.vacancyId || ''), 10);
  if (!Number.isFinite(vacancyId) || vacancyId <= 0) {
    throw new ApiError(400, 'Lowongan batch shortlist tidak valid.');
  }

  const rawApplicationIds: unknown[] = Array.isArray(req.body?.applicationIds) ? req.body.applicationIds : [];
  const applicationIds: number[] = Array.from(
    new Set(
      rawApplicationIds
        .map((value: unknown) => Number.parseInt(String(value || ''), 10))
        .filter((value: number) => Number.isFinite(value) && value > 0),
    ),
  );

  if (applicationIds.length === 0) {
    throw new ApiError(400, 'Pilih minimal satu pelamar untuk batch shortlist.');
  }

  const shortlistedAt = normalizeOptionalDate(req.body?.shortlistedAt, 'Tanggal shortlist') || new Date();
  const partnerHandoffNotes = normalizeOptionalText(req.body?.partnerHandoffNotes);
  const requestedReferenceCode = normalizeOptionalText(req.body?.partnerReferenceCode);

  const applications = await prisma.jobApplication.findMany({
    where: {
      id: {
        in: applicationIds,
      },
    },
    select: {
      id: true,
      vacancyId: true,
      status: true,
    },
  });

  if (applications.length !== applicationIds.length) {
    throw new ApiError(404, 'Sebagian pelamar yang dipilih tidak ditemukan.');
  }

  const invalidVacancyMember = applications.find((item) => item.vacancyId !== vacancyId);
  if (invalidVacancyMember) {
    throw new ApiError(400, 'Batch shortlist hanya boleh berisi pelamar dari lowongan yang sama.');
  }

  const blockedStatuses: JobApplicationStatus[] = [
    JobApplicationStatus.REJECTED,
    JobApplicationStatus.WITHDRAWN,
    JobApplicationStatus.PARTNER_INTERVIEW,
    JobApplicationStatus.HIRED,
    JobApplicationStatus.ACCEPTED,
  ];
  const blocked = applications.find((item) => blockedStatuses.includes(item.status));
  if (blocked) {
    throw new ApiError(400, `Ada pelamar dengan status ${blocked.status} yang tidak bisa dimasukkan ke shortlist batch.`);
  }

  const partnerReferenceCode =
    requestedReferenceCode ||
    `BKK-${vacancyId}-${shortlistedAt.toISOString().slice(0, 10).replace(/-/g, '')}-${applicationIds.length}`;

  await prisma.jobApplication.updateMany({
    where: {
      id: {
        in: applicationIds,
      },
    },
    data: {
      status: JobApplicationStatus.SHORTLISTED,
      reviewedAt: shortlistedAt,
      shortlistedAt,
      partnerReferenceCode,
      partnerHandoffNotes,
    },
  });

  const refreshed = (await prisma.jobApplication.findMany({
    where: {
      id: {
        in: applicationIds,
      },
    },
    select: reviewApplicationSelect,
    orderBy: {
      id: 'asc',
    },
  })) as ReviewApplicationRow[];

  res.status(200).json(
    new ApiResponse(
      200,
      {
        partnerReferenceCode,
        shortlistedAt: shortlistedAt.toISOString(),
        applications: refreshed.map((item) => serializeReviewApplication(item)),
        total: refreshed.length,
      },
      'Batch shortlist mitra berhasil dibuat',
    ),
  );
});

export const upsertApplicationAssessments = asyncHandler(async (req: Request, res: Response) => {
  const applicationId = Number.parseInt(String(req.params.id || ''), 10);
  if (!Number.isFinite(applicationId) || applicationId <= 0) {
    throw new ApiError(400, 'ID lamaran tidak valid.');
  }

  const items = parseJobAssessmentPayload(req.body);
  const evaluatorId = getAuthUserId(req);

  await prisma.$transaction(
    items.map((item) =>
      prisma.jobApplicationAssessment.upsert({
        where: {
          applicationId_stageCode: {
            applicationId,
            stageCode: item.stageCode,
          },
        },
        update: {
          title:
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.title ||
            item.stageCode,
          sourceType:
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.sourceType ||
            SelectionAssessmentSource.MANUAL,
          score: item.score,
          maxScore: item.maxScore ?? 100,
          weight:
            item.weight ??
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.weight ??
            1,
          passingScore:
            item.passingScore ??
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.passingScore ??
            70,
          notes: item.notes,
          assessedAt: item.assessedAt,
          evaluatorId,
        },
        create: {
          applicationId,
          stageCode: item.stageCode,
          title:
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.title ||
            item.stageCode,
          sourceType:
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.sourceType ||
            SelectionAssessmentSource.MANUAL,
          score: item.score,
          maxScore: item.maxScore ?? 100,
          weight:
            item.weight ??
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.weight ??
            1,
          passingScore:
            item.passingScore ??
            JOB_ASSESSMENT_STAGE_DEFINITIONS.find((definition) => definition.code === item.stageCode)?.passingScore ??
            70,
          notes: item.notes,
          assessedAt: item.assessedAt,
          evaluatorId,
        },
      }),
    ),
  );

  const refreshed = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: reviewApplicationSelect,
  });

  if (!refreshed) {
    throw new ApiError(404, 'Lamaran tidak ditemukan setelah penilaian disimpan.');
  }

  res.status(200).json(
    new ApiResponse(200, serializeReviewApplication(refreshed), 'Tahapan seleksi BKK berhasil diperbarui'),
  );
});
