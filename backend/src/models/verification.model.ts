import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

/** Fact-check / official verification of a civic claim tied to a post */
const verificationSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true },

    status: {
      type: String,
      enum: ['requested', 'in_review', 'verified', 'disputed', 'rejected'],
      default: 'requested',
    },

    summary: { type: String, default: '', maxlength: 2000 },
    evidenceUrls: { type: [String], default: [], maxlength: 20 },

    requestedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /** Optional link when verification concerns a specific tagged leader */
    relatedLeaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      default: null,
    },

    decidedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

verificationSchema.index({ postId: 1, status: 1 });
verificationSchema.index({ status: 1, createdAt: 1 });
verificationSchema.index({ relatedLeaderProfileId: 1, status: 1 }, { sparse: true });

export type VerificationDocument = InferSchemaType<typeof verificationSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type VerificationModel = Model<VerificationDocument>;

export const Verification =
  (mongoose.models.Verification as VerificationModel | undefined) ??
  mongoose.model<VerificationDocument>('Verification', verificationSchema);
