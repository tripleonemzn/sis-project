import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';
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
});

const updateInventorySchema = createInventorySchema.partial().omit({ roomId: true });

// Schemas
const createRoomCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
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
    data: body
  });

  res.status(201).json(new ApiResponse(201, category, 'Kategori berhasil dibuat'));
});

export const updateRoomCategory = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const body = updateRoomCategorySchema.parse(req.body);

  const category = await prisma.roomCategory.update({
    where: { id: Number(id) },
    data: body
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
      items: true
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
