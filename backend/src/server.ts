import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { closeRedis, createRedisClient } from './db/redis.js';
import { attachSocketIo } from './realtime/socketServer.js';
import { snapshotTrendingWindow } from './services/trending.service.js';
import { createLogger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);

  await connectDatabase(env.MONGODB_URI, logger);

  const redis = createRedisClient(env.REDIS_URL, logger);
  const app = createApp(env, logger, redis);
  const server = createServer(app);
  attachSocketIo(server, env, logger);

  const trendDeps = { redis };
  const trendSnap = setInterval(() => {
    void snapshotTrendingWindow(trendDeps);
  }, 15 * 60 * 1000);
  void snapshotTrendingWindow(trendDeps);

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server listening');
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown initiated');
    clearInterval(trendSnap);
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closeRedis(redis, logger);
    await disconnectDatabase(logger);
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
