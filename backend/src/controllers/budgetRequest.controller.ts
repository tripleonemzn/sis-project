import { Request, Response } from 'express';
import { z } from 'zod';
import { AdditionalDuty } from '@prisma/client';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';
import {
  assertTutorOwnsAdvisorDuty,
  getAdvisorEquipmentLabel,
  isAdvisorDuty,
} from '../utils/advisorDuty';

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

const normalizeDuties = (duties: unknown[]): string[] =>
  (duties || []).map((duty) => String(duty || '').trim().toUpperCase());

const ensureUserCanCreateBudgetDuty = async (userId: number, duty: AdditionalDuty) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, additionalDuties: true },
  });

  if (!user) {
    throw new ApiError(404, 'Pengguna tidak ditemukan');
  }

  if (user.role === 'ADMIN') return;

  if (user.role === 'EXTRACURRICULAR_TUTOR') {
    await assertTutorOwnsAdvisorDuty(userId, duty);
    return;
  }

  if (!user.additionalDuties.includes(duty)) {
    throw new ApiError(403, 'Anda tidak memiliki tugas tambahan tersebut');
  }
};

export const createBudgetRequest = asyncHandler(async (req: Request, res: Response) => {
  const body = createBudgetRequestSchema.parse(req.body);
  const authUser = (req as any).user;
  
  if (!authUser) throw new ApiError(401, 'Tidak memiliki otorisasi');
  if (!['ADMIN', 'TEACHER', 'EXTRACURRICULAR_TUTOR'].includes(authUser.role)) {
    throw new ApiError(403, 'Anda tidak memiliki akses membuat pengajuan');
  }
  if (authUser.role === 'EXTRACURRICULAR_TUTOR' && !isAdvisorDuty(body.additionalDuty)) {
    throw new ApiError(403, 'Akun tutor hanya dapat mengajukan kebutuhan pembina sesuai assignment aktif');
  }

  await ensureUserCanCreateBudgetDuty(authUser.id, body.additionalDuty);

  const normalizedDuty = String(body.additionalDuty || '').trim().toUpperCase();
  const isWakasek = normalizedDuty.startsWith('WAKASEK_');
  const isAdvisorEquipmentRequest = isAdvisorDuty(normalizedDuty);
  const advisorEquipmentLabel = getAdvisorEquipmentLabel(normalizedDuty);

  const [principal, sarpras, kesiswaan] = await Promise.all([
    prisma.user.findFirst({
      where: { role: 'PRINCIPAL' },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { additionalDuties: { has: 'WAKASEK_SARPRAS' } },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { additionalDuties: { has: 'WAKASEK_KESISWAAN' } },
      select: { id: true },
    }),
  ]);

  const initialApproverId = isAdvisorEquipmentRequest
    ? kesiswaan?.id ?? sarpras?.id ?? principal?.id ?? null
    : isWakasek
      ? principal?.id ?? null
      : sarpras?.id ?? principal?.id ?? null;

  const normalizedQuantity = Math.max(1, Number(body.quantity || 1));
  const normalizedUnitPrice = isAdvisorEquipmentRequest ? 0 : Number(body.unitPrice || 0);
  const normalizedTotalAmount = isAdvisorEquipmentRequest
    ? 0
    : Number.isFinite(Number(body.totalAmount))
      ? Number(body.totalAmount)
      : normalizedQuantity * normalizedUnitPrice;

  const budget = await prisma.budgetRequest.create({
    data: {
      ...body,
      quantity: normalizedQuantity,
      unitPrice: normalizedUnitPrice,
      totalAmount: normalizedTotalAmount,
      requesterId: authUser.id,
      approverId: initialApproverId,
      approvalStatus: 'PENDING',
      updatedAt: new Date(),
    },
  });
  
  res
    .status(201)
    .json(
      new ApiResponse(
        201,
        mapBudget(budget),
        isAdvisorEquipmentRequest
          ? `Pengajuan ${advisorEquipmentLabel} berhasil dibuat`
          : 'Pengajuan anggaran berhasil dibuat',
      ),
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
  } else if (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') {
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
      lpjInvoices: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          submittedAt: true,
          sentToFinanceAt: true,
          financeCompletedAt: true,
          items: {
            select: {
              amount: true,
            },
          },
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

    if (
      (authUser.role === 'TEACHER' || authUser.role === 'EXTRACURRICULAR_TUTOR') &&
      budget.requesterId !== authUser.id
    ) {
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

  const duties = normalizeDuties((dutyUser.additionalDuties || []) as unknown[]);
  const isKesiswaan =
    duties.includes('WAKASEK_KESISWAAN') || duties.includes('SEKRETARIS_KESISWAAN');
  const isSarpras =
    duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');
  const isPrincipal = dutyUser.role === 'PRINCIPAL';
  const isAdmin = dutyUser.role === 'ADMIN';
  const isAdvisorFlow = isAdvisorDuty(existing.additionalDuty);
  const advisorEquipmentLabel = getAdvisorEquipmentLabel(existing.additionalDuty);

  const finance = await prisma.user.findFirst({
    where: {
      OR: [
        { role: 'STAFF', ptkType: 'STAFF_KEUANGAN' },
        { additionalDuties: { has: 'BENDAHARA' } },
      ],
    },
    select: { id: true },
  });

  if (isAdvisorFlow) {
    if (!isKesiswaan && !isSarpras && !isPrincipal && !isAdmin) {
      throw new ApiError(
        403,
        `Alur pengajuan ${advisorEquipmentLabel} hanya dapat diproses oleh Wakasek Kesiswaan, Wakasek Sarpras, atau Kepala Sekolah`,
      );
    }

    if (!isAdmin && existing.approverId !== authUser.id) {
      throw new ApiError(403, 'Anda tidak berwenang memproses pengajuan ini');
    }

    if (isKesiswaan) {
      if (body.status === 'APPROVED') {
        const sarpras = await prisma.user.findFirst({
          where: { additionalDuties: { has: 'WAKASEK_SARPRAS' } },
          select: { id: true },
        });
        const principal = await prisma.user.findFirst({
          where: { role: 'PRINCIPAL' },
          select: { id: true },
        });

        const forwarded = await prisma.budgetRequest.update({
          where: { id },
          data: {
            approvalStatus: 'PENDING',
            approverId: sarpras?.id ?? principal?.id ?? null,
            approvedById: authUser.id,
            rejectionReason: null,
          },
        });

        return res
          .status(200)
          .json(
            new ApiResponse(
              200,
              mapBudget(forwarded),
              `Pengajuan ${advisorEquipmentLabel} diteruskan ke Wakasek Sarpras`,
            ),
          );
      }

      const rejected = await prisma.budgetRequest.update({
        where: { id },
        data: {
          approvalStatus: 'REJECTED',
          approverId: null,
          approvedById: authUser.id,
          rejectionReason: body.rejectionReason || 'Ditolak oleh Wakasek Kesiswaan',
        },
      });

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            mapBudget(rejected),
            `Pengajuan ${advisorEquipmentLabel} ditolak Wakasek Kesiswaan`,
          ),
        );
    }

    if (isSarpras) {
      if (body.status === 'APPROVED') {
        const principal = await prisma.user.findFirst({
          where: { role: 'PRINCIPAL' },
          select: { id: true },
        });

        const forwarded = await prisma.budgetRequest.update({
          where: { id },
          data: {
            approvalStatus: 'PENDING',
            approverId: principal?.id ?? null,
            approvedById: authUser.id,
            rejectionReason: null,
          },
        });

        return res
          .status(200)
          .json(
            new ApiResponse(
              200,
              mapBudget(forwarded),
              `Pengajuan ${advisorEquipmentLabel} diteruskan ke Kepala Sekolah`,
            ),
          );
      }

      const rejected = await prisma.budgetRequest.update({
        where: { id },
        data: {
          approvalStatus: 'REJECTED',
          approverId: null,
          approvedById: authUser.id,
          rejectionReason: body.rejectionReason || 'Ditolak oleh Wakasek Sarpras',
        },
      });

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            mapBudget(rejected),
            `Pengajuan ${advisorEquipmentLabel} ditolak Wakasek Sarpras`,
          ),
        );
    }

    const updated = await prisma.budgetRequest.update({
      where: { id },
      data: {
        approvalStatus: body.status,
        rejectionReason: body.status === 'REJECTED'
          ? body.rejectionReason || 'Ditolak oleh Kepala Sekolah'
          : null,
        approvedById: authUser.id,
        approverId: body.status === 'APPROVED' ? finance?.id ?? null : null,
      },
    });

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          mapBudget(updated),
          `Status pengajuan ${advisorEquipmentLabel} berhasil diperbarui`,
        ),
      );
  }

  if (!isSarpras && !isPrincipal && !isAdmin) {
    throw new ApiError(
      403,
      'Hanya Wakasek/ Sekretaris Sarpras atau Kepala Sekolah yang dapat mengubah status pengajuan anggaran',
    );
  }

  if (isSarpras) {
    if (!isAdmin && existing.approverId !== authUser.id) {
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
      select: { id: true },
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
