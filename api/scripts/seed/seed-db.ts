/**
 * A thin Drizzle-shaped facade over supabase-js, so the seed reads the way it
 * did before `DATABASE_URL` went away.
 *
 * This exists rather than a rewrite because the seed is 600 lines of `insert`
 * with conflict handling, and mechanically restating each one as a PostgREST
 * call would churn the whole file to say the same thing. The three verbs it
 * needs are below; anything more elaborate belongs in a migration, not here.
 *
 * ⚠️ `onConflictDoUpdate` is implemented as insert-then-update rather than as
 * a PostgREST `upsert`, and the difference matters. `upsert` replaces the whole
 * row, so a re-seed would rewrite `created_at`, `reviewed_at` and every
 * randomised column with fresh values — the seed's RNG is deterministic, but
 * its dates are computed from `Date.now()` and would march forward on every
 * run. Insert-then-update writes exactly the columns the caller named, which is
 * what the Drizzle version did.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { snakeize } from '../../src/db/case.js';

/** Postgres's own code for "unique violation". */
const UNIQUE_VIOLATION = '23505';

export type SeedDb = ReturnType<typeof createSeedDb>;

export function createSeedDb(supabaseUrl: string, serviceRoleKey: string) {
  const client: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    client,

    insert(table: string) {
      return {
        values(rows: Record<string, unknown> | Record<string, unknown>[]) {
          const list = (Array.isArray(rows) ? rows : [rows]).map(toRow);
          return {
            /** Idempotent re-seed: a row that already exists is left alone. */
            async onConflictDoNothing(): Promise<void> {
              if (list.length === 0) return;
              const { error } = await client.from(table).upsert(list, { ignoreDuplicates: true });
              if (error) throw fail(table, error);
            },

            /** Insert, or update only the named columns if the row is already there. */
            async onConflictDoUpdate(options: { set: Record<string, unknown> }): Promise<void> {
              if (list.length !== 1) throw new Error('onConflictDoUpdate takes exactly one row');
              const [row] = list;
              const { error } = await client.from(table).insert(row);
              if (!error) return;
              if (error.code !== UNIQUE_VIOLATION) throw fail(table, error);

              // The row exists. Write only what the caller asked to change,
              // matched on the id it supplied.
              const key = idColumnOf(row);
              const { error: updateError } = await client
                .from(table)
                .update(toRow(options.set))
                .eq(key, row[key] as string);
              if (updateError) throw fail(table, updateError);
            },

            /** Plain insert; a conflict is a real error. */
            async run(): Promise<void> {
              if (list.length === 0) return;
              const { error } = await client.from(table).insert(list);
              if (error) throw fail(table, error);
            },
          };
        },
      };
    },

    /** Count rows this script could not have written, for the foreign-data guard. */
    async countNotMatching(table: string, column: string, prefix: string): Promise<number> {
      const { count, error } = await client
        .from(table)
        .select(column, { count: 'exact', head: true })
        .not(column, 'like', `${prefix}%`);
      if (error) throw fail(table, error);
      return count ?? 0;
    },

    /** Set one column on one row — the profile back-links, and the admin role. */
    async setOn(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
      const { error } = await client.from(table).update(toRow(patch)).eq('id', id);
      if (error) throw fail(table, error);
    },
  };
}

function toRow(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snakeize(values))) {
    // PostgREST speaks JSON: a Date has to be serialised, and `undefined`
    // would be dropped from the body silently rather than meaning "default".
    out[key] = value instanceof Date ? value.toISOString() : value;
  }
  return out;
}

/**
 * Which column identifies the row, for the update half of `onConflictDoUpdate`.
 * Every caller here supplies an explicit `id`; the junction-style tables that
 * do not are all `onConflictDoNothing`.
 */
function idColumnOf(row: Record<string, unknown>): string {
  if ('id' in row) return 'id';
  throw new Error('onConflictDoUpdate needs a row with an explicit id');
}

function fail(table: string, error: { code?: string; message: string; details?: string | null }): Error {
  return new Error(`seed: ${table}: ${error.code ?? '?'} ${error.message}${error.details ? ` (${error.details})` : ''}`);
}
