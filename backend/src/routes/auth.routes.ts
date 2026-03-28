import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller.js';
import type { AuthMiddlewares } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validate.middleware.js';
import { loginSchema, registerSchema } from '../validators/auth.validator.js';

export function createAuthRoutes(auth: AuthMiddlewares) {
  const router = Router();
  const controller = createAuthController(auth);

  router.post('/register', validateBody(registerSchema), controller.register);
  router.post('/login', validateBody(loginSchema), controller.login);
  router.get('/me', auth.requireAuth, controller.me);

  return router;
}
