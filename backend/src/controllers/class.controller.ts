import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

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

export const updateClassPresident = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { presidentId } = updatePresidentSchema.parse(req.body);

  const updatedClass = await prisma.class.update({
    where: { id: Number(id) },
    data: { presidentId },
  });

  res.status(200).json(new ApiResponse(200, updatedClass, 'Ketua murid berhasil diperbarui'));
});

export const getClasses = asyncHandler(async (req: Request, res: Response) => {
  const { page = 1, limit = 10, search, level, majorId, academicYearId, teacherId } = req.query;
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

  res.status(200).json(
    new ApiResponse(
      200,
      {
        classes,
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
      students: {
        select: {
          id: true,
          name: true,
          nis: true,
          nisn: true,
          gender: true,
          studentStatus: true,
        },
        orderBy: { name: 'asc' },
      },
      _count: {
        select: { students: true },
      },
    },
  });

  if (!classData) {
    throw new Error('Kelas tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, classData, 'Detail kelas berhasil diambil'));
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  const validatedData = classSchema.parse(req.body);

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
    include: {
      _count: {
        select: { students: true },
      },
    },
  });

  if (!existingClass) {
    throw new Error('Kelas tidak ditemukan');
  }

  // Prevent deletion if has students
  if (existingClass._count.students > 0) {
    res.status(400).json(new ApiResponse(400, null, 'Tidak dapat menghapus kelas yang memiliki siswa'));
    return;
  }

  await prisma.class.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Kelas berhasil dihapus'));
});
