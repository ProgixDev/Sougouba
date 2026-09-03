'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser Supabase client, used for **authentication only**.
 *
 * This dashboard never reads data through PostgREST. Every row it shows comes
 * from the NestJS API (`sougouba-api`), which talks to Postgres directly over
 * Drizzle and authorises in `AdminGuard` rather than in RLS policies. Supabase's
 * job here is narrow: sign the administrator in, and hand back an access token
 * the API can verify against the project's JWKS.
 *
 * Keeping it to that matters. If reads started arriving through PostgREST too,
 * every table would need an admin RLS policy duplicating a rule `AdminGuard`
 * already enforces, and the two would drift.
 *
 * A single module-level instance: `createClient` starts a token-refresh timer
 * and subscribes to storage events, so one per render would leak both.
 */
/**
 * ⚠️ These must be written as **literal** `process.env.NEXT_PUBLIC_…`
 * expressions, never `process.env[someName]`.
 *
 * Next.js inlines client-side env vars with webpack's DefinePlugin, which does
 * a textual substitution on exactly that literal form. A dynamic lookup is not
 * a match, so it survives the build as a real property access on an object that
 * is empty in the browser — the value reads as `undefined` no matter what
 * `.env.local` contains, and `next dev` still cheerfully logs
 * "Environments: .env.local" while it happens.
 *
 * Assigning to consts here rather than reading inside the function keeps the
 * substitution visible in one place.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy admin/.env.example to admin/.env.local and fill it in, then restart \`next dev\` — ` +
        'NEXT_PUBLIC_ vars are inlined at build time, so a running server will not pick up a new value.'
    );
  }
  return value;
}

let client: SupabaseClient | undefined;

export function supabase(): SupabaseClient {
  client ??= createClient(required(SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'), required(SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // The dashboard is not an OAuth callback target; leaving this on makes
      // every page load parse the URL fragment for tokens it will never find.
      detectSessionInUrl: false,
    },
  });
  return client;
}
