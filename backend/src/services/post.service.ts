import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { LeaderProfile } from '../models/leaderProfile.model.js';
import type { PostDocument } from '../models/post.model.js';
import { Post } from '../models/post.model.js';
import { User } from '../models/user.model.js';
import { distanceKm } from './feed.service.js';
import { AppError } from '../utils/AppError.js';
import type { CreatePostInput } from '../validators/post.validator.js';
import { expandLeaderEscalation } from './hierarchy.service.js';
import type { TrendingDeps } from './trending.service.js';
import { recordPostEngagement } from './trending.service.js';
import type { RedisClient } from '../db/redis.js';
import { scheduleAccountabilityRefresh } from './accountability.service.js';
import { moderateNewPost } from './aiModeration.service.js';
import { emitFeedNewPost } from '../realtime/hub.js';

export type PostServiceDeps = {
  trending: TrendingDeps;
  redis: RedisClient;
  openAiKey?: string;
};

/** Open concerns within this radius are candidates for “same issue” detection (1 km). */
const DUPLICATE_RADIUS_M = 1000;
/** Tag sets must have Jaccard similarity ≥ this (≥50% of union is shared tags). */
const DUPLICATE_TAG_JACCARD_MIN = 0.5;

export function normalizeIssueTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\p{L}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function normalizeIssueTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const n = normalizeIssueTag(t);
    if (n.length > 0) out.add(n);
  }
  return [...out];
}

/** Normalize a leader tag from the client (strip @, lowercase). */
export function normalizeLeaderTagToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/u, '');
}

/**
 * Resolve post `taggedLeaders` strings to leader profile ObjectIds.
 * Each token is either a 24-char profile id (legacy) or a user's public `userHandle` for an account that has a leader profile.
 */
export async function resolveTaggedLeaderProfileIds(
  tokens: string[],
): Promise<mongoose.Types.ObjectId[]> {
  const dedupeProfile = new Set<string>();
  const out: mongoose.Types.ObjectId[] = [];

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;

    const looksLikeObjectId =
      /^[a-f\d]{24}$/i.test(token) && mongoose.isValidObjectId(token);

    if (looksLikeObjectId) {
      const lp = await LeaderProfile.findOne({
        _id: new mongoose.Types.ObjectId(token),
        isActive: true,
      })
        .select('_id')
        .lean();
      if (!lp) {
        throw new AppError(
          400,
          `Unknown leader id "${token}". Use an active leader profile id or a leader's public user id.`,
        );
      }
      const idStr = String(lp._id);
      if (dedupeProfile.has(idStr)) continue;
      dedupeProfile.add(idStr);
      out.push(new mongoose.Types.ObjectId(lp._id));
      continue;
    }

    const handle = normalizeLeaderTagToken(token);
    if (handle.length < 3) {
      throw new AppError(
        400,
        `Invalid leader user id "${token}". Public ids are at least 3 characters.`,
      );
    }

    const user = await User.findOne({
      userHandle: handle,
      status: 'active',
    })
      .select('leaderProfileId')
      .lean();

    if (!user?.leaderProfileId) {
      throw new AppError(
        400,
        `No leader account found for user id "${handle}". They need a public user id and a linked leader profile.`,
      );
    }

    const lp = await LeaderProfile.findOne({
      _id: user.leaderProfileId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!lp) {
      throw new AppError(
        400,
        `Leader profile missing or inactive for user id "${handle}".`,
      );
    }
    const idStr = String(lp._id);
    if (dedupeProfile.has(idStr)) continue;
    dedupeProfile.add(idStr);
    out.push(new mongoose.Types.ObjectId(lp._id));
  }

  if (out.length === 0) {
    throw new AppError(400, 'Tag at least one leader');
  }

  return out;
}

export function normalizeDistrictKeyInput(
  raw: string | null | undefined,
): string | null {
  if (raw == null || !String(raw).trim()) return null;
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 80);
}

function tokenizeForDuplicate(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f]+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const u = a.size + b.size - inter;
  return u === 0 ? 0 : inter / u;
}

export type DuplicateMatchInfo = {
  post: PostDocument;
  distanceKm: number;
  matchedBy: 'tags' | 'text';
  /** Jaccard(tags_new, tags_existing); null when matchedBy === 'text' */
  tagJaccard: number | null;
  sharedTags: string[];
};

function tagSetsJaccard(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  let inter = 0;
  for (const x of setA) if (setB.has(x)) inter++;
  const u = setA.size + setB.size - inter;
  return u === 0 ? 0 : inter / u;
}

/**
 * Find an existing open approved post within ~1 km with either:
 * - ≥50% tag overlap (Jaccard on normalized issue tags), plus compatible district when both set, or
 * - No tags on the new draft: title/body token Jaccard (same rough bar as before), still within 1 km.
 */
export async function findDuplicateOpenPost(input: {
  lng: number;
  lat: number;
  districtKey: string | null;
  issueTags: string[];
  title: string;
  body: string;
}): Promise<DuplicateMatchInfo | null> {
  const near = await Post.find({
    moderationStatus: 'approved',
    visibility: 'public',
    $or: [{ resolvedAt: null }, { resolvedAt: { $exists: false } }],
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [input.lng, input.lat] },
        $maxDistance: DUPLICATE_RADIUS_M,
      },
    },
  })
    .limit(80)
    .exec();

  const tags = input.issueTags;
  const setNewTags = new Set(tags);
  const newTok = new Set([
    ...tokenizeForDuplicate(input.title),
    ...tokenizeForDuplicate(input.body.slice(0, 800)),
  ]);

  let bestScore = -1;
  let chosen: DuplicateMatchInfo | null = null;

  for (const p of near) {
    if (p.resolvedAt) continue;
    const [plng, plat] = p.location.coordinates;
    const dist = distanceKm(input.lng, input.lat, plng, plat);
    if (dist > 1) continue;

    const pTags = normalizeIssueTags(
      Array.isArray(p.issueTags) ? p.issueTags.map((x) => String(x)) : [],
    );
    const setPostTags = new Set(pTags);

    if (tags.length > 0) {
      if (pTags.length === 0) continue;
      const pDistrict = p.districtKey
        ? String(p.districtKey).toLowerCase()
        : null;
      if (
        input.districtKey &&
        pDistrict &&
        input.districtKey !== pDistrict
      ) {
        continue;
      }
      const jac = tagSetsJaccard(setNewTags, setPostTags);
      if (jac < DUPLICATE_TAG_JACCARD_MIN) continue;
      const sharedTags = [...setNewTags].filter((t) => setPostTags.has(t));
      const score = jac * 1000 - dist;
      if (score > bestScore) {
        bestScore = score;
        chosen = {
          post: p,
          distanceKm: dist,
          matchedBy: 'tags',
          tagJaccard: jac,
          sharedTags,
        };
      }
    } else {
      const pTok = tokenizeForDuplicate(
        `${p.title} ${String(p.body).slice(0, 800)}`,
      );
      const jac = jaccardSimilarity(newTok, pTok);
      if (jac < 0.28) continue;
      const score = jac * 100 - dist;
      if (score > bestScore) {
        bestScore = score;
        chosen = {
          post: p,
          distanceKm: dist,
          matchedBy: 'text',
          tagJaccard: null,
          sharedTags: [],
        };
      }
    }
  }

  return chosen;
}

function mapPublicMediaItems(items: unknown) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return items
    .map((raw) => {
      const m: Record<string, unknown> =
        raw != null &&
        typeof raw === 'object' &&
        'toObject' in raw &&
        typeof (raw as { toObject?: (o?: object) => object }).toObject ===
          'function'
          ? ((raw as { toObject: (o?: object) => object }).toObject({
              flattenMaps: true,
            }) as unknown as Record<string, unknown>)
          : (raw as unknown as Record<string, unknown>);
      const cdnRaw =
        m.cdnUrl ??
        m.secure_url ??
        m.secureUrl ??
        m.cdn_url;
      const cdnUrl =
        cdnRaw != null && String(cdnRaw).trim() !== ''
          ? String(cdnRaw).trim()
          : null;
      return {
        kind: String(m.kind ?? 'other'),
        storageKey: String(m.storageKey ?? '').trim(),
        cdnUrl,
        mimeType: String(m.mimeType ?? ''),
        sizeBytes: Number(m.sizeBytes ?? 0),
        width: m.width != null ? Number(m.width) : null,
        height: m.height != null ? Number(m.height) : null,
        durationSec: m.durationSec != null ? Number(m.durationSec) : null,
        processingStatus:
          m.processingStatus != null
            ? String(m.processingStatus)
            : 'ready',
      };
    })
    .filter(
      (x) => x.storageKey.length > 0 || (x.cdnUrl != null && x.cdnUrl.length > 0),
    );
}

function mapPublicMedia(post: PostDocument) {
  return mapPublicMediaItems(post.media);
}

function toPublicPost(post: PostDocument, viewerUserId?: string) {
  const authorHidden = post.isAnonymous;
  const issueTags = Array.isArray(post.issueTags)
    ? post.issueTags.map((t) => String(t))
    : [];
  return {
    id: post._id.toString(),
    title: post.title,
    body: post.body,
    media: mapPublicMedia(post),
    resolutionProofMedia: mapPublicMediaItems(post.resolutionProofMedia),
    location: post.location,
    locationAccuracyM: post.locationAccuracyM,
    placeLabel: post.placeLabel,
    districtKey: post.districtKey ?? null,
    villageLabel: post.villageLabel ?? null,
    issueTags,
    taggedLeaderProfileIds: post.taggedLeaders.map((t) =>
      t.leaderProfileId.toString(),
    ),
    affectedLeaderProfileIds: post.affectedLeaderProfileIds.map((id) =>
      id.toString(),
    ),
    isAnonymous: post.isAnonymous,
    authorUserId:
      authorHidden || !post.authorUserId
        ? null
        : post.authorUserId.toString(),
    voteScore: post.voteScore,
    upvoteCount: post.upvoteCount,
    downvoteCount: post.downvoteCount,
    commentCount: post.commentCount,
    viewCount: post.viewCount,
    credibilityScore: post.credibilityScore,
    moderationStatus: post.moderationStatus,
    aiFlagged: post.aiModeration?.flagged ?? false,
    publishedAt: post.publishedAt,
    createdAt: post.createdAt,
    resolvedAt: post.resolvedAt ?? null,
    resolvedByLeaderProfileId:
      post.resolvedByLeaderProfileId?.toString() ?? null,
    resolvedByLeaderName: post.resolvedByLeaderName ?? null,
    resolutionSummary: post.resolutionSummary ?? null,
    /** Shown once at creation for anonymous vote/comment correlation */
    anonymousSessionId:
      authorHidden &&
      post.authorUserId &&
      viewerUserId &&
      post.authorUserId.toString() === viewerUserId
        ? post.anonymousSessionId
        : undefined,
  };
}

export { toPublicPost };

export async function createPost(
  deps: PostServiceDeps,
  input: CreatePostInput,
  actor: { kind: 'user'; userId: string } | { kind: 'anonymous'; sessionId: string },
): Promise<{ post: PostDocument; anonymousSessionId?: string }> {
  const leaderIds = await resolveTaggedLeaderProfileIds(input.taggedLeaders);

  let authorUserId: mongoose.Types.ObjectId | null = null;
  let anonymousSessionId: string | null = null;
  let isAnonymous = input.isAnonymous;

  if (actor.kind === 'user') {
    authorUserId = new mongoose.Types.ObjectId(actor.userId);
    if (isAnonymous) {
      anonymousSessionId =
        input.anonymousSessionId?.trim() ||
        crypto.randomBytes(24).toString('hex');
    }
  } else {
    authorUserId = null;
    isAnonymous = true;
    anonymousSessionId = actor.sessionId;
  }

  const taggedLeaders = leaderIds.map((leaderProfileId) => ({
    leaderProfileId,
    taggedAt: new Date(),
    taggedByUserId: authorUserId,
  }));

  const affectedLeaderProfileIds = await expandLeaderEscalation(leaderIds);

  let credibilityScore = 0.45;
  if (actor.kind === 'user' && !isAnonymous) {
    const u = await User.findById(actor.userId).select('trustScore').lean();
    if (u) {
      credibilityScore = Math.min(0.95, 0.35 + (u.trustScore / 100) * 0.55);
    }
  }

  const ai = await moderateNewPost(
    deps.openAiKey,
    input.title.trim(),
    input.body.trim(),
  );
  if (ai.flagged) {
    credibilityScore = Math.max(0, credibilityScore - 0.12);
  }

  const districtKey = normalizeDistrictKeyInput(input.districtKey);
  const issueTags = normalizeIssueTags(input.issueTags ?? []);

  const post = await Post.create({
    authorUserId,
    isAnonymous,
    anonymousSessionId,
    title: input.title.trim(),
    body: input.body.trim(),
    media: input.media ?? [],
    taggedLeaders,
    affectedLeaderProfileIds,
    location: {
      type: 'Point',
      coordinates: input.location.coordinates,
    },
    locationAccuracyM: input.locationAccuracyM ?? null,
    placeLabel: input.placeLabel?.trim() ?? null,
    districtKey,
    villageLabel: input.villageLabel?.trim() || null,
    issueTags,
    visibility: 'public',
    moderationStatus: ai.moderationStatus,
    credibilityScore,
    publishedAt: ai.moderationStatus === 'approved' ? new Date() : null,
    aiModeration: {
      scannedAt: new Date(),
      model: ai.model,
      flagged: ai.flagged,
      riskScore: ai.riskScore,
      categories: ai.categories,
    },
  });

  if (ai.moderationStatus === 'approved') {
    await LeaderProfile.updateMany(
      { _id: { $in: affectedLeaderProfileIds } },
      { $inc: { postTagCount: 1 } },
    );
    await recordPostEngagement(deps.trending, post._id.toString(), 1);
    scheduleAccountabilityRefresh(
      affectedLeaderProfileIds.map((id) => id.toString()),
    );
    emitFeedNewPost(post._id.toString());
  }

  const out: { post: PostDocument; anonymousSessionId?: string } = { post };
  if (
    actor.kind === 'user' &&
    isAnonymous &&
    anonymousSessionId &&
    input.isAnonymous
  ) {
    out.anonymousSessionId = anonymousSessionId;
  }
  return out;
}

export async function listPostsNear(
  lng: number,
  lat: number,
  radiusM: number,
  limit: number,
): Promise<PostDocument[]> {
  return Post.find({
    moderationStatus: 'approved',
    visibility: 'public',
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: radiusM,
      },
    },
  })
    .sort({ publishedAt: -1 })
    .limit(Math.min(limit, 100))
    .exec();
}

export async function listPostsByIds(ids: string[]): Promise<PostDocument[]> {
  if (ids.length === 0) return [];
  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  return Post.find({ _id: { $in: oids } }).exec();
}

export async function listPostsPaginated(
  page: number,
  limit: number,
): Promise<{ posts: PostDocument[]; total: number }> {
  const skip = (page - 1) * limit;
  const filter = { moderationStatus: 'approved' as const, visibility: 'public' as const };
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Post.countDocuments(filter),
  ]);
  return { posts, total };
}

export async function getPostById(id: string): Promise<PostDocument> {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError(400, 'Invalid post id');
  }
  const post = await Post.findById(id);
  if (!post || post.visibility === 'removed') {
    throw new AppError(404, 'Post not found');
  }
  return post;
}

export async function listLeaderConcernsPaginated(
  leaderProfileId: string,
  page: number,
  limit: number,
  status: 'open' | 'resolved' | 'all',
): Promise<{ posts: PostDocument[]; total: number }> {
  if (!mongoose.isValidObjectId(leaderProfileId)) {
    throw new AppError(400, 'Invalid leader profile');
  }
  const lid = new mongoose.Types.ObjectId(leaderProfileId);
  const filter: Record<string, unknown> = {
    affectedLeaderProfileIds: lid,
    moderationStatus: { $in: ['approved', 'pending'] },
    visibility: 'public',
  };
  if (status === 'open') {
    filter.$or = [
      { resolvedAt: null },
      { resolvedAt: { $exists: false } },
    ];
  } else if (status === 'resolved') {
    filter.resolvedAt = { $ne: null };
  }
  const skip = (page - 1) * limit;
  const [posts, total] = await Promise.all([
    Post.find(filter)
      .sort({ upvoteCount: -1, voteScore: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Post.countDocuments(filter),
  ]);
  return { posts, total };
}

export type ResolveProofMediaInput = {
  kind: 'image' | 'video';
  storageKey: string;
  cdnUrl?: string | null;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};

export async function markPostResolvedByLeader(
  postId: string,
  leaderUserId: string,
  resolutionSummary: string,
  proofMedia: ResolveProofMediaInput[],
): Promise<{
  post: PostDocument;
  upvotesCredited: number;
  hadProof: boolean;
  /** Points actually applied to User.trustScore (may be less than upvotes if near cap 100). */
  trustScoreAdded: number;
  trustScoreAfter: number;
}> {
  const user = await User.findById(leaderUserId)
    .select('leaderProfileId')
    .lean();
  if (!user?.leaderProfileId) {
    throw new AppError(403, 'Only verified leaders can mark concerns resolved');
  }
  const myLid = user.leaderProfileId.toString();
  const post = await getPostById(postId);
  if (post.resolvedAt) {
    throw new AppError(409, 'This concern is already marked resolved');
  }
  const affected = post.affectedLeaderProfileIds.map((id) => id.toString());
  const tagged = post.taggedLeaders.map((t) =>
    t.leaderProfileId.toString(),
  );
  if (!affected.includes(myLid) && !tagged.includes(myLid)) {
    throw new AppError(403, 'You are not responsible for this concern');
  }
  const leader = await LeaderProfile.findById(user.leaderProfileId)
    .select('publicName')
    .lean();
  const name = leader?.publicName ?? 'Leader';

  const upvotesCredited = Math.max(0, Math.floor(post.upvoteCount));
  const hadProof = proofMedia.length > 0;

  const storedProof = proofMedia.map((m) => ({
    kind: m.kind,
    storageKey: m.storageKey.trim(),
    cdnUrl: m.cdnUrl?.trim() || null,
    mimeType: m.mimeType,
    sizeBytes: m.sizeBytes,
    width: m.width ?? null,
    height: m.height ?? null,
    durationSec: m.durationSec ?? null,
    processingStatus: 'ready' as const,
  }));

  const updated = await Post.findByIdAndUpdate(
    post._id,
    {
      $set: {
        resolvedAt: new Date(),
        resolvedByLeaderProfileId: user.leaderProfileId,
        resolvedByLeaderName: name,
        resolutionSummary: resolutionSummary.trim(),
        resolutionProofMedia: storedProof,
      },
    },
    { new: true },
  );
  if (!updated) {
    throw new AppError(500, 'Could not update post');
  }

  const inc: Record<string, number> = {
    citizenSupportCreditTotal: upvotesCredited,
    concernsResolvedCount: 1,
  };
  if (hadProof) {
    inc.resolutionsWithProofCount = 1;
  }
  await LeaderProfile.updateOne({ _id: user.leaderProfileId }, { $inc: inc });

  const leaderAccount = await User.findById(leaderUserId).select('trustScore');
  let trustScoreAdded = 0;
  let trustScoreAfter = 50;
  if (leaderAccount) {
    const prev = Number(leaderAccount.trustScore ?? 50);
    const raw = prev + upvotesCredited;
    trustScoreAfter = Math.min(100, Math.max(0, raw));
    trustScoreAdded = trustScoreAfter - prev;
    leaderAccount.trustScore = trustScoreAfter;
    leaderAccount.trustScoreUpdatedAt = new Date();
    await leaderAccount.save();
  }

  return {
    post: updated,
    upvotesCredited,
    hadProof,
    trustScoreAdded,
    trustScoreAfter,
  };
}

export async function incrementPostView(
  deps: PostServiceDeps,
  postId: string,
  actorKey: string,
): Promise<number> {
  const post = await getPostById(postId);
  if (deps.redis) {
    const dedupe = `view:${postId}:${actorKey}`;
    const ok = await deps.redis.set(dedupe, '1', 'EX', 120, 'NX');
    if (ok !== 'OK') {
      return post.viewCount;
    }
  }
  const updated = await Post.findByIdAndUpdate(
    post._id,
    { $inc: { viewCount: 1 } },
    { new: true },
  );
  await recordPostEngagement(deps.trending, postId, 0.15);
  return updated?.viewCount ?? post.viewCount + 1;
}

export async function touchPostCredibilityFromEngagement(
  postId: string,
  delta: number,
): Promise<void> {
  const bump = Math.min(0.02, Math.max(-0.02, delta * 0.002));
  const p = await Post.findById(postId).select('credibilityScore');
  if (!p) return;
  const next = Math.min(1, Math.max(0, p.credibilityScore + bump));
  await Post.updateOne({ _id: postId }, { $set: { credibilityScore: next } });
}
