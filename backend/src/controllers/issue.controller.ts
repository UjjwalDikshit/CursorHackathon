import {
  confirmClusterCommunity,
  createReportAndCluster,
  listClusters,
  setClusterVerificationAdmin,
} from '../services/issueCluster.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { routeParam } from '../utils/params.js';
import type { CreateReportInput } from '../validators/report.validator.js';

type ClusterStatusBody = {
  status: 'unverified' | 'community_verified' | 'admin_verified';
  adminNote?: string;
};

export const issueController = {
  createReport: asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, 'Authentication required');
    }
    const body = req.body as CreateReportInput;
    const out = await createReportAndCluster(req.auth.userId, body);
    res.status(201).json(out);
  }),

  listClusters: asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined;
    const limit = req.query.limit
      ? Math.min(100, Number(req.query.limit) || 30)
      : 30;
    const rows = await listClusters(status, limit);
    res.json({ clusters: rows });
  }),

  confirmCommunity: asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, 'Authentication required');
    }
    const c = await confirmClusterCommunity(routeParam(req, 'id'));
    res.json({ cluster: c });
  }),

  adminSetStatus: asyncHandler(async (req, res) => {
    if (!req.auth) {
      throw new AppError(401, 'Authentication required');
    }
    const body = req.body as ClusterStatusBody;
    const c = await setClusterVerificationAdmin(
      routeParam(req, 'id'),
      req.auth.userId,
      body.status,
      body.adminNote,
    );
    res.json({ cluster: c });
  }),
};
