import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { Role, AdditionalDuty, Gender, StudentStatus, VerificationStatus } from '@prisma/client';

const dateSchema = z
  .string()
  .transform((str, ctx) => {
    if (!str) return null;
    const date = new Date(str);
    if (isNaN(date.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Format tanggal tidak valid',
      });
      return z.NEVER;
    }
    return date;
  })
  .optional()
  .nullable();

const emailSchema = z
  .string()
  .email()
  .or(z.literal(''))
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value));

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.nativeEnum(Role),
  nip: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  birthPlace: z.string().optional().nullable(),
  birthDate: dateSchema,
  email: emailSchema,
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  religion: z.string().optional().nullable(),
  nik: z.string().optional().nullable(),
  nuptk: z.string().optional().nullable(),
  motherName: z.string().optional().nullable(),
  childNumber: z.number().int().optional().nullable(),
  siblingsCount: z.number().int().optional().nullable(),
  preferences: z.any().optional().nullable(),
  fatherName: z.string().optional().nullable(),
  fatherOccupation: z.string().optional().nullable(),
  fatherIncome: z.string().optional().nullable(),
  motherOccupation: z.string().optional().nullable(),
  motherIncome: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianOccupation: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: dateSchema,
  institution: z.string().optional().nullable(),
  classId: z.number().optional().nullable(),
  documents: z.array(z.object({
    title: z.string(),
    fileUrl: z.string(),
    category: z.string(),
  })).optional(),
  studentStatus: z.nativeEnum(StudentStatus).optional().default(StudentStatus.ACTIVE),
  additionalDuties: z.array(z.nativeEnum(AdditionalDuty)).optional(),
  managedMajorIds: z.array(z.number()).optional(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
});

const updateUserSchema = z.object({
  username: z.string().min(3).optional(),
  password: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  // Profile fields
  nip: z.string().optional().nullable(),
  nis: z.string().optional().nullable(),
  nisn: z.string().optional().nullable(),
  gender: z.nativeEnum(Gender).optional().nullable(),
  birthPlace: z.string().optional().nullable(),
  birthDate: dateSchema,
  email: emailSchema,
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  photo: z.string().optional().nullable(),
  
  // New Personal Data
  religion: z.string().optional().nullable(),
  nik: z.string().optional().nullable(),
  nuptk: z.string().optional().nullable(),
  motherName: z.string().optional().nullable(),
  childNumber: z.number().int().optional().nullable(),
  siblingsCount: z.number().int().optional().nullable(),
  fatherName: z.string().optional().nullable(),
  fatherOccupation: z.string().optional().nullable(),
  fatherIncome: z.string().optional().nullable(),
  motherOccupation: z.string().optional().nullable(),
  motherIncome: z.string().optional().nullable(),
  guardianName: z.string().optional().nullable(),
  guardianOccupation: z.string().optional().nullable(),
  guardianPhone: z.string().optional().nullable(),

  // New Contact Data
  rt: z.string().optional().nullable(),
  rw: z.string().optional().nullable(),
  dusun: z.string().optional().nullable(),
  village: z.string().optional().nullable(),
  subdistrict: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),

  // New Employment Data
  ptkType: z.string().optional().nullable(),
  employeeStatus: z.string().optional().nullable(),
  appointmentDecree: z.string().optional().nullable(),
  appointmentDate: dateSchema,
  institution: z.string().optional().nullable(),
  classId: z.number().optional().nullable(),

  // Documents (URLs and names)
  documents: z.array(z.object({
    title: z.string(),
    fileUrl: z.string(),
    category: z.string(),
  })).optional(),

  studentStatus: z.nativeEnum(StudentStatus).optional(),
  additionalDuties: z.array(z.nativeEnum(AdditionalDuty)).optional(),
  managedMajorIds: z.array(z.number()).optional(),
  examinerMajorId: z.number().optional().nullable(),
  childNisns: z.array(z.string()).optional(),
  verificationStatus: z.nativeEnum(VerificationStatus).optional(),
  preferences: z.any().optional().nullable(),
});

const bulkVerifySchema = z.object({
  userIds: z.array(z.number().int()).min(1),
});

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, verificationStatus, class_id } = req.query;
  const where: any = {};
  
  if (role) {
    where.role = String(role);
  }

  if (verificationStatus) {
    where.verificationStatus = String(verificationStatus);
  }

  if (class_id) {
    where.classId = Number(class_id);
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      nip: true,
      nis: true,
      nisn: true,
      gender: true,
      birthPlace: true,
      birthDate: true,
      email: true,
      phone: true,
      address: true,
      nik: true,
      nuptk: true,
      motherName: true,
      childNumber: true,
      siblingsCount: true,
      fatherName: true,
      fatherOccupation: true,
      fatherIncome: true,
      motherOccupation: true,
      motherIncome: true,
      guardianName: true,
      guardianOccupation: true,
      guardianPhone: true,
      rt: true,
      rw: true,
      dusun: true,
      village: true,
      subdistrict: true,
      postalCode: true,
      ptkType: true,
      employeeStatus: true,
      appointmentDecree: true,
      appointmentDate: true,
      institution: true,
      classId: true,
      studentClass: {
        select: {
          id: true,
          name: true,
          major: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      studentStatus: true,
      verificationStatus: true,
      additionalDuties: true,
      managedMajors: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      examinerMajor: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      teacherClasses: {
        select: {
          id: true,
          name: true,
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nisn: true,
        },
      },
      photo: true,
      preferences: true,
      documents: true,
      createdAt: true,
      updatedAt: true,
    } as any,
    orderBy: {
      name: 'asc',
    },
  });

  res.status(200).json(new ApiResponse(200, users, 'Daftar pengguna berhasil diambil'));
});

export const getUserById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
    include: {
      documents: true,
      studentClass: {
        select: {
          id: true,
          name: true,
        },
      },
      managedMajors: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      examinerMajor: {
        select: {
          id: true,
          name: true,
          code: true
        }
      },
      teacherClasses: {
        select: {
          id: true,
          name: true
        }
      },
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nisn: true,
        }
      }
    }
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const { password, ...userWithoutPassword } = user;

  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Data pengguna berhasil diambil'));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { documents, childNisns, managedMajorIds, examinerMajorId, ...body } = createUserSchema.parse(req.body);

  // Enforce username = NISN for students
  if (body.role === Role.STUDENT) {
    if (!body.nisn) {
      throw new ApiError(400, 'NISN wajib diisi untuk siswa');
    }
    body.username = body.nisn;
  }

  const existingUser = await prisma.user.findUnique({
    where: { username: body.username },
  });

  if (existingUser) {
    throw new ApiError(400, 'Username sudah digunakan');
  }

  const hashedPassword = await bcrypt.hash(body.password, 10);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        ...body,
        password: hashedPassword,
        birthDate: (body as any).birthDate ?? undefined,
        examinerMajorId: examinerMajorId,
        managedMajors: managedMajorIds ? {
          connect: managedMajorIds.map(id => ({ id }))
        } : undefined,
        documents: documents ? {
          create: documents
        } : undefined
      },
      include: {
        documents: true,
        children: {
          select: {
            id: true,
            name: true,
            username: true,
            nisn: true,
          }
        }
      }
    });

    if (body.role === Role.PARENT && Array.isArray(childNisns)) {
      const normalizedChildNisns = childNisns
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (normalizedChildNisns.length > 0) {
        const children = await tx.user.findMany({
          where: {
            role: Role.STUDENT,
            nisn: {
              in: normalizedChildNisns,
            },
          },
        });

        if (children.length !== normalizedChildNisns.length) {
          throw new ApiError(400, 'Beberapa NISN siswa tidak ditemukan');
        }

        await tx.user.update({
          where: { id: created.id },
          data: {
            children: {
              connect: children.map((child) => ({ id: child.id })),
            },
          },
        });
      }
    }

    return created;
  });

  const { password, ...userWithoutPassword } = user;

  res.status(201).json(new ApiResponse(201, userWithoutPassword, 'Pengguna berhasil dibuat'));
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // @ts-ignore
  const currentUser = req.user;
  if (currentUser?.role !== Role.ADMIN && currentUser?.id !== Number(id)) {
    throw new ApiError(403, 'Anda tidak memiliki izin untuk mengubah data pengguna ini');
  }

  const { documents, childNisns, managedMajorIds, examinerMajorId, ...body } = updateUserSchema.parse(req.body);

  // Prevent non-admin from updating sensitive fields
  if (currentUser?.role !== Role.ADMIN) {
    delete body.username;
    delete body.password;
    // For students, nisn is username, so prevent updating it too
    delete body.nisn;
  }

  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (body.username && body.username !== user.username) {
    const existingUser = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existingUser) {
      throw new ApiError(400, 'Username sudah digunakan');
    }
  }

  let hashedPassword = undefined;
  if (body.password) {
    hashedPassword = await bcrypt.hash(body.password, 10);
  }

  const updatedUser = await prisma.$transaction(async (tx) => {
    const roleAfterUpdate = body.role ?? user.role;

    // Enforce username = NISN for students
    if (roleAfterUpdate === Role.STUDENT) {
      const nisnToUse = body.nisn || user.nisn;
      if (!nisnToUse) {
        throw new ApiError(400, 'NISN wajib diisi untuk siswa');
      }
      // Override username with NISN
      body.username = nisnToUse;
    }

    let childrenData:
      | {
          set: { id: number }[];
        }
      | undefined;

    if (typeof childNisns !== 'undefined') {
      const normalizedChildNisns = childNisns
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      if (roleAfterUpdate === Role.PARENT && normalizedChildNisns.length > 0) {
        const children = await tx.user.findMany({
          where: {
            role: Role.STUDENT,
            nisn: {
              in: normalizedChildNisns,
            },
          },
        });

        if (children.length !== normalizedChildNisns.length) {
          throw new ApiError(400, 'Beberapa NISN siswa tidak ditemukan');
        }

        childrenData = {
          set: children.map((child) => ({ id: child.id })),
        };
      } else {
        childrenData = {
          set: [],
        };
      }
    }

    const updated = await tx.user.update({
      where: { id: Number(id) },
      data: {
        ...body,
        password: hashedPassword,
        birthDate: (body as any).birthDate ?? undefined,
        examinerMajorId: examinerMajorId,
        managedMajors: managedMajorIds ? {
          set: managedMajorIds.map(id => ({ id }))
        } : undefined,
        // documents handled separately below
        ...(typeof childrenData !== 'undefined'
          ? {
              children: childrenData,
            }
          : {}),
      },
      include: {
        documents: true,
        children: {
          select: {
            id: true,
            name: true,
            username: true,
            nisn: true,
          },
        },
      },
    });

    if (documents) {
      await tx.user.update({
        where: { id: Number(id) },
        data: {
          documents: {
            deleteMany: {},
            create: documents,
          },
        },
      });
    }

    return await tx.user.findUniqueOrThrow({
        where: { id: Number(id) },
        include: {
            documents: true,
            children: {
                select: {
                    id: true,
                    name: true,
                    username: true,
                    nisn: true,
                },
            },
        }
    });
  });

  const { password: _, ...userWithoutPassword } = updatedUser;

  res.status(200).json(new ApiResponse(200, userWithoutPassword, 'Pengguna berhasil diperbarui'));
});

export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: Number(id) },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  // Prevent deleting self (optional but good practice)
  // @ts-ignore
  if (req.user?.id === user.id) {
     throw new ApiError(400, 'Tidak dapat menghapus akun sendiri');
  }

  await prisma.user.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Pengguna berhasil dihapus'));
});

export const verifyUsersBulk = asyncHandler(async (req: Request, res: Response) => {
  const { userIds } = bulkVerifySchema.parse(req.body);

  const result = await prisma.user.updateMany({
    where: {
      id: { in: userIds },
      verificationStatus: VerificationStatus.PENDING,
    },
    data: {
      verificationStatus: VerificationStatus.VERIFIED,
    },
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        { updatedCount: result.count },
        'Verifikasi massal pengguna berhasil',
      ),
    );
});
