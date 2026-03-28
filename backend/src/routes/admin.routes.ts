import { Router } from 'express';
import { createLeaderAdminController } from '../controllers/leaderAdmin.controller.js';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { validateQuery } from '../middleware/validateQuery.middleware.js';
import {
  adminCreateLeaderProfileSchema,
  approveLeaderApplicationSchema,
  listLeaderApplicationsQuerySchema,
  rejectLeaderApplicationSchema,
} from '../validators/leaderProfileApplication.validator.js';

/** Protected + RBAC admin APIs */
export function createAdminRoutes(auth: AuthMiddlewares) {
  const router = Router();
  const leaderAdmin = createLeaderAdminController();

  router.get(
    '/ping',
    auth.requireAuth,
    auth.requireRoles('admin', 'super_admin'),
    (_req, res) => {
      res.json({ ok: true, scope: 'admin' });
    },
  );

  const admin = [auth.requireAuth, auth.requireRoles('admin', 'super_admin')];

  router.get(
    '/leader-applications',
    ...admin,
    validateQuery(listLeaderApplicationsQuerySchema),
    leaderAdmin.listApplications,
  );
  router.post(
    '/leader-applications/:applicationId/approve',
    ...admin,
    validateBody(approveLeaderApplicationSchema),
    leaderAdmin.approveApplication,
  );
  router.post(
    '/leader-applications/:applicationId/reject',
    ...admin,
    validateBody(rejectLeaderApplicationSchema),
    leaderAdmin.rejectApplication,
  );
  router.post(
    '/leader-profiles',
    ...admin,
    validateBody(adminCreateLeaderProfileSchema),
    leaderAdmin.createLeaderProfile,
  );

  return router;
}
