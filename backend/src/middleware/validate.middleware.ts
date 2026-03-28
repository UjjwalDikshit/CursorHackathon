import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validateBody<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(400, 'Validation failed', {
          code: 'VALIDATION_ERROR',
          details: result.error.flatten(),
        }),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}
