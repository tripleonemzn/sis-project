import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import { z } from 'zod';

const listSchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  action: z.string().optional(),
  entity: z.string().optional(),
  actorId: z.coerce.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { role: true, additionalDuties: true },
  });
  if (!dutyUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }
  if (dutyUser.role !== 'ADMIN') {
    const duties = (dutyUser.additionalDuties || []).map((d: any) => String(d).trim().toUpperCase());
    const allowed = duties.includes('WAKASEK_KURIKULUM') || duties.includes('SEKRETARIS_KURIKULUM');
    if (!allowed) {
      throw new ApiError(403, 'Anda tidak memiliki hak akses untuk melihat riwayat audit');
    }
  }

  const { page = 1, limit = 20, search, action, entity, actorId, startDate, endDate } = listSchema.parse(req.query);

  const where: any = {};
  if (action && action.trim().length > 0) where.action = action;
  if (entity && entity.trim().length > 0) where.entity = entity;
  if (actorId) where.actorId = actorId;
  if (startDate || endDate) {
    const createdAt: any = {};
    if (startDate) createdAt.gte = new Date(startDate as string);
    if (endDate) {
      const d = new Date(endDate as string);
      createdAt.lte = d;
    }
    where.createdAt = createdAt;
  }
  if (search && search.trim().length > 0) {
    const term = search.trim();
    where.OR = [
      { action: { contains: term, mode: 'insensitive' } },
      { entity: { contains: term, mode: 'insensitive' } },
      { reason: { contains: term, mode: 'insensitive' } },
      { actor: { name: { contains: term, mode: 'insensitive' } } },
      { actor: { username: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const skip = (page - 1) * limit;

  const [total, logs] = await Promise.all([
    (prisma as any).auditLog.count({ where }),
    (prisma as any).auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, name: true, username: true, role: true },
        },
      },
    }),
  ]);

  res.status(200).json(
    new ApiResponse(
      200,
      {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      },
      'Riwayat audit berhasil diambil',
    ),
  );
});
