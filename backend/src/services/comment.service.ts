import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { Comment } from '../models/comment.model.js';
import { Post } from '../models/post.model.js';
import { AppError } from '../utils/AppError.js';
import type { CreateCommentInput } from '../validators/comment.validator.js';
import { getPostById } from './post.service.js';
import type { TrendingDeps } from './trending.service.js';
import { recordPostEngagement } from './trending.service.js';
import { touchPostCredibilityFromEngagement } from './post.service.js';
import { notifyPostComment } from '../realtime/notify.js';

export type CommentServiceDeps = { trending: TrendingDeps };

function toPublicComment(c: {
  _id: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  parentCommentId: mongoose.Types.ObjectId | null;
  path: string;
  depth: number;
  authorUserId: mongoose.Types.ObjectId | null;
  isAnonymous: boolean;
  body: string;
  voteScore: number;
  upvoteCount: number;
  downvoteCount: number;
  replyCount: number;
  createdAt: Date;
}) {
  return {
    id: c._id.toString(),
    postId: c.postId.toString(),
    parentCommentId: c.parentCommentId?.toString() ?? null,
    path: c.path,
    depth: c.depth,
    isAnonymous: c.isAnonymous,
    authorUserId:
      c.isAnonymous || !c.authorUserId ? null : c.authorUserId.toString(),
    body: c.body,
    voteScore: c.voteScore,
    upvoteCount: c.upvoteCount,
    downvoteCount: c.downvoteCount,
    replyCount: c.replyCount,
    createdAt: c.createdAt,
  };
}

export { toPublicComment };

export async function listCommentsForPost(postId: string) {
  await getPostById(postId);
  const rows = await Comment.find({ postId, moderationStatus: 'approved' })
    .sort({ path: 1, createdAt: 1 })
    .lean();
  return rows.map((c) => toPublicComment(c as never));
}

export async function createComment(
  deps: CommentServiceDeps,
  postId: string,
  input: CreateCommentInput,
  actor: { kind: 'user'; userId: string } | { kind: 'anonymous'; sessionId: string },
) {
  const post = await getPostById(postId);
  let parentCommentId: mongoose.Types.ObjectId | null = null;
  let parentPath = '';
  let depth = 0;

  if (input.parentCommentId) {
    const parent = await Comment.findOne({
      _id: input.parentCommentId,
      postId: post._id,
    });
    if (!parent) {
      throw new AppError(400, 'Parent comment not found');
    }
    parentCommentId = parent._id;
    parentPath = parent.path;
    depth = parent.depth + 1;
    if (depth > 20) {
      throw new AppError(400, 'Max thread depth exceeded');
    }
  }

  const authorUserId =
    actor.kind === 'user'
      ? new mongoose.Types.ObjectId(actor.userId)
      : null;
  const isAnonymous =
    actor.kind === 'anonymous' || Boolean(input.isAnonymous);

  let anonymousSessionId: string | null = null;
  if (actor.kind === 'anonymous') {
    anonymousSessionId = actor.sessionId;
  } else if (input.isAnonymous) {
    anonymousSessionId =
      input.anonymousSessionId?.trim() ||
      crypto.randomBytes(16).toString('hex');
  }

  const temp = await Comment.create({
    postId: post._id,
    parentCommentId,
    path: '__pending__',
    depth,
    authorUserId,
    isAnonymous,
    anonymousSessionId,
    body: input.body.trim(),
    moderationStatus: 'approved',
  });

  const path =
    parentCommentId === null
      ? `${temp._id.toString()}/`
      : `${parentPath}${temp._id.toString()}/`;
  temp.path = path;
  await temp.save();

  if (parentCommentId) {
    await Comment.updateOne(
      { _id: parentCommentId },
      { $inc: { replyCount: 1 } },
    );
  }

  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1 } });
  await recordPostEngagement(deps.trending, post._id.toString(), 1.5);
  await touchPostCredibilityFromEngagement(post._id.toString(), 1);

  const pLean = await Post.findById(post._id).select('authorUserId').lean();
  await notifyPostComment({
    postId: post._id.toString(),
    postAuthorUserId: pLean?.authorUserId ?? null,
    parentCommentId,
    commentBodyPreview: input.body.trim(),
  });

  return toPublicComment(temp.toObject() as never);
}
