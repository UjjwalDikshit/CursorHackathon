import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().trim().min(1).max(10000),
  parentCommentId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional()
    .nullable(),
  isAnonymous: z.boolean().optional().default(false),
  anonymousSessionId: z.string().min(16).max(128).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
