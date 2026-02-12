import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { AttendanceStatus } from '@prisma/client';

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

  if (academicYearId) {
    where.academicYearId = Number(academicYearId);
  }

  if (user.role === 'STUDENT') {
    where.studentId = user.id;
  } else if (classId) {
    where.student = {
      classId: Number(classId)
    };
  }

  if (search) {
    const searchFilter = {
      OR: [
        { name: { contains: search as string, mode: 'insensitive' } },
        { nis: { contains: search as string, mode: 'insensitive' } },
        { nisn: { contains: search as string, mode: 'insensitive' } }
      ]
    };
    
    if (where.student) {
      where.student = { ...where.student, ...searchFilter };
    } else {
      where.student = searchFilter;
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

  res.status(200).json(new ApiResponse(200, {
    permissions,
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
