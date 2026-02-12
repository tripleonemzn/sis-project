import { Request, Response } from 'express';
import { z } from 'zod';
import { AdditionalDuty } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const createBudgetRequestSchema = z.object({
  title: z.string().min(1, 'Judul wajib diisi'),
  description: z.string().min(1, 'Uraian wajib diisi'),
  executionTime: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
  totalAmount: z.coerce.number().min(0),
  academicYearId: z.coerce.number().int(),
  additionalDuty: z.nativeEnum(AdditionalDuty),
  workProgramId: z.coerce.number().int().optional(),
});

export const createBudgetRequest = asyncHandler(async (req: Request, res: Response) => {
  const body = createBudgetRequestSchema.parse(req.body);
  const authUser = (req as any).user;
  
  if (!authUser) throw new ApiError(401, 'Tidak memiliki otorisasi');
  
  // Find Wakasek Sarpras
  const sarpras = await prisma.user.findFirst({
    where: { additionalDuties: { has: 'WAKASEK_SARPRAS' } },
  });

  const budget = await prisma.budgetRequest.create({
    data: {
      ...body,
      requesterId: authUser.id,
      approverId: sarpras?.id ?? null,
      approvalStatus: 'PENDING', // default pending approval
      updatedAt: new Date(), // Explicitly set updatedAt to satisfy type requirement
    },
  });
  
  res.status(201).json(new ApiResponse(201, budget, 'Pengajuan anggaran berhasil dibuat'));
});

export const listBudgetRequests = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (!authUser) throw new ApiError(401, 'Tidak memiliki otorisasi');

  const { academicYearId, additionalDuty } = req.query;

  const where: any = {};
  
  if (authUser.role === 'TEACHER') {
    where.requesterId = authUser.id;
  }
  
  if (academicYearId) {
    where.academicYearId = Number(academicYearId);
  }

  if (additionalDuty) {
    where.additionalDuty = additionalDuty;
  }

  const budgets = await prisma.budgetRequest.findMany({
    where,
    include: {
        academicYear: true,
        requester: {
            select: { name: true }
        }
    },
    orderBy: { createdAt: 'desc' }
  });

  res.status(200).json(new ApiResponse(200, budgets, 'Data anggaran berhasil diambil'));
});

export const deleteBudgetRequest = asyncHandler(async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const authUser = (req as any).user;

    const budget = await prisma.budgetRequest.findUnique({ where: { id } });
    if (!budget) throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');

    if (authUser.role === 'TEACHER' && budget.requesterId !== authUser.id) {
        throw new ApiError(403, 'Anda tidak memiliki akses untuk menghapus data ini');
    }

    await prisma.budgetRequest.delete({ where: { id } });

    res.status(200).json(new ApiResponse(200, null, 'Pengajuan anggaran berhasil dihapus'));
});
