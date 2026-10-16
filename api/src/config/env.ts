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
   * The API's only database credential, and its Storage admin access.
   *
   * Required — this is how every query reaches Postgres now that the Drizzle
   * connection is gone. `service_role` **bypasses RLS entirely**: it is as
   * privileged as the `DATABASE_URL` password it replaced, so treat a leak of
   * it as a full database compromise. Never reachable from the mobile or admin
   * bundles.
   */
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, 'SUPABASE_SERVICE_ROLE_KEY is required — Supabase project settings → API → service_role.'),

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

  /**
   * Set to '1' by Vercel on every deployment, and by hand on any other
   * serverless host. Decides whether the in-process schedulers run or whether
   * cron drives them over HTTP — see `config/runtime.ts`.
   */
  VERCEL: z.string().optional(),
  SERVERLESS: z.string().optional(),

  /**
   * Shared secret for the platform's scheduler, sent as
   * `Authorization: Bearer <CRON_SECRET>` to the `/internal/cron/*` routes.
   *
   * Required in practice on a serverless deploy: without it `CronGuard`
   * refuses every call, so nothing is scheduled at all. Vercel generates one
   * and injects it into cron invocations automatically; set the same value in
   * the project's environment variables so the guard can compare against it.
   */
  CRON_SECRET: z.string().optional(),

  /** Phase 9. */
  OPENAI_API_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),

  /**
   * Outgoing mail (sign-up codes), sent with Nodemailer.
   *
   * Optional, and empty is a deliberate state: with no `SMTP_HOST` the
   * `MailService` does not send anything and logs the message to the console
   * instead, so sign-up can be exercised end to end before a mail provider is
   * chosen. Any SMTP relay works — Gmail app password, Resend, Postmark, SES.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  /** The From header, e.g. `Sougouba <no-reply@sougouba.com>`. Falls back to `SMTP_USER`. */
  MAIL_FROM: z.string().optional(),
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
