import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validateQuery<T extends z.ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new AppError(400, 'Invalid query', {
          code: 'VALIDATION_ERROR',
          details: result.error.flatten(),
        }),
      );
      return;
    }
    (req as Express.Request & { validatedQuery: z.infer<T> }).validatedQuery =
      result.data;
    next();
  };
}
