import { z } from 'zod';

export const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'leader_profile']),
  targetId: z.string().regex(/^[a-f\d]{24}$/i),
  category: z.enum([
    'spam',
    'harassment',
    'misinformation',
    'hate',
    'violence',
    'privacy',
    'impersonation',
    'other',
  ]),
  description: z.string().trim().max(4000).default(''),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const clusterStatusSchema = z.object({
  status: z.enum(['unverified', 'community_verified', 'admin_verified']),
  adminNote: z.string().max(4000).optional(),
});
