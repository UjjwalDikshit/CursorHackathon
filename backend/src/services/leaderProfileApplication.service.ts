import mongoose from 'mongoose';
import { LeaderProfile } from '../models/leaderProfile.model.js';
import { LeaderProfileApplication } from '../models/leaderProfileApplication.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import type {
  AdminCreateLeaderProfileInput,
  ApplyLeaderProfileInput,
  ApproveLeaderApplicationInput,
  ListLeaderApplicationsQuery,
} from '../validators/leaderProfileApplication.validator.js';

function toPoint(geo: { coordinates: [number, number] } | null | undefined) {
  if (!geo) return null;
  return {
    type: 'Point' as const,
    coordinates: geo.coordinates,
  };
}

function toPublicApplication(o: Record<string, unknown>) {
  return {
    id: String(o._id),
    applicantUserId: String(o.applicantUserId),
    status: o.status,
    slug: o.slug,
    publicName: o.publicName,
    bio: o.bio,
    officeTitle: o.officeTitle,
    jurisdictionLabel: o.jurisdictionLabel,
    officeLocation: o.officeLocation,
    homeRegionCode: o.homeRegionCode,
    hierarchyTier: o.hierarchyTier,
    parentLeaderProfileId: o.parentLeaderProfileId
      ? String(o.parentLeaderProfileId)
      : null,
    reviewedByUserId: o.reviewedByUserId ? String(o.reviewedByUserId) : null,
    reviewedAt: o.reviewedAt,
    rejectionReason: o.rejectionReason,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

async function assertParentLeader(id: string | null | undefined) {
  if (!id) return;
  const n = await LeaderProfile.countDocuments({ _id: id, isActive: true });
  if (n !== 1) throw new AppError(400, 'parentLeaderProfileId is not a valid active leader');
}

export async function submitLeaderApplication(
  applicantUserId: string,
  input: ApplyLeaderProfileInput,
) {
  const user = await User.findById(applicantUserId).select('role leaderProfileId').lean();
  if (!user) throw new AppError(404, 'User not found');
  if (user.role !== 'user') {
    throw new AppError(403, 'Only accounts with role user may apply for a leader profile');
  }
  if (user.leaderProfileId) {
    throw new AppError(409, 'You already have a leader profile');
  }

  const pending = await LeaderProfileApplication.findOne({
    applicantUserId,
    status: 'pending',
  }).lean();
  if (pending) {
    throw new AppError(409, 'You already have a pending application');
  }

  const slugTaken = await LeaderProfile.findOne({ slug: input.slug }).select('_id').lean();
  if (slugTaken) {
    throw new AppError(409, 'This slug is already used by an existing leader profile');
  }

  await assertParentLeader(input.parentLeaderProfileId ?? undefined);

  const doc = await LeaderProfileApplication.create({
    applicantUserId,
    status: 'pending',
    slug: input.slug,
    publicName: input.publicName,
    bio: input.bio ?? '',
    officeTitle: input.officeTitle ?? null,
    jurisdictionLabel: input.jurisdictionLabel ?? null,
    officeLocation: toPoint(input.officeLocation ?? undefined),
    homeRegionCode: input.homeRegionCode ?? null,
    hierarchyTier: input.hierarchyTier ?? null,
    parentLeaderProfileId: input.parentLeaderProfileId
      ? new mongoose.Types.ObjectId(input.parentLeaderProfileId)
      : null,
  });

  return toPublicApplication(doc.toObject() as Record<string, unknown>);
}

export async function getMyLeaderApplication(applicantUserId: string) {
  const doc = await LeaderProfileApplication.findOne({ applicantUserId })
    .sort({ createdAt: -1 })
    .exec();
  if (!doc) return null;
  return toPublicApplication(doc.toObject() as Record<string, unknown>);
}

export async function listLeaderApplicationsForAdmin(query: ListLeaderApplicationsQuery) {
  const filter =
    query.status === 'all' ? {} : { status: query.status };
  const [rows, total] = await Promise.all([
    LeaderProfileApplication.find(filter)
      .sort({ createdAt: -1 })
      .skip(query.skip)
      .limit(query.limit)
      .lean(),
    LeaderProfileApplication.countDocuments(filter),
  ]);
  return {
    applications: rows.map((r) => toPublicApplication(r as unknown as Record<string, unknown>)),
    total,
  };
}

async function promoteUserToLeader(
  session: mongoose.ClientSession,
  userId: mongoose.Types.ObjectId,
  profilePayload: Record<string, unknown>,
) {
  const [profile] = await LeaderProfile.create([profilePayload], { session });
  await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        role: 'leader',
        leaderProfileId: profile!._id,
      },
    },
    { session, runValidators: true },
  );
  return profile!;
}

export async function approveLeaderApplication(
  applicationId: string,
  reviewerUserId: string,
  overrides: ApproveLeaderApplicationInput,
) {
  if (!mongoose.isValidObjectId(applicationId)) {
    throw new AppError(400, 'Invalid application id');
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const appDoc = await LeaderProfileApplication.findById(applicationId).session(session);
    if (!appDoc || appDoc.status !== 'pending') {
      throw new AppError(404, 'Pending application not found');
    }

    const user = await User.findById(appDoc.applicantUserId)
      .session(session)
      .select('role leaderProfileId')
      .lean();
    if (!user) throw new AppError(404, 'Applicant not found');
    if (user.role !== 'user' || user.leaderProfileId) {
      throw new AppError(409, 'Applicant is no longer eligible (already leader or wrong role)');
    }

    if (appDoc.parentLeaderProfileId) {
      await assertParentLeader(appDoc.parentLeaderProfileId.toString());
    }

    const slug = (overrides.slug ?? appDoc.slug).toLowerCase().trim();
    const publicName = overrides.publicName ?? appDoc.publicName;

    const slugTaken = await LeaderProfile.findOne({ slug }).session(session).select('_id').lean();
    if (slugTaken) {
      throw new AppError(409, 'Slug is already taken by another leader profile');
    }

    const profilePayload = {
      userId: appDoc.applicantUserId,
      slug,
      publicName,
      bio: appDoc.bio ?? '',
      officeTitle: appDoc.officeTitle ?? null,
      jurisdictionLabel: appDoc.jurisdictionLabel ?? null,
      officeLocation: appDoc.officeLocation ?? null,
      homeRegionCode: appDoc.homeRegionCode ?? null,
      hierarchyTier: appDoc.hierarchyTier ?? null,
      parentLeaderProfileId: appDoc.parentLeaderProfileId ?? null,
      isActive: true,
    };

    await promoteUserToLeader(session, appDoc.applicantUserId, profilePayload);

    appDoc.status = 'approved';
    appDoc.reviewedByUserId = new mongoose.Types.ObjectId(reviewerUserId);
    appDoc.reviewedAt = new Date();
    appDoc.rejectionReason = null;
    await appDoc.save({ session });

    await session.commitTransaction();
    return toPublicApplication(appDoc.toObject() as Record<string, unknown>);
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}

export async function rejectLeaderApplication(
  applicationId: string,
  reviewerUserId: string,
  reason: string,
) {
  if (!mongoose.isValidObjectId(applicationId)) {
    throw new AppError(400, 'Invalid application id');
  }
  const appDoc = await LeaderProfileApplication.findById(applicationId);
  if (!appDoc || appDoc.status !== 'pending') {
    throw new AppError(404, 'Pending application not found');
  }
  appDoc.status = 'rejected';
  appDoc.reviewedByUserId = new mongoose.Types.ObjectId(reviewerUserId);
  appDoc.reviewedAt = new Date();
  appDoc.rejectionReason = reason;
  await appDoc.save();
  return toPublicApplication(appDoc.toObject() as Record<string, unknown>);
}

export async function adminCreateLeaderProfile(
  input: AdminCreateLeaderProfileInput,
  _actorUserId: string,
) {
  await assertParentLeader(input.parentLeaderProfileId ?? undefined);

  const userId = new mongoose.Types.ObjectId(input.userId);
  const user = await User.findById(userId).select('role leaderProfileId').lean();
  if (!user) throw new AppError(404, 'User not found');
  if (user.role !== 'user') {
    throw new AppError(400, 'Target user must have role user (promote via application for other cases)');
  }
  if (user.leaderProfileId) {
    throw new AppError(409, 'User already has a leader profile');
  }

  const slugTaken = await LeaderProfile.findOne({ slug: input.slug }).select('_id').lean();
  if (slugTaken) {
    throw new AppError(409, 'Slug is already taken');
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const profilePayload = {
      userId,
      slug: input.slug,
      publicName: input.publicName,
      bio: input.bio ?? '',
      officeTitle: input.officeTitle ?? null,
      jurisdictionLabel: input.jurisdictionLabel ?? null,
      officeLocation: toPoint(input.officeLocation ?? undefined),
      homeRegionCode: input.homeRegionCode ?? null,
      hierarchyTier: input.hierarchyTier ?? null,
      parentLeaderProfileId: input.parentLeaderProfileId
        ? new mongoose.Types.ObjectId(input.parentLeaderProfileId)
        : null,
      isActive: true,
    };

    const profile = await promoteUserToLeader(session, userId, profilePayload);

    await session.commitTransaction();
    return {
      leaderProfile: {
        id: profile._id.toString(),
        userId: profile.userId.toString(),
        slug: profile.slug,
        publicName: profile.publicName,
      },
    };
  } catch (e) {
    await session.abortTransaction();
    throw e;
  } finally {
    session.endSession();
  }
}
