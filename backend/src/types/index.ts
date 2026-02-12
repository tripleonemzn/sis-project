/**
 * TypeScript Type Definitions
 * Centralized types untuk aplikasi
 */

import { Request } from 'express';
import { Role } from '@prisma/client';

/**
 * Extended Express Request dengan user authentication
 */
export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string | null;
    role: Role;
    full_name: string;
  };
}

/**
 * API Response format yang konsisten
 */
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Query parameters untuk pagination, filtering, sorting
 */
export interface QueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  [key: string]: any;
}

/**
 * JWT Payload
 */
export interface JwtPayload {
  id: string;
  username: string;
  email: string | null;
  role: Role;
  full_name: string;
}

/**
 * Login credentials
 */
export interface LoginCredentials {
  username: string;
  password: string;
}

/**
 * Register data
 */
export interface RegisterData {
  username: string;
  email?: string;
  password: string;
  full_name: string;
  role: Role;
}
