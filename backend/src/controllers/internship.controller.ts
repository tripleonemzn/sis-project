import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { InternshipStatus } from '@prisma/client';
import { AuthRequest } from '../types';
import { resolvePublicAppBaseUrl } from '../utils/publicAppBaseUrl';
import {
  listHistoricalStudentsByIds,
  resolveHistoricalStudentScope,
} from '../utils/studentAcademicHistory';
import {
  resolveStandardSchoolDocumentHeaderSnapshot,
  type StandardSchoolDocumentHeaderSnapshot,
} from '../utils/standardSchoolDocumentHeader';

function hasHumasDuty(duties?: string[] | null) {
  if (!Array.isArray(duties)) return false;
  return duties.some((item) => {
    const duty = String(item || '').trim().toUpperCase();
    return duty === 'WAKASEK_HUMAS' || duty === 'SEKRETARIS_HUMAS';
  });
}

const DEFAULT_PKL_ELIGIBLE_GRADES = ['XI'];

function normalizeEligiblePklGrades(raw?: string | null): string[] {
  const parsed = String(raw || '')
    .split(',')
    .map((item) => String(item || '').trim().toUpperCase())
    .filter((item) => item === 'X' || item === 'XI' || item === 'XII');
  return parsed.length > 0 ? parsed : DEFAULT_PKL_ELIGIBLE_GRADES;
}

function isEligibleForPklByClass(className: string, rawEligibleGrades?: string | null): boolean {
  const normalizedClass = String(className || '').trim().toUpperCase();
  if (!normalizedClass) return false;
  const eligibleGrades = normalizeEligiblePklGrades(rawEligibleGrades);
  return eligibleGrades.some((grade) => normalizedClass === grade || normalizedClass.startsWith(`${grade} `));
}

async function assertCanManageInternshipExaminer(userId: number) {
  const actor = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: {
      id: true,
      role: true,
      additionalDuties: true,
    },
  });

  if (!actor) {
    throw new ApiError(401, 'Pengguna tidak ditemukan.');
  }

  if (actor.role === 'ADMIN') {
    return;
  }

  if (actor.role === 'TEACHER' && hasHumasDuty(actor.additionalDuties)) {
    return;
  }

  throw new ApiError(403, 'Hanya Wakasek/sekretaris Humas yang boleh mengelola penguji sidang PKL.');
}

function mergeHistoricalStudentClass(currentClass: any, historicalClass: any) {
  if (!historicalClass) return currentClass ?? null;
  return {
    ...(currentClass || {}),
    id: historicalClass.id,
    name: historicalClass.name,
    level: historicalClass.level ?? currentClass?.level ?? null,
    academicYearId: historicalClass.academicYearId,
    major: historicalClass.major ?? currentClass?.major,
    teacher: historicalClass.teacher ?? currentClass?.teacher,
  };
}

async function hydrateInternshipsWithHistoricalStudentClass<
  T extends { studentId?: number | null; academicYearId?: number | null; student?: any | null }
>(rows: T[]): Promise<T[]> {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const groupedStudentIds = new Map<number, Set<number>>();
  rows.forEach((row) => {
    const academicYearId = Number(row.academicYearId || 0);
    const studentId = Number(row.studentId || 0);
    if (!Number.isFinite(academicYearId) || academicYearId <= 0) return;
    if (!Number.isFinite(studentId) || studentId <= 0) return;
    const bucket = groupedStudentIds.get(academicYearId) || new Set<number>();
    bucket.add(studentId);
    groupedStudentIds.set(academicYearId, bucket);
  });

  const historicalStudentMap = new Map<string, any>();
  for (const [academicYearId, studentIds] of groupedStudentIds.entries()) {
    const snapshots = await listHistoricalStudentsByIds(Array.from(studentIds), academicYearId);
    snapshots.forEach((snapshot) => {
      historicalStudentMap.set(`${academicYearId}:${snapshot.id}`, snapshot);
    });
  }

  return rows.map((row) => {
    if (!row?.student) return row;
    const academicYearId = Number(row.academicYearId || 0);
    const studentId = Number(row.studentId || 0);
    const snapshot = historicalStudentMap.get(`${academicYearId}:${studentId}`);
    if (!snapshot) return row;

    return {
      ...row,
      student: {
        ...row.student,
        studentClass: mergeHistoricalStudentClass(row.student.studentClass, snapshot.studentClass),
      },
    };
  });
}

async function hydrateInternshipWithHistoricalStudentClass<
  T extends { studentId?: number | null; academicYearId?: number | null; student?: any | null }
>(row: T | null): Promise<T | null> {
  if (!row) return row;
  const [normalized] = await hydrateInternshipsWithHistoricalStudentClass([row]);
  return normalized || row;
}

export const getMyInternship = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = Number(req.user?.id);
  
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    include: { studentClass: true }
  });

  if (!student) throw new ApiError(404, 'Data siswa tidak ditemukan');

  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true }
  });

  const className = student.studentClass?.name || '';
  const isEligible = isEligibleForPklByClass(className, activeAcademicYear?.pklEligibleGrades);

  const internship = await prisma.internship.findFirst({
    where: { studentId },
    orderBy: { createdAt: 'desc' },
    include: {
      student: {
        include: {
          studentClass: {
            include: {
              major: true
            }
          }
        }
      },
      teacher: true,
      examiner: true,
      academicYear: true
    }
  });
  
  if (!internship) {
    return res.status(200).json(new ApiResponse(200, { internship: null, isEligible }, 'Data PKL tidak ditemukan'));
  }

  // Fetch colleagues (same company, same academic year, and approved/valid status)
  const colleagues = await prisma.internship.findMany({
    where: {
      companyName: internship.companyName,
      academicYearId: internship.academicYearId,
      status: { 
        in: [
          'WAITING_ACCEPTANCE_LETTER', 
          'APPROVED', 
          'ACTIVE', 
          'REPORT_SUBMITTED', 
          'DEFENSE_SCHEDULED', 
          'DEFENSE_COMPLETED', 
          'COMPLETED'
        ] 
      }
    },
    include: {
      student: {
        include: {
          studentClass: true
        }
      }
    },
    orderBy: {
      student: {
        name: 'asc'
      }
    }
  });

  // Fetch officials for report
  const majorId = student.studentClass?.majorId;
  let headOfMajor = null;
  if (majorId) {
    const major = await prisma.major.findUnique({
      where: { id: majorId },
      include: { heads: true }
    });
    if (major && major.heads.length > 0) {
      headOfMajor = major.heads[0];
    }
  }

  const principal = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' }
  });

  const wakasekHumas = await prisma.user.findFirst({
    where: { additionalDuties: { has: 'WAKASEK_HUMAS' } }
  });

  const normalizedInternship = await hydrateInternshipWithHistoricalStudentClass(internship);
  const normalizedColleagues = await hydrateInternshipsWithHistoricalStudentClass(colleagues);

  res.status(200).json(new ApiResponse(200, { 
    internship: normalizedInternship,
    isEligible, 
    colleagues: normalizedColleagues,
    officials: {
      headOfMajor,
      principal,
      wakasekHumas,
      activeAcademicYear
    }
  }, 'Data PKL berhasil diambil'));
});

export const applyInternship = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { companyName, companyAddress, mentorName, mentorPhone, mentorEmail, companyLatitude, companyLongitude, startDate, endDate } = req.body;
  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  
  if (!activeYear) throw new ApiError(400, 'Tahun ajaran aktif tidak ditemukan');

  const internship = await prisma.internship.create({
    data: {
      studentId: Number(req.user!.id),
      academicYearId: activeYear.id,
      companyName,
      companyAddress,
      mentorName,
      mentorPhone,
      mentorEmail,
      companyLatitude,
      companyLongitude,
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      status: 'PROPOSED'
    }
  });

  res.status(201).json(new ApiResponse(201, internship, 'Pengajuan PKL berhasil'));
});

export const getInternshipDetail = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const internship = await prisma.internship.findUnique({
    where: { id: Number(id) },
    include: {
      student: { include: { studentClass: true } },
      teacher: true,
      examiner: true,
      academicYear: true
    }
  });

  if (!internship) throw new ApiError(404, 'Data PKL tidak ditemukan');

  // Fetch colleagues (same company, same academic year)
  const colleagues = await prisma.internship.findMany({
    where: {
      companyName: internship.companyName,
      academicYearId: internship.academicYearId,
      status: {
        in: [
          'PROPOSED',
          'WAITING_ACCEPTANCE_LETTER',
          'APPROVED',
          'ACTIVE',
          'REPORT_SUBMITTED',
          'DEFENSE_SCHEDULED',
          'DEFENSE_COMPLETED',
          'COMPLETED'
        ]
      }
    },
    include: {
      student: {
        include: {
          studentClass: true
        }
      }
    },
    orderBy: {
      student: {
        name: 'asc'
      }
    }
  });

  const normalizedInternship = await hydrateInternshipWithHistoricalStudentClass(internship);
  const normalizedColleagues = await hydrateInternshipsWithHistoricalStudentClass(colleagues);

  res.status(200).json(
    new ApiResponse(
      200,
      { ...normalizedInternship, colleagues: normalizedColleagues },
      'Detail PKL berhasil diambil',
    ),
  );
});

export const getAllInternships = asyncHandler(async (req: Request, res: Response) => {
  const { status, classId, page = 1, limit = 10, search, academicYearId } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;
  const academicYearIdNum = academicYearId ? Number(academicYearId) : null;
  const classIdNum = classId ? Number(classId) : null;
  const searchText = String(search || '').trim();

  const where: any = {};
  const historicalStudentScope =
    academicYearIdNum && (classIdNum || searchText)
      ? await resolveHistoricalStudentScope({
          academicYearId: academicYearIdNum,
          classId: classIdNum,
          search: searchText || null,
        })
      : null;
  
  if (status) {
    const statuses = String(status).split(',');
    where.status = { in: statuses };
  }
  if (classIdNum) {
    if (historicalStudentScope?.academicYearId) {
      where.studentId = {
        in: historicalStudentScope.studentIds.length > 0 ? historicalStudentScope.studentIds : [-1],
      };
    } else {
      where.student = { classId: classIdNum };
    }
  }
  if (academicYearIdNum) where.academicYearId = academicYearIdNum;
  if (searchText) {
    if (historicalStudentScope?.academicYearId) {
      where.studentId = {
        in: historicalStudentScope.studentIds.length > 0 ? historicalStudentScope.studentIds : [-1],
      };
    } else {
      where.student = {
        ...where.student,
        OR: [
          { name: { contains: searchText, mode: 'insensitive' } },
          { nisn: { contains: searchText, mode: 'insensitive' } },
          { studentClass: { name: { contains: searchText, mode: 'insensitive' } } },
        ]
      };
    }
  }

  const [total, internships] = await Promise.all([
    prisma.internship.count({ where }),
    prisma.internship.findMany({
      where,
      include: {
        student: { include: { studentClass: true } },
        teacher: true,
        examiner: true,
        academicYear: true
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limitNum
    })
  ]);

  const normalizedInternships = await hydrateInternshipsWithHistoricalStudentClass(internships);

  res.status(200).json(new ApiResponse(200, {
    internships: normalizedInternships,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Data PKL berhasil diambil'));
});

export const uploadReport = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { reportUrl } = req.body;

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: { reportUrl }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Laporan berhasil diupload'));
});

export const uploadAcceptanceLetter = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { acceptanceLetterUrl } = req.body;

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: { acceptanceLetterUrl }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Surat balasan berhasil diupload'));
});

export const assignExaminer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { examinerId } = req.body;
  const actorId = Number(req.user?.id);

  if (!actorId) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  await assertCanManageInternshipExaminer(actorId);

  const normalizedExaminerId = Number(examinerId);
  if (!Number.isInteger(normalizedExaminerId) || normalizedExaminerId <= 0) {
    throw new ApiError(400, 'Penguji tidak valid.');
  }

  const examiner = await prisma.user.findUnique({
    where: { id: normalizedExaminerId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!examiner || examiner.role !== 'TEACHER') {
    throw new ApiError(400, 'Penguji PKL harus berasal dari akun guru yang ditunjuk Wakasek Humas.');
  }

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: { examinerId: normalizedExaminerId }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Penguji berhasil ditugaskan'));
});

export const scheduleDefense = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { defenseDate, defenseRoom } = req.body;
  const actorId = Number(req.user?.id);

  if (!actorId) {
    throw new ApiError(401, 'Sesi login tidak valid.');
  }

  await assertCanManageInternshipExaminer(actorId);

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: { 
      defenseDate: new Date(defenseDate),
      defenseRoom
    }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Jadwal sidang berhasil disimpan'));
});

export const gradeDefense = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { scorePresentation, scoreUnderstanding, scoreRelevance, scoreSystematics, defenseNotes } = req.body;

  const defenseScore = (scorePresentation + scoreUnderstanding + scoreRelevance + scoreSystematics) / 4;
  
  // Recalculate final grade if industry score exists
  const currentInternship = await prisma.internship.findUnique({ where: { id: Number(id) } });
  let finalGrade = null;
  if (currentInternship?.industryScore) {
    finalGrade = (currentInternship.industryScore * 0.7) + (defenseScore * 0.3);
  }

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: {
      scorePresentation,
      scoreUnderstanding,
      scoreRelevance,
      scoreSystematics,
      defenseScore,
      defenseNotes,
      finalGrade
    }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Nilai sidang berhasil disimpan'));
});

export const getExaminerInternships = asyncHandler(async (req: AuthRequest, res: Response) => {
  const internships = await prisma.internship.findMany({
    where: { examinerId: Number(req.user!.id) },
    include: {
      student: { include: { studentClass: true } },
      academicYear: true
    }
  });

  const normalizedInternships = await hydrateInternshipsWithHistoricalStudentClass(internships);
  res.status(200).json(new ApiResponse(200, normalizedInternships, 'Data PKL (Penguji) berhasil diambil'));
});

export const getAssignedInternships = asyncHandler(async (req: AuthRequest, res: Response) => {
  const internships = await prisma.internship.findMany({
    where: { teacherId: Number(req.user!.id) },
    include: {
      student: { include: { studentClass: true } },
      academicYear: true
    }
  });

  const normalizedInternships = await hydrateInternshipsWithHistoricalStudentClass(internships);
  res.status(200).json(new ApiResponse(200, normalizedInternships, 'Data PKL (Pembimbing) berhasil diambil'));
});

export const getJournals = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const journals = await prisma.internshipJournal.findMany({
    where: { internshipId: Number(id) },
    orderBy: { date: 'desc' }
  });

  res.status(200).json(new ApiResponse(200, journals, 'Jurnal PKL berhasil diambil'));
});

export const createJournal = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { date, activity, imageUrl } = req.body;

  const journal = await prisma.internshipJournal.create({
    data: {
      internshipId: Number(id),
      date: new Date(date),
      activity,
      imageUrl,
      status: 'VERIFIED'
    }
  });

  res.status(201).json(new ApiResponse(201, journal, 'Jurnal berhasil dibuat'));
});

export const approveJournal = asyncHandler(async (req: Request, res: Response) => {
  const { journalId } = req.params; // Note: route uses journalId? Check routes.
  const { status, feedback } = req.body;

  // Assuming journalId is passed, need to check route param name. Usually :id or :journalId
  // internship.routes.ts line 57: /internships/journal/:journalId/approve
  const journal = await prisma.internshipJournal.update({
    where: { id: Number(journalId) },
    data: { status, feedback }
  });

  res.status(200).json(new ApiResponse(200, journal, 'Status jurnal berhasil diupdate'));
});

export const getAttendances = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const attendances = await prisma.internshipAttendance.findMany({
    where: { internshipId: Number(id) },
    orderBy: { date: 'desc' }
  });

  res.status(200).json(new ApiResponse(200, attendances, 'Absensi berhasil diambil'));
});

export const createAttendance = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { date, status, note, proofUrl } = req.body;

  const attendance = await prisma.internshipAttendance.create({
    data: {
      internshipId: Number(id),
      date: new Date(date),
      status,
      note,
      imageUrl: proofUrl
    }
  });

  res.status(201).json(new ApiResponse(201, attendance, 'Absensi berhasil dicatat'));
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    status, 
    teacherId, 
    mentorName, 
    mentorPhone, 
    companyLatitude, 
    companyLongitude,
    rejectionReason 
  } = req.body;

  const updateData: any = { status };

  if (status === 'APPROVED') {
    if (teacherId !== undefined) updateData.teacherId = teacherId ? Number(teacherId) : null;
    if (mentorName !== undefined) updateData.mentorName = mentorName;
    if (mentorPhone !== undefined) updateData.mentorPhone = mentorPhone;
    if (companyLatitude !== undefined) updateData.companyLatitude = companyLatitude;
    if (companyLongitude !== undefined) updateData.companyLongitude = companyLongitude;
  } else if (status === 'REJECTED') {
    if (rejectionReason !== undefined) updateData.rejectionReason = rejectionReason;
  }

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: updateData
  });

  res.status(200).json(new ApiResponse(200, internship, 'Status PKL berhasil diupdate'));
});

export const deleteInternship = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.internship.delete({
    where: { id: Number(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Data PKL berhasil dihapus'));
});

export const updateInternship = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { 
    companyName, 
    companyAddress, 
    mentorName, 
    mentorPhone, 
    mentorEmail, 
    startDate, 
    endDate,
    companyLatitude,
    companyLongitude,
    reportTitle,
    schoolApprovalDate,
    lastActiveTab
  } = req.body;

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: {
      companyName,
      companyAddress,
      mentorName,
      mentorPhone,
      mentorEmail,
      companyLatitude,
      companyLongitude,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      reportTitle,
      schoolApprovalDate,
      lastActiveTab
    }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Data PKL berhasil diupdate'));
});

export const updateIndustryGrade = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { industryScore } = req.body;

  const currentInternship = await prisma.internship.findUnique({ where: { id: Number(id) } });
  const defenseScore = currentInternship?.defenseScore || 0;
  const finalGrade = (industryScore * 0.7) + (defenseScore * 0.3);

  const internship = await prisma.internship.update({
    where: { id: Number(id) },
    data: { industryScore, finalGrade }
  });

  res.status(200).json(new ApiResponse(200, internship, 'Nilai industri berhasil diupdate'));
});

const escapeLetterHtml = (value?: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const PKL_LETTER_TOKEN_SECRET =
  process.env.PKL_LETTER_TOKEN_SECRET || process.env.JWT_SECRET || 'sis-pkl-letter-verification-v1';

const normalizePklTokenText = (value?: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

const formatPklTokenDateKey = (value?: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return '00000000';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const signPklLetterPayload = (payload: string) =>
  crypto.createHmac('sha256', PKL_LETTER_TOKEN_SECRET).update(payload).digest('base64url').slice(0, 10);

const safeEqualTokenPart = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const buildPklLetterVerificationToken = (internships: any[], config: any) => {
  const ids = internships
    .map((item) => Number(item?.id))
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b);
  const primaryId = ids[0] || 0;
  const count = Math.max(ids.length, 1);
  const dateKey = formatPklTokenDateKey(config?.date);
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      [
        'pkl-letter-v1',
        ids.join(','),
        normalizePklTokenText(config?.letterNumber),
        normalizePklTokenText(config?.companyName || internships[0]?.companyName),
        normalizePklTokenText(config?.date),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 8);
  const payload = `${primaryId}.${count}.${dateKey}.${fingerprint}`;
  return `${primaryId}-${count}-${dateKey}-${fingerprint}-${signPklLetterPayload(payload)}`;
};

const parsePklLetterVerificationToken = (token?: string) => {
  const match = String(token || '').match(/^(\d+)-(\d+)-(\d{8})-([a-f0-9]{8})-([A-Za-z0-9_-]{10})$/);
  if (!match) return null;
  const [, primaryId, count, dateKey, fingerprint, signature] = match;
  const payload = `${primaryId}.${count}.${dateKey}.${fingerprint}`;
  const expectedSignature = signPklLetterPayload(payload);
  if (!safeEqualTokenPart(signature, expectedSignature)) return null;
  return {
    primaryId: Number(primaryId),
    count: Number(count),
    dateKey,
  };
};

const formatPklVerificationDateLabel = (dateKey: string) => {
  if (!/^\d{8}$/.test(dateKey) || dateKey === '00000000') return '-';
  const date = new Date(Number(dateKey.slice(0, 4)), Number(dateKey.slice(4, 6)) - 1, Number(dateKey.slice(6, 8)));
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const buildStandardLetterHeaderHtml = (header: StandardSchoolDocumentHeaderSnapshot) => {
  const competencyLine = Array.from(
    new Set((header.competencyNames || []).map((item) => String(item || '').trim()).filter(Boolean)),
  )
    .map(escapeLetterHtml)
    .join(' &nbsp; | &nbsp; ');
  const campusesHtml = (header.campuses || [])
    .map(
      (campus) =>
        `<p style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 10px;">${escapeLetterHtml(campus.label)} : ${escapeLetterHtml(campus.address)}</p>`,
    )
    .join('');

  return `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0 0 5px 0; margin: 0 0 4px 0;">
          <div style="width: 95px; display: flex; justify-content: center; align-items: center;">
            <img src="${escapeLetterHtml(header.foundationLogoPath)}" alt="Logo Yayasan" style="width: 88px; height: auto; object-fit: contain;" />
          </div>
          <div style="text-align: center; flex: 1; padding: 0 10px; line-height: 1.15;">
            <h3 style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 14px; font-weight: bold; letter-spacing: 0.3px; text-transform: uppercase;">${escapeLetterHtml(header.foundationName)}</h3>
            <h2 style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 14px; font-weight: bold; text-transform: uppercase;">${escapeLetterHtml(header.schoolFormalName)}</h2>
            <p style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 12px; font-weight: normal;">${competencyLine}</p>
            <p style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 12px;">NSS : ${escapeLetterHtml(header.nss)} &nbsp; | &nbsp; NPSN : ${escapeLetterHtml(header.npsn)}</p>
            <p style="margin: 2px 0 0; font-family: 'Times New Roman', Times, serif; font-size: 14px; font-weight: bold; text-transform: uppercase;">${escapeLetterHtml(header.accreditationLabel)}</p>
            ${campusesHtml}
            <p style="margin: 0; font-family: 'Times New Roman', Times, serif; font-size: 10px;">Email : ${escapeLetterHtml(header.email)} &nbsp; | &nbsp; Website : ${escapeLetterHtml(header.website)}</p>
          </div>
          <div style="width: 95px; display: flex; justify-content: center; align-items: center;">
            <img src="${escapeLetterHtml(header.schoolLogoPath)}" alt="Logo Sekolah" style="width: 88px; height: auto; object-fit: contain;" />
          </div>
        </div>
        <div style="margin-top: 4px; border-top: 1px solid #000;"></div>
        <div style="margin-top: 2px; margin-bottom: 15px; border-top: 2px solid #000;"></div>
  `;
};

// Helper function to generate letter HTML
const generateLetterHTML = async (
  internships: any[],
  config: any,
  principal: any,
  documentHeader: StandardSchoolDocumentHeaderSnapshot,
  req: Request,
) => {
  const { letterNumber, attachment, subject, date, openingText, closingText, signatureSpace, useBarcode, contactPersons } = config;
  
  // Use first internship for company details
  const internship = internships[0];
  
  // Prioritize dates from config (if provided by user in modal)
  const effectiveStartDate = config.startDate || internship.startDate;
  const effectiveEndDate = config.endDate || internship.endDate;
  const effectiveCompanyName = config.companyName || internship.companyName;
  const effectiveCompanyAddress = config.companyAddress || internship.companyAddress;
  
  const startDate = effectiveStartDate ? new Date(effectiveStartDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';
  const endDate = effectiveEndDate ? new Date(effectiveEndDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

  // Format date
  const formattedDate = new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const principalName = principal?.name || 'H. IYAN RASTIYAN, S.Pd., M.Pd';
  const principalNuptk = principal?.nuptk || '-';
  const verificationToken = buildPklLetterVerificationToken(internships, config);
  const verificationUrl = `${resolvePublicAppBaseUrl(req)}/v/pkl/${verificationToken}`;
  const verificationQrDataUrl = useBarcode
    ? await QRCode.toDataURL(verificationUrl, { width: 128, margin: 1 })
    : '';

  return `
    <style>
      @page { size: 215mm 330mm; margin: 1cm; }
      body { font-family: 'Times New Roman', serif; margin: 0; }
      .page-wrapper {
        padding: 0;
        min-height: 320mm;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
      }
      .content-area {
        margin-left: 40px;
        margin-right: 40px;
        font-family: 'Times New Roman', Times, serif;
        font-size: 14px;
      }
    </style>
    <div class="page-wrapper" style="font-family: 'Times New Roman', serif; max-width: 100%; margin: 0 auto; line-height: 1.15;">
      ${buildStandardLetterHeaderHtml(documentHeader)}
      
      <div class="content-wrapper" style="padding-left: 64px; padding-right: 64px;">
        <div class="content-area" style="line-height: 1.2; margin-left: 0; margin-right: 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
          <div>
            <table>
              <tr><td style="width: 110px;">Nomor</td><td>: ${letterNumber}</td></tr>
              <tr><td>Lampiran</td><td>: ${attachment}</td></tr>
              <tr><td>Perihal</td><td>: <strong style="text-decoration: underline;">${subject}</strong></td></tr>
            </table>
          </div>
          <div style="text-align: right;">
            Bekasi, ${formattedDate}
          </div>
        </div>

        <div style="margin-left: 110px;">
          <div style="margin-bottom: 20px;">
            Kepada Yth,<br/>
            <strong style="text-transform: uppercase;">Pimpinan / HRD ${effectiveCompanyName}</strong><br/>
            ${effectiveCompanyAddress || 'Di Tempat'}
          </div>

          <div style="margin-bottom: 10px; text-align: justify;">
            ${openingText}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
            <thead>
              <tr style="background-color: #f3f4f6;">
                <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 40px;">No</th>
                <th style="border: 1px solid #000; padding: 8px; text-align: left;">Nama Siswa</th>
                <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 120px;">NIS</th>
                <th style="border: 1px solid #000; padding: 8px; text-align: center; width: 120px;">Kelas</th>
              </tr>
            </thead>
            <tbody>
              ${internships.map((item, index) => {
                return `
                  <tr>
                    <td style="border: 1px solid #000; padding: 8px; text-align: center;">${index + 1}</td>
                    <td style="border: 1px solid #000; padding: 8px; font-weight: bold; text-transform: uppercase;">${item.student.name}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.student.nis || '-'}</td>
                    <td style="border: 1px solid #000; padding: 8px; text-align: center;">${item.student.studentClass?.name || '-'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <p style="margin-bottom: 20px;">
            <strong>Rencana Pelaksanaan PKL: ${startDate} s.d. ${endDate}</strong>
          </p>

          <div style="margin-bottom: 40px; text-align: justify;">
            ${closingText}
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; page-break-inside: avoid;">
          <div style="text-align: left; width: 250px;">
            <p style="margin-bottom: 0;">Hormat Kami,</p>
            <p style="margin-top: 0; margin-bottom: 0;">Kepala Sekolah,</p>
            <div style="${useBarcode ? 'margin: 10px 0;' : `height: ${signatureSpace * 20}px;`} display: flex; align-items: center; justify-content: flex-start;">
              ${useBarcode ? `<img src="${verificationQrDataUrl}" alt="QR Verifikasi Surat PKL" style="width: 100px; height: 100px;" />` : ''}
            </div>
            ${useBarcode ? `<div style="max-width: 220px; margin: -6px 0 8px 0; color: #475569; font-size: 8px; font-style: italic; line-height: 1.2; word-break: break-all;">Verifikasi: ${escapeLetterHtml(verificationUrl)}</div>` : ''}
            <p style="font-weight: bold; text-decoration: underline; margin-bottom: 0;">${principalName}</p>
            <p style="margin-top: 0;">NUPTK. ${principalNuptk}</p>
          </div>
        </div>
      </div>
    </div>

    ${contactPersons && contactPersons.length > 0 ? `
    <div style="margin-top: auto; border-top: 1px solid #ccc; padding-top: 10px; font-size: 12px; page-break-inside: avoid; padding-left: 64px; padding-right: 64px;">
      <strong style="text-decoration: underline;">Contact Person:</strong>
      <div style="display: flex; flex-wrap: wrap; margin-top: 5px; gap: 40px;">
        ${contactPersons.map((cp: any) => `
          <div>
            <div style="font-weight: bold;">${cp.name}</div>
            <div>${cp.phone}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}
  </div>
  `;
};

export const printGroupLetter = asyncHandler(async (req: Request, res: Response) => {
  const { ids, ...config } = req.body;
  
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    throw new ApiError(400, 'Tidak ada data siswa yang dipilih');
  }

  const internships = await prisma.internship.findMany({
    where: { id: { in: ids.map(Number) } },
    include: {
      student: { include: { studentClass: true } }
    },
    orderBy: [
      { student: { studentClass: { name: 'asc' } } },
      { student: { name: 'asc' } }
    ]
  });
  const normalizedInternships = await hydrateInternshipsWithHistoricalStudentClass(internships);

  // Group by company name
  const groupedInternships: { [key: string]: any[] } = {};
  normalizedInternships.forEach(internship => {
    const key = internship.companyName.trim().toLowerCase();
    if (!groupedInternships[key]) {
      groupedInternships[key] = [];
    }
    groupedInternships[key].push(internship);
  });

  // Get active principal
  const principal = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' },
    select: { name: true, nuptk: true }
  });
  const documentHeader = await resolveStandardSchoolDocumentHeaderSnapshot();

  const letterParts: string[] = [];
  for (const group of Object.values(groupedInternships)) {
    letterParts.push(await generateLetterHTML(group, config, principal, documentHeader, req));
  }
  const lettersHtml = letterParts.join('<div style="page-break-before: always;"></div>');

  res.status(200).json(new ApiResponse(200, { html: lettersHtml }, 'Surat kelompok berhasil digenerate'));
});

export const getPrintLetterHtml = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const config = req.body;

  const internship = await prisma.internship.findUnique({
    where: { id: Number(id) },
    include: {
      student: { include: { studentClass: true } }
    }
  });

  if (!internship) throw new ApiError(404, 'Data PKL tidak ditemukan');
  const normalizedInternship = await hydrateInternshipWithHistoricalStudentClass(internship);

  // Parse contact persons if string
  let parsedConfig = { ...config };
  if (typeof config.contactPersons === 'string') {
    try {
      parsedConfig.contactPersons = JSON.parse(config.contactPersons);
    } catch (e) {
      parsedConfig.contactPersons = [];
    }
  }

  // Get active principal
  const principal = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' },
    select: { name: true, nuptk: true }
  });
  const documentHeader = await resolveStandardSchoolDocumentHeaderSnapshot();

  const html = await generateLetterHTML([normalizedInternship], parsedConfig, principal, documentHeader, req);

  res.status(200).json(new ApiResponse(200, { html }, 'HTML surat berhasil diambil'));
});

export const verifyPublicPklLetter = asyncHandler(async (req: Request, res: Response) => {
  const parsedToken = parsePklLetterVerificationToken(req.params.token);
  if (!parsedToken || !parsedToken.primaryId) {
    throw new ApiError(404, 'Tautan verifikasi surat PKL tidak valid.');
  }

  const internship = await prisma.internship.findUnique({
    where: { id: parsedToken.primaryId },
    include: {
      student: {
        select: {
          name: true,
          nis: true,
          studentClass: { select: { name: true } },
        },
      },
      academicYear: {
        select: { name: true },
      },
    },
  });

  if (!internship) {
    throw new ApiError(404, 'Data surat PKL tidak ditemukan.');
  }

  const normalizedInternship = await hydrateInternshipWithHistoricalStudentClass(internship);

  res.status(200).json(new ApiResponse(200, {
    valid: true,
    documentType: 'Surat Permohonan Praktik Kerja Lapangan (PKL)',
    token: req.params.token,
    verifiedAt: new Date().toISOString(),
    issuedDate: formatPklVerificationDateLabel(parsedToken.dateKey),
    participantCount: parsedToken.count,
    companyName: normalizedInternship!.companyName,
    academicYearName: normalizedInternship!.academicYear?.name || '-',
    student: {
      name: normalizedInternship!.student?.name || '-',
      nis: normalizedInternship!.student?.nis || '-',
      className: normalizedInternship!.student?.studentClass?.name || '-',
    },
  }, 'Verifikasi surat PKL berhasil.'));
});

export const getPublicPklLetterQr = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    throw new ApiError(400, 'ID surat PKL tidak valid.');
  }

  const internship = await prisma.internship.findUnique({
    where: { id },
    select: {
      id: true,
      companyName: true,
    },
  });

  if (!internship) {
    throw new ApiError(404, 'Data PKL tidak ditemukan.');
  }

  const token = buildPklLetterVerificationToken([internship], {
    date: req.query.date,
    letterNumber: req.query.letterNumber,
    companyName: req.query.companyName || internship.companyName,
  });
  const verificationUrl = `${resolvePublicAppBaseUrl(req)}/v/pkl/${token}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { width: 128, margin: 1 });

  res.status(200).json(new ApiResponse(200, {
    verificationUrl,
    qrDataUrl,
  }, 'QR verifikasi surat PKL berhasil dibuat.'));
});


// Magic Link Functions

export const generateAccessCode = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { mentorEmail } = req.body;

  const internship = await prisma.internship.findUnique({
    where: { id: Number(id) }
  });

  if (!internship) {
    throw new ApiError(404, 'Data PKL tidak ditemukan');
  }

  // Generate 32 char hex token
  const accessCode = crypto.randomBytes(32).toString('hex');
  // Set expiration to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const updated = await prisma.internship.update({
    where: { id: Number(id) },
    data: {
      accessCode,
      accessCodeExpiresAt: expiresAt,
      mentorEmail: mentorEmail || internship.mentorEmail
    }
  });

  res.status(200).json(new ApiResponse(200, { 
    accessCode,
    expiresAt,
    mentorEmail: updated.mentorEmail
  }, 'Link akses berhasil dibuat'));
});

export const verifyAccessCode = asyncHandler(async (req: Request, res: Response) => {
  const { accessCode } = req.params;

  const internship = await prisma.internship.findUnique({
    where: { accessCode },
    include: {
      student: {
        select: {
          name: true,
          nis: true,
          studentClass: { select: { name: true } }
        }
      }
    }
  });

  if (!internship) {
    throw new ApiError(404, 'Link tidak valid atau kadaluarsa');
  }

  if (internship.accessCodeExpiresAt && new Date() > internship.accessCodeExpiresAt) {
    throw new ApiError(400, 'Link sudah kadaluarsa');
  }

  const normalizedInternship = await hydrateInternshipWithHistoricalStudentClass(internship);

  res.status(200).json(new ApiResponse(200, {
    nis: normalizedInternship!.student.nis,
    studentName: normalizedInternship!.student.name,
    studentClass: normalizedInternship!.student.studentClass?.name,
    companyName: normalizedInternship!.companyName,
    mentorName: normalizedInternship!.mentorName,
    industryScore: normalizedInternship!.industryScore,
    status: normalizedInternship!.status
  }, 'Link valid'));
});

export const submitIndustryGradeViaLink = asyncHandler(async (req: Request, res: Response) => {
  const { accessCode, industryScore, mentorName } = req.body;

  if (industryScore < 0 || industryScore > 100) {
    throw new ApiError(400, 'Nilai harus antara 0 - 100');
  }

  const internship = await prisma.internship.findUnique({
    where: { accessCode }
  });

  if (!internship) {
    throw new ApiError(404, 'Link tidak valid');
  }
  
  if (internship.accessCodeExpiresAt && new Date() > internship.accessCodeExpiresAt) {
    throw new ApiError(400, 'Link sudah kadaluarsa');
  }

  const defenseScore = internship.defenseScore || 0;
  const finalGrade = (industryScore * 0.7) + (defenseScore * 0.3);

  const updated = await prisma.internship.update({
    where: { id: internship.id },
    data: {
      industryScore,
      finalGrade,
      mentorName: mentorName || internship.mentorName
    }
  });

  res.status(200).json(new ApiResponse(200, updated, 'Nilai berhasil disimpan'));
});

export const updateMyInternship = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;
  const { 
    companyName, 
    companyAddress, 
    mentorName, 
    mentorPhone, 
    mentorEmail, 
    startDate, 
    endDate,
    companyLatitude,
    companyLongitude,
    reportTitle,
    schoolApprovalDate,
    lastActiveTab
  } = req.body;

  // Find the internship first
  const internship = await prisma.internship.findFirst({
    where: { studentId: Number(studentId) },
    orderBy: { createdAt: 'desc' }
  });

  if (!internship) {
    throw new ApiError(404, 'Data PKL tidak ditemukan');
  }

  const updated = await prisma.internship.update({
    where: { id: internship.id },
    data: {
      companyName,
      companyAddress,
      mentorName,
      mentorPhone,
      mentorEmail,
      companyLatitude,
      companyLongitude,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      reportTitle,
      schoolApprovalDate,
      lastActiveTab
    }
  });

  res.status(200).json(new ApiResponse(200, updated, 'Data PKL berhasil diupdate'));
});
