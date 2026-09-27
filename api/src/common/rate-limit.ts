import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

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
 * ⚠️ **Per instance, in memory.** Two API processes mean two counters and
 * effectively double every budget — the same single-instance caveat the dispatch
 * scheduler carries. The plugin takes a Redis store when that day comes, and
 * Redis is already the one item in the devis's stack list that nothing has
 * needed yet (see "Outstanding, and why" in the phases doc). This is the number
 * that will justify it.
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
const NEVER_LIMITED = ['/webhooks/stripe', '/health'];

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
 * The user id when there is one, and the IP only when there is not. Keying on
 * IP alone would be wrong in the specific way that matters for this app: mobile
 * carriers NAT thousands of subscribers behind one address, so a single
 * apartment block on the same network could exhaust a shared budget and lock
 * each other out of the catalogue.
 *
 * `request.userId` is what `SupabaseAuthGuard` sets. Guards run *after* this
 * plugin in the Fastify lifecycle, so on an authenticated route the id is only
 * present if it was set by a previous request on the same connection — which it
 * is not. The bearer token's `sub` is therefore read straight off the JWT
 * payload here, **without verifying the signature**: this is a bucket key, not
 * an authorisation decision, and the real verification still happens in the
 * guard moments later. A forged token buys the forger their own bucket and
 * nothing else.
 */
export function trackerFor(request: FastifyRequest): string {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const sub = unverifiedSub(header.slice('Bearer '.length));
    if (sub) return `user:${sub}`;
  }
  return `ip:${request.ip}`;
}

/** The `sub` claim, read without verification. See `trackerFor` for why that is safe here. */
function unverifiedSub(token: string): string | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof decoded.sub === 'string' ? decoded.sub : null;
  } catch {
    // A malformed token is not our problem here — it will fail the guard. Fall
    // back to the IP so the request is still counted against something.
    return null;
  }
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
