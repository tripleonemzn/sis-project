import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { writeAuditLog } from '../utils/auditLog';
import { z } from 'zod';
import { Role, AdditionalDuty, Gender, StudentStatus, VerificationStatus } from '@prisma/client';
import { validateCandidateProfileDocuments } from '../utils/candidateAdmissionDocuments';
import { getNisnValidationMessage, normalizeNisnInput } from '../utils/nisn';
import { resolveHistoricalStudentScope } from '../utils/studentAcademicHistory';
import { ensureAcademicYearArchiveReadAccess } from '../utils/academicYearArchiveAccess';

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

const nisnInputSchema = z
  .string()
  .transform((value) => normalizeNisnInput(value))
  .pipe(
    z.string().superRefine((value, ctx) => {
      const message = getNisnValidationMessage(value);
      if (message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message,
        });
      }
    }),
  );

const parentChildLinkSchema = z.object({
  nisn: nisnInputSchema,
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal lahir wajib menggunakan format YYYY-MM-DD'),
});

const parentChildLookupSchema = z.object({
  nisn: nisnInputSchema,
});

const parentChildSelect = {
  id: true,
  name: true,
  username: true,
  nis: true,
  nisn: true,
  birthDate: true,
  studentStatus: true,
  verificationStatus: true,
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
} as const;

function normalizeDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const { role, verificationStatus, class_id } = req.query;
  const user = (req as any).user;
  const where: any = {};
  let historicalStudentScope: Awaited<ReturnType<typeof resolveHistoricalStudentScope>> | null = null;
  
  if (role) {
    where.role = String(role);
  }

  if (verificationStatus) {
    where.verificationStatus = String(verificationStatus);
  }

  if (class_id) {
    const parsedClassId = Number(class_id);
    const normalizedRole = String(role || '').trim().toUpperCase();
    const shouldUseHistoricalStudentScope = !normalizedRole || normalizedRole === Role.STUDENT;

    if (shouldUseHistoricalStudentScope && Number.isFinite(parsedClassId) && parsedClassId > 0) {
      const selectedClass = await prisma.class.findUnique({
        where: { id: parsedClassId },
        select: { id: true, academicYearId: true },
      });

      if (selectedClass) {
        await ensureAcademicYearArchiveReadAccess({
          actorId: Number(user?.id || 0),
          actorRole: user?.role || null,
          academicYearId: selectedClass.academicYearId,
          module: 'CLASS_ROSTER',
          classId: selectedClass.id,
        });

        historicalStudentScope = await resolveHistoricalStudentScope({
          academicYearId: selectedClass.academicYearId,
          classId: selectedClass.id,
        });
        where.role = Role.STUDENT;
        where.id = {
          in: historicalStudentScope.studentIds.length > 0 ? historicalStudentScope.studentIds : [-1],
        };
      } else {
        where.role = Role.STUDENT;
        where.id = { in: [-1] };
      }
    } else {
      where.classId = parsedClassId;
    }
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

  const normalizedUsers = historicalStudentScope
    ? (users as Array<any>).map((user) => {
        const historicalStudent = historicalStudentScope.studentMap.get(Number(user.id));
        if (!historicalStudent?.studentClass) return user;

        return {
          ...user,
          classId: historicalStudent.studentClass.id,
          studentClass: {
            id: historicalStudent.studentClass.id,
            name: historicalStudent.studentClass.name,
            major: historicalStudent.studentClass.major
              ? {
                  id: historicalStudent.studentClass.major.id,
                  name: historicalStudent.studentClass.major.name,
                  code: historicalStudent.studentClass.major.code,
                }
              : null,
          },
        };
      })
    : users;

  res.status(200).json(new ApiResponse(200, normalizedUsers, 'Daftar pengguna berhasil diambil'));
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

export const listMyChildren = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, parent.children, 'Data anak berhasil diambil'));
});

export const lookupMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const { nisn } = parentChildLookupSchema.parse(req.query);

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const student = await prisma.user.findFirst({
    where: {
      role: Role.STUDENT,
      nisn,
    },
    select: {
      ...parentChildSelect,
      parents: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!student) {
    throw new ApiError(404, 'Data siswa dengan NISN tersebut tidak ditemukan');
  }

  const alreadyLinkedToCurrentParent = parent.children.some((child) => child.id === student.id);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        student: {
          id: student.id,
          name: student.name,
          username: student.username,
          nis: student.nis,
          nisn: student.nisn,
          birthDate: student.birthDate,
          studentStatus: student.studentStatus,
          verificationStatus: student.verificationStatus,
          studentClass: student.studentClass,
        },
        alreadyLinkedToCurrentParent,
        linkedParentCount: student.parents.length,
        oneTimeWarning:
          'Setiap NISN cukup dikaitkan satu kali ke akun ini. Jika memiliki lebih dari satu anak, ulangi proses dengan NISN yang berbeda.',
      },
      alreadyLinkedToCurrentParent
        ? 'Data siswa sudah terhubung ke akun orang tua ini'
        : 'Data siswa ditemukan. Lanjutkan verifikasi tanggal lahir untuk menghubungkan akun.',
    ),
  );
});

export const linkMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  const { nisn, birthDate } = parentChildLinkSchema.parse(req.body);

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
          nisn: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const student = await prisma.user.findFirst({
    where: {
      role: Role.STUDENT,
      nisn,
    },
    select: {
      id: true,
      name: true,
      nisn: true,
      birthDate: true,
    },
  });

  if (!student) {
    throw new ApiError(404, 'Data siswa dengan NISN tersebut tidak ditemukan');
  }

  if (!student.birthDate) {
    throw new ApiError(400, 'Data tanggal lahir siswa belum tersedia. Hubungi admin sekolah.');
  }

  if (normalizeDateOnly(student.birthDate) !== birthDate) {
    throw new ApiError(400, 'NISN dan tanggal lahir tidak cocok');
  }

  const alreadyLinked = parent.children.some((child) => child.id === student.id);

  if (!alreadyLinked) {
    await prisma.user.update({
      where: { id: parent.id },
      data: {
        children: {
          connect: { id: student.id },
        },
      },
    });
  }

  const refreshedParent = await prisma.user.findUnique({
    where: { id: parent.id },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  res.status(alreadyLinked ? 200 : 201).json(
    new ApiResponse(
      alreadyLinked ? 200 : 201,
      refreshedParent?.children || [],
      alreadyLinked
        ? 'Data anak sudah terhubung ke akun orang tua ini'
        : `Data ${student.name} berhasil dihubungkan ke akun orang tua`,
    ),
  );
});

export const unlinkMyChild = asyncHandler(async (req: Request, res: Response) => {
  const currentUser = (req as Request & { user?: { id: number; role: Role } }).user;
  const childId = Number(req.params.childId);

  if (currentUser?.role !== Role.PARENT) {
    throw new ApiError(403, 'Halaman ini khusus untuk role orang tua');
  }

  if (!Number.isInteger(childId) || childId <= 0) {
    throw new ApiError(400, 'ID anak tidak valid');
  }

  const parent = await prisma.user.findUnique({
    where: { id: Number(currentUser.id) },
    select: {
      id: true,
      children: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  const child = parent.children.find((item) => item.id === childId);
  if (!child) {
    throw new ApiError(404, 'Data anak tidak terhubung ke akun orang tua ini');
  }

  await prisma.user.update({
    where: { id: parent.id },
    data: {
      children: {
        disconnect: { id: childId },
      },
    },
  });

  const refreshedParent = await prisma.user.findUnique({
    where: { id: parent.id },
    select: {
      children: {
        select: parentChildSelect,
        orderBy: {
          name: 'asc',
        },
      },
    },
  });

  res.status(200).json(
    new ApiResponse(200, refreshedParent?.children || [], `Data ${child.name} berhasil dilepas dari akun orang tua`),
  );
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { documents, childNisns, managedMajorIds, examinerMajorId, ...body } = createUserSchema.parse(req.body);

  if (body.role === Role.CALON_SISWA && documents) {
    const validation = validateCandidateProfileDocuments(documents);
    if (validation.errors.length > 0) {
      throw new ApiError(400, `Dokumen calon siswa tidak valid: ${validation.errors.join(' | ')}`);
    }
  }

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
    // Non-admin hanya boleh mengubah profil dirinya sendiri (termasuk password akun sendiri)
    delete body.username;
    delete body.nis;
    delete body.nisn;
    delete body.role;
    delete body.verificationStatus;
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

    if (roleAfterUpdate === Role.CALON_SISWA && documents) {
      const validation = validateCandidateProfileDocuments(documents);
      if (validation.errors.length > 0) {
        throw new ApiError(400, `Dokumen calon siswa tidak valid: ${validation.errors.join(' | ')}`);
      }
    }

    // Lock identity fields for student self-update
    if (currentUser?.role !== Role.ADMIN && user.role === Role.STUDENT) {
      delete body.name;
      delete body.nis;
      delete body.nisn;
    }

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

  try {
    await writeAuditLog(
      Number(currentUser?.id || 0),
      String(currentUser?.role || 'UNKNOWN'),
      null,
      'UPDATE',
      'USER',
      Number(id),
      {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
        classId: user.classId,
        nis: user.nis,
        nisn: user.nisn,
      },
      {
        id: updatedUser.id,
        name: updatedUser.name,
        username: updatedUser.username,
        role: updatedUser.role,
        classId: updatedUser.classId,
        nis: updatedUser.nis,
        nisn: updatedUser.nisn,
      },
      (req.body as any)?.reason || undefined,
    );
  } catch (auditError) {
    console.warn('[AUDIT] gagal mencatat update user', auditError);
  }

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
