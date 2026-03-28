import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const VOTE_TARGETS = ['post', 'comment'] as const;

const voteSchema = new Schema(
  {
    targetType: { type: String, enum: VOTE_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    value: { type: Number, enum: [1, -1], required: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Must be set when userId is null (controlled anonymous voting) */
    anonymousSessionId: { type: String, default: null, maxlength: 128 },
  },
  { timestamps: true },
);

voteSchema.index(
  { targetType: 1, targetId: 1, userId: 1 },
  {
    unique: true,
    partialFilterExpression: { userId: { $type: 'objectId' } },
  },
);
voteSchema.index(
  { targetType: 1, targetId: 1, anonymousSessionId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      anonymousSessionId: { $type: 'string', $gt: '' },
    },
  },
);
voteSchema.index({ targetType: 1, targetId: 1 });
voteSchema.index({ userId: 1, createdAt: -1 }, { sparse: true });

voteSchema.pre('validate', function () {
  const hasUser = !!this.userId;
  const hasAnon = !!(this.anonymousSessionId && this.anonymousSessionId.length > 0);
  if (hasUser === hasAnon) {
    throw new Error('Vote requires exactly one of: userId or anonymousSessionId');
  }
});

export type VoteDocument = InferSchemaType<typeof voteSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type VoteModel = Model<VoteDocument>;

export const Vote =
  (mongoose.models.Vote as VoteModel | undefined) ??
  mongoose.model<VoteDocument>('Vote', voteSchema);
