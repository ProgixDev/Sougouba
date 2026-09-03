import type { NestFastifyApplication } from '@nestjs/platform-fastify';

import type { Env } from './env.js';

/**
 * Derived from the adapter rather than imported as Nest's generic
 * `CorsOptions`: on Fastify, `enableCors` takes `@fastify/cors`'s options,
 * whose `origin` delegate is `(origin, callback)`. Nest's platform-agnostic
 * `CustomOrigin` is single-argument and does not assign to it, so typing this
 * as `CorsOptions` compiles here and fails at the call site in `main.ts`.
 */
type FastifyCorsOptions = NonNullable<Parameters<NestFastifyApplication['enableCors']>[0]>;

/**
 * The admin dashboard's dev server — `next dev -p 4320` in the mobile repo's
 * `admin/` directory. Both spellings, because a browser sends whichever the
 * address bar holds and the two are different origins.
 *
 * Applied only outside production, and only when `CORS_ALLOWED_ORIGINS` is
 * unset. Keeping the fallback here rather than as a schema `.default()` is the
 * point: a default baked into the validated env is a localhost URL that ships
 * to production, and an unset var there should mean "no cross-origin browser
 * access", not "localhost is trusted".
 */
export const DEV_ORIGINS = ['http://localhost:4320', 'http://127.0.0.1:4320'];

type CorsEnv = Pick<Env, 'CORS_ALLOWED_ORIGINS' | 'NODE_ENV'>;

/**
 * Normalises one configured origin into the exact form a browser's `Origin`
 * header carries: no trailing slash, lower-cased.
 *
 * The trailing slash is the whole reason this function exists. Writing
 * `CORS_ALLOWED_ORIGINS=http://localhost:4320/` in an env file is the single
 * most common way this feature silently fails — an `Origin` header never
 * carries a path, so the string compare misses and the browser reports a
 * generic CORS error that says nothing about a slash.
 *
 * Lower-casing is safe because an origin is only scheme + host + port, all of
 * which are case-insensitive; there is no path to preserve the case of.
 */
function normalise(origin: string): string {
  return origin.trim().replace(/\/+$/, '').toLowerCase();
}

/** The configured allowlist, normalised. Empty means "refuse every cross-origin browser request". */
export function allowedOrigins(env: CorsEnv): string[] {
  const configured = env.CORS_ALLOWED_ORIGINS?.split(',').map(normalise).filter(Boolean) ?? [];
  if (configured.length > 0) return configured;
  return env.NODE_ENV === 'production' ? [] : [...DEV_ORIGINS];
}

export function corsOptionsFrom(env: CorsEnv): FastifyCorsOptions {
  const list = allowedOrigins(env);

  return {
    origin: (origin, callback) => {
      // No `Origin` header at all: curl, a server-to-server call, a Next.js
      // Route Handler, the Swagger page's own fetches. None of those are
      // browser cross-origin requests, so there is no cross-origin access to
      // grant or refuse — returning false here would break `curl` and `/docs`
      // while protecting nothing, since a non-browser client can set any
      // header it likes anyway.
      if (!origin) return callback(null, true);
      callback(null, list.includes(normalise(origin)));
    },
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    // `main.ts` sends these on every response, but a cross-origin reader sees
    // none of them unless they are named here — so without this the dashboard
    // cannot see its own rate-limit budget draining and cannot back off.
    exposedHeaders: ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after'],
    // The dashboard authenticates with a Supabase bearer token, not a cookie.
    // Left false so the allowlist is the only thing granting access, and so a
    // future `origin: '*'` mistake cannot combine with credentials.
    credentials: false,
    maxAge: 86_400,
  };
}
