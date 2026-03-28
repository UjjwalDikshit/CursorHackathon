import mongoose from 'mongoose';
import { LeaderProfile } from '../models/leaderProfile.model.js';

/**
 * Walk parentLeaderProfileId chain upward (local leader → state).
 * Used when a post tags a lower leader so higher authorities are also affected.
 */
export async function expandLeaderEscalation(
  directTaggedLeaderIds: mongoose.Types.ObjectId[],
): Promise<mongoose.Types.ObjectId[]> {
  const seen = new Set<string>();
  const queue = [...directTaggedLeaderIds];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const key = id.toString();
    if (seen.has(key)) continue;
    seen.add(key);

    const doc = await LeaderProfile.findById(id)
      .select('parentLeaderProfileId')
      .lean();
    if (!doc?.parentLeaderProfileId) continue;
    const parentId = doc.parentLeaderProfileId as mongoose.Types.ObjectId;
    const pk = parentId.toString();
    if (!seen.has(pk)) {
      queue.push(parentId);
    }
  }

  return [...seen].map((k) => new mongoose.Types.ObjectId(k));
}
