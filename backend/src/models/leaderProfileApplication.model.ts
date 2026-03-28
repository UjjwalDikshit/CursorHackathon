import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { HIERARCHY_TIERS } from './leaderProfile.model.js';

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

const leaderProfileApplicationSchema = new Schema(
  {
    applicantUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 160 },
    publicName: { type: String, required: true, trim: true, maxlength: 200 },
    bio: { type: String, default: '', maxlength: 8000 },
    officeTitle: { type: String, default: null, maxlength: 200 },
    jurisdictionLabel: { type: String, default: null, maxlength: 300 },
    officeLocation: { type: geoPointSchema, default: null },
    homeRegionCode: { type: String, default: null, maxlength: 16 },
    hierarchyTier: {
      type: String,
      enum: [...HIERARCHY_TIERS],
      default: null,
    },
    parentLeaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      default: null,
    },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null, maxlength: 2000 },
  },
  { timestamps: true },
);

leaderProfileApplicationSchema.index({ applicantUserId: 1, status: 1 });
leaderProfileApplicationSchema.index({ status: 1, createdAt: -1 });
leaderProfileApplicationSchema.index({ slug: 1 }, { unique: false });

export type LeaderProfileApplicationDocument =
  InferSchemaType<typeof leaderProfileApplicationSchema> & {
    _id: mongoose.Types.ObjectId;
  };
export type LeaderProfileApplicationModel = Model<LeaderProfileApplicationDocument>;

export const LeaderProfileApplication =
  (mongoose.models.LeaderProfileApplication as LeaderProfileApplicationModel | undefined) ??
  mongoose.model<LeaderProfileApplicationDocument>(
    'LeaderProfileApplication',
    leaderProfileApplicationSchema,
  );
