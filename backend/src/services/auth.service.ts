import bcrypt from 'bcryptjs';
import type { UserDocument } from '../models/user.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import type { RegisterInput } from '../validators/auth.validator.js';

const BCRYPT_ROUNDS = 12;

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  /** Public handle; null for legacy accounts until set. */
  userHandle: string | null;
  role: UserDocument['role'];
  trustScore: number;
  trustScoreUpdatedAt: Date | null;
  leaderProfileId: string | null;
  emailVerifiedAt: Date | null;
  createdAt: Date;
};

export function toPublicUser(user: UserDocument): PublicUser {
  return {
    id: user._id.toString(),
    email: user.email,
    displayName: user.displayName,
    userHandle: user.userHandle ?? null,
    role: user.role,
    trustScore: user.trustScore,
    trustScoreUpdatedAt: user.trustScoreUpdatedAt ?? null,
    leaderProfileId: user.leaderProfileId?.toString() ?? null,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    createdAt: user.createdAt,
  };
}

export async function registerWithPassword(
  input: RegisterInput,
): Promise<UserDocument> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const email = input.email.toLowerCase().trim();

  try {
    const user = await User.create({
      email,
      passwordHash,
      displayName: input.displayName.trim(),
      userHandle: input.userHandle,
      role: 'user',
      trustScore: 50,
      status: 'active',
    });
    return user;
  } catch (e: unknown) {
    if (isDuplicateKeyError(e)) {
      throw new AppError(
        409,
        'That email or public user id is already taken. Try another user id.',
      );
    }
    throw e;
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<UserDocument> {
  const normalized = email.toLowerCase().trim();
  const user = await User.findOne({ email: normalized }).select('+passwordHash');

  const invalid = new AppError(401, 'Invalid email or password');

  if (!user || !user.passwordHash) {
    throw invalid;
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'Account is not active');
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    throw invalid;
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { lastLoginAt: new Date() } },
  );

  const fresh = await User.findById(user._id);
  if (!fresh) {
    throw invalid;
  }
  return fresh;
}

export async function getUserById(id: string): Promise<UserDocument> {
  const user = await User.findById(id);
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (user.status !== 'active') {
    throw new AppError(403, 'Account is not active');
  }
  return user;
}

function isDuplicateKeyError(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code: number }).code === 11000
  );
}
