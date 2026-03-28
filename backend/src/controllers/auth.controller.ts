import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import {
  getUserById,
  registerWithPassword,
  toPublicUser,
  verifyCredentials,
} from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { LoginInput, RegisterInput } from '../validators/auth.validator.js';

export function createAuthController(auth: AuthMiddlewares) {
  return {
    register: asyncHandler(async (req, res) => {
      const body = req.body as RegisterInput;
      const user = await registerWithPassword(body);
      const token = auth.signToken(user._id.toString(), user.role);
      res.status(201).json({
        user: toPublicUser(user),
        token,
      });
    }),

    login: asyncHandler(async (req, res) => {
      const body = req.body as LoginInput;
      const user = await verifyCredentials(body.email, body.password);
      const token = auth.signToken(user._id.toString(), user.role);
      res.json({
        user: toPublicUser(user),
        token,
      });
    }),

    me: asyncHandler(async (req, res) => {
      const user = await getUserById(req.auth!.userId);
      res.json({ user: toPublicUser(user) });
    }),
  };
}
