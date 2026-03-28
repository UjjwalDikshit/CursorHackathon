import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const REPORT_TARGETS = ['post', 'comment', 'user', 'leader_profile'] as const;

const reportSchema = new Schema(
  {
    reporterUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },

    category: {
      type: String,
      enum: [
        'spam',
        'harassment',
        'misinformation',
        'hate',
        'violence',
        'privacy',
        'impersonation',
        'other',
      ],
      required: true,
    },
    description: { type: String, default: '', maxlength: 4000 },

    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'dismissed'],
      default: 'open',
    },
    priority: { type: String, enum: ['low', 'normal', 'high', 'urgent'], default: 'normal' },

    assignedToUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    resolutionNote: { type: String, default: null, maxlength: 4000 },
    resolvedAt: { type: Date, default: null },
    resolvedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /** Moderator marked complaint substantiated (weights accountability scoring) */
    verifiedComplaint: { type: Boolean, default: false },
    /** When target is a post, optional explicit leaders implicated (else derived from post) */
    implicatedLeaderProfileIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'LeaderProfile' }],
      default: [],
    },
  },
  { timestamps: true },
);

reportSchema.index({ status: 1, priority: -1, createdAt: 1 });
reportSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
reportSchema.index({ reporterUserId: 1, createdAt: -1 });
reportSchema.index({ assignedToUserId: 1, status: 1 }, { sparse: true });
reportSchema.index({ verifiedComplaint: 1, status: 1, createdAt: -1 });
reportSchema.index({ implicatedLeaderProfileIds: 1, status: 1 });

export type ReportDocument = InferSchemaType<typeof reportSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type ReportModel = Model<ReportDocument>;

export const Report =
  (mongoose.models.Report as ReportModel | undefined) ??
  mongoose.model<ReportDocument>('Report', reportSchema);
