import crypto from 'node:crypto';
import mongoose from 'mongoose';
import {
  IssueCluster,
  type IssueClusterDocument,
} from '../models/issueCluster.model.js';
import { Report } from '../models/report.model.js';
import { AppError } from '../utils/AppError.js';
import type { CreateReportInput } from '../validators/report.validator.js';

const COMMUNITY_VERIFY_THRESHOLD = Number(
  process.env.COMMUNITY_VERIFY_THRESHOLD ?? '5',
);

/** Cluster all reports for the same target + category (similar-issue bucket). */
export function fingerprintForReport(input: {
  targetType: CreateReportInput['targetType'];
  targetId: string;
  category: string;
}): string {
  const core = `${input.targetType}:${input.targetId}:${input.category}`;
  return crypto.createHash('sha256').update(core).digest('hex').slice(0, 48);
}

export async function createReportAndCluster(
  reporterUserId: string,
  input: CreateReportInput,
): Promise<{ reportId: string; clusterId: string; fingerprint: string }> {
  const targetId = new mongoose.Types.ObjectId(input.targetId);
  const fingerprint = fingerprintForReport({
    targetType: input.targetType,
    targetId: input.targetId,
    category: input.category,
  });

  const report = await Report.create({
    reporterUserId: new mongoose.Types.ObjectId(reporterUserId),
    targetType: input.targetType,
    targetId,
    category: input.category,
    description: input.description.trim().slice(0, 4000),
  });

  const cluster = await IssueCluster.findOneAndUpdate(
    { fingerprint },
    {
      $setOnInsert: {
        fingerprint,
        targetType: input.targetType,
        targetId,
        category: input.category,
        verificationStatus: 'unverified',
      },
      $addToSet: { reportIds: report._id },
      $set: { lastActivityAt: new Date() },
    },
    { upsert: true, new: true },
  );

  if (!cluster) {
    throw new AppError(500, 'Failed to assign issue cluster');
  }

  return {
    reportId: report._id.toString(),
    clusterId: cluster._id.toString(),
    fingerprint,
  };
}

export async function confirmClusterCommunity(
  clusterId: string,
): Promise<IssueClusterDocument> {
  const c = await IssueCluster.findByIdAndUpdate(
    clusterId,
    {
      $inc: { communityConfirmations: 1 },
      $set: { lastActivityAt: new Date() },
    },
    { new: true },
  );
  if (!c) {
    throw new AppError(404, 'Cluster not found');
  }
  if (
    c.verificationStatus === 'unverified' &&
    c.communityConfirmations >= COMMUNITY_VERIFY_THRESHOLD
  ) {
    c.verificationStatus = 'community_verified';
    await c.save();
  }
  return c;
}

export async function setClusterVerificationAdmin(
  clusterId: string,
  adminUserId: string,
  status: 'unverified' | 'community_verified' | 'admin_verified',
  note?: string,
): Promise<IssueClusterDocument> {
  const c = await IssueCluster.findByIdAndUpdate(
    clusterId,
    {
      verificationStatus: status,
      decidedByUserId: new mongoose.Types.ObjectId(adminUserId),
      adminNote: note?.slice(0, 4000) ?? null,
      lastActivityAt: new Date(),
    },
    { new: true },
  );
  if (!c) {
    throw new AppError(404, 'Cluster not found');
  }
  return c;
}

export async function listClusters(
  status?: string,
  limit = 30,
): Promise<IssueClusterDocument[]> {
  const q =
    status && ['unverified', 'community_verified', 'admin_verified'].includes(status)
      ? { verificationStatus: status }
      : {};
  return IssueCluster.find(q)
    .sort({ lastActivityAt: -1 })
    .limit(Math.min(limit, 100))
    .lean()
    .exec() as Promise<IssueClusterDocument[]>;
}
