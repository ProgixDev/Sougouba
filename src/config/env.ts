import { z } from 'zod';

/**
 * Every env var the app reads, in one typed, validated shape — checked once
 * at boot rather than discovered as a runtime null three requests in. Vars
 * a later phase needs are already declared here (optional until that phase's
 * guard actually reads them), so adding one is a one-line diff, not a hunt
 * through the codebase for where `process.env` gets read.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  /** Supabase's Postgres connection string — Drizzle's own connection, not through PostgREST. */
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — Supabase project settings → Database.'),

  /**
   * The project's own REST/Auth base URL, e.g. https://<ref>.supabase.co —
   * required from Phase 1 on: the auth guard fetches this project's own JWKS
   * from `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` to verify every
   * protected request's token. (Not `SUPABASE_JWT_SECRET` — Supabase's own
   * guidance is to move off the legacy shared-secret/HS256 verification path
   * in favour of the asymmetric signing-keys system this fetches.)
   */
  SUPABASE_URL: z.string().url('SUPABASE_URL is required from Phase 1 — Supabase project settings → API.'),

  /**
   * Storage admin access, for the retention purge only.
   *
   * Optional: without it the purge still clears the GPS trail and any proof
   * with no file, and refuses — loudly — to delete a proof row whose image it
   * cannot remove from the bucket. See `RetentionService`.
   *
   * Never reachable from the mobile bundle. This is the service-role key.
   */
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  /**
   * Browser origins allowed to call this API cross-origin, comma-separated.
   *
   * Optional, and deliberately with no `.default()` here: see `config/cors.ts`
   * for why the dev fallback is applied there instead, gated on NODE_ENV.
   *
   * Not named `ADMIN_*` — a future web storefront wants the same list.
   */
  CORS_ALLOWED_ORIGINS: z.string().optional(),

  /** Phase 3/7: never optional once payments exist, optional until then so Phase 0/1/2 can boot without it. */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  /** Phase 1/5: geocoding and Directions — same account as the mobile app's map rendering. */
  MAPBOX_SECRET_TOKEN: z.string().optional(),

  /** Phase 9. */
  OPENAI_API_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Throws with every missing/invalid var listed at once — not one crash-and-restart per var. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
