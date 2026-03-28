import type { Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import type pino from 'pino';
import { Server } from 'socket.io';
import type { Env } from '../config/env.js';
import type { JwtPayload } from '../middleware/auth.middleware.js';
import { setSocketIo } from './hub.js';

function corsOrigins(env: Env): string | string[] {
  const extra = env.CORS_EXTRA?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];
  const all = [env.FRONTEND_URL, ...extra];
  return all.length === 1 ? all[0]! : all;
}

export function attachSocketIo(
  httpServer: HttpServer,
  env: Env,
  log: pino.Logger,
): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOrigins(env),
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      next();
      return;
    }
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      socket.data.userId = decoded.sub;
      socket.data.role = decoded.role;
    } catch {
      /* guest socket */
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    const role = socket.data.role as string | undefined;
    if (userId) {
      socket.join(`user:${userId}`);
    }
    if (role === 'admin' || role === 'super_admin') {
      socket.join('admin:alerts');
    }

    socket.on('join:post', (postId: unknown) => {
      if (
        typeof postId === 'string' &&
        /^[a-f\d]{24}$/i.test(postId)
      ) {
        socket.join(`post:${postId}`);
      }
    });

    socket.on('leave:post', (postId: unknown) => {
      if (typeof postId === 'string') {
        socket.leave(`post:${postId}`);
      }
    });

    socket.on('disconnect', (reason) => {
      log.debug({ socketId: socket.id, reason }, 'socket disconnected');
    });
  });

  setSocketIo(io);
  log.info('Socket.io attached');
  return io;
}
