import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import type { IncomingMessage } from 'node:http';
import type pino from 'pino';
import type { RedisClient } from './db/redis.js';
import type { Env } from './config/env.js';
import { createAuthMiddlewares } from './middleware/auth.middleware.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { notFoundMiddleware } from './middleware/notFound.middleware.js';
import { createApiRouter } from './routes/index.js';

/** Browsers send `Origin` without a trailing slash; env URLs often include one — mismatch breaks CORS. */
function normalizeCorsOrigin(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function createApp(
  env: Env,
  logger: pino.Logger,
  redis: RedisClient,
): express.Application {
  const app = express();

  if (env.TRUST_PROXY) {
    app.set('trust proxy', 1);
  }

  app.use(
    pinoHttp({
      logger,
      autoLogging: {
        ignore: (req: IncomingMessage) => req.url === '/api/health',
      },
    }),
  );

  const corsOrigins = [
    env.FRONTEND_URL,
    ...(env.CORS_EXTRA?.split(',').map((s) => s.trim()).filter(Boolean) ?? []),
  ].map(normalizeCorsOrigin);

  app.use(
    cors({
      origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  const auth = createAuthMiddlewares(env);
  app.use('/api', createApiRouter(auth, redis, env));

  app.use(notFoundMiddleware);
  app.use(errorMiddleware(logger));

  return app;
}
