import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const ISSUE_VERIFICATION_STATUSES = [
  'unverified',
  'community_verified',
  'admin_verified',
] as const;
export type IssueVerificationStatus = (typeof ISSUE_VERIFICATION_STATUSES)[number];

const issueClusterSchema = new Schema(
  {
    /** Stable key: targetType + targetId + category (similar reports cluster) */
    fingerprint: {
      type: String,
      required: true,
      maxlength: 128,
    },
    targetType: {
      type: String,
      enum: ['post', 'leader_profile', 'user', 'comment'],
      required: true,
    },
    targetId: { type: Schema.Types.ObjectId, required: true },
    category: { type: String, required: true, maxlength: 64 },

    reportIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Report' }],
      default: [],
    },

    verificationStatus: {
      type: String,
      enum: ISSUE_VERIFICATION_STATUSES,
      default: 'unverified',
    },
    communityConfirmations: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: () => new Date() },

    adminNote: { type: String, default: null, maxlength: 4000 },
    decidedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

issueClusterSchema.index({ fingerprint: 1 }, { unique: true });
issueClusterSchema.index({ verificationStatus: 1, lastActivityAt: -1 });
issueClusterSchema.index({ targetType: 1, targetId: 1, category: 1 });

export type IssueClusterDocument = InferSchemaType<typeof issueClusterSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type IssueClusterModel = Model<IssueClusterDocument>;

export const IssueCluster =
  (mongoose.models.IssueCluster as IssueClusterModel | undefined) ??
  mongoose.model<IssueClusterDocument>('IssueCluster', issueClusterSchema);
