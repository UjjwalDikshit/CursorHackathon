import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';

export const USER_ROLES = ['user', 'leader', 'admin', 'super_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 320,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    emailVerifiedAt: { type: Date, default: null },
    passwordHash: {
      type: String,
      default: null,
      select: false,
      validate: {
        validator(v: string | null | undefined) {
          return v == null || v.length >= 60;
        },
        message: 'Invalid password hash',
      },
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
    /**
     * Public handle (e.g. @mayor-singh) — unique, chosen at signup for tagging and display.
     * Sparse index: legacy accounts may omit until they set one.
     */
    userHandle: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      maxlength: 32,
      validate: {
        validator(v: string | null | undefined) {
          if (v == null || (typeof v === 'string' && v.trim() === '')) return true;
          const s = String(v).trim();
          return (
            s.length >= 3 &&
            s.length <= 32 &&
            /^[a-z0-9][a-z0-9_-]*$/.test(s)
          );
        },
        message: 'Invalid public user id',
      },
    },
    avatarMediaId: { type: Schema.Types.ObjectId, default: null },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'user',
    },
    /** Set when this user is linked to a public leader profile (role should be `leader`) */
    leaderProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'LeaderProfile',
      default: null,
    },
    /**
     * Community trust / reputation (0–100). Leaders gain points when they resolve tagged concerns:
     * each resolution adds that post’s upvote count, capped so the score never exceeds 100.
     */
    trustScore: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
    },
    trustScoreUpdatedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active',
    },
    anonymousPersonaId: { type: Schema.Types.ObjectId, default: null },
    lastLoginAt: { type: Date, default: null },
    homeRegionCode: { type: String, default: null, maxlength: 16 },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ userHandle: 1 }, { unique: true, sparse: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ leaderProfileId: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ status: 1, updatedAt: -1 });
userSchema.index({ trustScore: -1 });
userSchema.index({ role: 1, trustScore: -1, status: 1 });

userSchema.pre('validate', function () {
  if (this.role === 'leader' && !this.leaderProfileId) {
    this.invalidate(
      'leaderProfileId',
      'Leader role requires leaderProfileId to be set',
    );
  }
});

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};
export type UserModel = Model<UserDocument>;

export const User =
  (mongoose.models.User as UserModel | undefined) ??
  mongoose.model<UserDocument>('User', userSchema);
