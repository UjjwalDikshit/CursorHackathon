import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

const dimensionSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 64 },
    label: { type: String, required: true, maxlength: 200 },
    value: { type: Number, required: true },
    weight: { type: Number, default: 1, min: 0 },
    unit: { type: String, default: null, maxlength: 32 },
  },
  { _id: false },
);

const accountabilityScoreSchema = new Schema(
  {
    leaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      required: true,
    },
    /** Bump when formula changes; enables historical comparisons */
    formulaVersion: { type: String, required: true, maxlength: 32 },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },

    compositeScore: { type: Number, required: true },
    rankPercentile: { type: Number, default: null, min: 0, max: 100 },
    dimensions: { type: [dimensionSchema], default: [] },

    /** Snapshot inputs hash for idempotent recomputes */
    inputsHash: { type: String, default: null, maxlength: 128 },
    computedAt: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

accountabilityScoreSchema.index(
  { leaderProfileId: 1, periodEnd: -1 },
  { unique: false },
);
accountabilityScoreSchema.index(
  { leaderProfileId: 1, formulaVersion: 1, periodEnd: -1 },
  { unique: true },
);
accountabilityScoreSchema.index({ compositeScore: -1, periodEnd: -1 });
accountabilityScoreSchema.index({ periodEnd: -1 });

export type AccountabilityScoreDocument = InferSchemaType<
  typeof accountabilityScoreSchema
> & { _id: mongoose.Types.ObjectId };
export type AccountabilityScoreModel = Model<AccountabilityScoreDocument>;

export const AccountabilityScore =
  (mongoose.models.AccountabilityScore as AccountabilityScoreModel | undefined) ??
  mongoose.model<AccountabilityScoreDocument>(
    'AccountabilityScore',
    accountabilityScoreSchema,
  );
