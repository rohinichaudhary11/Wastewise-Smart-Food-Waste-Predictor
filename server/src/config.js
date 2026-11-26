import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/wastewise?replicaSet=rs0'),
  JWT_ACCESS_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const fields = parsed.error.issues.map(issue => issue.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration: ${fields}`);
}

const env = parsed.data;
export const config = Object.freeze({
  ...env,
  cookieSecure: env.NODE_ENV === 'production' || env.COOKIE_SECURE === 'true',
  clientOrigins: env.CLIENT_ORIGIN.split(',').map(value => value.trim()).filter(Boolean),
  jwtIssuer: 'wastewise-api',
  jwtAudience: 'wastewise-client',
  accessTtlSeconds: 15 * 60,
  refreshTtlMs: 7 * 24 * 60 * 60 * 1000
});
