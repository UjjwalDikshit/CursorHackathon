/**
 * Civic platform — Mongoose models
 *
 * Relationships (logical):
 * - User 1 — 0..1 LeaderProfile (user.leaderProfileId, leader.userId unique)
 * - User.trustScore (0–100); LeaderProfile holds denormalized accountability snapshot + ref to AccountabilityScore history
 * - User 1 — * Post (post.authorUserId); anonymous posts keep internal ids
 * - Post 1 — * Comment; Comment 0..1 parent Comment (thread via parentCommentId + path)
 * - Post/Comment 1 — * Vote (targetType + targetId); one vote per user OR per anonymousSession
 * - LeaderProfile 1 — * AccountabilityScore (time-series snapshots by formulaVersion + period)
 * - User 1 — * Report (as reporter); targets polymorphic (post, comment, user, leader_profile)
 * - Post 1 — * Verification (workflow)
 *
 * Geo:
 * - Post.location, LeaderProfile.officeLocation: GeoJSON Point, 2dsphere indexes
 * - LeaderProfile.coverageArea: optional Polygon/MultiPolygon (index if used in $geoWithin queries)
 *
 * Scale notes:
 * - Denormalized counters (voteScore, commentCount) updated by workers or transactions
 * - homeRegionCode supports regional partitioning / sharding keys later
 * - Text indexes on posts/leaders: consider Atlas Search or OpenSearch at very large scale
 */

export { User, USER_ROLES, type UserRole } from './user.model.js';
export type { UserDocument, UserModel } from './user.model.js';

export {
  HIERARCHY_RANK,
  HIERARCHY_TIERS,
  LeaderProfile,
} from './leaderProfile.model.js';
export type {
  HierarchyTier,
  LeaderProfileDocument,
  LeaderProfileModel,
} from './leaderProfile.model.js';

export { Post } from './post.model.js';
export type { PostDocument, PostModel } from './post.model.js';

export { Comment } from './comment.model.js';
export type { CommentDocument, CommentModel } from './comment.model.js';

export { Vote } from './vote.model.js';
export type { VoteDocument, VoteModel } from './vote.model.js';

export { AccountabilityScore } from './accountabilityScore.model.js';
export type {
  AccountabilityScoreDocument,
  AccountabilityScoreModel,
} from './accountabilityScore.model.js';

export { Report } from './report.model.js';
export type { ReportDocument, ReportModel } from './report.model.js';

export { Verification } from './verification.model.js';
export type { VerificationDocument, VerificationModel } from './verification.model.js';

export {
  LeaderProfileApplication,
} from './leaderProfileApplication.model.js';
export type {
  LeaderProfileApplicationDocument,
  LeaderProfileApplicationModel,
} from './leaderProfileApplication.model.js';

export {
  ISSUE_VERIFICATION_STATUSES,
  IssueCluster,
} from './issueCluster.model.js';
export type {
  IssueClusterDocument,
  IssueClusterModel,
  IssueVerificationStatus,
} from './issueCluster.model.js';
