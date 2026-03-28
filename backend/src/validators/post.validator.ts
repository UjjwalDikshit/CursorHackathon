import { z } from 'zod';

const geoPointSchema = z.object({
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90),
  ]),
});

const mediaItemSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'pdf', 'other']),
  storageKey: z.string().min(1).max(1024),
  cdnUrl: z.string().url().max(2048).nullish(),
  mimeType: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(0),
  width: z.number().optional().nullable(),
  height: z.number().optional().nullable(),
  durationSec: z.number().optional().nullable(),
  processingStatus: z
    .enum(['pending', 'processing', 'ready', 'failed'])
    .optional(),
});

export const createPostSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50000),
    location: geoPointSchema,
    locationAccuracyM: z.number().positive().optional().nullable(),
    placeLabel: z.string().trim().max(500).optional().nullable(),
    /** Normalized district/tehsil key for grouping & duplicate detection */
    districtKey: z.string().trim().min(1).max(80).optional().nullable(),
    villageLabel: z.string().trim().max(200).optional().nullable(),
    issueTags: z.array(z.string().trim().min(1).max(40)).max(15).optional().default([]),
    /**
     * Leaders to tag: each entry is either a public user id (handle, optional @prefix)
     * or a legacy 24-char leader profile Mongo id — resolved server-side to profile ids.
     */
    taggedLeaders: z.array(z.string().trim().min(1).max(64)).min(1).max(25),
    media: z.array(mediaItemSchema).max(20).optional(),
    isAnonymous: z.boolean().optional().default(false),
    anonymousSessionId: z.string().min(16).max(128).optional(),
    /** If true, skip merging into an existing similar post */
    skipDuplicateMerge: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.isAnonymous && !data.anonymousSessionId) {
      /* optional — server may generate for logged-in anonymous */
    }
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const feedSortModes = [
  'top',
  'balanced',
  'nearest',
  'hot',
  'recent',
] as const;

export const feedQuerySchema = z.object({
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
  radiusKm: z.coerce.number().min(0.5).max(200).default(25),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  sort: z.enum(feedSortModes).optional().default('top'),
  /** Comma-separated issue tags (must match stored normalized tags) */
  tags: z.string().max(500).optional(),
  excludeResolved: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  minUpvotes: z.coerce.number().int().min(0).max(1_000_000).optional(),
});

export const resolvePostSchema = z
  .object({
    resolutionSummary: z.string().trim().min(10).max(4000),
    proofMedia: z.array(mediaItemSchema).max(5).optional(),
  })
  .refine(
    (d) =>
      (d.proofMedia ?? []).every((m) => m.kind === 'image' || m.kind === 'video'),
    { message: 'Proof attachments must be image or video only', path: ['proofMedia'] },
  );

export const leaderConcernsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  status: z.enum(['open', 'resolved', 'all']).optional().default('all'),
});

export const listPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const trendingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
