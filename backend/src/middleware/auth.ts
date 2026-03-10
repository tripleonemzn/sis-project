import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/api';

export interface JwtPayload {
  id: number;
  role: string;
  isDemo?: boolean;
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret', {
    expiresIn: '1d',
  });
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_SECRET || 'secret') as JwtPayload;
};

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new ApiError(401, 'Tidak memiliki otorisasi'));
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded;

    // Demo Account Read-Only Check
    if (req.user.isDemo) {
      const method = req.method.toUpperCase();
      // Allow GET, HEAD, OPTIONS
      // Block POST, PUT, PATCH, DELETE
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        // Whitelist logout if it exists as a protected route (unlikely but safe to add)
        if (req.path.endsWith('/logout')) {
          next();
          return;
        }
        
        // Log the blocked attempt for debugging
        console.warn(`[DemoReadonly] Blocked ${method} ${req.path} for demo user ${req.user.id}`);
        throw new ApiError(403, 'Mode Demo: Akun ini hanya untuk melihat-lihat (Read-Only). Anda tidak dapat menyimpan perubahan.');
      }
    }

    next();
  } catch (error) {
    next(new ApiError(401, 'Token tidak valid'));
  }
};
