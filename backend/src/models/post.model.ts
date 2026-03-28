import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const geoPointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator(v: number[]) {
          return (
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90
          );
        },
        message: 'coordinates must be [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

const mediaItemSchema = new Schema(
  {
    kind: {
      type: String,
      enum: ['image', 'video', 'audio', 'pdf', 'other'],
      required: true,
    },
    storageKey: { type: String, required: true, maxlength: 1024 },
    cdnUrl: { type: String, default: null, maxlength: 2048 },
    mimeType: { type: String, required: true, maxlength: 255 },
    sizeBytes: { type: Number, required: true, min: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    durationSec: { type: Number, default: null },
    processingStatus: {
      type: String,
      enum: ['pending', 'processing', 'ready', 'failed'],
      default: 'pending',
    },
  },
  { _id: true },
);

const leaderTagSchema = new Schema(
  {
    leaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      required: true,
    },
    taggedAt: { type: Date, default: () => new Date() },
    taggedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const postSchema = new Schema(
  {
    authorUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** Public flag only; authorUserId may still exist server-side for moderation */
    isAnonymous: { type: Boolean, default: false },
    /** Opaque internal ref for rate limits / abuse; not exposed in public API */
    anonymousSessionId: { type: String, default: null, maxlength: 128 },

    title: { type: String, required: true, trim: true, maxlength: 500 },
    body: { type: String, required: true, maxlength: 50000 },
    media: { type: [mediaItemSchema], default: [] },
    taggedLeaders: { type: [leaderTagSchema], default: [] },

    location: { type: geoPointSchema, required: true },
    locationAccuracyM: { type: Number, default: null },
    placeLabel: { type: String, default: null, maxlength: 500 },
    /** Normalized slug for duplicate detection (district / tehsil label) */
    districtKey: { type: String, default: null, maxlength: 80 },
    /** Optional village or locality label for display */
    villageLabel: { type: String, default: null, maxlength: 200 },
    /** Normalized issue tags (roads, water, …) for search & duplicate merge */
    issueTags: { type: [String], default: [] },

    visibility: {
      type: String,
      enum: ['public', 'unlisted', 'removed'],
      default: 'public',
    },
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'escalated'],
      default: 'pending',
    },

    voteScore: { type: Number, default: 0 },
    upvoteCount: { type: Number, default: 0, min: 0 },
    downvoteCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },

    /** 0–1 feed ranking signal; updated as engagement and moderation evolve */
    credibilityScore: { type: Number, default: 0.5, min: 0, max: 1 },

    /**
     * Direct tags + all parent leaders in hierarchy (escalation).
     * Used for accountability queries and notifications.
     */
    affectedLeaderProfileIds: {
      type: [{ type: Schema.Types.ObjectId, ref: 'LeaderProfile' }],
      default: [],
    },

    homeRegionCode: { type: String, default: null, maxlength: 16 },
    publishedAt: { type: Date, default: null },

    /** Set when a leader marks the concern addressed (visible on feed) */
    resolvedAt: { type: Date, default: null },
    resolvedByLeaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      default: null,
    },
    /** Denormalized for public feed without extra joins */
    resolvedByLeaderName: { type: String, default: null, maxlength: 200 },
    resolutionSummary: { type: String, default: null, maxlength: 4000 },
    /** Photo/video proof uploaded by the resolving leader */
    resolutionProofMedia: { type: [mediaItemSchema], default: [] },

    aiModeration: {
      scannedAt: { type: Date, default: null },
      model: { type: String, default: null, maxlength: 64 },
      flagged: { type: Boolean, default: false },
      riskScore: { type: Number, default: null, min: 0, max: 1 },
      categories: { type: [String], default: [] },
    },
  },
  { timestamps: true },
);

postSchema.index({ location: '2dsphere' });
postSchema.index({ createdAt: -1 });
postSchema.index({ publishedAt: -1 });
postSchema.index({ moderationStatus: 1, visibility: 1, publishedAt: -1 });
postSchema.index({ authorUserId: 1, createdAt: -1 }, { sparse: true });
postSchema.index({ 'taggedLeaders.leaderProfileId': 1, publishedAt: -1 });
postSchema.index({ voteScore: -1, publishedAt: -1 });
postSchema.index({ title: 'text', body: 'text', placeLabel: 'text' });
postSchema.index({ homeRegionCode: 1, moderationStatus: 1, publishedAt: -1 });
postSchema.index({ affectedLeaderProfileIds: 1, moderationStatus: 1, publishedAt: -1 });
postSchema.index({ credibilityScore: -1, publishedAt: -1 });
postSchema.index({ 'aiModeration.flagged': 1, moderationStatus: 1 });
postSchema.index({ districtKey: 1, issueTags: 1, moderationStatus: 1 });
postSchema.index({ resolvedAt: 1, moderationStatus: 1 });
postSchema.index({ issueTags: 1, moderationStatus: 1, publishedAt: -1 });

export type PostDocument = InferSchemaType<typeof postSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type PostModel = Model<PostDocument>;

export const Post =
  (mongoose.models.Post as PostModel | undefined) ??
  mongoose.model<PostDocument>('Post', postSchema);
