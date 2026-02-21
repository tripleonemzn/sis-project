import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const prismaAny: any = prisma;
const prismaLpjInvoice = prismaAny.budgetLpjInvoice;
const prismaLpjItem = prismaAny.budgetLpjItem;

const createLpjInvoiceSchema = z.object({
  budgetRequestId: z.number(),
  title: z.string().optional(),
});

const createLpjItemSchema = z.object({
  lpjInvoiceId: z.number(),
  description: z.string(),
  brand: z.string().optional(),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0),
});

const updateLpjItemSchema = z.object({
  description: z.string().optional(),
  brand: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
  unitPrice: z.number().min(0).optional(),
});

const auditLpjItemSchema = z.object({
  isMatched: z.boolean(),
  auditNote: z.string().optional(),
});

const auditLpjInvoiceReportSchema = z.object({
  auditReport: z.string().min(1),
});

const sarprasDecisionSchema = z.object({
  action: z.enum(['APPROVE', 'RETURN', 'SEND_TO_FINANCE']),
});

export const listFinanceLpjInvoices = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const duties = ((authUser.additionalDuties || []) as string[]).map((d) =>
      String(d).trim().toUpperCase(),
    );

    const isFinanceStaff =
      (authUser.role === 'STAFF' && authUser.ptkType === 'STAFF_KEUANGAN') ||
      duties.includes('BENDAHARA');

    const isAdmin = authUser.role === 'ADMIN';

    if (!isFinanceStaff && !isAdmin) {
      throw new ApiError(
        403,
        'Hanya Staff Keuangan/Bendahara yang dapat mengakses LPJ ini',
      );
    }

    const invoices = await prismaLpjInvoice.findMany({
      where: {
        status: 'SENT_TO_FINANCE',
      },
      select: {
        id: true,
        title: true,
        status: true,
        sentToFinanceAt: true,
        budgetRequest: {
          select: {
            id: true,
            title: true,
            description: true,
            totalAmount: true,
            additionalDuty: true,
            requester: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        sentToFinanceAt: 'desc',
      },
    });

    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { invoices },
          'Daftar LPJ untuk keuangan berhasil diambil',
        ),
      );
  },
);

export const listLpjInvoices = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const { budgetRequestId } = req.query;

  if (!budgetRequestId) {
    throw new ApiError(400, 'budgetRequestId wajib diisi');
  }

  const budgetId = Number(budgetRequestId);

  const budget = await prisma.budgetRequest.findUnique({
    where: { id: budgetId },
    select: {
      id: true,
      requesterId: true,
      approvalStatus: true,
    },
  });

  if (!budget) {
    throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');
  }

  const duties = ((authUser.additionalDuties || []) as string[]).map((d) =>
    String(d).trim().toUpperCase(),
  );

  const isSarpras =
    duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');

  const isAdmin = authUser.role === 'ADMIN';

  if (budget.requesterId !== authUser.id && !isSarpras && !isAdmin) {
    throw new ApiError(403, 'Tidak memiliki otorisasi untuk melihat LPJ ini');
  }

  const invoices = await prisma.budgetLpjInvoice.findMany({
    where: { budgetRequestId: budgetId },
    include: {
      items: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  res
    .status(200)
    .json(new ApiResponse(200, { budget, invoices }, 'Data LPJ berhasil diambil'));
});

export const createLpjInvoice = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const body = createLpjInvoiceSchema.parse({
    ...req.body,
    budgetRequestId: Number(req.body.budgetRequestId),
  });

  const budget = await prisma.budgetRequest.findUnique({
    where: { id: body.budgetRequestId },
  });

  if (!budget) {
    throw new ApiError(404, 'Pengajuan anggaran tidak ditemukan');
  }

  if (budget.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat membuat LPJ');
  }

  const isRealizationConfirmed = !!(budget as any).realizationConfirmedAt;

  if (!isRealizationConfirmed) {
    throw new ApiError(
      400,
      'LPJ hanya dapat dibuat setelah realisasi dikonfirmasi Staff Keuangan',
    );
  }

  const invoice = await prisma.budgetLpjInvoice.create({
    data: {
      budgetRequestId: body.budgetRequestId,
      title: body.title,
      createdById: authUser.id,
      status: 'DRAFT',
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, invoice, 'LPJ invoice berhasil dibuat'));
});

export const createLpjItem = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const body = createLpjItemSchema.parse({
    ...req.body,
    lpjInvoiceId: Number(req.body.lpjInvoiceId),
  });

  const invoice = await prismaLpjInvoice.findUnique({
    where: { id: body.lpjInvoiceId },
    include: {
      budgetRequest: true,
    },
  });

  if (!invoice) {
    throw new ApiError(404, 'LPJ invoice tidak ditemukan');
  }

  if (invoice.budgetRequest.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengubah LPJ');
  }

  if (invoice.status !== 'DRAFT' && invoice.status !== 'RETURNED') {
    throw new ApiError(400, 'LPJ hanya dapat diubah saat status DRAFT atau DIKEMBALIKAN');
  }

  const amount = body.quantity * body.unitPrice;

  const item = await prismaLpjItem.create({
    data: {
      lpjInvoiceId: body.lpjInvoiceId,
      description: body.description,
      brand: body.brand,
      quantity: body.quantity,
      unitPrice: body.unitPrice,
      amount,
    },
  });

  res
    .status(201)
    .json(new ApiResponse(201, item, 'Item LPJ berhasil ditambahkan'));
});

export const updateLpjItem = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const id = Number(req.params.id);
  const body = updateLpjItemSchema.parse(req.body);

  const existing = await prismaLpjItem.findUnique({
    where: { id },
    include: {
      invoice: {
        include: {
          budgetRequest: true,
        },
      },
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Item LPJ tidak ditemukan');
  }

  if (existing.invoice.budgetRequest.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengubah LPJ');
  }

  if (existing.invoice.status !== 'DRAFT' && existing.invoice.status !== 'RETURNED') {
    throw new ApiError(400, 'LPJ hanya dapat diubah saat status DRAFT atau DIKEMBALIKAN');
  }

  const quantity = body.quantity ?? existing.quantity;
  const unitPrice = body.unitPrice ?? existing.unitPrice;
  const amount = quantity * unitPrice;

  const updated = await prismaLpjItem.update({
    where: { id },
    data: {
      description: body.description ?? existing.description,
      brand: body.brand ?? existing.brand,
      quantity,
      unitPrice,
      amount,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'Item LPJ berhasil diperbarui'));
});

export const deleteLpjItem = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const id = Number(req.params.id);

  const existing = await prismaLpjItem.findUnique({
    where: { id },
    include: {
      invoice: {
        include: {
          budgetRequest: true,
        },
      },
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Item LPJ tidak ditemukan');
  }

  if (existing.invoice.budgetRequest.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengubah LPJ');
  }

  if (existing.invoice.status !== 'DRAFT' && existing.invoice.status !== 'RETURNED') {
    throw new ApiError(400, 'LPJ hanya dapat diubah saat status DRAFT atau DIKEMBALIKAN');
  }

  await prismaLpjItem.delete({
    where: { id },
  });

  res
    .status(200)
    .json(new ApiResponse(200, null, 'Item LPJ berhasil dihapus'));
});

export const uploadLpjInvoiceFile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const id = Number(req.params.id);
  const file = (req as any).file as any;

  if (!file) {
    throw new ApiError(400, 'File invoice LPJ wajib diunggah');
  }

  if (file.size > 500 * 1024) {
    throw new ApiError(400, 'Ukuran file invoice LPJ maksimal 500KB');
  }

  const invoice = await prismaLpjInvoice.findUnique({
    where: { id },
    include: {
      budgetRequest: true,
    },
  });

  if (!invoice) {
    throw new ApiError(404, 'LPJ invoice tidak ditemukan');
  }

  if (invoice.budgetRequest.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengunggah invoice LPJ');
  }

  if (!invoice.budgetRequest.realizationConfirmedAt) {
    throw new ApiError(
      400,
      'Invoice LPJ hanya dapat diunggah setelah realisasi dikonfirmasi Staff Keuangan',
    );
  }

  if (invoice.status !== 'DRAFT' && invoice.status !== 'RETURNED') {
    throw new ApiError(
      400,
      'Invoice LPJ hanya dapat diubah saat status DRAFT atau DIKEMBALIKAN',
    );
  }

  const fileUrl = `/api/uploads/budget-lpj/${file.filename}`;

  const updated = await prismaLpjInvoice.update({
    where: { id },
    data: {
      invoiceFileUrl: fileUrl,
      invoiceFileName: file.originalname,
      invoiceFileSize: file.size,
      invoiceMimeType: file.mimetype,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'File invoice LPJ berhasil diunggah'));
});

export const uploadLpjProofFile = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const id = Number(req.params.id);
  const file = (req as any).file as any;

  if (!file) {
    throw new ApiError(400, 'File bukti LPJ wajib diunggah');
  }

  if (file.size > 500 * 1024) {
    throw new ApiError(400, 'Ukuran file bukti LPJ maksimal 500KB');
  }

  const invoice = await prismaLpjInvoice.findUnique({
    where: { id },
    include: {
      budgetRequest: true,
    },
  });

  if (!invoice) {
    throw new ApiError(404, 'LPJ invoice tidak ditemukan');
  }

  if (invoice.budgetRequest.requesterId !== authUser.id) {
    throw new ApiError(403, 'Hanya pengaju yang dapat mengunggah bukti LPJ');
  }

  if (!invoice.budgetRequest.realizationConfirmedAt) {
    throw new ApiError(
      400,
      'Bukti LPJ hanya dapat diunggah setelah realisasi dikonfirmasi Staff Keuangan',
    );
  }

  if (invoice.status !== 'DRAFT' && invoice.status !== 'RETURNED') {
    throw new ApiError(
      400,
      'Bukti LPJ hanya dapat diubah saat status DRAFT atau DIKEMBALIKAN',
    );
  }

  const fileUrl = `/api/uploads/budget-lpj/${file.filename}`;

  const updated = await prismaLpjInvoice.update({
    where: { id },
    data: {
      proofFileUrl: fileUrl,
      proofFileName: file.originalname,
      proofFileSize: file.size,
      proofMimeType: file.mimetype,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'File bukti LPJ berhasil diunggah'));
});

export const submitLpjInvoiceToSarpras = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const id = Number(req.params.id);

    const invoice = await prismaLpjInvoice.findUnique({
      where: { id },
      include: {
        budgetRequest: true,
        items: true,
      },
    });

    if (!invoice) {
      throw new ApiError(404, 'LPJ invoice tidak ditemukan');
    }

    if (invoice.budgetRequest.requesterId !== authUser.id) {
      throw new ApiError(403, 'Hanya pengaju yang dapat mengajukan LPJ');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'RETURNED') {
      throw new ApiError(400, 'LPJ hanya dapat diajukan dari status DRAFT atau DIKEMBALIKAN');
    }

    if (!invoice.items.length) {
      throw new ApiError(400, 'LPJ harus memiliki minimal satu item sebelum diajukan');
    }

    const updated = await prismaLpjInvoice.update({
      where: { id },
      data: {
        status: 'SUBMITTED_TO_SARPRAS',
        submittedAt: new Date(),
      },
    });

    res
      .status(200)
      .json(
        new ApiResponse(200, updated, 'LPJ berhasil diajukan ke Wakasek Sarpras'),
      );
  },
);

export const auditLpjItem = asyncHandler(async (req: Request, res: Response) => {
  const authUser = (req as any).user;

  if (!authUser) {
    throw new ApiError(401, 'Tidak memiliki otorisasi');
  }

  const duties = ((authUser.additionalDuties || []) as string[]).map((d) =>
    String(d).trim().toUpperCase(),
  );

  const isSarpras =
    duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');

  if (!isSarpras && authUser.role !== 'ADMIN') {
    throw new ApiError(
      403,
      'Hanya Wakasek/ Sekretaris Sarpras yang dapat melakukan audit LPJ',
    );
  }

  const id = Number(req.params.id);
  const body = auditLpjItemSchema.parse(req.body);

  const existing = await prismaLpjItem.findUnique({
    where: { id },
    include: {
      invoice: true,
    },
  });

  if (!existing) {
    throw new ApiError(404, 'Item LPJ tidak ditemukan');
  }

  if (existing.invoice.status !== 'SUBMITTED_TO_SARPRAS') {
    throw new ApiError(400, 'Audit hanya dapat dilakukan pada LPJ yang diajukan ke Sarpras');
  }

  const updated = await prismaLpjItem.update({
    where: { id },
    data: {
      isMatched: body.isMatched,
      auditNote: body.auditNote,
    },
  });

  res
    .status(200)
    .json(new ApiResponse(200, updated, 'Hasil audit LPJ berhasil disimpan'));
});

export const auditLpjInvoiceReport = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const duties = ((authUser.additionalDuties || []) as string[]).map((d) =>
      String(d).trim().toUpperCase(),
    );

    const isSarpras =
      duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');

    const isAdmin = authUser.role === 'ADMIN';

    if (!isSarpras && !isAdmin) {
      throw new ApiError(
        403,
        'Hanya Wakasek/ Sekretaris Sarpras yang dapat mengisi Berita Acara LPJ',
      );
    }

    const id = Number(req.params.id);
    const body = auditLpjInvoiceReportSchema.parse(req.body);

    const existing = await prismaLpjInvoice.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, 'LPJ invoice tidak ditemukan');
    }

    if (existing.status !== 'SUBMITTED_TO_SARPRAS') {
      throw new ApiError(
        400,
        'Berita Acara hanya dapat diisi untuk LPJ yang diajukan ke Sarpras',
      );
    }

    const updated = await prismaLpjInvoice.update({
      where: { id },
      data: {
        auditReport: body.auditReport,
        auditReportAt: new Date(),
      },
    });

    res
      .status(200)
      .json(new ApiResponse(200, updated, 'Berita Acara LPJ berhasil disimpan'));
  },
);

export const sarprasDecisionOnLpjInvoice = asyncHandler(
  async (req: Request, res: Response) => {
    const authUser = (req as any).user;

    if (!authUser) {
      throw new ApiError(401, 'Tidak memiliki otorisasi');
    }

    const duties = ((authUser.additionalDuties || []) as string[]).map((d) =>
      String(d).trim().toUpperCase(),
    );

    const isSarpras =
      duties.includes('WAKASEK_SARPRAS') || duties.includes('SEKRETARIS_SARPRAS');

    const isAdmin = authUser.role === 'ADMIN';

    if (!isSarpras && !isAdmin) {
      throw new ApiError(
        403,
        'Hanya Wakasek/ Sekretaris Sarpras yang dapat memproses LPJ ini',
      );
    }

    const id = Number(req.params.id);
    const body = sarprasDecisionSchema.parse(req.body);

    const existing = await prisma.budgetLpjInvoice.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new ApiError(404, 'LPJ invoice tidak ditemukan');
    }

    if (body.action === 'APPROVE') {
      if (existing.status !== 'SUBMITTED_TO_SARPRAS') {
        throw new ApiError(
          400,
          'LPJ hanya dapat disetujui dari status Diajukan ke Wakasek Sarpras',
        );
      }

      const updated = await prismaLpjInvoice.update({
        where: { id },
        data: {
          status: 'APPROVED_BY_SARPRAS',
          approvedBySarprasAt: new Date(),
        },
      });

      res
        .status(200)
        .json(new ApiResponse(200, updated, 'LPJ disetujui oleh Wakasek Sarpras'));
      return;
    }

    if (body.action === 'RETURN') {
      if (existing.status !== 'SUBMITTED_TO_SARPRAS') {
        throw new ApiError(
          400,
          'LPJ hanya dapat dikembalikan dari status Diajukan ke Wakasek Sarpras',
        );
      }

      const updated = await prismaLpjInvoice.update({
        where: { id },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
        },
      });

      res
        .status(200)
        .json(new ApiResponse(200, updated, 'LPJ dikembalikan kepada guru'));
      return;
    }

    if (body.action === 'SEND_TO_FINANCE') {
      if (existing.status !== 'APPROVED_BY_SARPRAS') {
        throw new ApiError(
          400,
          'LPJ hanya dapat diteruskan ke keuangan setelah disetujui Wakasek Sarpras',
        );
      }

      const updated = await prisma.budgetLpjInvoice.update({
        where: { id },
        data: {
          status: 'SENT_TO_FINANCE',
          sentToFinanceAt: new Date(),
        },
      });

      res
        .status(200)
        .json(
          new ApiResponse(
            200,
            updated,
            'LPJ telah diteruskan ke bagian keuangan untuk diproses',
          ),
        );
      return;
    }
  },
);
