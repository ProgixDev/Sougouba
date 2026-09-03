import { pgSchema, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * A read-only view of Supabase's `auth.users`, for the admin back office.
 *
 * ── Why this is not in `src/db/schema/` ──────────────────────────────────────
 *
 * Because `drizzle-kit generate` would try to migrate it. `drizzle.config.ts`
 * sets `schemaFilter: ['public']`, and the obvious reading of that is "the
 * `auth` schema is off-limits to the generator" — **it is not**. Adding these
 * columns to `src/db/schema/auth.ts` was tried, and `generate` promptly emitted:
 *
 *     ALTER TABLE "auth"."users" ADD COLUMN "email" varchar;
 *     ALTER TABLE "auth"."users" ADD COLUMN "email_confirmed_at" timestamptz;
 *     …
 *
 * — a migration that would run `ALTER TABLE` against Supabase's own auth table.
 * `schemaFilter` evidently scopes introspection (`push`/`pull`), not the
 * snapshot diff that `generate` performs.
 *
 * `drizzle.config.ts` points the generator at `./src/db/schema/index.ts` and
 * follows its import graph. This file is deliberately outside that graph:
 * nothing under `src/db/schema/` may import it, or the DDL above comes back.
 * That is the entire mechanism keeping it safe, so keep it isolated.
 *
 * `schema/auth.ts` therefore stays a bare `id` stub — enough for `profiles.id`
 * to carry a real foreign key — and this is the shape you join to when you
 * need to *read* an account. Two table objects for one table is the cost;
 * an accidental `ALTER TABLE auth.users` in production is what it buys.
 *
 * ── Access ──────────────────────────────────────────────────────────────────
 *
 * Verified against the live project: the API's pooler role (`postgres`) holds
 * SELECT on `auth.users` and USAGE on the `auth` schema, so no grant is needed.
 *
 * ⚠️ SELECT only. Never insert, update or delete through this object —
 * Supabase's GoTrue owns these rows, and several columns it requires are
 * NOT NULL with empty-string defaults that a hand-written write will miss.
 * Accounts are created through the Auth Admin API (see `scripts/seed/`).
 *
 * ⚠️ These fields must never leak through `/me`, `/vendors` or any consumer
 * route. They exist so an administrator can see a directory of *other
 * people's* accounts — the one context where that is legitimate.
 *
 * Every column but `id` is nullable, and that is Supabase's shape, not
 * laziness: a phone-only signup genuinely has no email.
 */
const authSchemaReadonly = pgSchema('auth');

export const authUsersReadonly = authSchemaReadonly.table('users', {
  id: uuid('id').primaryKey(),
  /** `character varying` in Supabase's schema, hence varchar rather than text. */
  email: varchar('email'),
  emailConfirmedAt: timestamp('email_confirmed_at', { withTimezone: true }),
  lastSignInAt: timestamp('last_sign_in_at', { withTimezone: true }),
  phone: text('phone'),
  bannedUntil: timestamp('banned_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }),
});
