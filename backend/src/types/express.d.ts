import type { UserRole } from '../models/user.model.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        role: UserRole;
      };
      actor?:
        | { kind: 'user'; userId: string }
        | { kind: 'anonymous'; sessionId: string };
      validatedQuery?: unknown;
    }
  }
}

export {};
