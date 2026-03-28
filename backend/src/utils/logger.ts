import pino from 'pino';
import type { Env } from '../config/env.js';

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): pino.Logger {
  const transport =
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        }
      : undefined;

  return pino({
    level: env.LOG_LEVEL,
    transport,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'passwordHash',
      ],
      remove: true,
    },
    base: { env: env.NODE_ENV },
  });
}
