import { Request, Response } from 'express';
import prisma from '../utils/prisma';
import { ApiError, ApiResponse, asyncHandler } from '../utils/api';

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const [total, notifications] = await Promise.all([
    prisma.notification.count({ where: { userId: user.id } }),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    })
  ]);

  // Count unread
  const unreadCount = await prisma.notification.count({
    where: { userId: user.id, isRead: false }
  });

  res.json(new ApiResponse(200, {
    notifications,
    unreadCount,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / Number(limit))
    }
  }));
});

export const markAsRead = asyncHandler(async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { id } = req.params;

  // If id is 'all', mark all as read
  if (id === 'all') {
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true }
    });
    return res.json(new ApiResponse(200, null, 'Semua notifikasi ditandai sudah dibaca'));
  }

  const notification = await prisma.notification.findFirst({
    where: { id: Number(id), userId: user.id }
  });

  if (!notification) {
    throw new ApiError(404, 'Notifikasi tidak ditemukan');
  }

  await prisma.notification.update({
    where: { id: Number(id) },
    data: { isRead: true }
  });

  res.json(new ApiResponse(200, null, 'Notifikasi ditandai sudah dibaca'));
});
