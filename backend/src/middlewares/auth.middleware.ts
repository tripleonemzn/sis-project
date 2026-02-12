import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils";
import { AuthRequest } from "../types";

export const verifyJWT = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      throw new ApiError(401, "Permintaan tidak diizinkan");
    }

    const decodedToken = jwt.verify(token, process.env.JWT_SECRET as string);
    req.user = decodedToken as any;
    next();
  } catch (error) {
    throw new ApiError(401, "Token akses tidak valid");
  }
};

export const verifyRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new ApiError(403, "Dilarang: Hak akses tidak mencukupi");
    }
    next();
  };
};
