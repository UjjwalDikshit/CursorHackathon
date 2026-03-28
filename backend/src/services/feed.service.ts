import type { PostDocument } from '../models/post.model.js';
import type { TrendingDeps } from './trending.service.js';
import { getTrendingScores } from './trending.service.js';

/**
 * Feed ranking (higher = better rank):
 *
 * R = 0.35 * proximityNorm
 *   + 0.22 * engagementNorm
 *   + 0.18 * trendingBoost
 *   + 0.15 * recencyNorm
 *   + 0.10 * credibility
 *
 * - proximityNorm: 1 / (1 + distanceKm / 5)
 * - engagementNorm: log-scaled upvotes+comments+0.02*views vs cohort max
 * - trendingBoost: Redis spike-aware score (0–1)
 * - recencyNorm: exp(-ageHours / 72)
 * - credibility: post.credibilityScore (already 0–1)
 */
const W_PROX = 0.35;
const W_ENG = 0.22;
const W_TREND = 0.18;
const W_REC = 0.15;
const W_CRED = 0.1;

export function distanceKm(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type FeedSortMode = 'top' | 'balanced' | 'nearest' | 'hot' | 'recent';

function rankScoreForMode(
  post: PostDocument,
  viewerLng: number,
  viewerLat: number,
  maxEngagement: number,
  trendMap: Map<string, { rolling: number; spikeBoost: number }>,
  now: number,
  mode: FeedSortMode,
): number {
  const [plng, plat] = post.location.coordinates;
  const dist = distanceKm(viewerLng, viewerLat, plng, plat);
  const proximityNorm = 1 / (1 + dist / 5);

  const engagement =
    post.upvoteCount +
    post.commentCount +
    Math.floor(post.viewCount * 0.02);
  const engagementNorm =
    maxEngagement > 0
      ? Math.log1p(engagement) / Math.log1p(maxEngagement)
      : 0;

  const t = trendMap.get(post._id.toString());
  const rolling = t?.rolling ?? 0;
  const trendingBoost = Math.min(
    1,
    Math.log1p(rolling) / Math.log1p(50) + (t?.spikeBoost ?? 0) * 0.15,
  );

  const published = post.publishedAt?.getTime() ?? post.createdAt.getTime();
  const ageHours = (now - published) / 3_600_000;
  const recencyNorm = Math.exp(-ageHours / 72);

  const credibility = post.credibilityScore;

  switch (mode) {
    case 'nearest':
      return proximityNorm * 0.88 + Math.min(1, engagementNorm) * 0.12;
    case 'hot':
      return (
        Math.min(1, engagementNorm) * 0.45 +
        trendingBoost * 0.35 +
        recencyNorm * 0.2
      );
    case 'recent':
      return recencyNorm * 0.78 + proximityNorm * 0.22;
    default:
      return (
        W_PROX * proximityNorm +
        W_ENG * Math.min(1, engagementNorm) +
        W_TREND * trendingBoost +
        W_REC * recencyNorm +
        W_CRED * credibility
      );
  }
}

export async function rankPostsForFeed(
  posts: PostDocument[],
  viewerLng: number,
  viewerLat: number,
  trending: TrendingDeps,
  opts?: { sort?: FeedSortMode },
): Promise<PostDocument[]> {
  if (posts.length === 0) return [];

  const sort: FeedSortMode = opts?.sort ?? 'top';

  if (sort === 'top') {
    return [...posts].sort((a, b) => {
      if (b.upvoteCount !== a.upvoteCount) {
        return b.upvoteCount - a.upvoteCount;
      }
      if (b.voteScore !== a.voteScore) {
        return b.voteScore - a.voteScore;
      }
      const tb = (b.publishedAt ?? b.createdAt).getTime();
      const ta = (a.publishedAt ?? a.createdAt).getTime();
      return tb - ta;
    });
  }

  const trendMap = await getTrendingScores(trending, 80);
  const now = Date.now();
  const maxEngagement = posts.reduce(
    (m, p) =>
      Math.max(
        m,
        p.upvoteCount + p.commentCount + Math.floor(p.viewCount * 0.02),
      ),
    0,
  );

  return [...posts].sort(
    (a, b) =>
      rankScoreForMode(b, viewerLng, viewerLat, maxEngagement, trendMap, now, sort) -
      rankScoreForMode(a, viewerLng, viewerLat, maxEngagement, trendMap, now, sort),
  );
}
