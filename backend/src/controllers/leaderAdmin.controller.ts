import mongoose from 'mongoose';
import {
  adminCreateLeaderProfile,
  approveLeaderApplication,
  listLeaderApplicationsForAdmin,
  rejectLeaderApplication,
} from '../services/leaderProfileApplication.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { routeParam } from '../utils/params.js';
import type {
  AdminCreateLeaderProfileInput,
  ApproveLeaderApplicationInput,
  ListLeaderApplicationsQuery,
  RejectLeaderApplicationInput,
} from '../validators/leaderProfileApplication.validator.js';

export function createLeaderAdminController() {
  return {
    listApplications: asyncHandler(async (req, res) => {
      const q = (
        req as Express.Request & { validatedQuery: ListLeaderApplicationsQuery }
      ).validatedQuery;
      const out = await listLeaderApplicationsForAdmin(q);
      res.json(out);
    }),

    approveApplication: asyncHandler(async (req, res) => {
      const id = routeParam(req, 'applicationId');
      if (!mongoose.isValidObjectId(id)) {
        throw new AppError(400, 'Invalid application id');
      }
      const body = req.body as ApproveLeaderApplicationInput;
      const application = await approveLeaderApplication(id, req.auth!.userId, body);
      res.json({
        application,
        message: 'Approved. Ask the user to sign out and sign in again to receive leader role in their token.',
      });
    }),

    rejectApplication: asyncHandler(async (req, res) => {
      const id = routeParam(req, 'applicationId');
      if (!mongoose.isValidObjectId(id)) {
        throw new AppError(400, 'Invalid application id');
      }
      const { reason } = req.body as RejectLeaderApplicationInput;
      const application = await rejectLeaderApplication(id, req.auth!.userId, reason);
      res.json({ application });
    }),

    createLeaderProfile: asyncHandler(async (req, res) => {
      const body = req.body as AdminCreateLeaderProfileInput;
      const out = await adminCreateLeaderProfile(body, req.auth!.userId);
      res.status(201).json({
        ...out,
        message: 'Leader profile created. User should sign out and sign in again to refresh JWT.',
      });
    }),
  };
}
