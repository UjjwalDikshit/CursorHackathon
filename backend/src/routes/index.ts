import { Router } from 'express';
import type { Env } from '../config/env.js';
import type { RedisClient } from '../db/redis.js';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { buildAppServices } from '../types/api-deps.js';
import { createAdminRoutes } from './admin.routes.js';
import { createAuthRoutes } from './auth.routes.js';
import healthRoutes from './health.routes.js';
import { createIssueRoutes } from './issue.routes.js';
import { createLeadersApplicationRoutes } from './leadersApplication.routes.js';
import { createPostsRouter } from './posts.routes.js';

export function createApiRouter(
  auth: AuthMiddlewares,
  redis: RedisClient,
  env: Env,
) {
  const router = Router();
  const services = buildAppServices(redis, {
    openAiKey: env.OPENAI_API_KEY,
  });

  router.use(healthRoutes);
  router.use('/auth', createAuthRoutes(auth));
  router.use('/admin', createAdminRoutes(auth));
  router.use(createLeadersApplicationRoutes(auth));
  router.use(createPostsRouter(auth, services));
  router.use(createIssueRoutes(auth));

  return router;
}
