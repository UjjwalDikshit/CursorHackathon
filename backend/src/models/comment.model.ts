import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const commentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    parentCommentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    /** Materialized path for threaded read patterns (e.g. "parentId/childId/") */
    path: { type: String, required: true, maxlength: 4096 },
    depth: { type: Number, required: true, default: 0, min: 0, max: 20 },

    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    isAnonymous: { type: Boolean, default: false },
    anonymousSessionId: { type: String, default: null, maxlength: 128 },

    body: { type: String, required: true, maxlength: 10000 },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'escalated'],
      default: 'approved',
    },

    voteScore: { type: Number, default: 0 },
    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },
    replyCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

commentSchema.index({ postId: 1, path: 1 });
commentSchema.index({ postId: 1, parentCommentId: 1, createdAt: 1 });
commentSchema.index({ postId: 1, createdAt: 1 });
commentSchema.index({ authorUserId: 1, createdAt: -1 }, { sparse: true });
commentSchema.index({ moderationStatus: 1, createdAt: -1 });

export type CommentDocument = InferSchemaType<typeof commentSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type CommentModel = Model<CommentDocument>;

export const Comment =
  (mongoose.models.Comment as CommentModel | undefined) ??
  mongoose.model<CommentDocument>('Comment', commentSchema);
