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

  /**
   * Push notifications go through Expo's push service, which forwards to FCM
   * and APNs — so the FCM service account and APNs key are uploaded to the EAS
   * project (`eas credentials`), not set here. This token is only needed once
   * "Enhanced security for push notifications" is turned on in the Expo
   * project; until then Expo accepts unauthenticated sends.
   */
  EXPO_ACCESS_TOKEN: z.string().optional(),

  /**
   * The support assistant (`support/`). Without a key the endpoints stay up
   * and answer 503 "not yet available", so the app can ship before the key
   * does. `OPENAI_MODEL` overrides the default model without a deploy of code.
   */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().optional(),

  /**
   * Accept the fixed code `000000` for every sign-in, and send no email.
   *
   * The test-phase switch for a deploy with no mail provider: testers get into
   * any account with 000000 instead of waiting for a code that cannot arrive.
   * Without it, `MailService` refuses to boot in production rather than let
   * sign-up codes vanish into a server log.
   *
   * ⚠️ **This is an authentication bypass.** Anyone who knows an address — a
   * tester, a merchant, an administrator — can sign in as them with six zeros.
   * It must be unset before the app is delivered or handed to anyone outside
   * the test group, and it is a separate variable from `NODE_ENV` precisely so
   * that turning it off is one deliberate deletion rather than a side effect of
   * some other setting. The API logs a warning naming it on every boot.
   */
  ALLOW_FIXED_TEST_OTP: z.string().optional(),

  /**
   * Test phase only: lets a pending courier approve their own file with
   * `POST /couriers/me/demo-approve`, so the "Simuler l'approbation" button on
   * the courier gate opens the driver screens without a trip to the back office.
   *
   * ⚠️ **This skips the human review the CDC puts in front of every courier.**
   * Unset, the route answers 404 as if it did not exist. Unset it with
   * `ALLOW_FIXED_TEST_OTP`, before delivery. The API logs an error naming it on
   * every boot while it is on.
   */
  ALLOW_DEMO_SELF_APPROVAL: z.string().optional(),

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
