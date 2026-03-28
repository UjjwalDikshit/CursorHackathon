import { Router } from 'express';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { issueController } from '../controllers/issue.controller.js';
import {
  clusterStatusSchema,
  createReportSchema,
} from '../validators/report.validator.js';

export function createIssueRoutes(auth: AuthMiddlewares) {
  const router = Router();

  router.post(
    '/reports',
    auth.requireAuth,
    validateBody(createReportSchema),
    issueController.createReport,
  );

  router.get('/issue-clusters', issueController.listClusters);

  router.post(
    '/issue-clusters/:id/confirm',
    auth.requireAuth,
    issueController.confirmCommunity,
  );

  router.patch(
    '/issue-clusters/:id/status',
    auth.requireAuth,
    auth.requireRoles('admin', 'super_admin'),
    validateBody(clusterStatusSchema),
    issueController.adminSetStatus,
  );

  return router;
}
