import type { ErrorRequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import mongoose from 'mongoose';
import type pino from 'pino';
import { AppError } from '../utils/AppError.js';

function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function errorMiddleware(rootLogger: pino.Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const log = req.log ?? rootLogger;

    if (isAppError(err)) {
      if (err.statusCode >= 500) {
        log.error({ err }, err.message);
      } else {
        log.warn({ err: { message: err.message, code: err.code } }, err.message);
      }
      res.status(err.statusCode).json({
        error: {
          message: err.message,
          ...(err.code && { code: err.code }),
          ...(err.details !== undefined && { details: err.details }),
        },
      });
      return;
    }

    if (err instanceof mongoose.Error.ValidationError) {
      log.warn({ err }, 'Validation error');
      res.status(400).json({
        error: {
          message: 'Validation failed',
          details: Object.values(err.errors).map((e) => e.message),
        },
      });
      return;
    }

    if (err instanceof mongoose.Error.CastError) {
      log.warn({ err }, 'Cast error');
      res.status(400).json({ error: { message: 'Invalid id format' } });
      return;
    }

    if (err instanceof MongoServerError && err.code === 11000) {
      log.warn({ err }, 'Duplicate key');
      res.status(409).json({ error: { message: 'Resource already exists' } });
      return;
    }

    log.error({ err }, 'Unhandled error');
    const body =
      process.env.NODE_ENV === 'production'
        ? { error: { message: 'Internal server error' } }
        : { error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    res.status(500).json(body);
  };
}
