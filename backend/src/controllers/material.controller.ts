import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, asyncHandler, ApiResponse } from '../utils/api';

// Get all materials
export const getMaterials = asyncHandler(async (req: Request, res: Response) => {
  const { classId, subjectId, teacherId, isPublished, limit = '100', page = '1' } = req.query;
  const user = (req as any).user;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  // If user is a teacher, only show their materials
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

  const [materials, total] = await Promise.all([
    prisma.material.findMany({
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
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limitNum
    }),
    prisma.material.count({ where })
  ]);

  res.status(200).json(new ApiResponse(200, {
    materials,
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum)
    }
  }, 'Data materi berhasil diambil'));
});

// Get material by ID
export const getMaterialById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const material = await prisma.material.findUnique({
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
          name: true
        }
      }
    }
  });

  if (!material) {
    throw new ApiError(404, 'Materi tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, material, 'Detail materi berhasil diambil'));
});

// Create material
export const createMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, classId, subjectId, isPublished, academicYearId, youtubeUrl } = req.body;
  const user = (req as any).user;
  const file = req.file;

  if (!title || !subjectId) {
    throw new ApiError(400, 'Judul dan Mapel wajib diisi');
  }

  // Verify class exists if provided
  if (classId) {
    const classExists = await prisma.class.findUnique({
      where: { id: parseInt(classId) }
    });
    if (!classExists) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
  }

  const materialData: any = {
    title,
    description: description || null,
    subjectId: parseInt(subjectId),
    teacherId: user.id,
    isPublished: isPublished === 'true' || isPublished === true,
    youtubeUrl: youtubeUrl || null
  };

  if (classId) materialData.classId = parseInt(classId);
  if (academicYearId) materialData.academicYearId = parseInt(academicYearId);

  if (file) {
    materialData.fileUrl = `/uploads/materials/${file.filename}`;
    materialData.fileName = file.originalname;
    materialData.fileType = file.mimetype;
    materialData.fileSize = file.size;
  }

  const material = await prisma.material.create({
    data: materialData,
    include: {
      class: { select: { id: true, name: true, level: true } },
      subject: { select: { id: true, code: true, name: true } },
      teacher: { select: { id: true, name: true } }
    }
  });

  res.status(201).json(new ApiResponse(201, material, 'Materi berhasil dibuat'));
});

// Update material
export const updateMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { title, description, classId, subjectId, isPublished, youtubeUrl } = req.body;
  const file = req.file;

  const existingMaterial = await prisma.material.findUnique({
    where: { id: parseInt(id) }
  });

  if (!existingMaterial) {
    throw new ApiError(404, 'Materi tidak ditemukan');
  }

  const updateData: any = {
    title,
    description,
    isPublished: isPublished !== undefined ? (isPublished === 'true' || isPublished === true) : undefined,
    youtubeUrl
  };

  if (classId) updateData.classId = parseInt(classId);
  if (subjectId) updateData.subjectId = parseInt(subjectId);

  if (file) {
    // TODO: Delete old file if exists
    updateData.fileUrl = `/uploads/materials/${file.filename}`;
    updateData.fileName = file.originalname;
    updateData.fileType = file.mimetype;
    updateData.fileSize = file.size;
  }

  const material = await prisma.material.update({
    where: { id: parseInt(id) },
    data: updateData
  });

  res.status(200).json(new ApiResponse(200, material, 'Materi berhasil diperbarui'));
});

// Delete material
export const deleteMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const material = await prisma.material.findUnique({
    where: { id: parseInt(id) }
  });

  if (!material) {
    throw new ApiError(404, 'Materi tidak ditemukan');
  }

  // TODO: Delete associated file if exists

  await prisma.material.delete({
    where: { id: parseInt(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Materi berhasil dihapus'));
});

// Copy material to other classes
export const copyMaterial = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { targetClassIds } = req.body; // Array of class IDs
  const user = (req as any).user;

  if (!Array.isArray(targetClassIds) || targetClassIds.length === 0) {
    throw new ApiError(400, 'Target kelas wajib dipilih');
  }

  const material = await prisma.material.findUnique({
    where: { id: parseInt(id) }
  });

  if (!material) {
    throw new ApiError(404, 'Materi tidak ditemukan');
  }

  // Ensure user owns the material (if teacher)
  if (user.role === 'TEACHER' && material.teacherId !== user.id) {
    throw new ApiError(403, 'Anda tidak memiliki akses untuk menyalin materi ini');
  }

  // Transaction to create copies
  const copies = await prisma.$transaction(
    targetClassIds.map((classId: number) => 
      prisma.material.create({
        data: {
          title: material.title,
          description: material.description,
          fileUrl: material.fileUrl,
          fileName: material.fileName,
          fileType: material.fileType,
          fileSize: material.fileSize,
          youtubeUrl: material.youtubeUrl,
          isPublished: material.isPublished,
          subjectId: material.subjectId,
          teacherId: user.id,
          classId: classId,
          academicYearId: material.academicYearId
        }
      })
    )
  );

  res.status(200).json(new ApiResponse(200, copies, 'Materi berhasil disalin ke kelas lain'));
});
