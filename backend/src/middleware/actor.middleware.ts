import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

/** After optionalAuth: require either JWT user or X-Anonymous-Session */
export const requireActor: RequestHandler = (req, _res, next) => {
  if (req.auth) {
    req.actor = { kind: 'user', userId: req.auth.userId };
    next();
    return;
  }
  const raw = req.headers['x-anonymous-session'];
  const sid = typeof raw === 'string' ? raw.trim() : '';
  if (sid.length >= 16 && sid.length <= 128) {
    req.actor = { kind: 'anonymous', sessionId: sid };
    next();
    return;
  }
  next(
    new AppError(
      401,
      'Sign in or send header X-Anonymous-Session (16–128 characters)',
    ),
  );
};
