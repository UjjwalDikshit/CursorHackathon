import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export function notFoundMiddleware(req: Request, _res: Response, next: (err: Error) => void): void {
  next(new AppError(404, `Not found: ${req.method} ${req.path}`));
}
