import { Redis } from 'ioredis';
import type pino from 'pino';

export type RedisClient = Redis | null;

export function createRedisClient(
  url: string | undefined,
  log: pino.Logger,
): RedisClient {
  if (!url) {
    log.warn('REDIS_URL not set — trending cache and view dedupe disabled');
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on('error', (err: Error) => log.error({ err }, 'Redis error'));

  return client;
}

export async function closeRedis(
  client: RedisClient,
  log: pino.Logger,
): Promise<void> {
  if (!client) return;

  try {
    await client.quit();
    log.info('Redis connection closed');
  } catch (err) {
    log.warn({ err }, 'Redis quit');
    client.disconnect();
  }
}