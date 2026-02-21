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

const updateBudgetRequestStatusSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

const mapBudget = (budget: any) => {
  if (!budget) return budget;
  return {
    ...budget,
    status: budget.approvalStatus,
  };
};

export const createBudgetRequest = asyncHandler(async (req: Request, res: Response) => {
  const body = createBudgetRequestSchema.parse(req.body);
  const authUser = (req as any).user;
  
  if (!authUser) throw new ApiError(401, 'Tidak memiliki otorisasi');

  const isWakasek = String(body.additionalDuty || '')
    .trim()
    .toUpperCase()
    .startsWith('WAKASEK_');

  const principal = await prisma.user.findFirst({
    where: { role: 'PRINCIPAL' },
  });

  const sarpras = await prisma.user.findFirst({
    where: { additionalDuties: { has: 'WAKASEK_SARPRAS' } },
  });

  const initialApproverId = isWakasek
    ? principal?.id ?? null
    : sarpras?.id ?? principal?.id ?? null;

  const budget = await prisma.budgetRequest.create({
    data: {
      ...body,
      requesterId: authUser.id,
      approverId: initialApproverId,
      approvalStatus: 'PENDING',
      updatedAt: new Date(),
    },
  });
  
  res
    .status(201)
    .json(
      new ApiResponse(201, mapBudget(budget), 'Pengajuan anggaran berhasil dibuat'),
    );
});

export const listBudgetRequests = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;
  if (!authUser) throw new ApiError(401, 'Tidak memiliki otorisasi');

  const { academicYearId, additionalDuty, view } = req.query as {
    academicYearId?: string;
    additionalDuty?: string;
    view?: string;
  };

  const where: any = {};

  if (view === 'approver') {
    where.approverId = authUser.id;
  } else if (view === 'requester') {
    where.requesterId = authUser.id;
  } else if (authUser.role === 'TEACHER') {
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
        select: {
          name: true,
          managedMajors: {
            select: {
              name: true,
            },
          },
        },
      },
      approver: {
        select: {
          id: true,
          name: true,
          role: true,
          additionalDuties: true,
        },
      },
      workProgram: {
        include: {
          major: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        budgets.map(mapBudget),
        'Data anggaran berhasil diambil',
      ),
    );
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

export const updateBudgetRequestStatus = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const body = updateBudgetRequestStatusSchema.parse(req.body);

  const dutyUser = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: {
      role: true,
      additionalDuties: true,
      ptkType: true,
    },
  });

  if (!dutyUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const existing = await prisma.budgetRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');
  }

  const duties = (dutyUser.additionalDuties || []).map((d: any) =>
    String(d).trim().toUpperCase(),
  );
  const isSarpras =
    duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
  const isPrincipal = dutyUser.role === 'PRINCIPAL';
  const isAdmin = dutyUser.role === 'ADMIN';

  if (!isSarpras && !isPrincipal && !isAdmin) {
    throw new ApiError(
      403,
      'Hanya Wakasek/ Sekretaris Sarpras atau Kepala Sekolah yang dapat mengubah status pengajuan anggaran',
    );
  }

  if (isSarpras) {
    if (existing.approverId !== authUser.id) {
      throw new ApiError(403, 'Anda tidak berwenang memproses pengajuan ini');
    }

    if (body.status === 'REJECTED') {
      throw new ApiError(
        400,
        'Wakasek/ Sekretaris Sarpras tidak dapat menolak pengajuan, hanya meneruskan ke Kepala Sekolah',
      );
    }

    const principal = await prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
    });

    const updated = await prisma.budgetRequest.update({
      where: { id },
      data: {
        approverId: principal?.id ?? null,
        rejectionReason: body.rejectionReason ?? existing.rejectionReason ?? null,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          mapBudget(updated),
          'Pengajuan anggaran diteruskan ke Kepala Sekolah',
        ),
      );
  }

  let combinedRejectionReason: string | null = null;
  if (body.status === 'REJECTED') {
    const parts: string[] = [];
    if (existing.rejectionReason && existing.rejectionReason.trim().length > 0) {
      parts.push(`Catatan Sarpras: ${existing.rejectionReason.trim()}`);
    }
    if (body.rejectionReason && body.rejectionReason.trim().length > 0) {
      parts.push(`Alasan Kepala Sekolah: ${body.rejectionReason.trim()}`);
    }
    combinedRejectionReason = parts.length > 0 ? parts.join('\n') : null;
  }

  const updateData: any = {
    approvalStatus: body.status,
    rejectionReason: combinedRejectionReason,
    approvedById: authUser.id,
  };

  if (body.status === 'APPROVED') {
    const finance = await prisma.user.findFirst({
      where: {
        OR: [
          { role: 'STAFF', ptkType: 'STAFF_KEUANGAN' },
          { additionalDuties: { has: 'BENDAHARA' } },
        ],
      },
    });

    updateData.approverId = finance?.id ?? null;
  } else {
    updateData.approverId = null;
  }

  const updated = await prisma.budgetRequest.update({
    where: { id },
    data: updateData,
  });

  res
    .status(200)
    .json(
      new ApiResponse(200, mapBudget(updated), 'Status pengajuan anggaran berhasil diperbarui'),
    );
});

export const confirmBudgetRealization = asyncHandler(
  async (req: Request, res: Response) => {
    const id = Number(req.params.id);
    const authUser = (req as any).user;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const dutyUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: {
        role: true,
        additionalDuties: true,
        ptkType: true,
      },
    });

    if (!dutyUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const duties = (dutyUser.additionalDuties || []).map((d: any) =>
      String(d).trim().toUpperCase(),
    );

    const isFinanceStaff =
      (dutyUser.role === 'STAFF' && dutyUser.ptkType === 'STAFF_KEUANGAN') ||
      duties.includes('BENDAHARA');
    const isAdmin = dutyUser.role === 'ADMIN';

    if (!isFinanceStaff && !isAdmin) {
      throw new ApiError(
        403,
        'Hanya Staff Keuangan/Bendahara yang dapat mengkonfirmasi realisasi anggaran',
      );
    }

    const existing = await prisma.budgetRequest.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');
    }

    if (existing.approvalStatus !== 'APPROVED') {
      throw new ApiError(
        400,
        'Realisasi hanya dapat dikonfirmasi setelah disetujui Kepala Sekolah',
      );
    }

    const updated = await prisma.budgetRequest.update({
      where: { id },
      data: {
        realizationConfirmedAt: new Date(),
        realizationConfirmedById: authUser.id,
        approverId: existing.requesterId,
      } as any,
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          mapBudget(updated),
          'Realisasi anggaran berhasil dikonfirmasi',
        ),
      );
  },
);

export const uploadBudgetLpj = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const file = (req as any).file as any;

  if (!file) {
    throw new ApiError(400, 'File LPJ wajib diunggah');
  }

  if (file.size > 500 * 1024) {
    throw new ApiError(400, 'Ukuran file LPJ maksimal 500KB');
  }

  const existing = await prisma.budgetRequest.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');
  }

  if (existing.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengunggah LPJ');
  }

  if (!(existing as any).realizationConfirmedAt) {
    throw new ApiError(
      400,
      'LPJ hanya dapat diunggah setelah realisasi dikonfirmasi Staff Keuangan',
    );
  }

  const fileUrl = `/api/uploads/budget-lpj/${file.filename}`;

  const updated = await prisma.budgetRequest.update({
    where: { id },
    data: {
      lpjFileUrl: fileUrl,
      lpjFileName: file.originalname,
      lpjFileSize: file.size,
      lpjMimeType: file.mimetype,
      lpjSubmittedAt: new Date(),
    } as any,
  });

  res
    .status(200)
    .json(new ApiResponse(200, mapBudget(updated), 'LPJ berhasil diunggah'));
});
