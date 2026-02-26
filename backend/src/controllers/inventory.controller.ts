import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
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
});

const updateRoomSchema = createRoomSchema.partial();

const createLibraryBookLoanSchema = z.object({
  borrowDate: z.string().min(1),
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

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIBRARY_FINE_PER_DAY = 1000;

function isValidExpoPushToken(token: string) {
  return /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(token);
}

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

function chunkArray<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

async function sendPushNotificationToUser(userId: number, payload: { title: string; message: string; data?: Record<string, unknown> }) {
  const devices = await prisma.mobilePushDevice.findMany({
    where: {
      userId,
      isEnabled: true,
    },
    select: {
      expoPushToken: true,
    },
  });
  if (!devices.length) return;

  const uniqueTokens = Array.from(
    new Set(devices.map((device) => device.expoPushToken).filter((token) => isValidExpoPushToken(token))),
  );
  if (!uniqueTokens.length) return;

  const staleTokens = new Set<string>();
  const chunks = chunkArray(
    uniqueTokens.map((token) => ({
      to: token,
      title: payload.title,
      body: payload.message,
      sound: 'default',
      priority: 'high',
      data: payload.data || {},
    })),
    100,
  );

  for (const chunk of chunks) {
    try {
      const response = await axios.post(EXPO_PUSH_API_URL, chunk, {
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        timeout: 12000,
      });
      const tickets = Array.isArray(response.data?.data) ? response.data.data : [];
      tickets.forEach((ticket: any, index: number) => {
        if (ticket?.status === 'ok') return;
        const token = chunk[index]?.to;
        const errorCode = String(ticket?.details?.error || '');
        if (token && errorCode === 'DeviceNotRegistered') {
          staleTokens.add(token);
        }
      });
    } catch {
      continue;
    }
  }

  if (staleTokens.size > 0) {
    await prisma.mobilePushDevice.updateMany({
      where: {
        expoPushToken: { in: Array.from(staleTokens) },
      },
      data: {
        isEnabled: false,
        lastSeenAt: new Date(),
      },
    });
  }
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

    await prisma.notification.create({
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
    await sendPushNotificationToUser(loan.borrowerUserId!, {
      title,
      message,
      data: {
        type: 'LIBRARY_OVERDUE',
        loanId: loan.id,
        finePerDay: status.finePerDay,
        fineAmount: status.fineAmount,
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
  const { categoryId } = req.query;

  const where: any = {};
  if (categoryId) {
    where.categoryId = Number(categoryId);
  }

  const rooms = await prisma.room.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      category: true,
      _count: {
        select: { items: true }
      }
    }
  });

  res.status(200).json(new ApiResponse(200, rooms, 'Data ruangan berhasil diambil'));
});

export const getRoomById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const room = await prisma.room.findUnique({
    where: { id: Number(id) },
    include: {
      items: true,
      category: true,
    }
  });

  if (!room) {
    throw new ApiError(404, 'Ruangan tidak ditemukan');
  }

  res.status(200).json(new ApiResponse(200, room, 'Data ruangan berhasil diambil'));
});

export const createRoom = asyncHandler(async (req: Request, res: Response) => {
  const body = createRoomSchema.parse(req.body);

  const room = await prisma.room.create({
    data: body
  });

  res.status(201).json(new ApiResponse(201, room, 'Ruangan berhasil dibuat'));
});

export const updateRoom = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateRoomSchema.parse(req.body);

  const room = await prisma.room.update({
    where: { id: Number(id) },
    data: body
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

  const items = await prisma.inventoryItem.findMany({
    where: { roomId: Number(roomId) },
    orderBy: { name: 'asc' }
  });

  res.status(200).json(new ApiResponse(200, items, 'Data inventaris berhasil diambil'));
});

export const createInventory = asyncHandler(async (req: Request, res: Response) => {
  const body = createInventorySchema.parse(req.body);

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
    const currentItem = await prisma.inventoryItem.findUnique({ where: { id: Number(id) } });
    if (currentItem) {
      const g = body.goodQty ?? currentItem.goodQty;
      const m = body.minorDamageQty ?? currentItem.minorDamageQty;
      const d = body.majorDamageQty ?? currentItem.majorDamageQty;
      dataToUpdate.quantity = g + m + d;
      dataToUpdate.goodQty = g;
      dataToUpdate.minorDamageQty = m;
      dataToUpdate.majorDamageQty = d;
    }
  }

  const item = await prisma.inventoryItem.update({
    where: { id: Number(id) },
    data: dataToUpdate
  });

  res.status(200).json(new ApiResponse(200, item, 'Item inventaris berhasil diperbarui'));
});

export const deleteInventory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

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

  const row = await prisma.libraryBookLoan.create({
    data: {
      borrowDate,
      borrowerName,
      borrowerStatus,
      classId,
      bookTitle,
      publishYear: body.publishYear,
      returnDate,
      returnStatus: body.returnStatus || 'NOT_RETURNED',
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
  const nextBorrowerUserId = await resolveBorrowerUserId({
    borrowerName: nextBorrowerName,
    borrowerStatus: nextBorrowerStatus,
    classId: nextClassId,
    phoneNumber: nextPhoneNumber,
  });

  const updateData: Record<string, unknown> = {
    borrowerStatus: nextBorrowerStatus,
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
    updateData.bookTitle = body.bookTitle.trim();
  }
  if (body.publishYear !== undefined) {
    updateData.publishYear = body.publishYear;
  }
  if (body.returnDate !== undefined) {
    updateData.returnDate = parseOptionalDate(body.returnDate, 'Tanggal pengembalian');
  }
  if (body.returnStatus !== undefined) {
    updateData.returnStatus = body.returnStatus;
    if (body.returnStatus === 'RETURNED') {
      updateData.overdueNotifiedAt = null;
    }
  }
  if (body.phoneNumber !== undefined) {
    updateData.phoneNumber = nextPhoneNumber;
  }
  if (body.returnDate !== undefined && body.returnStatus !== 'RETURNED') {
    updateData.overdueNotifiedAt = null;
  }

  const row = await prisma.libraryBookLoan.update({
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

  await prisma.libraryBookLoan.delete({
    where: { id: Number(id) },
  });

  res.status(200).json(new ApiResponse(200, null, 'Peminjaman buku berhasil dihapus'));
});
