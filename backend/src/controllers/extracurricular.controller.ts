import { Request, Response } from 'express';
import { ExtracurricularCategory } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { osisManagementService } from '../services/osisManagement.service';

const extracurricularCategorySchema = z.preprocess((value) => {
  if (typeof value === 'string') return value.trim().toUpperCase();
  return value;
}, z.nativeEnum(ExtracurricularCategory));

const createEkskulSchema = z.object({
  name: z.string().min(1, 'Nama ekstrakurikuler wajib diisi'),
  description: z.string().optional().nullable(),
  category: extracurricularCategorySchema.default(ExtracurricularCategory.EXTRACURRICULAR),
});

const updateEkskulSchema = createEkskulSchema.partial();

const STUDENT_EXTRACURRICULAR_CATEGORY = ExtracurricularCategory.EXTRACURRICULAR;
const EXTRACURRICULAR_ATTENDANCE_STATUSES = ['PRESENT', 'PERMIT', 'SICK', 'ABSENT'] as const;

function buildAttendanceSummary(
  rows: Array<{ status?: string | null; note?: string | null; sessionIndex: number; week?: { weekKey?: string | null } | null }>,
) {
  const summary = {
    totalSessions: rows.length,
    presentCount: 0,
    permitCount: 0,
    sickCount: 0,
    absentCount: 0,
  };

  for (const row of rows) {
    const normalizedStatus = String(row.status || '').trim().toUpperCase() as (typeof EXTRACURRICULAR_ATTENDANCE_STATUSES)[number];
    if (normalizedStatus === 'PRESENT') summary.presentCount += 1;
    if (normalizedStatus === 'PERMIT') summary.permitCount += 1;
    if (normalizedStatus === 'SICK') summary.sickCount += 1;
    if (normalizedStatus === 'ABSENT') summary.absentCount += 1;
  }

  return summary;
}

export const getExtracurriculars = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, category } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Number(limit);
  const usePagination = Number.isFinite(limitNum) ? limitNum > 0 : true;
  const skip = usePagination ? (pageNum - 1) * limitNum : undefined;

  const where: any = {};
  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }
  if (category) {
    where.category = extracurricularCategorySchema.parse(category);
  }

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });

  const [total, extracurriculars] = await Promise.all([
    prisma.ekstrakurikuler.count({ where }),
    (prisma as any).ekstrakurikuler.findMany({
      where,
      ...(usePagination ? { skip, take: limitNum } : {}),
      orderBy: { name: 'asc' },
      include: {
        tutorAssignments: {
          where: {
            academicYearId: activeYear?.id,
            isActive: true,
          },
          include: {
            tutor: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
  ]);

  res.status(200).json(new ApiResponse(200, {
    extracurriculars,
    pagination: {
      page: pageNum,
      limit: usePagination ? limitNum : total,
      total,
      totalPages: usePagination ? Math.max(1, Math.ceil(total / limitNum)) : 1,
    },
  }, 'Data ekstrakurikuler berhasil diambil'));
});

export const createExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const body = createEkskulSchema.parse(req.body);
  const created = await prisma.ekstrakurikuler.create({
    data: {
      name: body.name,
      description: body.description ?? undefined,
      category: body.category,
    },
  });
  res.status(201).json(new ApiResponse(201, created, 'Ekstrakurikuler berhasil dibuat'));
});

export const updateExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateEkskulSchema.parse(req.body);
  const existing = await prisma.ekstrakurikuler.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  const updated = await prisma.ekstrakurikuler.update({
    where: { id: Number(id) },
    data: {
      name: body.name ?? undefined,
      description: body.description ?? undefined,
      category: body.category ?? undefined,
    },
  });
  res.status(200).json(new ApiResponse(200, updated, 'Ekstrakurikuler berhasil diperbarui'));
});

const assignTutorSchema = z.object({
  tutorId: z.coerce.number().int(),
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int(),
});

export const assignTutor = asyncHandler(async (req: Request, res: Response) => {
  const body = assignTutorSchema.parse(req.body);

  const assignee = await prisma.user.findUnique({
    where: { id: body.tutorId },
    select: {
      id: true,
      role: true,
      additionalDuties: true,
    },
  });

  const ekskul = await prisma.ekstrakurikuler.findUnique({
    where: { id: body.ekskulId },
    select: {
      id: true,
      category: true,
    },
  });

  if (!assignee) {
    throw new ApiError(404, 'User pembina tidak ditemukan');
  }

  if (!ekskul) {
    throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  }

  const assigneeRole = String(assignee.role || '').toUpperCase();
  const assigneeDuties = (assignee.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());

  if (ekskul.category === ExtracurricularCategory.OSIS) {
    if (assigneeRole !== 'TEACHER') {
      throw new ApiError(400, 'Pembina OSIS hanya dapat ditugaskan ke guru aktif.');
    }
    if (!assigneeDuties.includes('PEMBINA_OSIS')) {
      throw new ApiError(400, 'Guru harus memiliki duty Pembina OSIS sebelum ditugaskan ke OSIS.');
    }
  } else if (!['TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(assigneeRole)) {
    throw new ApiError(400, 'Pembina ekskul hanya dapat ditugaskan ke guru aktif atau tutor eksternal');
  }
  
  // Check if already exists
  const existing = await (prisma as any).ekstrakurikulerTutorAssignment.findUnique({
    where: {
      tutorId_ekskulId_academicYearId: {
        tutorId: body.tutorId,
        ekskulId: body.ekskulId,
        academicYearId: body.academicYearId,
      },
    },
  });

  if (existing) {
    if (!existing.isActive) {
      const updated = await (prisma as any).ekstrakurikulerTutorAssignment.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
      res.status(200).json(new ApiResponse(200, updated, 'Pembina berhasil diaktifkan kembali'));
      return;
    }
    throw new ApiError(400, 'Pembina sudah ditugaskan di ekstrakurikuler ini pada tahun ajaran tersebut');
  }

  const assignment = await (prisma as any).ekstrakurikulerTutorAssignment.create({
    data: {
      tutorId: body.tutorId,
      ekskulId: body.ekskulId,
      academicYearId: body.academicYearId,
      isActive: true,
    },
  });

  res.status(201).json(new ApiResponse(201, assignment, 'Pembina berhasil ditugaskan'));
});

export const getAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { academicYearId, ekskulId } = req.query;
  
  const where: any = { isActive: true };
  if (academicYearId) where.academicYearId = Number(academicYearId);
  if (ekskulId) where.ekskulId = Number(ekskulId);

  const assignments = await (prisma as any).ekstrakurikulerTutorAssignment.findMany({
    where,
    include: {
      tutor: { select: { id: true, name: true, username: true } },
      ekskul: true,
      academicYear: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  res.status(200).json(new ApiResponse(200, assignments, 'Data penugasan berhasil diambil'));
});

export const removeAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  
  await (prisma as any).ekstrakurikulerTutorAssignment.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Penugasan berhasil dihapus'));
});

export const deleteExtracurricular = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await prisma.ekstrakurikuler.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  await prisma.ekstrakurikuler.delete({ where: { id: Number(id) } });
  res.status(200).json(new ApiResponse(200, null, 'Ekstrakurikuler berhasil dihapus'));
});

const enrollSchema = z.object({
  ekskulId: z.coerce.number().int(),
  academicYearId: z.coerce.number().int().optional(),
});

async function notifyHomeroomExtracurricularSelection(params: {
  studentId: number;
  academicYearId: number;
  ekskulId: number;
}) {
  const student = await prisma.user.findUnique({
    where: { id: params.studentId },
    select: {
      id: true,
      name: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          teacherId: true,
        },
      },
    },
  });

  if (!student?.studentClass?.teacherId) return;

  const ekskul = await prisma.ekstrakurikuler.findUnique({
    where: { id: params.ekskulId },
    select: { id: true, name: true },
  });

  if (!ekskul) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const title = 'Pilihan Ekstrakurikuler Baru';
  const message = `${student.name} memilih ekstrakurikuler ${ekskul.name}.`;

  const existingToday = await prisma.notification.findFirst({
    where: {
      userId: student.studentClass.teacherId,
      type: 'EXTRACURRICULAR_ENROLLMENT',
      title,
      message,
      createdAt: { gte: dayStart },
    },
    select: { id: true },
  });

  if (existingToday) return;

  await prisma.notification.create({
    data: {
      userId: student.studentClass.teacherId,
      title,
      message,
      type: 'EXTRACURRICULAR_ENROLLMENT',
      data: {
        module: 'EXTRACURRICULAR',
        studentId: student.id,
        classId: student.studentClass.id,
        className: student.studentClass.name,
        academicYearId: params.academicYearId,
        ekskulId: ekskul.id,
        ekskulName: ekskul.name,
        route: '/teacher/wali-kelas/students',
      },
    },
  });
}

export const getMyExtracurricularEnrollment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;

  const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
  const academicYearId = activeYear?.id;

  if (!academicYearId) {
    res.status(200).json(new ApiResponse(200, null, 'Tahun ajaran aktif tidak ditemukan'));
    return;
  }

  const enrollment = await prisma.ekstrakurikulerEnrollment.findFirst({
    where: {
      studentId,
      academicYearId,
      ekskul: {
        category: STUDENT_EXTRACURRICULAR_CATEGORY,
      },
    },
    include: { ekskul: true },
  });

  res.status(200).json(new ApiResponse(200, enrollment, 'Data pilihan ekstrakurikuler siswa'));
});

export const getStudentExtracurricularSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const studentId = req.user!.id;

  const activeYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
    },
  });

  if (!activeYear) {
    res.status(200).json(
      new ApiResponse(
        200,
        {
          academicYear: null,
          regularEnrollment: null,
          osisStatus: {
            academicYearId: null,
            membership: null,
            request: null,
          },
          actions: {
            canChooseRegular: false,
            canRequestOsis: false,
          },
        },
        'Ringkasan ekstrakurikuler siswa berhasil diambil',
      ),
    );
    return;
  }

  const [regularEnrollment, osisStatus] = await Promise.all([
    prisma.ekstrakurikulerEnrollment.findFirst({
      where: {
        studentId,
        academicYearId: activeYear.id,
        ekskul: {
          category: STUDENT_EXTRACURRICULAR_CATEGORY,
        },
      },
      include: {
        ekskul: {
          include: {
            tutorAssignments: {
              where: {
                academicYearId: activeYear.id,
                isActive: true,
              },
              include: {
                tutor: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    osisManagementService.getStudentJoinStatus(studentId, activeYear.id),
  ]);

  let regularEnrollmentSummary: any = null;

  if (regularEnrollment) {
    const attendanceRows = await (prisma as any).ekstrakurikulerAttendanceEntry.findMany({
      where: {
        enrollmentId: regularEnrollment.id,
      },
      orderBy: [
        {
          week: {
            weekKey: 'desc',
          },
        },
        {
          sessionIndex: 'desc',
        },
      ],
      include: {
        week: {
          select: {
            weekKey: true,
          },
        },
      },
    });

    regularEnrollmentSummary = {
      id: regularEnrollment.id,
      academicYearId: regularEnrollment.academicYearId,
      grade: regularEnrollment.grade,
      description: regularEnrollment.description,
      semesterGrades: {
        sbtsOdd: {
          grade: regularEnrollment.gradeSbtsOdd,
          description: regularEnrollment.descSbtsOdd,
        },
        sas: {
          grade: regularEnrollment.gradeSas,
          description: regularEnrollment.descSas,
        },
        sbtsEven: {
          grade: regularEnrollment.gradeSbtsEven,
          description: regularEnrollment.descSbtsEven,
        },
        sat: {
          grade: regularEnrollment.gradeSat,
          description: regularEnrollment.descSat,
        },
      },
      ekskul: {
        id: regularEnrollment.ekskul.id,
        name: regularEnrollment.ekskul.name,
        description: regularEnrollment.ekskul.description,
        tutors: (regularEnrollment.ekskul.tutorAssignments || [])
          .map((assignment: any) => assignment.tutor)
          .filter(Boolean),
      },
      attendanceSummary: {
        ...buildAttendanceSummary(attendanceRows),
        latestRecords: attendanceRows.slice(0, 6).map((row: any) => ({
          weekKey: row.week?.weekKey || null,
          sessionIndex: row.sessionIndex,
          status: row.status,
          note: row.note || null,
        })),
      },
    };
  }

  const canChooseRegular = !regularEnrollmentSummary;
  const canRequestOsis =
    !regularEnrollmentSummary &&
    !osisStatus.membership &&
    osisStatus.request?.status !== 'PENDING' &&
    osisStatus.request?.status !== 'APPROVED';

  res.status(200).json(
    new ApiResponse(
      200,
      {
        academicYear: activeYear,
        regularEnrollment: regularEnrollmentSummary,
        osisStatus,
        actions: {
          canChooseRegular,
          canRequestOsis,
        },
      },
      'Ringkasan ekstrakurikuler siswa berhasil diambil',
    ),
  );
});

export const enrollExtracurricular = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { ekskulId, academicYearId: bodyYearId } = enrollSchema.parse(req.body);
  const studentId = req.user!.id;

  let academicYearId = bodyYearId;
  if (!academicYearId) {
    const activeYear = await prisma.academicYear.findFirst({ where: { isActive: true } });
    academicYearId = activeYear?.id;
  }

  if (!academicYearId) {
    throw new ApiError(400, 'Tahun ajaran aktif tidak tersedia');
  }

  const existing = await prisma.ekstrakurikulerEnrollment.findFirst({
    where: {
      studentId,
      academicYearId,
      ekskul: {
        category: STUDENT_EXTRACURRICULAR_CATEGORY,
      },
    },
  });

  if (existing) {
    throw new ApiError(400, 'Anda sudah memilih ekstrakurikuler untuk tahun ajaran ini');
  }

  const selectedEkskul = await prisma.ekstrakurikuler.findUnique({
    where: { id: ekskulId },
    select: {
      id: true,
      category: true,
    },
  });

  if (!selectedEkskul) {
    throw new ApiError(404, 'Ekstrakurikuler tidak ditemukan');
  }

  if (selectedEkskul.category !== STUDENT_EXTRACURRICULAR_CATEGORY) {
    throw new ApiError(400, 'OSIS tidak didaftarkan melalui menu ekstrakurikuler siswa.');
  }

  const created = await prisma.ekstrakurikulerEnrollment.create({
    data: {
      studentId,
      ekskulId,
      academicYearId,
    },
    include: { ekskul: true },
  });

  await notifyHomeroomExtracurricularSelection({
    studentId,
    academicYearId,
    ekskulId,
  });

  res.status(201).json(new ApiResponse(201, created, 'Pendaftaran ekstrakurikuler berhasil'));
});
