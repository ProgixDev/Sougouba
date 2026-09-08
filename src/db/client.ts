import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types.js';

/**
 * The API's data connection — PostgREST over HTTPS, not the Postgres wire
 * protocol. This replaces the Drizzle/`postgres.js` client that needed
 * `DATABASE_URL`; nothing in this process opens a TCP connection to Postgres
 * any more, and the only database credential the app holds is the
 * service-role key.
 *
 * ── What this key is ────────────────────────────────────────────────────────
 *
 * `SUPABASE_SERVICE_ROLE_KEY` authenticates as the `service_role` Postgres
 * role, and **that role bypasses RLS entirely**. It is exactly as privileged
 * as the database password it replaces — same blast radius, different name.
 * It must never reach the mobile bundle, the admin bundle, a log line, or an
 * error response.
 *
 * This is the trusted path, as the Drizzle client was before it: authorization
 * happens in NestJS guards, and RLS remains defense in depth for the *clients'*
 * own direct Supabase calls (mobile Auth/Storage/Realtime, the admin
 * dashboard's reads), never for this connection.
 *
 * ── Why no session persistence ──────────────────────────────────────────────
 *
 * `persistSession`/`autoRefreshToken` exist for browsers holding a user
 * session. This client is a long-lived server process with a static key and no
 * user; leaving them on makes it schedule refresh timers that never fire
 * usefully and keeps the process alive on shutdown.
 */
export function createDbClient(supabaseUrl: string, serviceRoleKey: string): Db {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  });
}

export type Db = SupabaseClient<Database>;

/** Row/Insert/Update helpers, so services name a table once rather than spelling the path out. */
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type InsertOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type UpdateOf<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];
