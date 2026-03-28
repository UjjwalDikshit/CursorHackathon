import {
  getMyLeaderApplication,
  submitLeaderApplication,
} from '../services/leaderProfileApplication.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { ApplyLeaderProfileInput } from '../validators/leaderProfileApplication.validator.js';

export function createLeaderApplicationController() {
  return {
    apply: asyncHandler(async (req, res) => {
      const userId = req.auth!.userId;
      const body = req.body as ApplyLeaderProfileInput;
      const application = await submitLeaderApplication(userId, body);
      res.status(201).json({
        application,
        message:
          'Application submitted. An admin will review it. Sign out and sign in again after approval to refresh your role.',
      });
    }),

    myApplication: asyncHandler(async (req, res) => {
      const application = await getMyLeaderApplication(req.auth!.userId);
      res.json({ application });
    }),
  };
}
