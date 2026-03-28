import mongoose from 'mongoose';
import { Post } from '../models/post.model.js';
import { Vote } from '../models/vote.model.js';
import { AppError } from '../utils/AppError.js';
import { getPostById, touchPostCredibilityFromEngagement } from './post.service.js';
import type { TrendingDeps } from './trending.service.js';
import { recordPostEngagement } from './trending.service.js';

export type VoteServiceDeps = { trending: TrendingDeps };

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: number }).code === 11000
  );
}

export async function voteOnPost(
  deps: VoteServiceDeps,
  postId: string,
  value: 1 | -1,
  actor: { kind: 'user'; userId: string } | { kind: 'anonymous'; sessionId: string },
) {
  const post = await getPostById(postId);
  const userId =
    actor.kind === 'user'
      ? new mongoose.Types.ObjectId(actor.userId)
      : null;
  const anonymousSessionId =
    actor.kind === 'anonymous' ? actor.sessionId : null;

  const filter =
    userId !== null
      ? { targetType: 'post' as const, targetId: post._id, userId }
      : {
          targetType: 'post' as const,
          targetId: post._id,
          anonymousSessionId: anonymousSessionId!,
        };

  let dUp = 0;
  let dDown = 0;
  let dScore = 0;
  let settled = false;

  /* No multi-document transaction: standalone MongoDB often has no replica set, so multi-doc transactions fail and votes never persisted. */
  for (let attempt = 0; attempt < 8 && !settled; attempt++) {
    const existing = await Vote.findOne(filter);

    if (!existing) {
      try {
        await Vote.create({
          targetType: 'post',
          targetId: post._id,
          value,
          userId,
          anonymousSessionId,
        });
      } catch (e) {
        if (isDuplicateKeyError(e)) {
          continue;
        }
        throw e;
      }
      if (value === 1) {
        dUp = 1;
        dScore = 1;
      } else {
        dDown = 1;
        dScore = -1;
      }
      settled = true;
      continue;
    }

    if (existing.value === value) {
      settled = true;
      continue;
    }

    existing.value = value;
    await existing.save();
    if (value === 1) {
      dUp = 1;
      dDown = -1;
      dScore = 2;
    } else {
      dUp = -1;
      dDown = 1;
      dScore = -2;
    }
    settled = true;
  }

  if (!settled) {
    throw new AppError(503, 'Could not record vote; please try again');
  }

  if (dUp !== 0 || dDown !== 0) {
    const updated = await Post.findByIdAndUpdate(
      post._id,
      {
        $inc: {
          upvoteCount: dUp,
          downvoteCount: dDown,
          voteScore: dScore,
        },
      },
      { new: true },
    );
    if (!updated) {
      throw new AppError(500, 'Post update failed');
    }
  }

  if (dScore !== 0) {
    await recordPostEngagement(deps.trending, postId, Math.abs(dScore) * 0.5);
    await touchPostCredibilityFromEngagement(postId, dScore);
  }

  const updated = await Post.findById(post._id);
  if (!updated) {
    throw new AppError(500, 'Post update failed');
  }

  const voteDoc = await Vote.findOne(
    userId !== null
      ? { targetType: 'post', targetId: post._id, userId }
      : {
          targetType: 'post',
          targetId: post._id,
          anonymousSessionId: anonymousSessionId!,
        },
  );

  return {
    postId: updated._id.toString(),
    upvoteCount: updated.upvoteCount,
    downvoteCount: updated.downvoteCount,
    voteScore: updated.voteScore,
    yourVote: voteDoc?.value ?? value,
  };
}
