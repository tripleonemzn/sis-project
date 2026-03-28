import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { listHistoricalStudentsForClass } from '../utils/studentAcademicHistory';
import {
  ensureAcademicYearArchiveReadAccess,
  ensureAcademicYearArchiveWriteAccess,
} from '../utils/academicYearArchiveAccess';

const classSchema = z.object({
  name: z.string().min(1, 'Nama kelas wajib diisi'),
  level: z.string().min(1, 'Tingkat kelas wajib diisi'), // X, XI, XII
  majorId: z.number().int('Jurusan tidak valid'),
  academicYearId: z.number().int('Tahun ajaran tidak valid'),
  teacherId: z.number().int().optional().nullable(),
});

const updatePresidentSchema = z.object({
  presidentId: z.number().int().nullable(),
});

async function runWithConcurrencyLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const results: R[] = [];
  for (let index = 0; index < items.length; index += normalizedLimit) {
    const batch = items.slice(index, index + normalizedLimit);
    const batchResults = await Promise.all(batch.map((item) => worker(item)));
    results.push(...batchResults);
  }
  return results;
}

export const updateClassPresident = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { presidentId } = updatePresidentSchema.parse(req.body);
  const existingClass = await prisma.class.findUnique({
    where: { id: Number(id) },
    select: { id: true, academicYearId: true },
  });

  if (!existingClass) {
    throw new Error('Kelas tidak ditemukan');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existingClass.academicYearId,
    module: 'CLASS_ROSTER',
  });

  const updatedClass = await prisma.class.update({
    where: { id: Number(id) },
    data: { presidentId },
  });

  res.status(200).json(new ApiResponse(200, updatedClass, 'Ketua murid berhasil diperbarui'));
});

export const getClasses = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, level, majorId, academicYearId, teacherId } = req.query;
  const user = (req as any).user;
  const pageNum = Number(page);
  const limitNum = Number(limit);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};

  if (search) {
    where.name = { contains: String(search), mode: 'insensitive' };
  }

  if (level) {
    where.level = String(level);
  }

  if (majorId) {
    where.majorId = Number(majorId);
  }

  if (academicYearId) {
    where.academicYearId = Number(academicYearId);
  }

  if (teacherId) {
    where.teacherId = Number(teacherId);
  }

  const academicYearIdNum = Number(academicYearId || 0);
  if (Number.isFinite(academicYearIdNum) && academicYearIdNum > 0) {
    await ensureAcademicYearArchiveReadAccess({
      actorId: Number(user?.id || 0),
      actorRole: user?.role || null,
      academicYearId: academicYearIdNum,
      module: 'CLASS_ROSTER',
      teacherId: teacherId ? Number(teacherId) : null,
    });
  }

  const [total, classes] = await Promise.all([
    prisma.class.count({ where }),
    prisma.class.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: [
        { level: 'asc' },
        { major: { code: 'asc' } },
        { name: 'asc' },
      ],
      include: {
        major: {
          select: { id: true, name: true, code: true },
        },
        academicYear: {
          select: { id: true, name: true, isActive: true },
        },
        teacher: {
          select: { id: true, name: true, username: true },
        },
        president: {
          select: { id: true, name: true },
        },
        _count: {
          select: { students: true },
        },
      },
    }),
  ]);

  const historicalCounts = await runWithConcurrencyLimit(classes, 5, async (classItem) => {
    const students = await listHistoricalStudentsForClass(classItem.id, classItem.academicYearId);
    return {
      classId: classItem.id,
      studentCount: students.length,
    };
  });

  const historicalCountMap = new Map(
    historicalCounts.map((item) => [item.classId, item.studentCount]),
  );

  const normalizedClasses = classes.map((classItem) => ({
    ...classItem,
    _count: {
      ...classItem._count,
      students: historicalCountMap.get(classItem.id) ?? classItem._count.students,
    },
  }));

  res.status(200).json(
    new ApiResponse(
      200,
      {
        classes: normalizedClasses,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      },
      'Data kelas berhasil diambil'
    )
  );
});

export const getClassById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  const classData = await prisma.class.findUnique({
    where: { id: Number(id) },
    include: {
      major: {
        select: { id: true, name: true, code: true },
      },
      academicYear: {
        select: { id: true, name: true },
      },
      teacher: {
        select: { id: true, name: true },
      },
      president: {
        select: { id: true, name: true },
      },
      _count: {
        select: { students: true },
      },
    },
  });

  if (!classData) {
    throw new Error('Kelas tidak ditemukan');
  }

  await ensureAcademicYearArchiveReadAccess({
    actorId: Number(user?.id || 0),
    actorRole: user?.role || null,
    academicYearId: classData.academicYearId,
    module: 'CLASS_ROSTER',
    classId: classData.id,
  });

  const historicalStudents = await listHistoricalStudentsForClass(
    classData.id,
    classData.academicYearId,
  );

  const normalizedClassData = {
    ...classData,
    students: historicalStudents.map((student) => ({
      id: student.id,
      name: student.name,
      nis: student.nis,
      nisn: student.nisn,
      gender: student.gender,
      studentStatus: student.studentStatus,
    })),
    _count: {
      ...classData._count,
      students: historicalStudents.length,
    },
  };

  res.status(200).json(new ApiResponse(200, normalizedClassData, 'Detail kelas berhasil diambil'));
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = classSchema.parse(req.body);

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: validatedData.academicYearId,
    module: 'CLASS_ROSTER',
  });

  // Check for duplicate name in same academic year
  const existingClass = await prisma.class.findFirst({
    where: {
      name: { equals: validatedData.name, mode: 'insensitive' },
      academicYearId: validatedData.academicYearId,
    },
  });

  if (existingClass) {
    res.status(400).json(new ApiResponse(400, null, 'Nama kelas sudah ada pada tahun ajaran tersebut'));
    return;
  }

  const newClass = await prisma.class.create({
    data: validatedData,
    include: {
      major: true,
      academicYear: true,
      teacher: true,
    },
  });

  res.status(201).json(new ApiResponse(201, newClass, 'Kelas berhasil dibuat'));
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validatedData = classSchema.parse(req.body);

  const existingClass = await prisma.class.findUnique({
    where: { id: Number(id) },
  });

  if (!existingClass) {
    throw new Error('Kelas tidak ditemukan');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existingClass.academicYearId,
    module: 'CLASS_ROSTER',
  });

  if (existingClass.academicYearId !== validatedData.academicYearId) {
    await ensureAcademicYearArchiveWriteAccess({
      academicYearId: validatedData.academicYearId,
      module: 'CLASS_ROSTER',
    });
  }

  // Check for duplicate name in same academic year (excluding current class)
  const duplicateClass = await prisma.class.findFirst({
    where: {
      name: { equals: validatedData.name, mode: 'insensitive' },
      academicYearId: validatedData.academicYearId,
      NOT: { id: Number(id) },
    },
  });

  if (duplicateClass) {
    res.status(400).json(new ApiResponse(400, null, 'Nama kelas sudah ada pada tahun ajaran tersebut'));
    return;
  }

  const updatedClass = await prisma.class.update({
    where: { id: Number(id) },
    data: validatedData,
    include: {
      major: true,
      academicYear: true,
      teacher: true,
    },
  });

  res.status(200).json(new ApiResponse(200, updatedClass, 'Kelas berhasil diperbarui'));
});

export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if class exists
  const existingClass = await prisma.class.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      academicYearId: true,
    },
  });

  if (!existingClass) {
    throw new Error('Kelas tidak ditemukan');
  }

  await ensureAcademicYearArchiveWriteAccess({
    academicYearId: existingClass.academicYearId,
    module: 'CLASS_ROSTER',
  });

  const historicalStudents = await listHistoricalStudentsForClass(
    existingClass.id,
    existingClass.academicYearId,
  );

  // Prevent deletion if has students
  if (historicalStudents.length > 0) {
    res.status(400).json(new ApiResponse(400, null, 'Tidak dapat menghapus kelas yang memiliki siswa'));
    return;
  }

  await prisma.class.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Kelas berhasil dihapus'));
});
