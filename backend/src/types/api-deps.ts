import type { RedisClient } from '../db/redis.js';
import type { CommentServiceDeps } from '../services/comment.service.js';
import type { PostServiceDeps } from '../services/post.service.js';
import type { TrendingDeps } from '../services/trending.service.js';
import type { VoteServiceDeps } from '../services/vote.service.js';

export type AppServices = {
  trending: TrendingDeps;
  post: PostServiceDeps;
  comment: CommentServiceDeps;
  vote: VoteServiceDeps;
};

export function buildAppServices(
  redis: RedisClient,
  opts?: { openAiKey?: string },
): AppServices {
  const trending: TrendingDeps = { redis };
  return {
    trending,
    post: { trending, redis, openAiKey: opts?.openAiKey },
    comment: { trending },
    vote: { trending },
  };
}
