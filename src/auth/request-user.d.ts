import 'fastify';

/**
 * What `SupabaseAuthGuard` attaches once a request's JWT verifies — the
 * `id` a Supabase Auth token's `sub` claim carries, which is also
 * `profiles.id`'s primary key. Nothing else from the token is trusted as
 * authorization data (see the guard's own comment on `app_metadata` vs
 * `user_metadata`).
 */
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}
