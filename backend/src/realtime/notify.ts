import mongoose from 'mongoose';
import { LeaderProfile } from '../models/leaderProfile.model.js';
import type { PostDocument } from '../models/post.model.js';
import { Comment } from '../models/comment.model.js';
import { emitToPostRoom, emitToUser } from './hub.js';

export async function notifyLeadersTaggedOnPost(post: PostDocument): Promise<void> {
  const ids = post.taggedLeaders.map((t) => t.leaderProfileId);
  if (ids.length === 0) return;
  const leaders = await LeaderProfile.find({ _id: { $in: ids } })
    .select('userId publicName')
    .lean();
  const payload = {
    type: 'post.tagged',
    postId: post._id.toString(),
    title: post.title,
    at: new Date().toISOString(),
  };
  for (const l of leaders) {
    const uid = l.userId?.toString();
    if (uid) {
      emitToUser(uid, 'notification', payload);
    }
  }
}

export async function notifyPostComment(params: {
  postId: string;
  postAuthorUserId: mongoose.Types.ObjectId | null;
  parentCommentId: mongoose.Types.ObjectId | null;
  commentBodyPreview: string;
}): Promise<void> {
  const roomPayload = {
    type: 'comment.created',
    postId: params.postId,
    preview: params.commentBodyPreview.slice(0, 200),
    at: new Date().toISOString(),
  };
  emitToPostRoom(params.postId, 'post:comment', roomPayload);

  if (params.postAuthorUserId) {
    emitToUser(params.postAuthorUserId.toString(), 'notification', {
      ...roomPayload,
      type: 'post.comment',
    });
  }

  if (params.parentCommentId) {
    const parent = await Comment.findById(params.parentCommentId)
      .select('authorUserId')
      .lean();
    const puid = parent?.authorUserId?.toString();
    if (puid) {
      emitToUser(puid, 'notification', {
        type: 'comment.reply',
        postId: params.postId,
        preview: params.commentBodyPreview.slice(0, 200),
        at: new Date().toISOString(),
      });
    }
  }
}
