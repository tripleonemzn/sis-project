import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { writeAuditLog } from '../utils/auditLog';

const createTeacherAssignmentsSchema = z.object({
  academicYearId: z.number().int(),
  teacherId: z.number().int(),
  subjectId: z.number().int(),
  classIds: z.array(z.number().int()).min(1),
});

const listTeacherAssignmentsSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(1000).optional(),
  search: z.string().optional(),
  academicYearId: z.coerce.number().int().optional(),
  teacherId: z.coerce.number().int().optional(),
  subjectId: z.coerce.number().int().optional(),
  classId: z.coerce.number().int().optional(),
  scope: z.string().optional(),
});

const teacherAssignmentIdSchema = z.object({
  id: z.coerce.number().int(),
});

const updateCompetencySchema = z.object({
  competencyThresholds: z.object({
    A: z.string().optional(),
    B: z.string().optional(),
    C: z.string().optional(),
    D: z.string().optional(),
  }),
});

export const updateCompetencyThresholds = asyncHandler(async (req: Request, res: Response) => {
  const { id } = teacherAssignmentIdSchema.parse(req.params);
  const { competencyThresholds } = updateCompetencySchema.parse(req.body);

  const before = await prisma.teacherAssignment.findUnique({ where: { id } });
  const assignment = await prisma.teacherAssignment.update({
    where: { id },
    data: { competencyThresholds },
  });

  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  const dutiesArr = (dutyUser?.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
  await writeAuditLog(authUser.id, dutyUser?.role || authUser.role, dutiesArr, 'UPDATE', 'TEACHER_ASSIGNMENT_COMPETENCY', id, before, assignment, (req.body as any)?.reason);

  res.status(200).json(new ApiResponse(200, assignment, 'Deskripsi capaian kompetensi berhasil disimpan'));
});

export const getTeacherAssignmentById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = teacherAssignmentIdSchema.parse(req.params);

  const assignment = await prisma.teacherAssignment.findUnique({
    where: { id },
    include: {
      class: {
        include: {
          students: {
            where: { studentStatus: 'ACTIVE' },
            orderBy: { name: 'asc' },
            select: { id: true, name: true, nis: true, nisn: true, gender: true },
          },
          major: true,
        },
      },
      subject: true,
      academicYear: true,
      teacher: {
        select: { id: true, name: true },
      },
    },
  });

  if (!assignment) {
    throw new ApiError(404, 'Penugasan tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, assignment, 'Detail penugasan berhasil diambil'));
});

export const createTeacherAssignments = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      throw new ApiError(403, 'Anda tidak memiliki hak akses untuk mengelola assignment guru');
    }
  }
  const { academicYearId, teacherId, subjectId, classIds } = createTeacherAssignmentsSchema.parse(req.body);

  const classes = await prisma.class.findMany({
    where: {
      id: { in: classIds },
      academicYearId,
    },
    select: {
      id: true,
      level: true,
    },
  });

  if (classes.length === 0) {
    res.status(400).json(new ApiResponse(400, null, 'Kelas tidak valid untuk tahun ajaran tersebut'));
    return;
  }

  const existingAssignments = await prisma.teacherAssignment.findMany({
    where: {
      teacherId,
      subjectId,
      academicYearId,
    },
    select: {
      id: true,
      classId: true,
    },
  });

  const targetClassIdSet = new Set(classIds);

  const assignments = [];

  for (const cls of classes) {
    const subjectKkm = await prisma.subjectKKM.findFirst({
      where: {
        subjectId,
        classLevel: cls.level,
        OR: [
          { academicYearId },
          { academicYearId: null },
        ],
      },
      orderBy: {
        academicYearId: 'desc',
      },
    });

    const kkm = subjectKkm?.kkm ?? 75;

    const existing = existingAssignments.find((a) => a.classId === cls.id);

    let assignment;

    if (existing) {
      assignment = await prisma.teacherAssignment.update({
        where: { id: existing.id },
        data: { kkm },
      });
    } else {
      assignment = await prisma.teacherAssignment.create({
        data: {
          teacherId,
          subjectId,
          academicYearId,
          classId: cls.id,
          kkm,
        },
      });
    }

    assignments.push(assignment);
  }

  const toDeleteIds = existingAssignments
    .filter((a) => !targetClassIdSet.has(a.classId))
    .map((a) => a.id);

  if (toDeleteIds.length > 0) {
    await prisma.teacherAssignment.deleteMany({
      where: {
        id: { in: toDeleteIds },
      },
    });
  }

  const dutiesArr2 = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
  await writeAuditLog(authUser.id, dutyUser.role, dutiesArr2, 'UPSERT', 'TEACHER_ASSIGNMENTS', undefined, null, { academicYearId, teacherId, subjectId, classIds }, (req.body as any)?.reason);

  res
    .status(201)
    .json(new ApiResponse(201, { assignments }, 'Penugasan guru berhasil disimpan'));
});

export const getTeacherAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, academicYearId, teacherId, subjectId, classId, scope } =
    listTeacherAssignmentsSchema.parse(req.query);

  const user = (req as any).user;

  const skip = (page - 1) * limit;

  const where: any = {};

  if (academicYearId) {
    where.academicYearId = academicYearId;
  }

  if (classId) {
    where.classId = classId;
  }

  if (user && user.role === 'TEACHER') {
    const dutyUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { additionalDuties: true },
    });
    const duties = (dutyUser?.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );
    const isCurriculum =
      duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    const requestScope = String(scope || '').trim().toUpperCase();
    const canUseCurriculumScope = isCurriculum && requestScope === 'CURRICULUM';

    if (canUseCurriculumScope) {
      if (teacherId) {
        where.teacherId = teacherId;
      }
    } else {
      // Default TEACHER scope must always be own assignment only,
      // even when the account has additional curriculum duty.
      where.teacherId = user.id;
    }
  } else if (teacherId) {
    where.teacherId = teacherId;
  }

  if (subjectId) {
    where.subjectId = subjectId;
  }
  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      {
        teacher: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        teacher: {
          username: { contains: term, mode: 'insensitive' },
        },
      },
      {
        subject: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        subject: {
          code: { contains: term, mode: 'insensitive' },
        },
      },
      {
        class: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
      {
        academicYear: {
          name: { contains: term, mode: 'insensitive' },
        },
      },
    ];
  }

  const [total, assignments] = await Promise.all([
    prisma.teacherAssignment.count({ where }),
    prisma.teacherAssignment.findMany({
      where,
      skip,
      take: limit,
      orderBy: [
        { academicYear: { name: 'desc' } },
        { subject: { name: 'asc' } },
        { class: { level: 'asc' } },
        { class: { name: 'asc' } },
        { subject: { code: 'asc' } },
      ],
      include: {
        teacher: {
          select: { id: true, name: true, username: true },
        },
        subject: {
          select: { id: true, name: true, code: true },
        },
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: { id: true, name: true, code: true },
            },
            _count: {
              select: { students: true },
            },
          },
        },
        academicYear: {
          select: { id: true, name: true },
        },
        _count: {
          select: { scheduleEntries: true },
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        assignments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Data penugasan guru berhasil diambil',
    ),
  );
});

export const deleteTeacherAssignment = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;
    const dutyUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { role: true, additionalDuties: true },
    });
    if (!dutyUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }
    if (dutyUser.role !== 'ADMIN') {
      const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
      const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
      if (!allowed) {
        throw new ApiError(403, 'Anda tidak memiliki hak akses untuk menghapus assignment guru');
      }
    }
    const { id } = teacherAssignmentIdSchema.parse(req.params);

    const before = await prisma.teacherAssignment.findUnique({ where: { id } });
    await prisma.teacherAssignment.delete({ where: { id } });
    const dutiesArr3 = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    await writeAuditLog(authUser.id, dutyUser.role, dutiesArr3, 'DELETE', 'TEACHER_ASSIGNMENT', id, before, null, (req.body as any)?.reason);

    res
      .status(200)
      .json(
        new ApiResponse(200, null, 'Penugasan guru berhasil dihapus'),
      );
  },
);
