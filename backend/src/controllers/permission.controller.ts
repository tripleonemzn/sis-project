import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AttendanceStatus } from '@prisma/client';
import { resolveHistoricalStudentScope } from '../utils/studentAcademicHistory';
import {
  ensureAcademicYearArchiveReadAccess,
  ensureAcademicYearArchiveWriteAccess,
} from '../utils/academicYearArchiveAccess';

const requestPermissionSchema = z.object({
  type: z.enum(['SICK', 'PERMISSION', 'OTHER']),
  startDate: z.string().transform((str) => new Date(str)),
  endDate: z.string().transform((str) => new Date(str)),
  reason: z.string().optional(),
  fileUrl: z.string().optional(),
});

const updatePermissionStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  approvalNote: z.string().optional(),
});

export const getPermissions = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { classId, academicYearId, type, status, page = 1, limit = 10, search } = req.query;

  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  const classIdNum = classId ? Number(classId) : null;
  const academicYearIdNum = academicYearId ? Number(academicYearId) : null;
  const searchText = String(search || '').trim();
  const studentScope =
    user.role === 'STUDENT'
      ? await resolveHistoricalStudentScope({
          academicYearId: academicYearIdNum,
          studentId: Number(user.id),
          search: searchText || null,
        })
      : classIdNum || academicYearIdNum
        ? await resolveHistoricalStudentScope({
            academicYearId: academicYearIdNum,
            classId: classIdNum,
            search: searchText || null,
          })
        : null;
  const effectiveAcademicYearId = Number(
    studentScope?.academicYearId || academicYearIdNum || 0,
  );

  if (effectiveAcademicYearId > 0) {
    await ensureAcademicYearArchiveReadAccess({
      actorId: Number(user?.id || 0),
      actorRole: user?.role || null,
      academicYearId: effectiveAcademicYearId,
      module: 'PERMISSIONS',
      classId: classIdNum || null,
      studentId: user.role === 'STUDENT' ? Number(user.id) : null,
    });
  }

  if (studentScope?.academicYearId) {
    where.academicYearId = studentScope.academicYearId;
  } else if (academicYearIdNum) {
    where.academicYearId = academicYearIdNum;
  }

  if (user.role === 'STUDENT') {
    where.studentId = user.id;
  } else if (studentScope && classIdNum) {
    where.studentId = {
      in: studentScope.studentIds.length > 0 ? studentScope.studentIds : [-1],
    };
  }

  if (searchText) {
    const matchedStudentIds = studentScope?.studentIds || [];
    where.OR = [
      { reason: { contains: searchText, mode: 'insensitive' } },
      ...(matchedStudentIds.length > 0
        ? [
            {
              studentId: {
                in: matchedStudentIds,
              },
            },
          ]
        : !studentScope
          ? [
              { student: { name: { contains: searchText, mode: 'insensitive' } } },
              { student: { nis: { contains: searchText, mode: 'insensitive' } } },
              { student: { nisn: { contains: searchText, mode: 'insensitive' } } },
            ]
        : []),
    ];

    if (!where.OR.length) {
      where.studentId = {
        in: [-1],
      };
    }
  }

  if (type) where.type = type;
  if (status) where.status = status;

  const [permissions, total] = await Promise.all([
    prisma.studentPermission.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nis: true,
            nisn: true,
            photo: true,
            studentClass: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        approvedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limitNum,
    }),
    prisma.studentPermission.count({ where })
  ]);

  const historicalStudentMap = studentScope?.studentMap || new Map();
  const normalizedPermissions = permissions.map((permission) => {
    const historicalStudent = historicalStudentMap.get(permission.studentId);
    return {
      ...permission,
      student: permission.student
        ? {
            ...permission.student,
            studentClass: historicalStudent?.studentClass
              ? {
                  id: historicalStudent.studentClass.id,
                  name: historicalStudent.studentClass.name,
                }
              : permission.student.studentClass || null,
          }
        : null,
    };
  });

  res.status(200).json(new ApiResponse(200, {
    permissions: normalizedPermissions,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Data perizinan berhasil diambil'));
});

export const requestPermission = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { type, startDate, endDate, reason, fileUrl } = requestPermissionSchema.parse(req.body);

  if (user.role !== 'STUDENT') {
    throw new ApiError(403, 'Hanya siswa yang dapat mengajukan izin');
  }

  // Get student's current class and academic year
  const studentData = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
        classId: true,
        studentClass: {
            select: { academicYearId: true }
        }
    }
  });

  if (!studentData?.classId || !studentData?.studentClass?.academicYearId) {
    throw new ApiError(400, 'Data kelas/tahun ajaran siswa tidak ditemukan');
  }

  const permission = await prisma.studentPermission.create({
    data: {
      studentId: user.id,
      academicYearId: studentData.studentClass.academicYearId,
      type,
      startDate,
      endDate,
      reason,
      fileUrl,
      status: 'PENDING',
    },
  });

  res.status(201).json(new ApiResponse(201, permission, 'Pengajuan izin berhasil dibuat'));
});

export const updatePermissionStatus = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, approvalNote } = updatePermissionStatusSchema.parse(req.body);
  const user = (req as any).user;

  const permission = await prisma.studentPermission.findUnique({
    where: { id: Number(id) },
  });

  if (!permission) {
    throw new ApiError(404, 'Data perizinan tidak ditemukan');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: permission.academicYearId,
    module: 'PERMISSIONS',
  });

  const updated = await prisma.studentPermission.update({
    where: { id: Number(id) },
    data: {
      status,
      approvalNote,
      approvedById: user.id,
    },
  });

  // Automatically update DailyAttendance if Approved
  if (status === 'APPROVED') {
    let attendanceStatus: AttendanceStatus | undefined;

    switch (updated.type) {
      case 'SICK':
        attendanceStatus = AttendanceStatus.SICK;
        break;
      case 'PERMISSION':
      case 'OTHER':
        attendanceStatus = AttendanceStatus.PERMISSION;
        break;
    }

    if (attendanceStatus) {
      // Normalize dates to cover the full range
      const startDate = new Date(updated.startDate);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(updated.endDate);
      endDate.setHours(23, 59, 59, 999);

      // Update existing attendance records
      await prisma.dailyAttendance.updateMany({
        where: {
          studentId: updated.studentId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
        data: {
          status: attendanceStatus,
          note: updated.reason ? `Izin disetujui: ${updated.reason}` : 'Izin disetujui via sistem',
        },
      });
    }
  }

  res.status(200).json(new ApiResponse(200, updated, 'Status perizinan berhasil diperbarui'));
});
