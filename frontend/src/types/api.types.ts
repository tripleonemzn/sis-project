export interface ApiResponse<T = any> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;
}

export interface ApiError {
  statusCode: number;
  message: string;
  success: boolean;
  errors?: any[];
  stack?: string;
}
