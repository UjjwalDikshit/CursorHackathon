export class AppError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly isOperational: boolean;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: {
      code?: string;
      isOperational?: boolean;
      details?: unknown;
    },
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.isOperational = options?.isOperational ?? true;
    this.details = options?.details;
    Error.captureStackTrace(this, this.constructor);
  }
}
