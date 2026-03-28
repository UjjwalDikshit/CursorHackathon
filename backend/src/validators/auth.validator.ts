import { z } from 'zod';

const userHandleSchema = z
  .string()
  .trim()
  .min(3, 'Public user id must be at least 3 characters')
  .max(32)
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,
    'Use letters, numbers, underscores, or hyphens (start with a letter or number)',
  )
  .transform((s) => s.toLowerCase());

export const registerSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long'),
  displayName: z.string().trim().min(1).max(120),
  /** Unique public id for your account (others tag leaders with this). */
  userHandle: userHandleSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
