import type { RequestHandler } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Env } from '../config/env.js';
import type { UserRole } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';

export type JwtPayload = {
  sub: string;
  role: UserRole;
};

export type AuthMiddlewares = {
  requireAuth: RequestHandler;
  optionalAuth: RequestHandler;
  requireRoles: (...roles: UserRole[]) => RequestHandler;
  signToken: (userId: string, role: UserRole) => string;
};

export function createAuthMiddlewares(
  env: Pick<Env, 'JWT_SECRET' | 'JWT_EXPIRES_IN'>,
): AuthMiddlewares {
  const optionalAuth: RequestHandler = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next();
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      next();
      return;
    }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      if (decoded.sub && decoded.role) {
        req.auth = { userId: decoded.sub, role: decoded.role };
      }
    } catch {
      /* invalid token: continue as guest */
    }
    next();
  };

  const requireAuth: RequestHandler = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    const token = header.slice(7).trim();
    if (!token) {
      next(new AppError(401, 'Authentication required'));
      return;
    }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      if (!decoded.sub || !decoded.role) {
        next(new AppError(401, 'Invalid token'));
        return;
      }
      req.auth = { userId: decoded.sub, role: decoded.role };
      next();
    } catch {
      next(new AppError(401, 'Invalid or expired token'));
    }
  };

  const requireRoles =
    (...allowed: UserRole[]): RequestHandler =>
    (req, _res, next) => {
      if (!req.auth) {
        next(new AppError(401, 'Authentication required'));
        return;
      }
      if (!allowed.includes(req.auth.role)) {
        next(new AppError(403, 'Insufficient permissions'));
        return;
      }
      next();
    };

  const signToken = (userId: string, role: UserRole): string =>
    jwt.sign({ sub: userId, role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as SignOptions);

  return { requireAuth, optionalAuth, requireRoles, signToken };
}
