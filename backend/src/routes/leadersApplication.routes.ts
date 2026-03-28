import { Router } from 'express';
import { createLeaderApplicationController } from '../controllers/leaderApplication.controller.js';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { applyLeaderProfileSchema } from '../validators/leaderProfileApplication.validator.js';

export function createLeadersApplicationRoutes(auth: AuthMiddlewares) {
  const router = Router();
  const c = createLeaderApplicationController();

  router.post(
    '/leaders/apply',
    auth.requireAuth,
    validateBody(applyLeaderProfileSchema),
    c.apply,
  );
  router.get('/leaders/application/me', auth.requireAuth, c.myApplication);

  return router;
}
