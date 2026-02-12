import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

// Get all assignments
export const getAssignments = asyncHandler(async (req: Request, res: Response) => {
  const { classId, subjectId, teacherId, isPublished, limit = '100', page = '1' } = req.query;
  const user = (req as any).user;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  // If user is a teacher, only show their assignments
  if (user.role === 'TEACHER') {
    where.teacherId = user.id;
  }

  if (classId) where.classId = parseInt(classId as string);
  if (subjectId) where.subjectId = parseInt(subjectId as string);
  if (teacherId) where.teacherId = parseInt(teacherId as string);
  if (isPublished !== undefined) where.isPublished = isPublished === 'true';

  // If user is a student, enforce their class
  if (user.role === 'STUDENT') {
    const student = await prisma.user.findUnique({
      where: { id: user.id },
      select: { classId: true }
    });

    if (student?.classId) {
      where.classId = student.classId;
    } else {
      where.classId = -1; // Force empty result if no class
    }
  }

  const [assignments, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true
          }
        },
        subject: {
          select: {
            id: true,
            code: true,
            name: true
          }
        },
        teacher: {
          select: {
            id: true,
            name: true 
          }
        },
        _count: {
          select: {
            submissions: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limitNum
    }),
    prisma.assignment.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, {
    assignments,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Data tugas berhasil diambil'));
});

// Get assignment by ID
export const getAssignmentById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const assignment = await prisma.assignment.findUnique({
    where: { id: parseInt(id) },
    include: {
      class: {
        select: {
          id: true,
          name: true,
          level: true
        }
      },
      subject: {
        select: {
          id: true,
          code: true,
          name: true
        }
      },
      teacher: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          submissions: true
        }
      }
    }
  });

  if (!assignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, assignment, 'Detail tugas berhasil diambil'));
});

// Create assignment
export const createAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, classId, subjectId, dueDate, allowResubmit, maxScore, isPublished, academicYearId } = req.body;
  const user = (req as any).user;
  const file = req.file;

  if (!title || !classId || !subjectId || !dueDate || !academicYearId) {
    throw new ApiError(400, 'Judul, Kelas, Mapel, Tanggal Pengumpulan, dan Tahun Ajaran wajib diisi');
  }

  const assignmentData: any = {
    title,
    description: description || null,
    classId: parseInt(classId),
    subjectId: parseInt(subjectId),
    teacherId: user.id,
    academicYearId: parseInt(academicYearId),
    dueDate: new Date(dueDate),
    allowResubmit: allowResubmit === 'true' || allowResubmit === true,
    maxScore: maxScore ? parseInt(maxScore) : 100,
    isPublished: isPublished === 'true' || isPublished === true
  };

  if (file) {
    assignmentData.fileUrl = `/uploads/assignments/${file.filename}`;
    assignmentData.fileName = file.originalname;
  }

  const assignment = await prisma.assignment.create({
    data: assignmentData,
    include: {
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, code: true, name: true } },
      teacher: { select: { id: true, name: true } }
    }
  });

  res.status(201).json(new ApiResponse(201, assignment, 'Tugas berhasil dibuat'));
});

// Update assignment
export const updateAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, classId, subjectId, dueDate, allowResubmit, maxScore, isPublished } = req.body;
  const file = req.file;

  const existingAssignment = await prisma.assignment.findUnique({
    where: { id: parseInt(id) }
  });

  if (!existingAssignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  const updateData: any = {
    title,
    description,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    allowResubmit: allowResubmit !== undefined ? (allowResubmit === 'true' || allowResubmit === true) : undefined,
    maxScore: maxScore ? parseInt(maxScore) : undefined,
    isPublished: isPublished !== undefined ? (isPublished === 'true' || isPublished === true) : undefined
  };

  if (classId) updateData.classId = parseInt(classId);
  if (subjectId) updateData.subjectId = parseInt(subjectId);

  if (file) {
    // TODO: Delete old file if exists?
    updateData.fileUrl = `/uploads/assignments/${file.filename}`;
    updateData.fileName = file.originalname;
  }

  const assignment = await prisma.assignment.update({
    where: { id: parseInt(id) },
    data: updateData
  });

  res.status(200).json(new ApiResponse(200, assignment, 'Tugas berhasil diperbarui'));
});

// Delete assignment
export const deleteAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const assignment = await prisma.assignment.findUnique({
    where: { id: parseInt(id) }
  });

  if (!assignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  // TODO: Delete associated file if exists

  await prisma.assignment.delete({
    where: { id: parseInt(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Tugas berhasil dihapus'));
});


// Copy assignment to other classes
export const copyAssignment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetClassIds } = req.body; // Array of class IDs
  const user = (req as any).user;

  if (!Array.isArray(targetClassIds) || targetClassIds.length === 0) {
    throw new ApiError(400, 'Target kelas wajib dipilih');
  }

  const assignment = await prisma.assignment.findUnique({
    where: { id: parseInt(id) }
  });

  if (!assignment) {
    throw new ApiError(404, 'Tugas tidak ditemukan');
  }

  // Ensure user owns the assignment (if teacher)
  if (user.role === 'TEACHER' && assignment.teacherId !== user.id) {
    throw new ApiError(403, 'Anda tidak memiliki akses untuk menyalin tugas ini');
  }

  // Transaction to create copies
  const copies = await prisma.$transaction(
    targetClassIds.map((classId: number) => 
      prisma.assignment.create({
        data: {
          title: assignment.title,
          description: assignment.description,
          fileUrl: assignment.fileUrl,
          fileName: assignment.fileName,
          dueDate: assignment.dueDate,
          allowResubmit: assignment.allowResubmit,
          maxScore: assignment.maxScore,
          isPublished: assignment.isPublished,
          subjectId: assignment.subjectId,
          teacherId: user.id,
          classId: classId,
          academicYearId: assignment.academicYearId
        }
      })
    )
  );

  res.status(200).json(new ApiResponse(200, copies, 'Tugas berhasil disalin ke kelas lain'));
});
