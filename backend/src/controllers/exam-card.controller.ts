import { ExamGeneratedCardStatus, Prisma, Semester } from '@prisma/client';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import QRCode from 'qrcode';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { assertHeadTuExamCardAccess } from '../utils/examManagementAccess';
import {
  buildExamEligibilitySnapshot,
  normalizeExamProgramCode,
  type ExamEligibilityStatus,
} from '../services/examEligibility.service';
import {
  listHistoricalStudentsForClass,
  listHistoricalStudentsByIdsForAcademicYear,
} from '../utils/studentAcademicHistory';
import { reconcileMissingStudentPlacements } from '../services/examStudentPlacementSync.service';

const SCHOOL_NAME = 'SMKS Karya Guna Bhakti 2';
const EXAM_CARD_TITLE = 'KARTU PESERTA';
const EXAM_CARD_INTERNAL_NOTE = 'Berkas digital yang sah secara internal';
const DEFAULT_ISSUE_LOCATION = 'Bekasi';
const JWT_SIGNING_SECRET = String(process.env.JWT_SECRET || 'secret').trim();

const overviewQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive(),
  programCode: z.string().trim().min(1).max(50),
  semester: z.nativeEnum(Semester).optional(),
});

const generateCardsSchema = overviewQuerySchema.extend({
  issueLocation: z.string().trim().max(80).optional(),
  issueDate: z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    return value;
  }, z.coerce.date().optional()),
});

const myCardsQuerySchema = z.object({
  academicYearId: z.coerce.number().int().positive().optional(),
  programCode: z.string().trim().min(1).max(50).optional(),
});

type ExamCardEntrySnapshot = {
  sittingId: number;
  roomName: string;
  sessionLabel: string | null;
  startTime: Date | null;
  endTime: Date | null;
  seatLabel: string | null;
};

type ExamCardOverviewStatusCategory =
  | 'PUBLISHED'
  | 'READY'
  | 'BLOCKED_KKM'
  | 'BLOCKED_FINANCE'
  | 'REVIEW_REQUIRED';

type ExamCardOverviewStatusCode =
  | 'PUBLISHED_ACTIVE'
  | 'READY_TO_GENERATE'
  | 'BLOCKED_KKM'
  | 'BLOCKED_FINANCE'
  | 'REVIEW_MANUAL_BLOCK'
  | 'REVIEW_PLACEMENT_SYNC'
  | 'REVIEW_STALE_CARD'
  | 'REVIEW_DATA_SYNC';

type ExamCardOverviewStatus = {
  code: ExamCardOverviewStatusCode;
  category: ExamCardOverviewStatusCategory;
  label: string;
  detail: string;
};

type ExamCardScheduleEntryCandidate = {
  roomName: string;
  roomToken: string;
  sessionLabel: string | null;
  sessionToken: string;
  startTime: Date | null;
  endTime: Date | null;
  startTimeToken: number | null;
  endTimeToken: number | null;
  dateToken: string;
};

type ExamCardOverviewRow = {
  studentId: number;
  studentName: string;
  username: string;
  nis: string | null;
  nisn: string | null;
  className: string | null;
  classId: number | null;
  classLevelLabel: string | null;
  classLevelNumber: string | null;
  participantSequence: number | null;
  participantNumber: string | null;
  formalPhotoUrl: string | null;
  entries: ExamCardEntrySnapshot[];
  eligibility: ExamEligibilityStatus;
  status: ExamCardOverviewStatus;
  card: {
    id: number;
    generatedAt: Date;
    payload: Prisma.JsonValue;
  } | null;
};

type ExamCardDocumentAsset = {
  title: string;
  fileUrl: string;
  category: string;
};

type ExamCardVerificationTokenPayload = {
  kind: 'EXAM_CARD';
  studentId: number;
  academicYearId: number;
  programCode: string;
  semester: Semester;
  generatedAtMs: number;
  participantNumber?: string | null;
};

function formatSemesterLabel(semester: Semester) {
  return semester === Semester.EVEN ? 'Genap' : 'Ganjil';
}

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeAliasCode(raw: unknown) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/QUIZ/g, 'FORMATIF')
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function buildEntrySortValue(entry: ExamCardEntrySnapshot) {
  return entry.startTime ? new Date(entry.startTime).getTime() : Number.MAX_SAFE_INTEGER;
}

function buildLocalDateToken(value?: Date | string | null) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeMediaUrl(value: unknown) {
  const raw = normalizeText(value);
  if (!raw) return null;
  if (/^(data:|https?:)/i.test(raw)) return raw;
  if (raw.startsWith('/api/uploads/')) return raw;
  if (raw.startsWith('/uploads/')) return `/api${raw}`;
  if (raw.startsWith('/api/')) return raw;
  if (raw.startsWith('/')) return raw;
  return `/api/uploads/${raw.replace(/^\/+/, '')}`;
}

function normalizeDocumentTitle(value: unknown) {
  return normalizeText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOptionalSessionLabel(raw: unknown) {
  const normalized = normalizeText(raw).replace(/\s+/g, ' ').trim();
  return normalized || null;
}

function resolveRepresentativeScheduleEntry(
  entries: ExamCardScheduleEntryCandidate[],
  matchedEntry: ExamCardScheduleEntryCandidate | null,
) {
  if (matchedEntry) return matchedEntry;
  return (
    entries.find((entry) => entry.startTimeToken !== null && entry.endTimeToken !== null) ||
    entries.find((entry) => entry.startTimeToken !== null) ||
    entries[0] ||
    null
  );
}

function deriveExamCardOverviewStatus(params: {
  eligibility: ExamEligibilityStatus;
  entries: ExamCardEntrySnapshot[];
  hasActiveCard: boolean;
}) {
  const hasOperationalEntry = params.entries.length > 0;
  const hasBelowKkm = Boolean(params.eligibility.automatic.flags.belowKkm);
  const hasFinanceBlock = Boolean(params.eligibility.automatic.flags.financeBlocked);
  const hasAcademicWarning = Boolean(params.eligibility.academicClearance.warningOnly);
  const academicWarningReason = params.eligibility.academicClearance.reason || 'Masih ada warning akademik pada SBTS.';

  if (params.eligibility.isEligible) {
    if (params.hasActiveCard) {
      return {
        code: 'PUBLISHED_ACTIVE',
        category: 'PUBLISHED',
        label: 'Sudah Dipublikasikan',
        detail: hasAcademicWarning
          ? `Kartu aktif sudah terbit, tetapi siswa ini masih punya warning akademik. ${academicWarningReason}`
          : 'Kartu aktif sudah terbit dan tampil di akun siswa.',
      } satisfies ExamCardOverviewStatus;
    }
    if (hasOperationalEntry) {
      return {
        code: 'READY_TO_GENERATE',
        category: 'READY',
        label: 'Siap Digenerate',
        detail: hasAcademicWarning
          ? `Siswa boleh ikut ujian dan siap dipublikasikan, tetapi masih punya warning akademik. ${academicWarningReason}`
          : 'Siswa memenuhi syarat dan siap dipublikasikan setelah generate kartu.',
      } satisfies ExamCardOverviewStatus;
    }
    return {
      code: 'REVIEW_PLACEMENT_SYNC',
      category: 'REVIEW_REQUIRED',
      label: 'Perlu Review Penempatan',
      detail: 'Siswa sudah eligible, tetapi penempatan ruang atau jadwal aktif belum terbaca penuh.',
    } satisfies ExamCardOverviewStatus;
  }

  if (hasBelowKkm) {
    return {
      code: 'BLOCKED_KKM',
      category: 'BLOCKED_KKM',
      label: 'Blocked KKM',
      detail: params.eligibility.reason || 'Masih ada nilai di bawah KKM.',
    } satisfies ExamCardOverviewStatus;
  }

  if (hasFinanceBlock) {
    return {
      code: 'BLOCKED_FINANCE',
      category: 'BLOCKED_FINANCE',
      label: 'Blocked Finance',
      detail: params.eligibility.reason || 'Masih ada tunggakan finance yang memblokir ujian.',
    } satisfies ExamCardOverviewStatus;
  }

  if (params.eligibility.manualBlocked) {
    return {
      code: 'REVIEW_MANUAL_BLOCK',
      category: 'REVIEW_REQUIRED',
      label: 'Blocked Manual',
      detail: params.eligibility.reason || 'Siswa sedang diblokir manual dan perlu review operator.',
    } satisfies ExamCardOverviewStatus;
  }

  if (params.hasActiveCard) {
    return {
      code: 'REVIEW_STALE_CARD',
      category: 'REVIEW_REQUIRED',
      label: 'Kartu Perlu Sinkronisasi',
      detail: 'Kartu lama masih aktif, tetapi status kelayakan atau jadwal terbarunya perlu ditinjau ulang.',
    } satisfies ExamCardOverviewStatus;
  }

  return {
    code: 'REVIEW_DATA_SYNC',
    category: 'REVIEW_REQUIRED',
    label: 'Perlu Review Data',
    detail: params.eligibility.reason || 'Masih ada data kelayakan ujian yang perlu ditinjau.',
  } satisfies ExamCardOverviewStatus;
}

function resolveProgramCodeCandidates(params: {
  programCode: string;
  baseTypeCode?: string | null;
}) {
  const normalizedProgramCode = normalizeAliasCode(params.programCode);
  const candidates = new Set<string>();

  if (!normalizedProgramCode) {
    return [];
  }

  candidates.add(normalizedProgramCode);

  if (['SBTS', 'MIDTERM', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(normalizedProgramCode)) {
    candidates.add('SBTS');
    candidates.add('MIDTERM');
    candidates.add('SUMATIF_BERSAMA_TENGAH_SEMESTER');
  }

  if (['SAS', 'SUMATIF_AKHIR_SEMESTER'].includes(normalizedProgramCode)) {
    candidates.add('SAS');
    candidates.add('SUMATIF_AKHIR_SEMESTER');
  }

  if (['SAT', 'SUMATIF_AKHIR_TAHUN'].includes(normalizedProgramCode)) {
    candidates.add('SAT');
    candidates.add('SUMATIF_AKHIR_TAHUN');
  }

  if (['ASAJ', 'ASESMEN_SUMATIF_AKHIR_JENJANG'].includes(normalizedProgramCode)) {
    candidates.add('ASAJ');
    candidates.add('ASESMEN_SUMATIF_AKHIR_JENJANG');
  }

  if (['ASAJP', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK'].includes(normalizedProgramCode)) {
    candidates.add('ASAJP');
    candidates.add('ASAJ_PRAKTIK');
    candidates.add('ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK');
  }

  return Array.from(candidates);
}

function getFirstHeaderValue(value: string | string[] | undefined): string {
  const rawValue = Array.isArray(value) ? value[0] : value;
  return String(rawValue || '')
    .split(',')
    .map((item) => item.trim())
    .find((item) => item.length > 0) || '';
}

function resolvePublicAppBaseUrl(req: Request): string {
  const configuredBaseUrl = String(
    process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_BASE_URL || '',
  ).trim();

  if (configuredBaseUrl) {
    const normalized = /^https?:\/\//i.test(configuredBaseUrl) ? configuredBaseUrl : `https://${configuredBaseUrl}`;
    return normalized.replace(/\/+$/, '');
  }

  const forwardedProto = getFirstHeaderValue(req.headers['x-forwarded-proto']);
  const forwardedHost = getFirstHeaderValue(req.headers['x-forwarded-host']);
  const host = forwardedHost || getFirstHeaderValue(req.headers.host);
  if (host) {
    const protocol = forwardedProto || req.protocol || 'https';
    return `${protocol}://${host}`.replace(/\/+$/, '');
  }

  return 'https://siskgb2.id';
}

function buildExamCardVerificationToken(payload: ExamCardVerificationTokenPayload) {
  return jwt.sign(payload, JWT_SIGNING_SECRET, {
    subject: `exam-card:${payload.studentId}:${payload.programCode}:${payload.generatedAtMs}`,
    noTimestamp: true,
  });
}

function buildShortExamCardVerificationToken() {
  return randomUUID().replace(/-/g, '');
}

function buildExamCardVerificationUrl(baseUrl: string, verificationToken: string) {
  return `${baseUrl}/verify/exam-card/${verificationToken}`;
}

async function buildExamCardVerificationQrDataUrl(verificationUrl: string) {
  return QRCode.toDataURL(verificationUrl, {
    width: 192,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: {
      dark: '#000000',
      light: '#FFFFFFFF',
    },
  });
}

function verifyExamCardVerificationToken(token: string): ExamCardVerificationTokenPayload {
  const decoded = jwt.verify(token, JWT_SIGNING_SECRET);
  if (!decoded || typeof decoded !== 'object') {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  const record = decoded as Partial<ExamCardVerificationTokenPayload>;
  if (record.kind !== 'EXAM_CARD') {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  if (!Number.isFinite(Number(record.studentId)) || Number(record.studentId) <= 0) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  if (!Number.isFinite(Number(record.academicYearId)) || Number(record.academicYearId) <= 0) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  if (!Number.isFinite(Number(record.generatedAtMs)) || Number(record.generatedAtMs) <= 0) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  const programCode = normalizeExamProgramCode(record.programCode);
  if (!programCode) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  if (!record.semester || !Object.values(Semester).includes(record.semester)) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak valid.');
  }
  return {
    kind: 'EXAM_CARD',
    studentId: Number(record.studentId),
    academicYearId: Number(record.academicYearId),
    programCode,
    semester: record.semester,
    generatedAtMs: Number(record.generatedAtMs),
    participantNumber: normalizeText(record.participantNumber),
  };
}

function resolveFormalPhotoUrl(params: {
  photo?: string | null;
  documents?: ExamCardDocumentAsset[];
}) {
  const preferredDocument =
    (params.documents || []).find((document) => normalizeDocumentTitle(document.title) === 'FOTO FORMAL') || null;
  if (preferredDocument?.fileUrl) {
    return normalizeMediaUrl(preferredDocument.fileUrl);
  }
  return normalizeMediaUrl(params.photo);
}

function formatIssueDateLabel(value: Date) {
  return value
    .toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
    .replace(/\./g, '');
}

function resolveAcademicYearToken(value: string) {
  const years = String(value || '').match(/\d{4}/g);
  if (years && years.length >= 2) {
    return `${years[0].slice(-2)}${years[1].slice(-2)}`;
  }
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return '0000';
}

function resolveProgramParticipantCode(params: {
  programCode: string;
  programBaseTypeCode?: string | null;
  programDisplayOrder?: number | null;
}) {
  const candidates = [
    normalizeAliasCode(params.programCode),
    normalizeAliasCode(params.programBaseTypeCode),
  ].filter(Boolean);

  for (const token of candidates) {
    if (['SBTS', 'MIDTERM', 'SUMATIF_BERSAMA_TENGAH_SEMESTER'].includes(token)) return '01';
    if (['SAS', 'SUMATIF_AKHIR_SEMESTER'].includes(token)) return '02';
    if (['SAT', 'FINAL', 'SUMATIF_AKHIR_TAHUN'].includes(token)) return '03';
    if (['ASAJ', 'ASSESMEN_SUMATIF_AKHIR_JENJANG'].includes(token)) return '04';
    if (['ASAJP', 'ASAJ_PRAKTIK', 'ASSESMEN_SUMATIF_AKHIR_JENJANG_PRAKTIK'].includes(token)) return '05';
  }

  const fallbackOrder = Number(params.programDisplayOrder || 0);
  if (Number.isFinite(fallbackOrder) && fallbackOrder > 0) {
    return String(fallbackOrder).padStart(2, '0').slice(-2);
  }
  return '00';
}

function resolveClassLevelNumber(level: unknown) {
  const normalized = normalizeText(level).toUpperCase();
  if (!normalized) return null;
  if (normalized === 'X') return '10';
  if (normalized === 'XI') return '11';
  if (normalized === 'XII') return '12';
  const digits = normalized.replace(/\D/g, '');
  if (!digits) return null;
  return digits.padStart(2, '0').slice(-2);
}

function formatParticipantSequence(value: number | null | undefined) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return null;
  return String(Number(value)).padStart(3, '0').slice(-3);
}

function compareClassName(left: string | null | undefined, right: string | null | undefined) {
  return String(left || '').localeCompare(String(right || ''), 'id-ID', {
    numeric: true,
    sensitivity: 'base',
  });
}

function buildParticipantNumber(params: {
  academicYearName: string;
  programCode: string;
  programBaseTypeCode?: string | null;
  programDisplayOrder?: number | null;
  classLevelNumber?: string | null;
  participantSequence?: number | null;
}) {
  const academicYearToken = resolveAcademicYearToken(params.academicYearName);
  const programToken = resolveProgramParticipantCode({
    programCode: params.programCode,
    programBaseTypeCode: params.programBaseTypeCode,
    programDisplayOrder: params.programDisplayOrder,
  });
  const classLevelToken = normalizeText(params.classLevelNumber);
  const sequenceToken = formatParticipantSequence(params.participantSequence);
  if (!classLevelToken || !sequenceToken) return null;
  return `${academicYearToken}${programToken}${classLevelToken}${sequenceToken}`;
}

function resolvePrimaryEntry(entries: ExamCardEntrySnapshot[]) {
  if (entries.length === 0) return null;
  return [...entries].sort((left, right) => buildEntrySortValue(left) - buildEntrySortValue(right))[0] || null;
}

async function resolveCardSemester(params: {
  academicYearId: number;
  programCode: string;
  requestedSemester?: Semester;
  sittingSemesters?: Array<Semester | null>;
}) {
  if (params.requestedSemester) {
    return params.requestedSemester;
  }

  const program = await prisma.examProgramConfig.findFirst({
    where: {
      academicYearId: params.academicYearId,
      code: params.programCode,
    },
    select: {
      fixedSemester: true,
    },
  });
  if (program?.fixedSemester) {
    return program.fixedSemester;
  }

  const uniqueSittingSemesters = Array.from(
    new Set((params.sittingSemesters || []).filter((semester): semester is Semester => Boolean(semester))),
  );
  if (uniqueSittingSemesters.length === 1) {
    return uniqueSittingSemesters[0];
  }

  const academicYear = await prisma.academicYear.findUnique({
    where: { id: params.academicYearId },
    select: {
      semester1Start: true,
      semester1End: true,
      semester2Start: true,
      semester2End: true,
    },
  });
  const now = new Date();
  if (academicYear) {
    if (academicYear.semester2Start && academicYear.semester2End && now >= academicYear.semester2Start && now <= academicYear.semester2End) {
      return Semester.EVEN;
    }
    if (academicYear.semester1Start && academicYear.semester1End && now >= academicYear.semester1Start && now <= academicYear.semester1End) {
      return Semester.ODD;
    }
  }

  return Semester.ODD;
}

function buildExamCardPayload(params: {
  req: Request;
  academicYearId: number;
  academicYearName: string;
  programCode: string;
  programBaseTypeCode?: string | null;
  programDisplayOrder?: number | null;
  programLabel: string;
  semester: Semester;
  generatedAt: Date;
  generatedById: number;
  generatedByName: string;
  issueLocation: string;
  issueDate: Date;
  principalName: string;
  principalBarcodeDataUrl: string;
  verificationToken: string;
  row: ExamCardOverviewRow;
}) {
  const headerTitle = EXAM_CARD_TITLE;
  const headerSubtitle = `${params.programLabel} • Tahun Ajaran ${params.academicYearName}`;
  const primaryEntry = resolvePrimaryEntry(params.row.entries);
  const issueDateLabel = formatIssueDateLabel(params.issueDate);
  const verificationUrl = buildExamCardVerificationUrl(resolvePublicAppBaseUrl(params.req), params.verificationToken);

  return {
    schoolName: SCHOOL_NAME,
    headerTitle,
    headerSubtitle,
    cardTitle: EXAM_CARD_TITLE,
    examTitle: params.programLabel,
    institutionName: SCHOOL_NAME,
    academicYearId: params.academicYearId,
    academicYearName: params.academicYearName,
    programCode: params.programCode,
    programBaseTypeCode: params.programBaseTypeCode || null,
    programLabel: params.programLabel,
    semester: params.semester,
    generatedAt: params.generatedAt.toISOString(),
    participantNumber: params.row.participantNumber,
    participantSequence: params.row.participantSequence,
    generatedBy: {
      id: params.generatedById,
      name: params.generatedByName,
    },
    issue: {
      location: params.issueLocation,
      date: params.issueDate.toISOString(),
      dateLabel: issueDateLabel,
      signLabel: `${params.issueLocation}, ${issueDateLabel}`,
    },
    student: {
      id: params.row.studentId,
      name: params.row.studentName,
      username: params.row.username,
      nis: params.row.nis,
      nisn: params.row.nisn,
      className: params.row.className,
      classLevelLabel: params.row.classLevelLabel,
      classLevelNumber: params.row.classLevelNumber,
      photoUrl: params.row.formalPhotoUrl,
    },
    placement: {
      roomName: primaryEntry?.roomName || null,
      sessionLabel: primaryEntry?.sessionLabel || null,
      seatLabel: primaryEntry?.seatLabel || null,
      startTime: primaryEntry?.startTime ? primaryEntry.startTime.toISOString() : null,
      endTime: primaryEntry?.endTime ? primaryEntry.endTime.toISOString() : null,
    },
    entries: params.row.entries.map((entry) => ({
      sittingId: entry.sittingId,
      roomName: entry.roomName,
      sessionLabel: entry.sessionLabel,
      startTime: entry.startTime ? entry.startTime.toISOString() : null,
      endTime: entry.endTime ? entry.endTime.toISOString() : null,
      seatLabel: entry.seatLabel,
    })),
    legality: {
      principalName: params.principalName,
      signatureLabel: 'Ditandatangani secara digital oleh Kepala Sekolah',
      principalBarcodeDataUrl: params.principalBarcodeDataUrl,
      principalTitle: 'Kepala Sekolah',
      footerNote: EXAM_CARD_INTERNAL_NOTE,
      verificationToken: params.verificationToken,
      verificationUrl,
      verificationNote: 'Keaslian kartu ujian ini dapat diverifikasi melalui QR code atau tautan verifikasi.',
    },
  };
}

async function buildExamCardOverview(params: {
  academicYearId: number;
  programCode: string;
  semester?: Semester;
}) {
  const normalizedProgramCode = normalizeExamProgramCode(params.programCode);
  if (!normalizedProgramCode) {
    throw new ApiError(400, 'Program ujian tidak valid.');
  }

  const loadSittings = () =>
    prisma.examSitting.findMany({
      where: {
        academicYearId: params.academicYearId,
        examType: normalizedProgramCode,
      },
      include: {
        programSession: {
          select: {
            id: true,
            label: true,
            displayOrder: true,
          },
        },
        students: {
          select: {
            studentId: true,
          },
        },
        layout: {
          select: {
            cells: {
              select: {
                studentId: true,
                seatLabel: true,
              },
            },
          },
        },
      },
      orderBy: [{ startTime: 'asc' }, { roomName: 'asc' }, { id: 'asc' }],
    });

  const [academicYear, programConfig, initialSittings] = await Promise.all([
    prisma.academicYear.findUnique({
      where: { id: params.academicYearId },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.examProgramConfig.findFirst({
      where: {
        academicYearId: params.academicYearId,
        code: normalizedProgramCode,
      },
      select: {
        code: true,
        baseTypeCode: true,
        displayLabel: true,
        shortLabel: true,
        displayOrder: true,
        fixedSemester: true,
      },
    }),
    loadSittings(),
  ]);

  if (!academicYear) {
    throw new ApiError(404, 'Tahun ajaran tidak ditemukan.');
  }

  const semester = await resolveCardSemester({
    academicYearId: params.academicYearId,
    programCode: normalizedProgramCode,
    requestedSemester: params.semester,
    sittingSemesters: initialSittings.map((item) => item.semester || null),
  });
  const syncSummary = await reconcileMissingStudentPlacements({
    academicYearId: params.academicYearId,
    programCode: normalizedProgramCode,
    semester,
  });
  const sittings =
    syncSummary.createdAssignments > 0 || syncSummary.assignedSeats > 0
      ? await loadSittings()
      : initialSittings;
  const relevantSittings = sittings.filter((sitting) => !sitting.semester || sitting.semester === semester);

  const scheduleProgramCandidates = resolveProgramCodeCandidates({
    programCode: normalizedProgramCode,
    baseTypeCode: programConfig?.baseTypeCode || null,
  });

  const activeSchedules = await prisma.examSchedule.findMany({
    where: {
      academicYearId: params.academicYearId,
      semester,
      isActive: true,
      OR: [
        {
          examType: {
            in: scheduleProgramCandidates,
          },
        },
        {
          packet: {
            is: {
              programCode: {
                in: scheduleProgramCandidates,
              },
            },
          },
        },
      ],
    },
    select: {
      classId: true,
      room: true,
      startTime: true,
      endTime: true,
      sessionLabel: true,
      class: {
        select: {
          name: true,
          level: true,
        },
      },
      programSession: {
        select: {
          label: true,
        },
      },
    },
  });

  const scheduledClassIds = new Set(
    activeSchedules
      .map((schedule) => Number(schedule.classId || 0))
      .filter((classId) => Number.isFinite(classId) && classId > 0),
  );
  const candidateStudentIds = Array.from(
    new Set(
      relevantSittings.flatMap((sitting) =>
        (sitting.students || [])
          .map((item) => Number(item.studentId || 0))
          .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
      ),
    ),
  );
  const historicalStudentsById =
    candidateStudentIds.length > 0
      ? await listHistoricalStudentsByIdsForAcademicYear(candidateStudentIds, params.academicYearId)
      : [];
  const scheduledHistoricalStudents = historicalStudentsById.filter((student) => {
    const classId = Number(student.studentClass?.id || 0);
    return Number.isFinite(classId) && classId > 0 && scheduledClassIds.has(classId);
  });
  const classMetaMap = new Map<number, { name: string | null; level: string | null }>();
  const studentsByClassId = new Map<number, typeof scheduledHistoricalStudents>();

  scheduledHistoricalStudents.forEach((student) => {
    const classId = Number(student.studentClass?.id || 0);
    if (!Number.isFinite(classId) || classId <= 0) return;
    if (!classMetaMap.has(classId)) {
      classMetaMap.set(classId, {
        name: student.studentClass?.name || null,
        level: student.studentClass?.level || null,
      });
    }
    const current = studentsByClassId.get(classId) || [];
    current.push(student);
    studentsByClassId.set(classId, current);
  });

  const rosterRows = Array.from(studentsByClassId.entries())
    .map(([classId, students]) => ({
      classId,
      className: classMetaMap.get(classId)?.name || null,
      classLevelNumber: resolveClassLevelNumber(classMetaMap.get(classId)?.level || null) || null,
      students: [...students].sort((left, right) =>
        left.name.localeCompare(right.name, 'id-ID', { sensitivity: 'base' }),
      ),
    }))
    .sort((left, right) => compareClassName(left.className, right.className));

  const scheduledStudentIds = scheduledHistoricalStudents.map((student) => student.id);

  const [studentProfiles, generatedCards] = await Promise.all([
    scheduledStudentIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: scheduledStudentIds },
          },
          select: {
            id: true,
            username: true,
            photo: true,
            documents: {
              select: {
                title: true,
                fileUrl: true,
                category: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    prisma.examGeneratedCard.findMany({
      where: {
        academicYearId: params.academicYearId,
        programCode: normalizedProgramCode,
        semester,
        status: ExamGeneratedCardStatus.ACTIVE,
        ...(scheduledStudentIds.length > 0 ? { studentId: { in: scheduledStudentIds } } : {}),
      },
      select: {
        id: true,
        studentId: true,
        generatedAt: true,
        payload: true,
      },
    }),
  ]);

  const eligibilityMap = await buildExamEligibilitySnapshot({
    academicYearId: params.academicYearId,
    semester,
    programCode: normalizedProgramCode,
    students: scheduledHistoricalStudents,
  });

  const eligibleHistoricalStudents = scheduledHistoricalStudents;
  const allowedStudentIds = new Set(eligibleHistoricalStudents.map((student) => student.id));
  const studentMap = new Map(eligibleHistoricalStudents.map((student) => [student.id, student]));
  const usernameMap = new Map(studentProfiles.map((student) => [student.id, student.username || '-']));
  const studentAssetMap = new Map(
    studentProfiles.map((student) => [
      student.id,
      {
        photo: student.photo || null,
        documents: student.documents || [],
      },
    ]),
  );
  const generatedCardMap = new Map(generatedCards.map((card) => [card.studentId, card]));
  const entriesByStudent = new Map<number, ExamCardEntrySnapshot[]>();
  const scheduleEntriesByClassId = new Map<number, ExamCardScheduleEntryCandidate[]>();

  activeSchedules.forEach((schedule) => {
    const classId = Number(schedule.classId || 0);
    if (!Number.isFinite(classId) || classId <= 0) return;
    const current = scheduleEntriesByClassId.get(classId) || [];
    const normalizedRoomName = normalizeText(schedule.room) || null;
    if (!normalizedRoomName) return;
    const normalizedSessionLabel = normalizeOptionalSessionLabel(schedule.programSession?.label || schedule.sessionLabel);
    current.push({
      roomName: normalizedRoomName,
      roomToken: normalizedRoomName.toLowerCase(),
      sessionLabel: normalizedSessionLabel,
      sessionToken: normalizedSessionLabel?.toLowerCase() || '__no_session__',
      startTime: schedule.startTime || null,
      endTime: schedule.endTime || null,
      startTimeToken: schedule.startTime ? schedule.startTime.getTime() : null,
      endTimeToken: schedule.endTime ? schedule.endTime.getTime() : null,
      dateToken: buildLocalDateToken(schedule.startTime || schedule.endTime || null),
    });
    scheduleEntriesByClassId.set(classId, current);
  });

  scheduleEntriesByClassId.forEach((entries, classId) => {
    entries.sort((left, right) => {
      const leftTime = left.startTime ? left.startTime.getTime() : Number.MAX_SAFE_INTEGER;
      const rightTime = right.startTime ? right.startTime.getTime() : Number.MAX_SAFE_INTEGER;
      if (leftTime !== rightTime) return leftTime - rightTime;
      return left.roomName.localeCompare(right.roomName, 'id-ID', { numeric: true, sensitivity: 'base' });
    });
    scheduleEntriesByClassId.set(classId, entries);
  });

  const participantSequenceMap = new Map<number, number>();
  const rosterRowsByLevel = new Map<
    string,
    Array<{
      classId: number;
      className: string | null;
      students: Awaited<ReturnType<typeof listHistoricalStudentsForClass>>;
    }>
  >();

  rosterRows.forEach(({ classId, className, classLevelNumber, students }) => {
    const levelKey = normalizeText(classLevelNumber) || '__UNSPECIFIED_LEVEL__';
    const current = rosterRowsByLevel.get(levelKey) || [];
    current.push({
      classId,
      className,
      students,
    });
    rosterRowsByLevel.set(levelKey, current);
  });

  Array.from(rosterRowsByLevel.entries())
    .sort(([leftLevel], [rightLevel]) => {
      const leftNumeric = Number(leftLevel.replace(/\D/g, ''));
      const rightNumeric = Number(rightLevel.replace(/\D/g, ''));
      if (Number.isFinite(leftNumeric) && Number.isFinite(rightNumeric) && leftNumeric !== rightNumeric) {
        return leftNumeric - rightNumeric;
      }
      return leftLevel.localeCompare(rightLevel, 'id-ID', { numeric: true, sensitivity: 'base' });
    })
    .forEach(([, levelRows]) => {
      let currentSequence = 1;
      levelRows
        .sort((left, right) => compareClassName(left.className, right.className))
        .forEach(({ students }) => {
          students.forEach((student) => {
            if (participantSequenceMap.has(student.id)) return;
            participantSequenceMap.set(student.id, currentSequence);
            currentSequence += 1;
          });
        });
    });

  relevantSittings.forEach((sitting) => {
    const seatLabelByStudent = new Map<number, string | null>();
    (sitting.layout?.cells || []).forEach((cell) => {
      if (!cell.studentId) return;
      seatLabelByStudent.set(cell.studentId, normalizeText(cell.seatLabel) || null);
    });

    (sitting.students || []).forEach((item) => {
      const studentId = Number(item.studentId);
      const student = studentMap.get(studentId);
      if (!allowedStudentIds.has(studentId) || !student) return;
      const classId = Number(student.studentClass?.id || 0);
      if (!Number.isFinite(classId) || classId <= 0) return;
      const normalizedRoomName = normalizeText(sitting.roomName);
      if (!normalizedRoomName) return;
      const normalizedSittingSession = normalizeOptionalSessionLabel(sitting.programSession?.label || sitting.sessionLabel);
      const normalizedSittingSessionToken = normalizedSittingSession?.toLowerCase() || '__no_session__';
      const sittingStartTime = sitting.startTime ? new Date(sitting.startTime) : null;
      const sittingEndTime = sitting.endTime ? new Date(sitting.endTime) : null;
      const sittingStartToken = sittingStartTime && !Number.isNaN(sittingStartTime.getTime()) ? sittingStartTime.getTime() : null;
      const sittingEndToken = sittingEndTime && !Number.isNaN(sittingEndTime.getTime()) ? sittingEndTime.getTime() : null;
      const sittingDateToken = buildLocalDateToken(sitting.startTime || sitting.endTime || null);
      const scheduleEntries = scheduleEntriesByClassId.get(classId) || [];
      const matchedSchedule =
        scheduleEntries.find(
          (entry) =>
            entry.roomToken === normalizedRoomName.toLowerCase() &&
            entry.sessionToken === normalizedSittingSessionToken &&
            entry.startTimeToken !== null &&
            entry.endTimeToken !== null &&
            sittingStartToken !== null &&
            sittingEndToken !== null &&
            entry.startTimeToken === sittingStartToken &&
            entry.endTimeToken === sittingEndToken,
        ) ||
        scheduleEntries.find(
          (entry) =>
            entry.roomToken === normalizedRoomName.toLowerCase() &&
            entry.sessionToken === normalizedSittingSessionToken &&
            Boolean(sittingDateToken) &&
            entry.dateToken === sittingDateToken,
        ) ||
        scheduleEntries.find(
          (entry) =>
            entry.roomToken === normalizedRoomName.toLowerCase() &&
            Boolean(sittingDateToken) &&
            entry.dateToken === sittingDateToken,
        ) ||
        scheduleEntries.find(
          (entry) =>
            entry.roomToken === normalizedRoomName.toLowerCase() && entry.sessionToken === normalizedSittingSessionToken,
        ) ||
        scheduleEntries.find((entry) => entry.roomToken === normalizedRoomName.toLowerCase()) ||
        scheduleEntries.find(
          (entry) =>
            entry.sessionToken === normalizedSittingSessionToken &&
            entry.startTimeToken !== null &&
            entry.endTimeToken !== null &&
            sittingStartToken !== null &&
            sittingEndToken !== null &&
            entry.startTimeToken === sittingStartToken &&
            entry.endTimeToken === sittingEndToken,
        ) ||
        scheduleEntries.find(
          (entry) =>
            entry.sessionToken === normalizedSittingSessionToken &&
            Boolean(sittingDateToken) &&
            entry.dateToken === sittingDateToken,
        ) ||
        scheduleEntries.find((entry) => Boolean(sittingDateToken) && entry.dateToken === sittingDateToken) ||
        null;
      const representativeSchedule = resolveRepresentativeScheduleEntry(scheduleEntries, matchedSchedule);
      if (!representativeSchedule) return;
      const current = entriesByStudent.get(studentId) || [];
      current.push({
        sittingId: sitting.id,
        roomName: normalizedRoomName,
        sessionLabel: normalizedSittingSession || representativeSchedule.sessionLabel || null,
        startTime: sitting.startTime || representativeSchedule.startTime,
        endTime: sitting.endTime || representativeSchedule.endTime,
        seatLabel: seatLabelByStudent.get(studentId) || null,
      });
      entriesByStudent.set(studentId, current);
    });
  });

  const rows = eligibleHistoricalStudents.reduce<ExamCardOverviewRow[]>((accumulator, student) => {
    const eligibility = eligibilityMap.get(student.id);
    if (!eligibility) {
      return accumulator;
    }

    const entries = [...(entriesByStudent.get(student.id) || [])].sort(
      (a, b) => buildEntrySortValue(a) - buildEntrySortValue(b),
    );
    const card = generatedCardMap.get(student.id) || null;
    const classId = Number(student.studentClass?.id || 0) || null;
    const classLevelLabel = normalizeText(student.studentClass?.level || '') || null;
    const classLevelNumber = resolveClassLevelNumber(student.studentClass?.level || null);
    const participantSequence = participantSequenceMap.get(student.id) || null;
    const participantNumber = buildParticipantNumber({
      academicYearName: academicYear.name,
      programCode: normalizedProgramCode,
      programBaseTypeCode: programConfig?.baseTypeCode || null,
      programDisplayOrder: programConfig?.displayOrder || null,
      classLevelNumber,
      participantSequence,
    });
    const studentAssets = studentAssetMap.get(student.id) || { photo: null, documents: [] };
    const formalPhotoUrl = resolveFormalPhotoUrl(studentAssets);
    const status = deriveExamCardOverviewStatus({
      eligibility,
      entries,
      hasActiveCard: Boolean(card),
    });

    accumulator.push({
      studentId: student.id,
      studentName: student.name,
      username: normalizeText(usernameMap.get(student.id) || '-') || '-',
      nis: student.nis || null,
      nisn: student.nisn || null,
      className: student.studentClass?.name || null,
      classId,
      classLevelLabel,
      classLevelNumber,
      participantSequence,
      participantNumber,
      formalPhotoUrl,
      entries,
      eligibility,
      status,
      card: card
        ? {
            id: card.id,
            generatedAt: card.generatedAt,
            payload: card.payload,
          }
        : null,
    });

    return accumulator;
  }, []);

  rows.sort((left, right) => {
    const classCompare = compareClassName(left.className, right.className);
    if (classCompare !== 0) return classCompare;
    const orderLeft = Number(left.participantSequence || Number.MAX_SAFE_INTEGER);
    const orderRight = Number(right.participantSequence || Number.MAX_SAFE_INTEGER);
    if (orderLeft !== orderRight) return orderLeft - orderRight;
    return left.studentName.localeCompare(right.studentName, 'id-ID');
  });

  return {
    academicYear,
    program: {
      code: normalizedProgramCode,
      label: normalizeText(programConfig?.displayLabel || programConfig?.shortLabel || normalizedProgramCode),
      baseTypeCode: normalizeText(programConfig?.baseTypeCode || '') || null,
      displayOrder: Number(programConfig?.displayOrder || 0) || 0,
    },
    semester,
    rows,
    summary: {
      totalStudents: rows.length,
      eligibleStudents: rows.filter((row) => row.eligibility.isEligible && row.entries.length > 0).length,
      blockedStudents: rows.filter((row) => !row.eligibility.isEligible).length,
      publishedCards: rows.filter((row) => Boolean(row.card)).length,
      financeExceptionStudents: rows.filter((row) => row.eligibility.financeExceptionApplied).length,
      statusCounts: {
        publishedActive: rows.filter((row) => row.status.code === 'PUBLISHED_ACTIVE').length,
        readyToGenerate: rows.filter((row) => row.status.code === 'READY_TO_GENERATE').length,
        warningAcademic: rows.filter((row) => row.eligibility.academicClearance.warningOnly).length,
        blockedKkm: rows.filter((row) => row.status.code === 'BLOCKED_KKM').length,
        blockedFinance: rows.filter((row) => row.status.code === 'BLOCKED_FINANCE').length,
        reviewRequired: rows.filter((row) => row.status.category === 'REVIEW_REQUIRED').length,
        blockedManual: rows.filter((row) => row.status.code === 'REVIEW_MANUAL_BLOCK').length,
        needsPlacementSync: rows.filter((row) => row.status.code === 'REVIEW_PLACEMENT_SYNC').length,
        staleCard: rows.filter((row) => row.status.code === 'REVIEW_STALE_CARD').length,
        needsDataSync: rows.filter((row) => row.status.code === 'REVIEW_DATA_SYNC').length,
      },
    },
  };
}

export const getHeadTuExamCardOverview = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number } | undefined;
  if (!user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  await assertHeadTuExamCardAccess(Number(user.id), { allowAdmin: true });
  const query = overviewQuerySchema.parse(req.query);
  const payload = await buildExamCardOverview(query);

  res.status(200).json(new ApiResponse(200, payload, 'Overview kartu ujian berhasil diambil'));
});

export const generateExamCards = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number } | undefined;
  if (!user?.id) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }

  const requester = await assertHeadTuExamCardAccess(Number(user.id), { allowAdmin: true });
  const body = generateCardsSchema.parse(req.body);
  const overview = await buildExamCardOverview(body);
  const principal = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, name: true },
  });

  if (!principal?.name) {
    throw new ApiError(400, 'Data kepala sekolah belum tersedia. Kartu ujian tidak bisa digenerate.');
  }

  const now = new Date();
  const issueLocation = normalizeText(body.issueLocation) || DEFAULT_ISSUE_LOCATION;
  const issueDate = body.issueDate ? new Date(body.issueDate) : now;
  const eligibleRows = overview.rows.filter((row) => row.eligibility.isEligible && row.entries.length > 0);
  const generatedRows = await Promise.all(
    eligibleRows.map(async (row) => {
      const verificationToken = buildShortExamCardVerificationToken();
      const verificationUrl = buildExamCardVerificationUrl(resolvePublicAppBaseUrl(req), verificationToken);
      const principalBarcodeDataUrl = await buildExamCardVerificationQrDataUrl(verificationUrl);

      const payload = buildExamCardPayload({
        req,
        academicYearId: overview.academicYear.id,
        academicYearName: overview.academicYear.name,
        programCode: overview.program.code,
        programBaseTypeCode: overview.program.baseTypeCode,
        programDisplayOrder: overview.program.displayOrder,
        programLabel: overview.program.label,
        semester: overview.semester,
        generatedAt: now,
        generatedById: requester.id,
        generatedByName: requester.name,
        issueLocation,
        issueDate,
        principalName: principal.name,
        principalBarcodeDataUrl,
        verificationToken,
        row,
      });

      return {
        row,
        payload,
        principalBarcodeDataUrl,
      };
    }),
  );

  await prisma.$transaction(async (tx) => {
    await tx.examGeneratedCard.updateMany({
      where: {
        academicYearId: overview.academicYear.id,
        programCode: overview.program.code,
        semester: overview.semester,
        status: ExamGeneratedCardStatus.ACTIVE,
      },
      data: {
        status: ExamGeneratedCardStatus.REVOKED,
        revokedAt: now,
        revokedReason: 'Menunggu sinkronisasi generate kartu ujian terbaru.',
      },
    });

    await Promise.all(
      generatedRows.map(({ row, payload, principalBarcodeDataUrl }) =>
        tx.examGeneratedCard.upsert({
          where: {
            academicYearId_programCode_semester_studentId: {
              academicYearId: overview.academicYear.id,
              programCode: overview.program.code,
              semester: overview.semester,
              studentId: row.studentId,
            },
          },
          update: {
            status: ExamGeneratedCardStatus.ACTIVE,
            generatedAt: now,
            generatedById: requester.id,
            revokedAt: null,
            revokedReason: null,
            principalName: principal.name,
            principalBarcodeDataUrl,
            headTuName: requester.name,
            schoolName: SCHOOL_NAME,
            headerTitle: EXAM_CARD_TITLE,
            headerSubtitle: `${overview.program.label} • Tahun Ajaran ${overview.academicYear.name}`,
            studentName: row.studentName,
            studentUsername: row.username,
            nis: row.nis,
            nisn: row.nisn,
            className: row.className,
            payload: payload as object,
          },
          create: {
            academicYearId: overview.academicYear.id,
            programCode: overview.program.code,
            semester: overview.semester,
            studentId: row.studentId,
            status: ExamGeneratedCardStatus.ACTIVE,
            generatedAt: now,
            generatedById: requester.id,
            principalName: principal.name,
            principalBarcodeDataUrl,
            headTuName: requester.name,
            schoolName: SCHOOL_NAME,
            headerTitle: EXAM_CARD_TITLE,
            headerSubtitle: `${overview.program.label} • Tahun Ajaran ${overview.academicYear.name}`,
            studentName: row.studentName,
            studentUsername: row.username,
            nis: row.nis,
            nisn: row.nisn,
            className: row.className,
            payload: payload as object,
          },
        }),
      ),
    );
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYearId: overview.academicYear.id,
        programCode: overview.program.code,
        semester: overview.semester,
        generatedAt: now,
        generatedCount: generatedRows.length,
        blockedCount: overview.rows.filter((row) => !row.eligibility.isEligible).length,
        skippedWithoutRoomCount: overview.rows.filter((row) => row.entries.length === 0).length,
      },
      'Kartu ujian berhasil digenerate',
    ),
  );
});

export const listMyGeneratedExamCards = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user as { id?: number; role?: string } | undefined;
  if (!user?.id || !user.role) {
    throw new ApiError(401, 'Tidak memiliki otorisasi.');
  }
  if (user.role !== 'STUDENT') {
    throw new ApiError(403, 'Kartu ujian digital hanya tersedia untuk akun siswa.');
  }

  const query = myCardsQuerySchema.parse(req.query);
  const programCode = query.programCode ? normalizeExamProgramCode(query.programCode) : '';
  if (query.programCode && !programCode) {
    throw new ApiError(400, 'programCode tidak valid.');
  }
  const effectiveAcademicYearId =
    query.academicYearId ||
    (
      await prisma.academicYear.findFirst({
        where: { isActive: true },
        select: { id: true },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      })
    )?.id ||
    undefined;

  const cards = await prisma.examGeneratedCard.findMany({
    where: {
      studentId: Number(user.id),
      status: ExamGeneratedCardStatus.ACTIVE,
      ...(effectiveAcademicYearId ? { academicYearId: effectiveAcademicYearId } : {}),
      ...(programCode ? { programCode } : {}),
    },
    orderBy: [{ generatedAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      academicYearId: true,
      programCode: true,
      semester: true,
      generatedAt: true,
      payload: true,
    },
  });

  res.status(200).json(new ApiResponse(200, { cards }, 'Kartu ujian digital berhasil diambil'));
});

export const verifyPublicExamCard = asyncHandler(async (req: Request, res: Response) => {
  const token = String(req.params.token || '').trim();
  if (!token) {
    throw new ApiError(404, 'Tautan verifikasi kartu ujian tidak ditemukan.');
  }

  let decoded: ExamCardVerificationTokenPayload | null = null;
  let card = await prisma.examGeneratedCard.findFirst({
    where: {
      status: ExamGeneratedCardStatus.ACTIVE,
      payload: {
        path: ['legality', 'verificationToken'],
        equals: token,
      },
    },
    orderBy: { generatedAt: 'desc' },
    select: {
      id: true,
      generatedAt: true,
      payload: true,
    },
  });

  if (!card) {
    decoded = verifyExamCardVerificationToken(token);
    card = await prisma.examGeneratedCard.findFirst({
      where: {
        studentId: decoded.studentId,
        academicYearId: decoded.academicYearId,
        programCode: decoded.programCode,
        semester: decoded.semester,
        status: ExamGeneratedCardStatus.ACTIVE,
      },
      orderBy: { generatedAt: 'desc' },
      select: {
        id: true,
        generatedAt: true,
        payload: true,
      },
    });

    if (!card || new Date(card.generatedAt).getTime() !== decoded.generatedAtMs) {
      throw new ApiError(404, 'Kartu ujian ini tidak lagi aktif atau tidak valid.');
    }
  }

  const payload = (card.payload || {}) as any;
  const primaryPlacement = payload?.placement || payload?.entries?.[0] || null;

  res.status(200).json(
    new ApiResponse(
      200,
      {
        valid: true,
        verifiedAt: new Date().toISOString(),
        participantNumber: payload?.participantNumber || decoded?.participantNumber || '-',
        cardId: card.id,
        snapshot: {
          title: payload?.cardTitle || EXAM_CARD_TITLE,
          examLabel: payload?.examTitle || payload?.programLabel || decoded?.programCode || '-',
          schoolName: payload?.institutionName || payload?.schoolName || SCHOOL_NAME,
          academicYearName: payload?.academicYearName || '-',
          student: {
            name: payload?.student?.name || '-',
            username: payload?.student?.username || '-',
            className: payload?.student?.className || '-',
            photoUrl: payload?.student?.photoUrl || null,
          },
          placement: {
            roomName: primaryPlacement?.roomName || '-',
            sessionLabel: primaryPlacement?.sessionLabel || null,
            seatLabel: primaryPlacement?.seatLabel || null,
            startTime: primaryPlacement?.startTime || null,
            endTime: primaryPlacement?.endTime || null,
          },
          issue: {
            signLabel: payload?.issue?.signLabel || null,
            date: payload?.issue?.date || null,
          },
          principal: {
            name: payload?.legality?.principalName || '-',
            title: payload?.legality?.principalTitle || 'Kepala Sekolah',
          },
        },
      },
      'Kartu ujian berhasil diverifikasi',
    ),
  );
});
