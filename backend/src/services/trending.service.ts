import type { RedisClient } from '../db/redis.js';
import { emitAdminAlert } from '../realtime/hub.js';

const TREND_ZSET = 'trend:posts:scores';
const ROLLING_24H_KEY = 'trend:posts:rolling24h';
const WINDOW_KEY_PREFIX = 'trend:posts:window:';
const SNAPSHOT_KEY = 'trend:posts:snapshot';
const SNAPSHOT_TTL_SEC = 900;
const SPIKE_VELOCITY_MIN = 4;
const SPIKE_RATIO = 2.4;

export type TrendingDeps = { redis: RedisClient };

/**
 * Record engagement for spike-friendly trending (ZINCRBY on rolling set).
 * Window keys (hourly) support comparing current vs previous period velocity.
 */
export async function recordPostEngagement(
  deps: TrendingDeps,
  postId: string,
  delta = 1,
): Promise<void> {
  if (!deps.redis || delta === 0) return;
  const pipeline = deps.redis.pipeline();
  pipeline.zincrby(TREND_ZSET, delta, postId);
  const hour = new Date();
  const windowKey = `${WINDOW_KEY_PREFIX}${hour.getUTCFullYear()}${String(hour.getUTCMonth() + 1).padStart(2, '0')}${String(hour.getUTCDate()).padStart(2, '0')}${String(hour.getUTCHours()).padStart(2, '0')}`;
  pipeline.zincrby(windowKey, delta, postId);
  pipeline.expire(windowKey, 172800);
  await pipeline.exec();
  await maybeEmitEngagementSpike(deps, postId);
}

/** Previous hour window key for velocity / spike proxy */
function previousHourWindowKey(): string {
  const d = new Date(Date.now() - 3600_000);
  return `${WINDOW_KEY_PREFIX}${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}`;
}

function currentHourWindowKey(): string {
  const d = new Date();
  return windowKeyForDate(d);
}

function windowKeyForDate(d: Date): string {
  return `${WINDOW_KEY_PREFIX}${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}${String(d.getUTCHours()).padStart(2, '0')}`;
}

async function maybeEmitEngagementSpike(
  deps: TrendingDeps,
  postId: string,
): Promise<void> {
  if (!deps.redis) return;
  const currKey = currentHourWindowKey();
  const prevKey = previousHourWindowKey();
  const [currS, prevS] = await Promise.all([
    deps.redis.zscore(currKey, postId),
    deps.redis.zscore(prevKey, postId),
  ]);
  const curr = Number(currS ?? 0);
  const prev = Number(prevS ?? 0);
  const velocity = curr - prev;

  if (
    velocity >= SPIKE_VELOCITY_MIN &&
    prev > 0 &&
    curr / prev >= SPIKE_RATIO
  ) {
    emitAdminAlert('trending:spike', {
      postId,
      velocity,
      currentHourTotal: curr,
      previousHourTotal: prev,
      at: new Date().toISOString(),
    });
    return;
  }
  if (prev === 0 && curr >= 12) {
    emitAdminAlert('trending:spike', {
      postId,
      velocity: curr,
      currentHourTotal: curr,
      previousHourTotal: 0,
      coldStart: true,
      at: new Date().toISOString(),
    });
  }
}

/**
 * Trending score = current hour engagement + bonus if spike vs previous hour (Redis snapshot).
 * Returns postId -> { score, spikeBoost }.
 */
export async function getTrendingScores(
  deps: TrendingDeps,
  limit = 50,
): Promise<Map<string, { rolling: number; spikeBoost: number }>> {
  const out = new Map<string, { rolling: number; spikeBoost: number }>();
  if (!deps.redis) return out;

  const [topRolling, currWindow, prevWindow, snapshotRaw] = await Promise.all([
    deps.redis.zrevrange(TREND_ZSET, 0, limit - 1, 'WITHSCORES'),
    deps.redis.zrange(currentHourWindowKey(), 0, -1, 'WITHSCORES'),
    deps.redis.zrange(previousHourWindowKey(), 0, -1, 'WITHSCORES'),
    deps.redis.get(SNAPSHOT_KEY),
  ]);

  const parseZ = (arr: string[]) => {
    const m = new Map<string, number>();
    for (let i = 0; i < arr.length; i += 2) {
      m.set(arr[i]!, Number(arr[i + 1]!));
    }
    return m;
  };

  const currMap = parseZ(currWindow);
  const prevMap = parseZ(prevWindow);

  let snapshot = new Map<string, number>();
  if (snapshotRaw) {
    try {
      const o = JSON.parse(snapshotRaw) as Record<string, number>;
      snapshot = new Map(Object.entries(o));
    } catch {
      /* ignore */
    }
  }

  const pairs = topRolling;
  for (let i = 0; i < pairs.length; i += 2) {
    const id = pairs[i]!;
    const rolling = Number(pairs[i + 1]!);
    const now = currMap.get(id) ?? 0;
    const prevSnap = snapshot.get(id) ?? 0;
    const prev = prevMap.get(id) ?? prevSnap;
    const velocity = Math.max(0, now - prev);
    const spikeBoost = Math.min(3, Math.log1p(velocity));
    out.set(id, { rolling, spikeBoost });
  }

  return out;
}

/** Periodically snapshot current hour counts for spike detection (call from cron or interval) */
export async function snapshotTrendingWindow(deps: TrendingDeps): Promise<void> {
  if (!deps.redis) return;
  const arr = await deps.redis.zrange(currentHourWindowKey(), 0, -1, 'WITHSCORES');
  const o: Record<string, number> = {};
  for (let i = 0; i < arr.length; i += 2) {
    o[arr[i]!] = Number(arr[i + 1]!);
  }
  await deps.redis.set(SNAPSHOT_KEY, JSON.stringify(o), 'EX', SNAPSHOT_TTL_SEC);

  const hourKeys: string[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date(Date.now() - i * 3600_000);
    hourKeys.push(windowKeyForDate(d));
  }
  const existing = await Promise.all(
    hourKeys.map((k) => deps.redis!.exists(k)),
  );
  const keys = hourKeys.filter((_, idx) => existing[idx] === 1);
  if (keys.length > 0) {
    await deps.redis.zunionstore(ROLLING_24H_KEY, keys.length, ...keys, 'AGGREGATE', 'SUM');
    await deps.redis.expire(ROLLING_24H_KEY, 7200);
  }
}

export async function getTrendingPostIds(
  deps: TrendingDeps,
  limit: number,
): Promise<string[]> {
  if (!deps.redis) return [];
  const hasRolling = (await deps.redis.exists(ROLLING_24H_KEY)) === 1;
  const key = hasRolling ? ROLLING_24H_KEY : TREND_ZSET;
  return deps.redis.zrevrange(key, 0, limit - 1);
}
