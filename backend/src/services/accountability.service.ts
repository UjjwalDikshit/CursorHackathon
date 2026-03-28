import mongoose from 'mongoose';
import { AccountabilityScore } from '../models/accountabilityScore.model.js';
import { LeaderProfile } from '../models/leaderProfile.model.js';
import { Post } from '../models/post.model.js';
import { Report } from '../models/report.model.js';
import { User } from '../models/user.model.js';

export const ACCOUNTABILITY_FORMULA_VERSION = 'v1.1.0';

const debouncers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleAccountabilityRefresh(leaderProfileIds: string[]): void {
  for (const id of leaderProfileIds) {
    const prev = debouncers.get(id);
    if (prev) clearTimeout(prev);
    debouncers.set(
      id,
      setTimeout(() => {
        debouncers.delete(id);
        void recomputeLeaderAccountability(id).catch(() => {});
      }, 2500),
    );
  }
}

function utcDayBounds(d = new Date()) {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
  return { start, end };
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Anti-manipulation: log dampening on complaints & engagement, caps on penalties,
 * ignores engagement from very low–trust authors (threshold) when averaging trust.
 */
const LOW_TRUST_CUTOFF = 15;

export async function recomputeLeaderAccountability(
  leaderProfileId: string,
): Promise<void> {
  if (!mongoose.isValidObjectId(leaderProfileId)) return;
  const lid = new mongoose.Types.ObjectId(leaderProfileId);

  const leader = await LeaderProfile.findById(lid).lean();
  if (!leader) return;

  const directComplaints = await Report.countDocuments({
    targetType: 'leader_profile',
    targetId: lid,
    status: { $nin: ['dismissed'] },
  });

  const verifiedDirect = await Report.countDocuments({
    targetType: 'leader_profile',
    targetId: lid,
    verifiedComplaint: true,
  });

  const taggedPosts = await Post.find({
    affectedLeaderProfileIds: lid,
    moderationStatus: 'approved',
  })
    .select('_id')
    .lean();
  const postIds = taggedPosts.map((p) => p._id);

  const postComplaints = await Report.countDocuments({
    targetType: 'post',
    targetId: { $in: postIds },
    status: { $nin: ['dismissed'] },
  });

  const verifiedPostComplaints = await Report.countDocuments({
    targetType: 'post',
    targetId: { $in: postIds },
    verifiedComplaint: true,
  });

  const implicatedComplaints = await Report.countDocuments({
    implicatedLeaderProfileIds: lid,
    status: { $nin: ['dismissed'] },
  });

  const totalComplaints =
    directComplaints + postComplaints + implicatedComplaints;
  const verifiedTotal = verifiedDirect + verifiedPostComplaints;

  const openReports = await Report.find({
    $or: [
      { targetType: 'leader_profile', targetId: lid },
      { targetType: 'post', targetId: { $in: postIds } },
      { implicatedLeaderProfileIds: lid },
    ],
    status: { $in: ['open', 'reviewing'] },
  })
    .select('createdAt')
    .lean();

  const now = Date.now();
  let unresolvedHours = 0;
  if (openReports.length > 0) {
    const sumH = openReports.reduce(
      (s, r) => s + (now - new Date(r.createdAt).getTime()) / 3_600_000,
      0,
    );
    unresolvedHours = sumH / openReports.length;
  }
  const unresolvedDays = unresolvedHours / 24;

  const engMatch = await Post.aggregate<{
    engagement: number;
  }>([
    {
      $match: {
        affectedLeaderProfileIds: lid,
        moderationStatus: 'approved',
      },
    },
    {
      $group: {
        _id: null,
        engagement: {
          $sum: {
            $add: [
              '$upvoteCount',
              '$commentCount',
              { $multiply: ['$viewCount', 0.05] },
            ],
          },
        },
      },
    },
  ]);
  const rawEngagement = engMatch[0]?.engagement ?? 0;

  const authorTrust = await Post.aggregate<{
    avgTrust: number;
    n: number;
  }>([
    {
      $match: {
        affectedLeaderProfileIds: lid,
        moderationStatus: 'approved',
        authorUserId: { $ne: null },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'authorUserId',
        foreignField: '_id',
        as: 'author',
      },
    },
    { $unwind: '$author' },
    { $match: { 'author.trustScore': { $gte: LOW_TRUST_CUTOFF } } },
    {
      $group: {
        _id: null,
        avgTrust: { $avg: '$author.trustScore' },
        n: { $sum: 1 },
      },
    },
  ]);
  const avgAuthorTrust = authorTrust[0]?.avgTrust ?? 50;
  const trustedPostCount = authorTrust[0]?.n ?? 0;

  let localPostDensity = 0;
  if (
    leader.officeLocation?.coordinates &&
    leader.officeLocation.coordinates.length === 2
  ) {
    const [lng, lat] = leader.officeLocation.coordinates;
    localPostDensity = await Post.countDocuments({
      moderationStatus: 'approved',
      location: {
        $geoWithin: {
          $centerSphere: [[lng, lat], 15 / 6378.1],
        },
      },
    });
  }

  const complaintPressure =
    Math.log1p(totalComplaints) * 6 +
    Math.log1p(verifiedTotal) * 14;
  const unresolvedStress = clamp(unresolvedDays * 2.5, 0, 28);
  const engagementRelief = clamp(Math.log1p(rawEngagement) * 3.2, 0, 22);
  const trustBoost = clamp((avgAuthorTrust / 100) * 18, 0, 18);
  const densityStress = clamp(Math.log1p(localPostDensity) * 1.2, 0, 12);

  let score =
    68 -
    complaintPressure -
    unresolvedStress +
    engagementRelief * 0.85 +
    trustBoost * (trustedPostCount > 0 ? 1 : 0.4) -
    densityStress;

  score = clamp(score, 0, 100);

  const dimensions = [
    { key: 'complaints', label: 'Complaint load', value: totalComplaints, weight: 1 },
    {
      key: 'verified_complaints',
      label: 'Verified complaints',
      value: verifiedTotal,
      weight: 1.5,
    },
    {
      key: 'unresolved_days_avg',
      label: 'Avg. unresolved age (days proxy)',
      value: Number(unresolvedDays.toFixed(2)),
      weight: 1,
    },
    {
      key: 'engagement',
      label: 'Tagged post engagement',
      value: Math.round(rawEngagement),
      weight: 0.5,
    },
    {
      key: 'author_trust_avg',
      label: 'Avg. author trust (filtered)',
      value: Number(avgAuthorTrust.toFixed(1)),
      weight: 1,
    },
    {
      key: 'local_post_density',
      label: 'Geo issue density (15km)',
      value: localPostDensity,
      weight: 0.5,
    },
  ];

  const { start, end } = utcDayBounds();

  await AccountabilityScore.findOneAndUpdate(
    {
      leaderProfileId: lid,
      formulaVersion: ACCOUNTABILITY_FORMULA_VERSION,
      periodEnd: end,
    },
    {
      $set: {
        periodStart: start,
        compositeScore: score,
        dimensions,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  await LeaderProfile.findByIdAndUpdate(lid, {
    accountabilityCompositeScore: score,
    accountabilityFormulaVersion: ACCOUNTABILITY_FORMULA_VERSION,
    accountabilityUpdatedAt: new Date(),
  });
}

export async function getLatestAccountabilitySnapshot(leaderProfileId: string) {
  if (!mongoose.isValidObjectId(leaderProfileId)) return null;
  const lid = new mongoose.Types.ObjectId(leaderProfileId);
  const leader = await LeaderProfile.findById(lid)
    .select(
      'accountabilityCompositeScore accountabilityRankPercentile accountabilityFormulaVersion accountabilityUpdatedAt publicName slug citizenSupportCreditTotal concernsResolvedCount resolutionsWithProofCount',
    )
    .lean();
  const latest = await AccountabilityScore.findOne({ leaderProfileId: lid })
    .sort({ computedAt: -1 })
    .lean();
  return { leader, latest };
}
