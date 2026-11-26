import { createHash } from 'node:crypto';

import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Rate limits, as one table rather than a decorator per controller.
 *
 * `@fastify/rate-limit` and not `@nestjs/throttler`: the throttler's current
 * release peers on `@nestjs/common` ^7–^11 and this project is on 12, so it
 * installs only under `--legacy-peer-deps`. An unsupported guard in front of
 * every request is not a trade worth making, and the plugin is Fastify-native
 * anyway — which is what the server actually is.
 *
 * The plugin takes `max` and `timeWindow` as functions of the request, which is
 * how per-route budgets happen here without Nest having to pass route config
 * down into Fastify. The table below is the whole policy, readable in one place.
 *
 * ⚠️ **Per instance, in memory — unless `REDIS_URL` is set.** Two API processes
 * with their own memory mean two counters and effectively double every budget,
 * the same single-instance caveat the dispatch scheduler carries. With
 * `REDIS_URL` the counters live in Redis and every instance shares them
 * (`app-factory.ts`). One instance needs none of that, which is why it is
 * optional: set it the day a second instance is started, not before.
 */

/** Requests allowed per window. First matching prefix wins, so order matters. */
const BUDGETS: { prefix: string; max: number; windowMs: number; why: string }[] = [
  {
    // Every call costs money at Mapbox, and the cost is per request whether the
    // answer was useful or not. The tightest budget on the API.
    prefix: '/geo',
    max: 20,
    windowMs: 60_000,
    why: 'billed per call by Mapbox',
  },
  {
    // Sign-up and its email codes: every call can send a mail, and a 6-digit
    // code is only safe while guesses are scarce. Keyed by IP (there is no
    // account yet). The per-code attempt cap and resend cooldown in
    // `SignupService` are the real brute-force limit; this caps the rate.
    prefix: '/auth',
    max: 10,
    windowMs: 60_000,
    why: 'sends mail, and guards 6-digit codes',
  },
  {
    // The race-condition endpoint: two couriers accepting the same offer is the
    // contention this protects, and one courier needs exactly one call per
    // offer. Twenty a minute is a courier working flat out; a thousand is a
    // script trying to win every offer on the platform.
    prefix: '/courier/offers',
    max: 20,
    windowMs: 60_000,
    why: 'dispatch acceptance is a contended write',
  },
  {
    // Phase 9's assistant — every message is a paid model call. Budgeted now so
    // the endpoint cannot land unprotected later.
    prefix: '/support',
    max: 15,
    windowMs: 60_000,
    why: 'each message is a paid model call',
  },
  {
    // Placing an order ends in a Stripe call. Generous enough for a shopper
    // retrying a declined card, tight enough that nobody enumerates.
    prefix: '/orders',
    max: 40,
    windowMs: 60_000,
    why: 'ends in a Stripe call',
  },
  {
    // A receipt link, opened: every hit verifies a signature, reads an order and
    // draws a PDF. Keyed by IP — the browser that opens a link carries no token.
    // One shopper opens a receipt once or twice; thirty a minute is a script.
    prefix: '/receipts',
    max: 30,
    windowMs: 60_000,
    why: 'renders a PDF per call',
  },
  {
    // The same, for a merchant's monthly statement.
    prefix: '/statements',
    max: 30,
    windowMs: 60_000,
    why: 'renders a PDF per call',
  },
  {
    // The back office is a handful of people. A thousand requests a minute from
    // an admin session is not an admin.
    prefix: '/admin',
    max: 120,
    windowMs: 60_000,
    why: 'a back office is a handful of people',
  },
];

/** Catalogue browsing and everything else: cheap Postgres reads, so this is abuse protection, not cost control. */
const DEFAULT_BUDGET = { max: 300, windowMs: 60_000 };

/**
 * Routes that must never be throttled, and why each one would break.
 *
 * - **The Stripe webhook.** Stripe retries a 429, but a burst during an outage
 *   is exactly when events arrive together, and a dropped `payment_intent`
 *   event is an order that was paid for and never created. The endpoint is
 *   already authenticated by signature, which is a better gate than a counter.
 * - **Health checks.** A load balancer polling `/health` every second must not
 *   be able to rate-limit itself out of existence and take the instance with it.
 */
// `/internal/cron` is exempt because the caller is the platform's scheduler,
// already authenticated by `CronGuard`'s shared secret, and a throttled payout
// run is a courier not being paid. It keys on IP like anything unauthenticated
// would, and cron invocations do not come from a stable one.
const NEVER_LIMITED = ['/webhooks/stripe', '/health', '/internal/cron'];

export function budgetFor(url: string): { max: number; windowMs: number } {
  const path = url.split('?')[0] ?? url;
  const match = BUDGETS.find((b) => path.startsWith(b.prefix));
  return match ? { max: match.max, windowMs: match.windowMs } : DEFAULT_BUDGET;
}

export function isExempt(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return NEVER_LIMITED.some((exempt) => path.startsWith(exempt));
}

/**
 * Who a budget is spent by.
 *
 * The account when the request carries a token that checks out, and the IP
 * address only when it does not. Keying on IP alone would be wrong in the
 * specific way that matters for this app: mobile carriers NAT thousands of
 * subscribers behind one address, so a single apartment block on the same
 * network could exhaust a shared budget and lock each other out of the
 * catalogue. (The app sends its token on public reads too, for exactly this.)
 *
 * The token is **verified** before its `sub` is believed. It used not to be —
 * the reasoning was that a forged token only bought the forger their own
 * bucket. On a route behind the auth guard that is true: the guard refuses the
 * request a moment later. On a public route nothing does, so a script minting
 * a fresh made-up `sub` per request had a fresh budget per request, which is
 * no limit at all. A token that fails the check is counted against the address
 * it came from, like a request with none.
 */
export function createTracker(verify: TokenVerifier): (request: FastifyRequest) => Promise<string> {
  return async (request) => {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const sub = await verify(header.slice('Bearer '.length).trim());
      if (sub) return `user:${sub}`;
    }
    return `ip:${request.ip}`;
  };
}

/** The account a token belongs to, or `null` when it is forged, expired, malformed or cannot be checked. Never throws. */
export type TokenVerifier = (token: string) => Promise<string | null>;

/** Tokens remembered as verified. An access token lives an hour; this is every account active in that hour, with room. */
const VERIFIED_TOKENS_KEPT = 5_000;

/** A Supabase access token is around a kilobyte. Anything far past that is not one, and is not worth hashing. */
const MAX_TOKEN_LENGTH = 4_096;

/**
 * Remembers which tokens have already been checked, so the signature is
 * verified once per token rather than once per request — this runs ahead of
 * everything, on every call.
 *
 * Only successes are remembered, each until its own expiry, under a hash of
 * the token rather than the token. A failure is not: remembering it would
 * hand a flood of distinct forged tokens a way to fill the memory, and
 * verifying a signature is cheap next to the request it precedes.
 *
 * `check` may throw (a bad signature does); that is a `null` here, because a
 * garbage `Authorization` header must not turn into a 500 ahead of the guard
 * that would have refused it properly.
 */
export function rememberingVerifier(
  check: (token: string) => Promise<{ sub: string; expiresAt: number } | null>,
  now: () => number = Date.now
): TokenVerifier {
  const verified = new Map<string, { sub: string; expiresAt: number }>();

  return async (token) => {
    // Three non-empty dot-separated parts or it is not a JWT — refused before any hashing.
    if (!token || token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every(Boolean)) return null;

    const key = createHash('sha256').update(token).digest('base64url');
    const known = verified.get(key);
    if (known) {
      if (known.expiresAt > now()) return known.sub;
      verified.delete(key);
    }

    try {
      const result = await check(token);
      if (!result || result.expiresAt <= now()) return null;
      verified.set(key, result);
      // Insertion order is close enough to expiry order: drop from the front.
      while (verified.size > VERIFIED_TOKENS_KEPT) {
        const oldest = verified.keys().next();
        if (oldest.done) break;
        verified.delete(oldest.value);
      }
      return result.sub;
    } catch {
      return null;
    }
  };
}

/**
 * The verifier the API runs with: the same check `SupabaseAuthGuard` makes —
 * this project's own signing keys, its own issuer, an unexpired token — so the
 * limiter and the guard cannot disagree about whose request it is.
 *
 * Its own key set rather than the guard's: the guard is the authorisation
 * decision and stays untouched; this is only a bucket key. `jose` fetches the
 * keys once and re-fetches on rotation. If they cannot be fetched, every token
 * fails the check and requests are counted by address until they can.
 */
export function createTokenVerifier(supabaseUrl: string): TokenVerifier {
  const issuer = `${supabaseUrl}/auth/v1`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  return rememberingVerifier(async (token) => {
    const { payload } = await jwtVerify(token, jwks, { issuer });
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
    return { sub: payload.sub, expiresAt: payload.exp * 1000 };
  });
}

// ── whose address a request comes from ───────────────────────────────────────

/**
 * How many proxies stand between the internet and this process — `TRUST_PROXY_HOPS`.
 *
 * Behind a proxy (Render, Vercel, nginx on a VPS) the connection this process
 * sees comes *from the proxy*, so without this every visitor has the proxy's
 * address: all the requests without a token share one budget, and `/auth`'s
 * ten sign-in codes a minute become ten for the whole platform. The visitor's
 * own address is in `X-Forwarded-For`, which each proxy appends to — and which
 * a client can also write into, so only the entries the trusted proxies added
 * (the last `hops` of them) may be believed. Zero, the default, believes none:
 * right for a process facing the internet directly, wrong behind anything.
 *
 * Read when first asked rather than at import: on a developer's machine the
 * value comes from `.env`, which Nest loads after the HTTP adapter is built.
 */
export function trustedProxyHops(env: { TRUST_PROXY_HOPS?: string } = process.env): number {
  const hops = Number.parseInt(env.TRUST_PROXY_HOPS ?? '', 10);
  return Number.isInteger(hops) && hops > 0 ? Math.min(hops, 10) : 0;
}

/**
 * What to tell whoever runs the server when requests plainly arrive through a
 * proxy that this process has not been told about — or `null` when there is
 * nothing to say. Counts only, never an address: this goes to the log.
 */
export function proxyWarning(forwardedFor: string | string[] | undefined, hops: number): string | null {
  if (hops > 0 || !forwardedFor) return null;
  const entries = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .filter((entry) => entry.trim()).length;
  if (entries === 0) return null;
  return (
    `Requests arrive through a proxy (X-Forwarded-For carried ${entries} entr${entries === 1 ? 'y' : 'ies'}) but TRUST_PROXY_HOPS is not set: ` +
    `every request without a token is rate-limited as one visitor, sign-in codes included. ` +
    `Set TRUST_PROXY_HOPS to the number of proxies in front of this server — ${entries} if this request came straight from a browser or the app.`
  );
}

/**
 * What a refused request throws.
 *
 * **An `HttpException`, not a plain `Error`** — and that distinction is the
 * whole reason this function exists. `@fastify/rate-limit` `throw`s whatever
 * its `errorResponseBuilder` returns, and its default returns an `Error` with a
 * `statusCode` property. That works under Fastify's own error handler and does
 * not work here: `HttpExceptionFilter` is a catch-all, sees something that is
 * not an `HttpException`, and reports it as `500 Internal Server Error`.
 *
 * Which is exactly what happened the first time this was exercised — the
 * budget was enforced, the caller was refused, and the response said 500. A
 * client cannot back off from a 500; `Retry-After` on a 500 is noise. Only
 * running it found this. Typechecking could not have.
 *
 * Returning an `HttpException` lets the existing filter do its job: it reads
 * the status as 429, `HttpStatus[429]` gives `TOO_MANY_REQUESTS`, and the
 * message below comes through — the same body shape as every other error,
 * without this module having to duplicate it.
 */
export function tooManyRequests(request: FastifyRequest, context: { after: string }): HttpException {
  return new HttpException(
    { message: `Trop de requêtes. Réessayez dans ${context.after}.` },
    HttpStatus.TOO_MANY_REQUESTS
  );
}

export type RateLimitReply = FastifyReply;
