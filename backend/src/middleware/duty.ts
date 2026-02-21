import { Response, NextFunction } from 'express';
import { ApiError } from '../utils/api';
import { AuthRequest } from './auth';
import prisma from '../utils/prisma';
import { AdditionalDuty } from '@prisma/client';

export const dutyMiddleware = (allowedDuties: AdditionalDuty[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Tidak memiliki otorisasi'));
    }

    // Allow ADMIN to bypass duty check
    if (req.user.role === 'ADMIN') {
      return next();
    }

    // Only TEACHERs have additional duties
    if (req.user.role !== 'TEACHER') {
      return next(new ApiError(403, 'Dilarang: Role tidak valid untuk tugas ini'));
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { additionalDuties: true },
      });

      if (!user) {
        return next(new ApiError(404, 'User tidak ditemukan'));
      }

      const hasDuty = user.additionalDuties.some((duty) => allowedDuties.includes(duty));

      if (!hasDuty) {
        return next(new ApiError(403, 'Dilarang: Tugas tambahan tidak mencukupi'));
      }

      next();
    } catch (error) {
      next(new ApiError(500, 'Terjadi kesalahan saat memverifikasi tugas'));
    }
  };
};
