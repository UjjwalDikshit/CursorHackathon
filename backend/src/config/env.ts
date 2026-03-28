import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  /** Set when running behind a reverse proxy (X-Forwarded-* headers) */
  TRUST_PROXY: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? false : v === '1' || v === 'true')),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Optional; trending + view dedupe degrade gracefully when unset */
  REDIS_URL: z.string().url().optional(),
  /** OpenAI key for post moderation (Moderations API) */
  OPENAI_API_KEY: z.string().optional(),
  /** Extra allowed browser origins (comma-separated), e.g. Next.js on :3000 */
  CORS_EXTRA: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment configuration');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
