import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

/**
 * The API's own connection to Supabase's Postgres — direct, not through
 * PostgREST. This is the trusted, service-role-equivalent path: RLS exists
 * as defense in depth for the mobile app's own direct Supabase calls
 * (Storage/Realtime/Auth), not as the only gate this connection passes
 * through. Authorization for everything reachable via this client happens
 * in NestJS guards, not in Postgres policies.
 */
export function createDbClient(connectionString: string) {
  const client = postgres(connectionString, { prepare: false });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDbClient>;
