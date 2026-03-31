import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createInAppNotification } from '../services/mobilePushNotification.service';
// import { RoomType } from '@prisma/client'; // Deprecated
// Verified: Prisma Client updated.

// Inventory Schema (Re-adding missing schema)
const createInventorySchema = z.object({
  roomId: z.number().int(),
  name: z.string().min(1),
  code: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.number().int().default(0), // Will be recalculated
  goodQty: z.number().int().min(0).default(0),
  minorDamageQty: z.number().int().min(0).default(0),
  majorDamageQty: z.number().int().min(0).default(0),
  condition: z.string().optional(), // Deprecated
  purchaseDate: z.string().optional().transform(str => str ? new Date(str) : undefined),
  price: z.number().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  attributes: z.record(z.string(), z.any()).optional(),
});

const updateInventorySchema = createInventorySchema.partial().omit({ roomId: true });

const normalizeTemplateKey = (value?: string) => {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return 'STANDARD';
  return raw;
};

// Schemas
const createRoomCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inventoryTemplateKey: z.string().optional(),
});

const updateRoomCategorySchema = createRoomCategorySchema.partial();

const createRoomSchema = z.object({
  name: z.string().min(1),
  categoryId: z.number().int(),
  capacity: z.number().int().optional(),
  location: z.string().optional(),
  condition: z.string().optional(),
  description: z.string().optional(),
  managerUserId: z.number().int().nullable().optional(),
});

const updateRoomSchema = createRoomSchema.partial();

const INVENTORY_PRIVILEGED_DUTIES = [
  'WAKASEK_SARPRAS',
  'SEKRETARIS_SARPRAS',
  'KEPALA_LAB',
  'KEPALA_PERPUSTAKAAN',
] as const;

type InventoryAuthUser = {
  id: number;
  role: string;
  name: string;
  ptkType?: string | null;
  additionalDuties?: string[] | null;
};

const getInventoryAuthUser = async (
  req: Request | AuthRequest,
): Promise<InventoryAuthUser | null> => {
  const authId = Number((req as AuthRequest).user?.id || 0);
  if (!Number.isFinite(authId) || authId <= 0) return null;
  return prisma.user.findUnique({
    where: { id: authId },
    select: {
      id: true,
      role: true,
      name: true,
      ptkType: true,
      additionalDuties: true,
    },
  });
};

const hasPrivilegedInventoryAccess = (user: InventoryAuthUser | null) => {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (user.role !== 'TEACHER') return false;
  const duties = Array.isArray(user.additionalDuties) ? user.additionalDuties : [];
  return duties.some((duty) =>
    INVENTORY_PRIVILEGED_DUTIES.includes(
      String(duty).toUpperCase() as (typeof INVENTORY_PRIVILEGED_DUTIES)[number],
    ),
  );
};

const normalizeComparableText = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const syncAdvisorInventoryRoomManagers = async (userId: number) => {
  if (!Number.isFinite(userId) || userId <= 0) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      additionalDuties: true,
    },
  });

  if (!user || user.role !== 'TEACHER') return;

  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  const duties = (user.additionalDuties || []).map((item) => String(item || '').trim().toUpperCase());
  const teacherAssignments = activeAcademicYear?.id
    ? await prisma.ekstrakurikulerTutorAssignment.findMany({
        where: {
          tutorId: user.id,
          academicYearId: activeAcademicYear.id,
          isActive: true,
        },
        select: {
          id: true,
          ekskul: {
            select: {
              id: true,
              name: true,
              category: true,
            },
          },
        },
      })
    : [];

  const roomIdsToAssign = new Set<number>();

  for (const assignment of teacherAssignments) {
    const ekskulName = normalizeComparableText(assignment.ekskul?.name);
    if (!ekskulName || String(assignment.ekskul?.category || '').toUpperCase() === 'OSIS') continue;

    const room = await prisma.room.findFirst({
      where: {
        name: {
          equals: assignment.ekskul?.name || '',
          mode: 'insensitive',
        },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        managerUserId: true,
        managerUser: {
          select: {
            role: true,
          },
        },
      },
    });

    const managerRole = String(room?.managerUser?.role || '').trim().toUpperCase();
    if (
      room?.id &&
      room.managerUserId !== user.id &&
      (!room.managerUserId || managerRole === 'EXTRACURRICULAR_TUTOR')
    ) {
      roomIdsToAssign.add(room.id);
    }
  }

  if (duties.includes('PEMBINA_OSIS')) {
    const osisRoom = await prisma.room.findFirst({
      where: {
        name: {
          contains: 'OSIS',
          mode: 'insensitive',
        },
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        managerUserId: true,
        managerUser: {
          select: {
            role: true,
          },
        },
      },
    });

    const managerRole = String(osisRoom?.managerUser?.role || '').trim().toUpperCase();
    if (
      osisRoom?.id &&
      osisRoom.managerUserId !== user.id &&
      (!osisRoom.managerUserId || ['EXTRACURRICULAR_TUTOR', 'ADMIN'].includes(managerRole))
    ) {
      roomIdsToAssign.add(osisRoom.id);
    }
  }

  if (!roomIdsToAssign.size) return;

  await prisma.room.updateMany({
    where: {
      id: {
        in: Array.from(roomIdsToAssign),
      },
    },
    data: {
      managerUserId: user.id,
    },
  });
};

const assertAssignableManager = async (managerUserId?: number | null) => {
  if (!managerUserId) return null;
  const manager = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: {
      id: true,
      role: true,
      name: true,
      ptkType: true,
      additionalDuties: true,
    },
  });
  if (!manager || !['ADMIN', 'TEACHER', 'STAFF', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR'].includes(manager.role)) {
    throw new ApiError(400, 'Penanggung jawab ruangan tidak valid');
  }
  return manager;
};

export const getAssignableInventoryManagers = asyncHandler(async (_req: Request, res: Response) => {
  const activeAcademicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  const users = await prisma.user.findMany({
    where: {
      verificationStatus: 'VERIFIED',
      role: {
        in: ['TEACHER', 'STAFF', 'PRINCIPAL', 'EXTRACURRICULAR_TUTOR'],
      },
    },
    orderBy: [
      { role: 'asc' },
      { name: 'asc' },
    ],
    select: {
      id: true,
      name: true,
      role: true,
      ptkType: true,
      additionalDuties: true,
      ekskulTutorAssignments: {
        where: {
          isActive: true,
          ...(activeAcademicYear?.id ? { academicYearId: activeAcademicYear.id } : {}),
        },
        select: {
          ekskul: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  const data = users.map((user) => {
    const extracurricularNames = user.ekskulTutorAssignments
      .map((assignment) => assignment.ekskul?.name?.trim())
      .filter((value): value is string => Boolean(value));

    let displayLabel = user.ptkType || user.role;
    if (user.role === 'EXTRACURRICULAR_TUTOR') {
      displayLabel =
        extracurricularNames.length > 0
          ? `Pembina Ekskul - ${extracurricularNames.join(', ')}`
          : 'Pembina Ekskul';
    }

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      ptkType: user.ptkType,
      additionalDuties: user.additionalDuties,
      extracurricularNames,
      displayLabel,
    };
  });

  res.status(200).json(new ApiResponse(200, data, 'Daftar penanggung jawab inventaris berhasil diambil'));
});

export const getAssignedInventoryRooms = asyncHandler(async (req: Request, res: Response) => {
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  if (!authUser) throw new ApiError(401, 'Pengguna tidak ditemukan');

  await syncDefaultInventoryRoomManagers();
  await syncAdvisorInventoryRoomManagers(authUser.id);

  const rooms = await prisma.room.findMany({
    where: {
      managerUserId: authUser.id,
    },
    orderBy: { name: 'asc' },
    include: {
      category: true,
      managerUser: {
        select: {
          id: true,
          name: true,
          role: true,
          ptkType: true,
          additionalDuties: true,
        },
      },
      _count: {
        select: { items: true },
      },
    },
  });

  res.status(200).json(new ApiResponse(200, rooms, 'Data inventaris tugas berhasil diambil'));
});

const syncDefaultInventoryRoomManagers = async () => {
  const [headLabUser, headLibraryUser] = await Promise.all([
    prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        additionalDuties: {
          has: 'KEPALA_LAB',
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
    prisma.user.findFirst({
      where: {
        role: 'TEACHER',
        additionalDuties: {
          has: 'KEPALA_PERPUSTAKAAN',
        },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    }),
  ]);

  const updates: Prisma.PrismaPromise<Prisma.BatchPayload>[] = [];

  if (headLabUser?.id) {
    updates.push(
      prisma.room.updateMany({
        where: {
          managerUserId: null,
          OR: [
            {
              category: {
                inventoryTemplateKey: 'LAB',
              },
            },
            {
              name: {
                contains: 'LAB',
                mode: 'insensitive',
              },
            },
          ],
        },
        data: {
          managerUserId: headLabUser.id,
        },
      }),
    );
  }

  if (headLibraryUser?.id) {
    updates.push(
      prisma.room.updateMany({
        where: {
          managerUserId: null,
          OR: [
            {
              category: {
                inventoryTemplateKey: 'LIBRARY',
              },
            },
            {
              category: {
                name: {
                  contains: 'PERPUSTAKAAN',
                  mode: 'insensitive',
                },
              },
            },
            {
              name: {
                contains: 'PERPUSTAKAAN',
                mode: 'insensitive',
              },
            },
          ],
        },
        data: {
          managerUserId: headLibraryUser.id,
        },
      }),
    );
  }

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
};

const assertRoomInventoryAccess = async (
  roomId: number,
  authUser: InventoryAuthUser | null,
) => {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    select: { id: true, managerUserId: true },
  });
  if (!room) throw new ApiError(404, 'Ruangan tidak ditemukan');
  if (hasPrivilegedInventoryAccess(authUser)) return room;
  if (authUser?.id && room.managerUserId === authUser.id) return room;
  throw new ApiError(403, 'Anda tidak memiliki akses ke inventaris ruangan ini');
};

const createLibraryBookLoanSchema = z.object({
  borrowDate: z.string().min(1),
  borrowQty: z.number().int().min(1).max(200).default(1),
  borrowerName: z.string().min(1),
  borrowerStatus: z.enum(['TEACHER', 'STUDENT']),
  classId: z.number().int().nullable().optional(),
  bookTitle: z.string().min(1),
  publishYear: z.number().int().min(1900).max(2100).optional(),
  returnDate: z.string().optional().nullable(),
  returnStatus: z.enum(['RETURNED', 'NOT_RETURNED']).optional(),
  phoneNumber: z.string().optional(),
});

const updateLibraryBookLoanSchema = createLibraryBookLoanSchema.partial();

const updateLibraryLoanPolicySchema = z.object({
  finePerDay: z.number().int().min(0).max(1_000_000),
});

const parseRequiredDate = (value: string, label: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${label} tidak valid`);
  }
  return parsed;
};

const parseOptionalDate = (value: string | null | undefined, label: string) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, `${label} tidak valid`);
  }
  return parsed;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIBRARY_FINE_PER_DAY = 1000;

function normalizeName(value?: string | null) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value?: string | null) {
  return String(value || '').replace(/\D+/g, '').trim();
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCurrencyIdr(amount: number) {
  return new Intl.NumberFormat('id-ID').format(Math.max(0, Math.trunc(amount || 0)));
}

async function ensureLibraryLoanPolicy() {
  return prisma.libraryLoanPolicy.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      finePerDay: DEFAULT_LIBRARY_FINE_PER_DAY,
    },
  });
}

function getLoanDerivedStatus(row: {
  returnStatus: 'RETURNED' | 'NOT_RETURNED';
  returnDate?: Date | null;
}, finePerDay = DEFAULT_LIBRARY_FINE_PER_DAY) {
  if (row.returnStatus === 'RETURNED') {
    return {
      code: 'RETURNED' as const,
      label: 'Dikembalikan',
      isOverdue: false,
      overdueDays: 0,
      finePerDay,
      fineAmount: 0,
    };
  }
  if (row.returnDate) {
    const dueDay = startOfDay(new Date(row.returnDate));
    const today = startOfDay(new Date());
    if (today > dueDay) {
      const overdueDays = Math.max(1, Math.floor((today.getTime() - dueDay.getTime()) / DAY_IN_MS));
      const fineAmount = overdueDays * Math.max(0, finePerDay);
      return {
        code: 'OVERDUE' as const,
        label: `Terlambat ${overdueDays} hari`,
        isOverdue: true,
        overdueDays,
        finePerDay,
        fineAmount,
      };
    }
  }
  return {
    code: 'BORROWED' as const,
    label: 'Dipinjam',
    isOverdue: false,
    overdueDays: 0,
    finePerDay,
    fineAmount: 0,
  };
}

function getBorrowableQty(item: {
  quantity: number;
  goodQty: number;
  minorDamageQty: number;
  majorDamageQty: number;
}) {
  if (item.goodQty > 0) return item.goodQty;
  const fallback = item.quantity - item.minorDamageQty - item.majorDamageQty;
  return Math.max(0, fallback);
}

async function getLibraryBookStockCandidates(
  tx: Prisma.TransactionClient,
  bookTitle: string,
) {
  const normalizedTitle = String(bookTitle || '').trim();
  if (!normalizedTitle) return [];
  return tx.inventoryItem.findMany({
    where: {
      name: {
        equals: normalizedTitle,
        mode: 'insensitive',
      },
      room: {
        category: {
          OR: [
            { inventoryTemplateKey: 'LIBRARY' },
            { name: { contains: 'PERPUSTAKAAN', mode: 'insensitive' } },
            { name: { contains: 'PUSTAKA', mode: 'insensitive' } },
          ],
        },
      },
    },
    orderBy: [{ goodQty: 'desc' }, { quantity: 'desc' }, { id: 'asc' }],
  });
}

function resolveLibraryBookPublishYear(
  items: Array<{
    attributes?: Prisma.JsonValue | null;
    publishYear?: number | null;
  }>,
) {
  const parseFromAttributes = (rawAttributes: Prisma.JsonValue | null | undefined) => {
    if (!rawAttributes || typeof rawAttributes !== 'object' || Array.isArray(rawAttributes)) return null;
    const attributes = rawAttributes as Record<string, unknown>;
    const candidateValues = [
      attributes.publishYear,
      attributes.year,
      attributes.tahunTerbit,
      attributes.tahun_terbit,
      attributes.tahunterbit,
      attributes['tahun terbit'],
    ];
    for (const rawValue of candidateValues) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed) && parsed >= 1900 && parsed <= 2100) {
        return Math.trunc(parsed);
      }
    }
    return null;
  };

  const years = items
    .map((item) => Number(item.publishYear ?? parseFromAttributes(item.attributes)))
    .filter((value) => Number.isFinite(value) && value >= 1900 && value <= 2100)
    .map((value) => Math.trunc(value));
  if (years.length === 0) return null;
  return Math.max(...years);
}

async function consumeLibraryBookStock(
  tx: Prisma.TransactionClient,
  bookTitle: string,
  qty: number,
) {
  const requestedQty = Math.max(0, Math.trunc(qty || 0));
  if (requestedQty <= 0) return;

  const candidates = await getLibraryBookStockCandidates(tx, bookTitle);
  if (!candidates.length) {
    throw new ApiError(
      400,
      `Buku "${bookTitle}" belum terdaftar di inventaris perpustakaan.`,
    );
  }

  const totalAvailable = candidates.reduce((sum, item) => sum + getBorrowableQty(item), 0);
  if (totalAvailable < requestedQty) {
    throw new ApiError(
      400,
      `Stok buku "${bookTitle}" tidak cukup. Tersedia ${totalAvailable}, diminta ${requestedQty}.`,
    );
  }

  let remaining = requestedQty;
  for (const item of candidates) {
    if (remaining <= 0) break;
    const available = getBorrowableQty(item);
    if (available <= 0) continue;
    const taken = Math.min(available, remaining);

    const currentGood = getBorrowableQty(item);
    const nextGood = Math.max(0, currentGood - taken);
    const nextQty = Math.max(0, item.quantity - taken);

    await tx.inventoryItem.update({
      where: { id: item.id },
      data: {
        goodQty: nextGood,
        quantity: nextQty,
      },
    });

    remaining -= taken;
  }
}

async function restoreLibraryBookStock(
  tx: Prisma.TransactionClient,
  bookTitle: string,
  qty: number,
) {
  const restoreQty = Math.max(0, Math.trunc(qty || 0));
  if (restoreQty <= 0) return;

  const candidates = await getLibraryBookStockCandidates(tx, bookTitle);
  if (!candidates.length) {
    throw new ApiError(
      400,
      `Inventaris buku "${bookTitle}" tidak ditemukan saat mengembalikan stok.`,
    );
  }

  const target = candidates[0];
  await tx.inventoryItem.update({
    where: { id: target.id },
    data: {
      goodQty: target.goodQty + restoreQty,
      quantity: target.quantity + restoreQty,
    },
  });
}

async function resolveBorrowerUserId(args: {
  borrowerName: string;
  borrowerStatus: 'TEACHER' | 'STUDENT';
  classId: number | null;
  phoneNumber?: string | null;
}) {
  const normalizedBorrowerName = normalizeName(args.borrowerName);
  if (!normalizedBorrowerName) return null;

  const role = args.borrowerStatus === 'STUDENT' ? 'STUDENT' : 'TEACHER';
  const nameExactMatch = await prisma.user.findFirst({
    where: {
      role,
      name: {
        equals: args.borrowerName.trim(),
        mode: 'insensitive',
      },
      ...(role === 'STUDENT' && args.classId ? { classId: args.classId } : {}),
    },
    select: { id: true },
  });
  if (nameExactMatch) return nameExactMatch.id;

  const candidates = await prisma.user.findMany({
    where: {
      role,
      ...(role === 'STUDENT' && args.classId ? { classId: args.classId } : {}),
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
    take: 200,
  });

  const borrowerPhone = normalizePhone(args.phoneNumber);
  const borrowerPhoneTail = borrowerPhone.length > 8 ? borrowerPhone.slice(-8) : borrowerPhone;
  let selectedId: number | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    let score = 0;
    const normalizedCandidateName = normalizeName(candidate.name);
    if (normalizedCandidateName === normalizedBorrowerName) score += 5;
    if (
      normalizedCandidateName.includes(normalizedBorrowerName) ||
      normalizedBorrowerName.includes(normalizedCandidateName)
    ) {
      score += 3;
    }

    const candidatePhone = normalizePhone(candidate.phone);
    if (borrowerPhone && candidatePhone && borrowerPhone === candidatePhone) score += 6;
    if (
      borrowerPhoneTail &&
      borrowerPhoneTail.length >= 8 &&
      candidatePhone.endsWith(borrowerPhoneTail)
    ) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      selectedId = candidate.id;
    }
  }

  return bestScore > 0 ? selectedId : null;
}

type LibraryLoanReminderRow = {
  id: number;
  borrowerUserId: number | null;
  overdueNotifiedAt: Date | null;
  bookTitle: string;
  returnDate: Date | null;
  returnStatus: 'RETURNED' | 'NOT_RETURNED';
};

export async function dispatchLibraryOverdueReminders(rowsInput?: LibraryLoanReminderRow[]) {
  const now = new Date();
  const loanPolicy = await ensureLibraryLoanPolicy();
  const rows =
    rowsInput ||
    (await prisma.libraryBookLoan.findMany({
      where: {
        returnStatus: 'NOT_RETURNED',
        returnDate: { not: null },
        borrowerUserId: { not: null },
      },
      select: {
        id: true,
        borrowerUserId: true,
        overdueNotifiedAt: true,
        bookTitle: true,
        returnDate: true,
        returnStatus: true,
      },
      orderBy: [{ returnDate: 'asc' }, { id: 'asc' }],
    }));

  const overdueCandidates = rows.filter((row) => {
    const status = getLoanDerivedStatus({
      returnStatus: row.returnStatus,
      returnDate: row.returnDate,
    }, loanPolicy.finePerDay);
    return status.code === 'OVERDUE' && !!row.borrowerUserId;
  });

  for (const loan of overdueCandidates) {
    const hasBeenNotifiedToday =
      !!loan.overdueNotifiedAt &&
      startOfDay(new Date(loan.overdueNotifiedAt)).getTime() === startOfDay(now).getTime();
    if (hasBeenNotifiedToday) continue;

    const status = getLoanDerivedStatus({
      returnStatus: loan.returnStatus,
      returnDate: loan.returnDate,
    }, loanPolicy.finePerDay);
    if (status.code !== 'OVERDUE') continue;

    const title = 'Pengingat Pengembalian Buku';
    const message = `Buku "${loan.bookTitle}" sudah melewati tenggat ${status.overdueDays} hari. Denda berjalan Rp${formatCurrencyIdr(
      status.fineAmount,
    )} (Rp${formatCurrencyIdr(status.finePerDay)}/hari). Mohon segera dikembalikan.`;

    await createInAppNotification({
      data: {
        userId: loan.borrowerUserId!,
        title,
        message,
        type: 'LIBRARY_OVERDUE',
        data: {
          loanId: loan.id,
          overdueDays: status.overdueDays,
          finePerDay: status.finePerDay,
          fineAmount: status.fineAmount,
          returnDate: loan.returnDate,
          bookTitle: loan.bookTitle,
        },
      },
    });

    await prisma.libraryBookLoan.update({
      where: { id: loan.id },
      data: { overdueNotifiedAt: now },
    });
  }

  return {
    checked: rows.length,
    overdue: overdueCandidates.length,
  };
}

// Room Category Controllers
export const getRoomCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await prisma.roomCategory.findMany({
    orderBy: { id: 'asc' },
    include: {
      _count: {
        select: { rooms: true }
      }
    }
  });

  res.status(200).json(new ApiResponse(200, categories, 'Data kategori berhasil diambil'));
});

export const createRoomCategory = asyncHandler(async (req: Request, res: Response) => {
  const body = createRoomCategorySchema.parse(req.body);

  const category = await prisma.roomCategory.create({
    data: {
      name: body.name,
      description: body.description,
      inventoryTemplateKey: normalizeTemplateKey(body.inventoryTemplateKey),
    }
  });

  res.status(201).json(new ApiResponse(201, category, 'Kategori berhasil dibuat'));
});

export const updateRoomCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateRoomCategorySchema.parse(req.body);

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.inventoryTemplateKey !== undefined) {
    updateData.inventoryTemplateKey = normalizeTemplateKey(body.inventoryTemplateKey);
  }

  const category = await prisma.roomCategory.update({
    where: { id: Number(id) },
    data: updateData,
  });

  res.status(200).json(new ApiResponse(200, category, 'Kategori berhasil diperbarui'));
});

export const deleteRoomCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if category has rooms
  const category = await prisma.roomCategory.findUnique({
    where: { id: Number(id) },
    include: { _count: { select: { rooms: true } } }
  });

  if (!category) {
    throw new ApiError(404, 'Kategori tidak ditemukan');
  }

  if (category._count.rooms > 0) {
    throw new ApiError(400, 'Kategori tidak dapat dihapus karena masih memiliki ruangan. Silakan hapus atau pindahkan ruangan terlebih dahulu.');
  }

  await prisma.roomCategory.delete({
    where: { id: Number(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Kategori berhasil dihapus'));
});

// Room Controllers
export const getRooms = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId, assignedOnly } = req.query;
  const authUser = await getInventoryAuthUser(req as AuthRequest);

  await syncDefaultInventoryRoomManagers();

  const where: any = {};
  if (categoryId) {
    where.categoryId = Number(categoryId);
  }
  if (String(assignedOnly || '').toLowerCase() === 'true') {
    if (!authUser) throw new ApiError(401, 'Pengguna tidak ditemukan');
    await syncAdvisorInventoryRoomManagers(authUser.id);
    where.managerUserId = authUser.id;
  }

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      category: true,
      managerUser: {
        select: {
          id: true,
          name: true,
          role: true,
          ptkType: true,
          additionalDuties: true,
        },
      },
      _count: {
        select: { items: true }
      }
    }
  });

  res.status(200).json(new ApiResponse(200, rooms, 'Data ruangan berhasil diambil'));
});

export const getRoomById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  await assertRoomInventoryAccess(Number(id), authUser);

  const room = await prisma.room.findUnique({
    where: { id: Number(id) },
    include: {
      items: true,
      category: true,
      managerUser: {
        select: {
          id: true,
          name: true,
          role: true,
          ptkType: true,
          additionalDuties: true,
        },
      },
    }
  });

  if (!room) {
    throw new ApiError(404, 'Ruangan tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, room, 'Data ruangan berhasil diambil'));
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const body = createRoomSchema.parse(req.body);
  await assertAssignableManager(body.managerUserId);

  const room = await prisma.room.create({
    data: body,
    include: {
      category: true,
      managerUser: {
        select: {
          id: true,
          name: true,
          role: true,
          ptkType: true,
          additionalDuties: true,
        },
      },
    },
  });

  res.status(201).json(new ApiResponse(201, room, 'Ruangan berhasil dibuat'));
});

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateRoomSchema.parse(req.body);
  await assertAssignableManager(body.managerUserId);

  const room = await prisma.room.update({
    where: { id: Number(id) },
    data: body,
    include: {
      category: true,
      managerUser: {
        select: {
          id: true,
          name: true,
          role: true,
          ptkType: true,
          additionalDuties: true,
        },
      },
    },
  });

  res.status(200).json(new ApiResponse(200, room, 'Ruangan berhasil diperbarui'));
});

export const deleteRoom = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Check if room has items
  const room = await prisma.room.findUnique({
    where: { id: Number(id) },
    include: { _count: { select: { items: true } } }
  });

  if (!room) {
    throw new ApiError(404, 'Ruangan tidak ditemukan');
  }

  if (room._count.items > 0) {
    throw new ApiError(400, 'Ruangan tidak dapat dihapus karena masih memiliki Item/Daftar Inventaris di dalamnya.');
  }

  await prisma.room.delete({
    where: { id: Number(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Ruangan berhasil dihapus'));
});

// Inventory Controllers
export const getInventoryByRoom = asyncHandler(async (req: Request, res: Response) => {
  const { roomId } = req.params;
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  await assertRoomInventoryAccess(Number(roomId), authUser);

  const items = await prisma.inventoryItem.findMany({
    where: { roomId: Number(roomId) },
    orderBy: { name: 'asc' }
  });

  res.status(200).json(new ApiResponse(200, items, 'Data inventaris berhasil diambil'));
});

export const createInventory = asyncHandler(async (req: Request, res: Response) => {
  const body = createInventorySchema.parse(req.body);
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  await assertRoomInventoryAccess(body.roomId, authUser);

  // Verify room exists
  const room = await prisma.room.findUnique({
    where: { id: body.roomId }
  });
  if (!room) {
    throw new ApiError(404, 'Ruangan tidak ditemukan');
  }

  // Calculate total quantity from breakdown
  const totalQty = (body.goodQty || 0) + (body.minorDamageQty || 0) + (body.majorDamageQty || 0);
  
  // Use calculated quantity if breakdown is provided, otherwise fallback to provided quantity (legacy support)
  // But if both are 0, default to 1? No, 0 is allowed.
  const finalQuantity = totalQty > 0 ? totalQty : (body.quantity || 0);

  const item = await prisma.inventoryItem.create({
    data: {
      ...body,
      quantity: finalQuantity,
      goodQty: body.goodQty || 0,
      minorDamageQty: body.minorDamageQty || 0,
      majorDamageQty: body.majorDamageQty || 0
    }
  });

  res.status(201).json(new ApiResponse(201, item, 'Item inventaris berhasil ditambahkan'));
});

export const updateInventory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateInventorySchema.parse(req.body);
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  const currentItem = await prisma.inventoryItem.findUnique({
    where: { id: Number(id) },
    select: {
      id: true,
      roomId: true,
      quantity: true,
      goodQty: true,
      minorDamageQty: true,
      majorDamageQty: true,
    },
  });
  if (!currentItem) {
    throw new ApiError(404, 'Item inventaris tidak ditemukan');
  }
  await assertRoomInventoryAccess(currentItem.roomId, authUser);

  // Recalculate quantity if breakdown fields are present
  // Note: For update, we need to be careful. If only one field is updated, we might need current values.
  // But standard PUT/PATCH usually sends what changed.
  // Ideally, frontend sends all 3 qty fields.
  
  let dataToUpdate: any = { ...body };

  // If any qty field is updated, we should ideally re-sum.
  // But since it's a partial update, we might miss the other values.
  // Safer approach: If any qty field is provided, we fetch the existing item to calculate new total?
  // OR we just assume the frontend sends all qty fields if it changes them.
  // Let's rely on the frontend sending consistent data or simple logic here.
  
  if (body.goodQty !== undefined || body.minorDamageQty !== undefined || body.majorDamageQty !== undefined) {
    const g = body.goodQty ?? currentItem.goodQty;
    const m = body.minorDamageQty ?? currentItem.minorDamageQty;
    const d = body.majorDamageQty ?? currentItem.majorDamageQty;
    dataToUpdate.quantity = g + m + d;
    dataToUpdate.goodQty = g;
    dataToUpdate.minorDamageQty = m;
    dataToUpdate.majorDamageQty = d;
  }

  const item = await prisma.inventoryItem.update({
    where: { id: Number(id) },
    data: dataToUpdate
  });

  res.status(200).json(new ApiResponse(200, item, 'Item inventaris berhasil diperbarui'));
});

export const deleteInventory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const authUser = await getInventoryAuthUser(req as AuthRequest);
  const currentItem = await prisma.inventoryItem.findUnique({
    where: { id: Number(id) },
    select: { id: true, roomId: true },
  });
  if (!currentItem) {
    throw new ApiError(404, 'Item inventaris tidak ditemukan');
  }
  await assertRoomInventoryAccess(currentItem.roomId, authUser);

  await prisma.inventoryItem.delete({
    where: { id: Number(id) }
  });

  res.status(200).json(new ApiResponse(200, null, 'Item inventaris berhasil dihapus'));
});

// Library Book Loans Controllers
export const getLibraryLoanSettings = asyncHandler(async (_req: Request, res: Response) => {
  const policy = await ensureLibraryLoanPolicy();
  res.status(200).json(
    new ApiResponse(
      200,
      {
        finePerDay: policy.finePerDay,
        updatedAt: policy.updatedAt,
      },
      'Pengaturan denda peminjaman buku berhasil diambil',
    ),
  );
});

export const updateLibraryLoanSettings = asyncHandler(async (req: Request, res: Response) => {
  const body = updateLibraryLoanPolicySchema.parse(req.body);
  const policy = await prisma.libraryLoanPolicy.upsert({
    where: { id: 1 },
    update: {
      finePerDay: body.finePerDay,
    },
    create: {
      id: 1,
      finePerDay: body.finePerDay,
    },
  });

  res.status(200).json(
    new ApiResponse(
      200,
      {
        finePerDay: policy.finePerDay,
        updatedAt: policy.updatedAt,
      },
      'Pengaturan denda peminjaman buku berhasil diperbarui',
    ),
  );
});

export const getLibraryLoanClassOptions = asyncHandler(async (req: Request, res: Response) => {
  const classes = await prisma.class.findMany({
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      level: true,
      major: {
        select: {
          code: true,
          name: true,
        },
      },
    },
  });

  const mapped = classes.map((row) => {
    const majorLabel = row.major?.code || row.major?.name || '';
    const displayName = majorLabel ? `${row.name} - ${majorLabel}` : row.name;
    return {
      id: row.id,
      name: row.name,
      level: row.level,
      major: row.major,
      displayName,
    };
  });

  res.status(200).json(new ApiResponse(200, mapped, 'Daftar kelas untuk peminjaman buku berhasil diambil'));
});

export const getLibraryLoanBookOptions = asyncHandler(async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();

  const items = await prisma.inventoryItem.findMany({
    where: {
      ...(query
        ? {
            name: {
              contains: query,
              mode: 'insensitive',
            },
          }
        : {}),
      room: {
        category: {
          OR: [
            { inventoryTemplateKey: 'LIBRARY' },
            { name: { contains: 'PERPUSTAKAAN', mode: 'insensitive' } },
            { name: { contains: 'PUSTAKA', mode: 'insensitive' } },
          ],
        },
      },
    },
    select: {
      id: true,
      name: true,
      quantity: true,
      goodQty: true,
      minorDamageQty: true,
      majorDamageQty: true,
      attributes: true,
      room: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  const grouped = new Map<
    string,
    {
      title: string;
      availableQty: number;
      totalQty: number;
      publishYear: number | null;
      roomNames: Set<string>;
    }
  >();

  for (const item of items) {
    const rawTitle = String(item.name || '').trim();
    if (!rawTitle) continue;
    const key = rawTitle.toLowerCase();
    const current = grouped.get(key) || {
      title: rawTitle,
      availableQty: 0,
      totalQty: 0,
      publishYear: null,
      roomNames: new Set<string>(),
    };
    current.availableQty += getBorrowableQty(item);
    current.totalQty += Math.max(0, Number(item.quantity || 0));
    const parsedPublishYear = resolveLibraryBookPublishYear([item]);
    if (parsedPublishYear !== null) {
      const normalizedPublishYear = Math.trunc(parsedPublishYear);
      current.publishYear =
        current.publishYear === null
          ? normalizedPublishYear
          : Math.max(current.publishYear, normalizedPublishYear);
    }
    if (item.room?.name) current.roomNames.add(item.room.name);
    grouped.set(key, current);
  }

  const mapped = Array.from(grouped.values())
    .map((row) => ({
      title: row.title,
      availableQty: Math.max(0, Math.trunc(row.availableQty || 0)),
      totalQty: Math.max(0, Math.trunc(row.totalQty || 0)),
      publishYear: row.publishYear,
      roomCount: row.roomNames.size,
      roomNames: Array.from(row.roomNames).sort((a, b) => a.localeCompare(b, 'id-ID')).slice(0, 3),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'id-ID'));

  res.status(200).json(
    new ApiResponse(200, mapped, 'Daftar judul buku inventaris perpustakaan berhasil diambil'),
  );
});

export const getLibraryBookLoans = asyncHandler(async (req: Request, res: Response) => {
  const query = String(req.query.q || '').trim();
  const loanPolicy = await ensureLibraryLoanPolicy();

  const where: any = {};
  if (query) {
    where.OR = [
      { borrowerName: { contains: query, mode: 'insensitive' } },
      { bookTitle: { contains: query, mode: 'insensitive' } },
      { phoneNumber: { contains: query, mode: 'insensitive' } },
      {
        class: {
          name: { contains: query, mode: 'insensitive' },
        },
      },
    ];
  }

  const rows = await prisma.libraryBookLoan.findMany({
    where,
    include: {
      class: {
        select: {
          id: true,
          name: true,
          level: true,
          major: {
            select: {
              code: true,
              name: true,
            },
          },
        },
      },
      borrowerUser: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ borrowDate: 'desc' }, { id: 'desc' }],
  });

  await dispatchLibraryOverdueReminders(
    rows.map((row) => ({
      id: row.id,
      borrowerUserId: row.borrowerUserId,
      overdueNotifiedAt: row.overdueNotifiedAt,
      bookTitle: row.bookTitle,
      returnDate: row.returnDate,
      returnStatus: row.returnStatus,
    })),
  );

  const mappedRows = rows.map((row) => {
    const status = getLoanDerivedStatus({
      returnStatus: row.returnStatus,
      returnDate: row.returnDate,
    }, loanPolicy.finePerDay);
    return {
      ...row,
      displayStatus: status.code,
      statusLabel: status.label,
      isOverdue: status.isOverdue,
      overdueDays: status.overdueDays,
      finePerDay: status.finePerDay,
      fineAmount: status.fineAmount,
    };
  });

  res.status(200).json(new ApiResponse(200, mappedRows, 'Daftar peminjaman buku berhasil diambil'));
});

export const createLibraryBookLoan = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = createLibraryBookLoanSchema.parse(req.body);
  const loanPolicy = await ensureLibraryLoanPolicy();
  const borrowDate = parseRequiredDate(body.borrowDate, 'Tanggal pinjam');
  const borrowQty = Math.max(1, Math.trunc(body.borrowQty || 1));
  const returnDate = parseOptionalDate(body.returnDate, 'Tanggal pengembalian');
  const borrowerStatus = body.borrowerStatus;
  const borrowerName = body.borrowerName.trim();
  const bookTitle = body.bookTitle.trim();
  const phoneNumber = body.phoneNumber?.trim() || null;

  let classId = body.classId ?? null;
  if (borrowerStatus === 'STUDENT' && !classId) {
    throw new ApiError(400, 'Kelas wajib dipilih jika status peminjam adalah siswa');
  }
  if (borrowerStatus === 'TEACHER') {
    classId = null;
  }

  if (classId) {
    const classExists = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!classExists) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
  }

  const borrowerUserId = await resolveBorrowerUserId({
    borrowerName,
    borrowerStatus,
    classId,
    phoneNumber,
  });
  const nextReturnStatus = body.returnStatus || 'NOT_RETURNED';

  const row = await prisma.$transaction(async (tx) => {
    const bookCandidates = await getLibraryBookStockCandidates(tx, bookTitle);
    const resolvedPublishYear = resolveLibraryBookPublishYear(bookCandidates);

    if (nextReturnStatus !== 'RETURNED') {
      await consumeLibraryBookStock(tx, bookTitle, borrowQty);
    }

    return tx.libraryBookLoan.create({
      data: {
        borrowDate,
        borrowQty,
        borrowerName,
        borrowerStatus,
        classId,
        bookTitle,
        publishYear: resolvedPublishYear ?? body.publishYear ?? null,
        returnDate,
        returnStatus: nextReturnStatus,
        phoneNumber,
        createdById: req.user?.id,
        borrowerUserId,
        overdueNotifiedAt: null,
      },
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        borrowerUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  const status = getLoanDerivedStatus({
    returnStatus: row.returnStatus,
    returnDate: row.returnDate,
  }, loanPolicy.finePerDay);
  res.status(201).json(
    new ApiResponse(
      201,
      {
        ...row,
        displayStatus: status.code,
        statusLabel: status.label,
        isOverdue: status.isOverdue,
        overdueDays: status.overdueDays,
        finePerDay: status.finePerDay,
        fineAmount: status.fineAmount,
      },
      'Peminjaman buku berhasil ditambahkan',
    ),
  );
});

export const updateLibraryBookLoan = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateLibraryBookLoanSchema.parse(req.body);
  const loanId = Number(id);
  const loanPolicy = await ensureLibraryLoanPolicy();

  const existing = await prisma.libraryBookLoan.findUnique({
    where: { id: loanId },
  });
  if (!existing) {
    throw new ApiError(404, 'Data peminjaman buku tidak ditemukan');
  }

  const nextBorrowerStatus = body.borrowerStatus ?? existing.borrowerStatus;
  const nextBorrowQty =
    body.borrowQty !== undefined
      ? Math.max(1, Math.trunc(body.borrowQty))
      : Math.max(1, existing.borrowQty || 1);
  let nextClassId = body.classId === undefined ? existing.classId : body.classId;
  if (nextBorrowerStatus === 'TEACHER') {
    nextClassId = null;
  }
  if (nextBorrowerStatus === 'STUDENT' && !nextClassId) {
    throw new ApiError(400, 'Kelas wajib dipilih jika status peminjam adalah siswa');
  }
  if (nextClassId) {
    const classExists = await prisma.class.findUnique({ where: { id: nextClassId }, select: { id: true } });
    if (!classExists) {
      throw new ApiError(404, 'Kelas tidak ditemukan');
    }
  }
  const nextBorrowerName =
    body.borrowerName !== undefined ? body.borrowerName.trim() : existing.borrowerName;
  const nextPhoneNumber =
    body.phoneNumber !== undefined ? body.phoneNumber?.trim() || null : existing.phoneNumber;
  const nextBookTitle = body.bookTitle !== undefined ? body.bookTitle.trim() : existing.bookTitle;
  const nextReturnStatus = body.returnStatus ?? existing.returnStatus;
  const nextBorrowerUserId = await resolveBorrowerUserId({
    borrowerName: nextBorrowerName,
    borrowerStatus: nextBorrowerStatus,
    classId: nextClassId,
    phoneNumber: nextPhoneNumber,
  });

  const updateData: Record<string, unknown> = {
    borrowerStatus: nextBorrowerStatus,
    borrowQty: nextBorrowQty,
    classId: nextClassId,
    borrowerUserId: nextBorrowerUserId,
  };

  if (body.borrowDate !== undefined) {
    updateData.borrowDate = parseRequiredDate(body.borrowDate, 'Tanggal pinjam');
  }
  if (body.borrowerName !== undefined) {
    updateData.borrowerName = nextBorrowerName;
  }
  if (body.bookTitle !== undefined) {
    updateData.bookTitle = nextBookTitle;
  }
  if (body.returnDate !== undefined) {
    updateData.returnDate = parseOptionalDate(body.returnDate, 'Tanggal pengembalian');
  }
  if (body.returnStatus !== undefined) {
    updateData.returnStatus = nextReturnStatus;
    if (nextReturnStatus === 'RETURNED') {
      updateData.overdueNotifiedAt = null;
    }
  }
  if (body.phoneNumber !== undefined) {
    updateData.phoneNumber = nextPhoneNumber;
  }
  if (body.returnDate !== undefined && body.returnStatus !== 'RETURNED') {
    updateData.overdueNotifiedAt = null;
  }

  const oldBorrowQty = Math.max(1, existing.borrowQty || 1);
  const oldBookTitle = existing.bookTitle;
  const oldActive = existing.returnStatus !== 'RETURNED';
  const newActive = nextReturnStatus !== 'RETURNED';

  const row = await prisma.$transaction(async (tx) => {
    if (oldActive) {
      if (!newActive) {
        await restoreLibraryBookStock(tx, oldBookTitle, oldBorrowQty);
      } else if (oldBookTitle.toLowerCase() !== nextBookTitle.toLowerCase()) {
        await restoreLibraryBookStock(tx, oldBookTitle, oldBorrowQty);
        await consumeLibraryBookStock(tx, nextBookTitle, nextBorrowQty);
      } else if (nextBorrowQty > oldBorrowQty) {
        await consumeLibraryBookStock(tx, nextBookTitle, nextBorrowQty - oldBorrowQty);
      } else if (nextBorrowQty < oldBorrowQty) {
        await restoreLibraryBookStock(tx, oldBookTitle, oldBorrowQty - nextBorrowQty);
      }
    } else if (newActive) {
      await consumeLibraryBookStock(tx, nextBookTitle, nextBorrowQty);
    }

    if (body.bookTitle !== undefined || body.publishYear !== undefined) {
      const publishYearCandidates = await getLibraryBookStockCandidates(tx, nextBookTitle);
      const resolvedPublishYear = resolveLibraryBookPublishYear(publishYearCandidates);
      updateData.publishYear = resolvedPublishYear ?? body.publishYear ?? null;
    }

    return tx.libraryBookLoan.update({
      where: { id: loanId },
      data: updateData,
      include: {
        class: {
          select: {
            id: true,
            name: true,
            level: true,
            major: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
        borrowerUser: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });

  const status = getLoanDerivedStatus({
    returnStatus: row.returnStatus,
    returnDate: row.returnDate,
  }, loanPolicy.finePerDay);
  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...row,
        displayStatus: status.code,
        statusLabel: status.label,
        isOverdue: status.isOverdue,
        overdueDays: status.overdueDays,
        finePerDay: status.finePerDay,
        fineAmount: status.fineAmount,
      },
      'Peminjaman buku berhasil diperbarui',
    ),
  );
});

export const deleteLibraryBookLoan = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const loanId = Number(id);
  const existing = await prisma.libraryBookLoan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      bookTitle: true,
      borrowQty: true,
      returnStatus: true,
    },
  });
  if (!existing) {
    throw new ApiError(404, 'Data peminjaman buku tidak ditemukan');
  }

  await prisma.$transaction(async (tx) => {
    if (existing.returnStatus !== 'RETURNED') {
      await restoreLibraryBookStock(tx, existing.bookTitle, Math.max(1, existing.borrowQty || 1));
    }

    await tx.libraryBookLoan.delete({
      where: { id: loanId },
    });
  });

  res.status(200).json(new ApiResponse(200, null, 'Peminjaman buku berhasil dihapus'));
});
