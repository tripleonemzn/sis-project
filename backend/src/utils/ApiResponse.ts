/**
 * API Response Helper
 * Untuk membuat response format yang konsisten
 */

import { Response } from 'express';
import { ApiResponse, PaginationMeta } from '../types';

export class ApiResponseHelper {
  /**
   * Success response
   */
  static success<T>(
    res: Response,
    data: T,
    message: string = 'Success',
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Success response with pagination
   */
  static successWithPagination<T>(
    res: Response,
    data: T,
    meta: PaginationMeta,
    message: string = 'Success',
    statusCode: number = 200
  ): Response {
    const response: ApiResponse<T> = {
      success: true,
      message,
      data,
      meta
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Created response (201)
   */
  static created<T>(
    res: Response,
    data: T,
    message: string = 'Resource created successfully'
  ): Response {
    return this.success(res, data, message, 201);
  }

  /**
   * No content response (204)
   */
  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  /**
   * Error response
   */
  static error(
    res: Response,
    message: string,
    statusCode: number = 500,
    errors?: any
  ): Response {
    const response: any = {
      success: false,
      message
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }
}
