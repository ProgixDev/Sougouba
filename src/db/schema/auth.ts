import { pgSchema, uuid } from 'drizzle-orm/pg-core';

/**
 * Stub for Supabase's own `auth.users` table — owned by Supabase, never
 * migrated by us. Declared only so `profiles.id` can carry a real foreign
 * key into it instead of a bare, unenforced uuid column.
 */
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table('users', {
  id: uuid('id').primaryKey(),
});
