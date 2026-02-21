import { PaymentStatus, PaymentType } from '@prisma/client';
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

const listParentPaymentsQuerySchema = z.object({
  studentId: z.coerce.number().int().positive().optional(),
  student_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

const PAYMENT_STATUSES: PaymentStatus[] = ['PENDING', 'PAID', 'PARTIAL', 'CANCELLED'];
const PAYMENT_TYPES: PaymentType[] = ['MONTHLY', 'ONE_TIME'];

type StatusSummary = Record<PaymentStatus, { count: number; amount: number }>;
type TypeSummary = Record<PaymentType, { count: number; amount: number }>;

function createStatusSummary(): StatusSummary {
  return {
    PENDING: { count: 0, amount: 0 },
    PAID: { count: 0, amount: 0 },
    PARTIAL: { count: 0, amount: 0 },
    CANCELLED: { count: 0, amount: 0 },
  };
}

function createTypeSummary(): TypeSummary {
  return {
    MONTHLY: { count: 0, amount: 0 },
    ONE_TIME: { count: 0, amount: 0 },
  };
}

export const listParentPayments = asyncHandler(async (req: Request, res: Response) => {
  const { studentId, student_id, limit } = listParentPaymentsQuerySchema.parse(req.query);
  const requestedStudentId = studentId ?? student_id ?? null;
  const authUser = (req as any).user;

  const parent = await prisma.user.findUnique({
    where: { id: Number(authUser.id) },
    select: {
      id: true,
      name: true,
      username: true,
      children: {
        select: {
          id: true,
          name: true,
          username: true,
          nis: true,
          nisn: true,
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
        },
      },
    },
  });

  if (!parent) {
    throw new ApiError(404, 'Data orang tua tidak ditemukan');
  }

  let targetChildren = parent.children;

  if (requestedStudentId != null) {
    const selectedChild = targetChildren.find((item) => item.id === Number(requestedStudentId));
    if (!selectedChild) {
      throw new ApiError(403, 'Anda tidak memiliki akses ke data keuangan siswa ini');
    }
    targetChildren = [selectedChild];
  }

  const childrenOverview = await Promise.all(
    targetChildren.map(async (child) => {
      const [payments, statusGroups, typeGroups] = await Promise.all([
        prisma.payment.findMany({
          where: { studentId: child.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit,
        }),
        prisma.payment.groupBy({
          by: ['status'],
          where: { studentId: child.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        prisma.payment.groupBy({
          by: ['type'],
          where: { studentId: child.id },
          _count: { _all: true },
          _sum: { amount: true },
        }),
      ]);

      const statusSummary = createStatusSummary();
      for (const group of statusGroups) {
        if (!PAYMENT_STATUSES.includes(group.status)) continue;
        statusSummary[group.status] = {
          count: group._count._all,
          amount: Number(group._sum.amount || 0),
        };
      }

      const typeSummary = createTypeSummary();
      for (const group of typeGroups) {
        if (!PAYMENT_TYPES.includes(group.type)) continue;
        typeSummary[group.type] = {
          count: group._count._all,
          amount: Number(group._sum.amount || 0),
        };
      }

      const totalAmount = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].amount, 0);
      const totalRecords = PAYMENT_STATUSES.reduce((sum, status) => sum + statusSummary[status].count, 0);

      return {
        student: child,
        summary: {
          totalRecords,
          totalAmount,
          status: {
            pendingCount: statusSummary.PENDING.count,
            pendingAmount: statusSummary.PENDING.amount,
            paidCount: statusSummary.PAID.count,
            paidAmount: statusSummary.PAID.amount,
            partialCount: statusSummary.PARTIAL.count,
            partialAmount: statusSummary.PARTIAL.amount,
            cancelledCount: statusSummary.CANCELLED.count,
            cancelledAmount: statusSummary.CANCELLED.amount,
          },
          type: {
            monthlyCount: typeSummary.MONTHLY.count,
            monthlyAmount: typeSummary.MONTHLY.amount,
            oneTimeCount: typeSummary.ONE_TIME.count,
            oneTimeAmount: typeSummary.ONE_TIME.amount,
          },
        },
        payments: payments.map((payment) => ({
          id: payment.id,
          amount: payment.amount,
          status: payment.status,
          type: payment.type,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
        })),
      };
    }),
  );

  const summary = childrenOverview.reduce(
    (acc, child) => {
      acc.totalRecords += child.summary.totalRecords;
      acc.totalAmount += child.summary.totalAmount;
      acc.paidAmount += child.summary.status.paidAmount;
      acc.pendingAmount += child.summary.status.pendingAmount;
      acc.partialAmount += child.summary.status.partialAmount;
      acc.cancelledAmount += child.summary.status.cancelledAmount;
      acc.monthlyAmount += child.summary.type.monthlyAmount;
      acc.oneTimeAmount += child.summary.type.oneTimeAmount;
      return acc;
    },
    {
      childCount: childrenOverview.length,
      totalRecords: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      partialAmount: 0,
      cancelledAmount: 0,
      monthlyAmount: 0,
      oneTimeAmount: 0,
    },
  );

  res.status(200).json(
    new ApiResponse(
      200,
      {
        parent: {
          id: parent.id,
          name: parent.name,
          username: parent.username,
        },
        summary,
        children: childrenOverview,
      },
      'Data keuangan anak berhasil diambil',
    ),
  );
});
