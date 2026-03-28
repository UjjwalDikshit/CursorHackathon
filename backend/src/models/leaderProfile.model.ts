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
            typeof v[0] === 'number' &&
            typeof v[1] === 'number' &&
            v[0] >= -180 &&
            v[0] <= 180 &&
            v[1] >= -90 &&
            v[1] <= 90
          );
        },
        message: 'coordinates must be [longitude, latitude] in WGS84',
      },
    },
  },
  { _id: false },
);

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const HIERARCHY_TIERS = [
  'pradhan',
  'block_officer',
  'district_officer',
  'state_authority',
] as const;
export type HierarchyTier = (typeof HIERARCHY_TIERS)[number];

/** Lower index = more local (e.g. pradhan); higher = state-wide */
export const HIERARCHY_RANK: Record<HierarchyTier, number> = {
  pradhan: 1,
  block_officer: 2,
  district_officer: 3,
  state_authority: 4,
};

const leaderProfileSchema = new Schema(
  {
    /** Owning account — 1:1 with User when that user is a leader */
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160,
      match: [slugPattern, 'Slug must be lowercase alphanumeric with single hyphens'],
    },
    publicName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
    },
    bio: { type: String, default: '', maxlength: 8000 },
    officeTitle: { type: String, default: null, maxlength: 200 },
    jurisdictionLabel: { type: String, default: null, maxlength: 300 },
    officeLocation: { type: geoPointSchema, default: null },
    coverageArea: {
      type: { type: String, enum: ['Polygon', 'MultiPolygon'], required: false },
      coordinates: { type: Schema.Types.Mixed, default: null },
    },
    verifiedAt: { type: Date, default: null },
    verifiedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    avatarMediaId: { type: Schema.Types.ObjectId, default: null },
    followerCount: { type: Number, default: 0, min: 0 },
    postTagCount: { type: Number, default: 0, min: 0 },
    /**
     * Running sum of citizen upvotes on concerns this leader marked resolved
     * (rewards closing the loop with the community’s visible support).
     */
    citizenSupportCreditTotal: { type: Number, default: 0, min: 0 },
    concernsResolvedCount: { type: Number, default: 0, min: 0 },
    resolutionsWithProofCount: { type: Number, default: 0, min: 0 },
    homeRegionCode: { type: String, default: null, maxlength: 16 },
    isActive: { type: Boolean, default: true },

    /** Administrative hierarchy tier (escalation chain goes upward via parent) */
    hierarchyTier: {
      type: String,
      enum: [...HIERARCHY_TIERS],
      default: null,
    },
    /** Immediate superior in the chain (Block → District → State); null at top */
    parentLeaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      default: null,
    },

    /**
     * Denormalized accountability snapshot for fast leader lists / maps.
     * Source of truth for history remains `AccountabilityScore` documents.
     */
    accountabilityCompositeScore: { type: Number, default: null, min: 0 },
    accountabilityRankPercentile: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    accountabilityFormulaVersion: { type: String, default: null, maxlength: 32 },
    accountabilityUpdatedAt: { type: Date, default: null },
    latestAccountabilityScoreId: {
      type: Schema.Types.ObjectId,
      ref: 'AccountabilityScore',
      default: null,
    },
  },
  { timestamps: true },
);

leaderProfileSchema.index({ userId: 1 }, { unique: true });
leaderProfileSchema.index({ slug: 1 }, { unique: true });
leaderProfileSchema.index({ officeLocation: '2dsphere' }, { sparse: true });
leaderProfileSchema.index({ publicName: 'text', bio: 'text', jurisdictionLabel: 'text' });
leaderProfileSchema.index({ verifiedAt: -1, followerCount: -1 });
leaderProfileSchema.index({ homeRegionCode: 1, isActive: 1 });
leaderProfileSchema.index({ accountabilityCompositeScore: -1, isActive: 1 }, { sparse: true });
leaderProfileSchema.index({
  isActive: 1,
  accountabilityCompositeScore: -1,
  publicName: 1,
});
leaderProfileSchema.index({ parentLeaderProfileId: 1 }, { sparse: true });
leaderProfileSchema.index({ hierarchyTier: 1, isActive: 1 }, { sparse: true });

export type LeaderProfileDocument = InferSchemaType<typeof leaderProfileSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type LeaderProfileModel = Model<LeaderProfileDocument>;

export const LeaderProfile =
  (mongoose.models.LeaderProfile as LeaderProfileModel | undefined) ??
  mongoose.model<LeaderProfileDocument>('LeaderProfile', leaderProfileSchema);
