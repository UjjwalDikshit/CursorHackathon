import { notifyLeadersTaggedOnPost } from '../realtime/notify.js';
import { emitFeedPostResolved } from '../realtime/hub.js';
import type { AppServices } from '../types/api-deps.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { routeParam } from '../utils/params.js';
import { LeaderProfile } from '../models/leaderProfile.model.js';
import { User } from '../models/user.model.js';
import {
  getLatestAccountabilitySnapshot,
  recomputeLeaderAccountability,
} from '../services/accountability.service.js';
import { rankPostsForFeed } from '../services/feed.service.js';
import {
  createComment,
  listCommentsForPost,
} from '../services/comment.service.js';
import {
  createPost,
  findDuplicateOpenPost,
  getPostById,
  incrementPostView,
  listLeaderConcernsPaginated,
  listPostsByIds,
  listPostsNear,
  listPostsPaginated,
  markPostResolvedByLeader,
  type ResolveProofMediaInput,
  normalizeDistrictKeyInput,
  normalizeIssueTags,
  toPublicPost,
} from '../services/post.service.js';
import { getTrendingPostIds } from '../services/trending.service.js';
import { voteOnPost } from '../services/vote.service.js';
import type { CreateCommentInput } from '../validators/comment.validator.js';
import type { CreatePostInput } from '../validators/post.validator.js';
import type {
  feedQuerySchema,
  leaderConcernsQuerySchema,
  listPostsQuerySchema,
  resolvePostSchema,
  trendingQuerySchema,
} from '../validators/post.validator.js';
import type { VotePostInput } from '../validators/vote.validator.js';
import type { z } from 'zod';

type FeedQuery = z.infer<typeof feedQuerySchema>;
type ListPostsQuery = z.infer<typeof listPostsQuerySchema>;
type TrendingQuery = z.infer<typeof trendingQuerySchema>;
type LeaderConcernsQuery = z.infer<typeof leaderConcernsQuerySchema>;
type ResolvePostBody = z.infer<typeof resolvePostSchema>;

function parseFeedTags(raw?: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function createPostsController(services: AppServices) {
  return {
    createPost: asyncHandler(async (req, res) => {
      const body = req.body as CreatePostInput;
      const actor = req.actor!;
      const [lng, lat] = body.location.coordinates;
      if (!body.skipDuplicateMerge) {
        const dup = await findDuplicateOpenPost({
          lng,
          lat,
          districtKey: normalizeDistrictKeyInput(body.districtKey),
          issueTags: normalizeIssueTags(body.issueTags ?? []),
          title: body.title,
          body: body.body,
        });
        if (dup) {
          throw new AppError(
            409,
            'A very similar open concern already exists within about 1 km. Upvote that thread so it ranks higher—splitting into new posts weakens visibility for leaders.',
            {
              code: 'SIMILAR_POST_EXISTS',
              details: {
                duplicatePost: toPublicPost(dup.post, req.auth?.userId),
                meta: {
                  distanceKm: Number(dup.distanceKm.toFixed(2)),
                  matchedBy: dup.matchedBy,
                  tagJaccard: dup.tagJaccard,
                  sharedTags: dup.sharedTags,
                },
              },
            },
          );
        }
      }
      const { post, anonymousSessionId } = await createPost(
        services.post,
        body,
        actor,
      );
      if (post.moderationStatus === 'approved') {
        void notifyLeadersTaggedOnPost(post);
      }
      res.status(201).json({
        post: toPublicPost(post, req.auth?.userId),
        ...(anonymousSessionId && { anonymousSessionId }),
      });
    }),

    getPost: asyncHandler(async (req, res) => {
      const post = await getPostById(routeParam(req, 'id'));
      res.json({ post: toPublicPost(post, req.auth?.userId) });
    }),

    listPosts: asyncHandler(async (req, res) => {
      const q = (req as Express.Request & { validatedQuery: ListPostsQuery })
        .validatedQuery;
      const { posts, total } = await listPostsPaginated(q.page, q.limit);
      res.json({
        posts: posts.map((p) => toPublicPost(p, req.auth?.userId)),
        page: q.page,
        limit: q.limit,
        total,
      });
    }),

    feedNearby: asyncHandler(async (req, res) => {
      const q = (req as Express.Request & { validatedQuery: FeedQuery })
        .validatedQuery;
      const radiusM = q.radiusKm * 1000;
      let candidates = await listPostsNear(
        q.lng,
        q.lat,
        radiusM,
        Math.min(q.limit * 4, 120),
      );
      if (q.excludeResolved) {
        candidates = candidates.filter((p) => !p.resolvedAt);
      }
      const tagList = parseFeedTags(q.tags);
      if (tagList.length > 0) {
        candidates = candidates.filter((p) => {
          const pts = (p.issueTags ?? []).map((x) => String(x).toLowerCase());
          return tagList.some((t) => pts.includes(t));
        });
      }
      const minUv = q.minUpvotes;
      if (minUv != null && minUv > 0) {
        candidates = candidates.filter((p) => p.upvoteCount >= minUv);
      }
      const ranked = await rankPostsForFeed(
        candidates,
        q.lng,
        q.lat,
        services.trending,
        { sort: q.sort },
      );
      const sliced = ranked.slice(0, q.limit);
      res.json({
        posts: sliced.map((p) => toPublicPost(p, req.auth?.userId)),
      });
    }),

    listLeaderConcerns: asyncHandler(async (req, res) => {
      if (!req.auth?.userId) {
        throw new AppError(401, 'Authentication required');
      }
      const q = (req as Express.Request & {
        validatedQuery: LeaderConcernsQuery;
      }).validatedQuery;
      const user = await User.findById(req.auth.userId)
        .select('leaderProfileId')
        .lean();
      if (!user?.leaderProfileId) {
        throw new AppError(
          403,
          'No leader profile is linked to this account',
        );
      }
      const { posts, total } = await listLeaderConcernsPaginated(
        user.leaderProfileId.toString(),
        q.page,
        q.limit,
        q.status,
      );
      const viewerId = req.auth!.userId;
      res.json({
        posts: posts.map((p) => toPublicPost(p, viewerId)),
        page: q.page,
        limit: q.limit,
        total,
      });
    }),

    resolvePost: asyncHandler(async (req, res) => {
      if (!req.auth?.userId) {
        throw new AppError(401, 'Authentication required');
      }
      const body = req.body as ResolvePostBody;
      const {
        post,
        upvotesCredited,
        hadProof,
        trustScoreAdded,
        trustScoreAfter,
      } = await markPostResolvedByLeader(
        routeParam(req, 'id'),
        req.auth.userId,
        body.resolutionSummary,
        (body.proofMedia ?? []) as ResolveProofMediaInput[],
      );
      const summary = post.resolutionSummary ?? '';
      emitFeedPostResolved({
        postId: post._id.toString(),
        summaryPreview: summary.slice(0, 280),
        leaderName: post.resolvedByLeaderName ?? 'Leader',
        at: new Date().toISOString(),
      });
      const u = await User.findById(req.auth.userId)
        .select('leaderProfileId')
        .lean();
      const stats = u?.leaderProfileId
        ? await LeaderProfile.findById(u.leaderProfileId)
            .select(
              'citizenSupportCreditTotal concernsResolvedCount resolutionsWithProofCount',
            )
            .lean()
        : null;
      res.json({
        post: toPublicPost(post, req.auth!.userId),
        leaderCredit: {
          upvotesCreditedFromPost: upvotesCredited,
          citizenSupportCreditTotal: stats?.citizenSupportCreditTotal ?? 0,
          concernsResolvedCount: stats?.concernsResolvedCount ?? 0,
          resolutionsWithProofCount: stats?.resolutionsWithProofCount ?? 0,
          hadProof,
          trustScoreAdded,
          trustScore: trustScoreAfter,
        },
      });
    }),

    trendingPosts: asyncHandler(async (req, res) => {
      const q = (req as Express.Request & { validatedQuery: TrendingQuery })
        .validatedQuery;
      const ids = await getTrendingPostIds(services.trending, q.limit * 2);
      const posts = await listPostsByIds(ids);
      const filtered = posts.filter(
        (p) => p.moderationStatus === 'approved' && p.visibility === 'public',
      );
      const order = new Map(ids.map((id, i) => [id, i]));
      filtered.sort(
        (a, b) =>
          (order.get(a._id.toString()) ?? 999) -
          (order.get(b._id.toString()) ?? 999),
      );
      res.json({
        posts: filtered
          .slice(0, q.limit)
          .map((p) => toPublicPost(p, req.auth?.userId)),
      });
    }),

    recordView: asyncHandler(async (req, res) => {
      const actor = req.actor!;
      const key =
        actor.kind === 'user' ? `u:${actor.userId}` : `a:${actor.sessionId}`;
      const viewCount = await incrementPostView(
        services.post,
        routeParam(req, 'id'),
        key,
      );
      res.json({ viewCount });
    }),

    listComments: asyncHandler(async (req, res) => {
      const rows = await listCommentsForPost(routeParam(req, 'id'));
      res.json({ comments: rows });
    }),

    createComment: asyncHandler(async (req, res) => {
      const body = req.body as CreateCommentInput;
      const actor = req.actor!;
      const comment = await createComment(
        services.comment,
        routeParam(req, 'id'),
        body,
        actor,
      );
      res.status(201).json({ comment });
    }),

    votePost: asyncHandler(async (req, res) => {
      const body = req.body as VotePostInput;
      const actor = req.actor!;
      const result = await voteOnPost(
        services.vote,
        routeParam(req, 'id'),
        body.value,
        actor,
      );
      res.json(result);
    }),

    getAccountability: asyncHandler(async (req, res) => {
      const data = await getLatestAccountabilitySnapshot(
        routeParam(req, 'leaderId'),
      );
      if (!data?.leader) {
        throw new AppError(404, 'Leader not found');
      }
      res.json(data);
    }),

    refreshAccountability: asyncHandler(async (req, res) => {
      await recomputeLeaderAccountability(routeParam(req, 'leaderId'));
      const data = await getLatestAccountabilitySnapshot(
        routeParam(req, 'leaderId'),
      );
      res.json(data);
    }),
  };
}
