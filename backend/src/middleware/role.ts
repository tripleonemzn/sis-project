import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api';
import { AuthRequest } from './auth';

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Tidak memiliki otorisasi'));
    }

    if (req.user.isDemo) {
      next();
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      if (process.env.LOG_ACCESS_DENIED === 'true') {
        console.warn(
          `[RoleMiddleware] Access Denied. User Role: ${req.user.role}, Allowed: ${allowedRoles}, Path: ${req.path}, Method: ${req.method}`,
        );
      }
      return next(new ApiError(403, 'Dilarang: Hak akses tidak mencukupi'));
    }

    next();
  };
};
