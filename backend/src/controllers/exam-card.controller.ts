import { ExamGeneratedCardStatus, Prisma, Semester } from '@prisma/client';
import { Request, Response } from 'express';
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
  listHistoricalStudentsByIdsForAcademicYear,
  listHistoricalStudentsForClass,
} from '../utils/studentAcademicHistory';

const SCHOOL_NAME = 'SMKS Karya Guna Bhakti 2';
const EXAM_CARD_TITLE = 'KARTU PESERTA';
const EXAM_CARD_INTERNAL_NOTE = 'Berkas digital yang sah secara internal';
const DEFAULT_ISSUE_LOCATION = 'Bekasi';

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

type ExamCardEntrySnapshot = {
  sittingId: number;
  roomName: string;
  sessionLabel: string | null;
  startTime: Date | null;
  endTime: Date | null;
  seatLabel: string | null;
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
  row: ExamCardOverviewRow;
}) {
  const headerTitle = EXAM_CARD_TITLE;
  const headerSubtitle = `${params.programLabel} • Tahun Ajaran ${params.academicYearName}`;
  const primaryEntry = resolvePrimaryEntry(params.row.entries);
  const issueDateLabel = formatIssueDateLabel(params.issueDate);

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

  const [academicYear, programConfig, sittings] = await Promise.all([
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
    }),
  ]);

  if (!academicYear) {
    throw new ApiError(404, 'Tahun ajaran tidak ditemukan.');
  }

  const semester = await resolveCardSemester({
    academicYearId: params.academicYearId,
    programCode: normalizedProgramCode,
    requestedSemester: params.semester,
    sittingSemesters: sittings.map((item) => item.semester || null),
  });

  const allStudentIds = Array.from(
    new Set(
      sittings.flatMap((sitting) =>
        (sitting.students || [])
          .map((item) => Number(item.studentId))
          .filter((studentId) => Number.isFinite(studentId) && studentId > 0),
      ),
    ),
  );

  const [historicalStudents, studentProfiles, generatedCards] = await Promise.all([
    listHistoricalStudentsByIdsForAcademicYear(allStudentIds, params.academicYearId),
    allStudentIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: allStudentIds },
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
        ...(allStudentIds.length > 0 ? { studentId: { in: allStudentIds } } : {}),
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
    students: historicalStudents,
  });

  const studentMap = new Map(historicalStudents.map((student) => [student.id, student]));
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

  const uniqueClassIds = Array.from(
    new Set(
      historicalStudents
        .map((student) => Number(student.studentClass?.id || 0))
        .filter((classId) => Number.isFinite(classId) && classId > 0),
    ),
  );
  const rosterOrderMap = new Map<number, Map<number, number>>();
  const rosterRows = await Promise.all(
    uniqueClassIds.map(async (classId) => ({
      classId,
      students: await listHistoricalStudentsForClass(classId, params.academicYearId),
    })),
  );
  rosterRows.forEach(({ classId, students }) => {
    const orderMap = new Map<number, number>();
    students.forEach((student, index) => {
      orderMap.set(student.id, index + 1);
    });
    rosterOrderMap.set(classId, orderMap);
  });

  sittings.forEach((sitting) => {
    const seatLabelByStudent = new Map<number, string | null>();
    (sitting.layout?.cells || []).forEach((cell) => {
      if (!cell.studentId) return;
      seatLabelByStudent.set(cell.studentId, normalizeText(cell.seatLabel) || null);
    });

    (sitting.students || []).forEach((item) => {
      const studentId = Number(item.studentId);
      if (!studentMap.has(studentId)) return;
      const current = entriesByStudent.get(studentId) || [];
      current.push({
        sittingId: sitting.id,
        roomName: sitting.roomName,
        sessionLabel: normalizeText(sitting.programSession?.label || sitting.sessionLabel) || null,
        startTime: sitting.startTime,
        endTime: sitting.endTime,
        seatLabel: seatLabelByStudent.get(studentId) || null,
      });
      entriesByStudent.set(studentId, current);
    });
  });

  const rows = historicalStudents.reduce<ExamCardOverviewRow[]>((accumulator, student) => {
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
    const participantSequence = classId ? rosterOrderMap.get(classId)?.get(student.id) || null : null;
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
    const classCompare = String(left.className || '').localeCompare(String(right.className || ''), 'id-ID');
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
      const qrPayload = JSON.stringify({
        type: 'EXAM_CARD',
        school: SCHOOL_NAME,
        academicYearId: overview.academicYear.id,
        academicYearName: overview.academicYear.name,
        programCode: overview.program.code,
        semester: overview.semester,
        studentId: row.studentId,
        principalId: principal.id,
        principalName: principal.name,
        generatedAt: now.toISOString(),
      });

      const principalBarcodeDataUrl = await QRCode.toDataURL(qrPayload, {
        width: 116,
        margin: 1,
      });

      const payload = buildExamCardPayload({
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

  const academicYearId = req.query.academicYearId ? Number(req.query.academicYearId) : null;
  if (academicYearId !== null && (!Number.isFinite(academicYearId) || academicYearId <= 0)) {
    throw new ApiError(400, 'academicYearId tidak valid.');
  }

  const cards = await prisma.examGeneratedCard.findMany({
    where: {
      studentId: Number(user.id),
      status: ExamGeneratedCardStatus.ACTIVE,
      ...(academicYearId ? { academicYearId } : {}),
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
