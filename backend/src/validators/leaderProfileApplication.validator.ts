import { z } from 'zod';
import { HIERARCHY_TIERS } from '../models/leaderProfile.model.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const geoPointInputSchema = z.object({
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});

export const applyLeaderProfileSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(160)
    .regex(slugPattern, 'Slug must be lowercase alphanumeric with single hyphens'),
  publicName: z.string().trim().min(1).max(200),
  bio: z.string().trim().max(8000).optional().default(''),
  officeTitle: z.string().trim().max(200).optional().nullable(),
  jurisdictionLabel: z.string().trim().max(300).optional().nullable(),
  officeLocation: geoPointInputSchema.optional().nullable(),
  homeRegionCode: z.string().trim().max(16).optional().nullable(),
  hierarchyTier: z.enum(HIERARCHY_TIERS).optional().nullable(),
  parentLeaderProfileId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional()
    .nullable(),
});

export type ApplyLeaderProfileInput = z.infer<typeof applyLeaderProfileSchema>;

export const adminCreateLeaderProfileSchema = z.object({
  userId: z.string().regex(/^[a-f\d]{24}$/i),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(160)
    .regex(slugPattern),
  publicName: z.string().trim().min(1).max(200),
  bio: z.string().trim().max(8000).optional().default(''),
  officeTitle: z.string().trim().max(200).optional().nullable(),
  jurisdictionLabel: z.string().trim().max(300).optional().nullable(),
  officeLocation: geoPointInputSchema.optional().nullable(),
  homeRegionCode: z.string().trim().max(16).optional().nullable(),
  hierarchyTier: z.enum(HIERARCHY_TIERS).optional().nullable(),
  parentLeaderProfileId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional()
    .nullable(),
});

export type AdminCreateLeaderProfileInput = z.infer<typeof adminCreateLeaderProfileSchema>;

export const approveLeaderApplicationSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(160)
    .regex(slugPattern)
    .optional(),
  publicName: z.string().trim().min(1).max(200).optional(),
});

export type ApproveLeaderApplicationInput = z.infer<typeof approveLeaderApplicationSchema>;

export const rejectLeaderApplicationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type RejectLeaderApplicationInput = z.infer<typeof rejectLeaderApplicationSchema>;

export const listLeaderApplicationsQuerySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).optional().default('pending'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  skip: z.coerce.number().int().min(0).optional().default(0),
});

export type ListLeaderApplicationsQuery = z.infer<typeof listLeaderApplicationsQuerySchema>;
