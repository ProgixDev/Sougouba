/**
 * Builds the application, short of binding a port.
 *
 * Split out of `main.ts` so the two hosts this API runs on share one
 * bootstrap: `main.ts` adds `listen()` for a VPS or local run, and
 * `serverless.ts` hands the same configured Fastify instance to a function
 * platform. Everything order-dependent — CORS before rate limiting, both
 * before the instance is ready — therefore has exactly one definition, and a
 * fix to it cannot reach one host and miss the other.
 */
import rateLimit from '@fastify/rate-limit';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { budgetFor, isExempt, tooManyRequests, trackerFor } from './common/rate-limit.js';
import { corsOptionsFrom } from './config/cors.js';
import type { Env } from './config/env.js';

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Fastify's own logger (pino under the hood) rather than a separate
    // logging package — one less dependency, and it already understands
    // request/response lifecycle events Nest's default logger doesn't emit.
    new FastifyAdapter({ logger: true }),
    // Keeps the unparsed request body available as `request.rawBody`. Stripe
    // signs the exact bytes it sent, so the webhook's signature check cannot
    // work against a re-serialised JSON object — see
    // `billing/stripe-webhook.controller.ts`.
    { rawBody: true }
  );

  const config = app.get(ConfigService<Env, true>);

  /**
   * CORS, so the admin dashboard (a separate Next.js app on :4320) can reach
   * this API from a browser at all. Allowlist and rationale in `config/cors.ts`.
   *
   * ⚠️ Two ordering rules, both load-bearing:
   *
   * 1. **Before `app.listen()`.** On Fastify — unlike Express — `enableCors`
   *    registers a plugin, and plugins can only be added before the instance is
   *    ready. There is no separate `app.init()` here, so `listen()` is the
   *    deadline.
   *
   * 2. **Before the `await app.register(rateLimit, …)` below**, which is why
   *    this sits above it rather than next to the other global setup further
   *    down. `enableCors` is fire-and-forget (it does not await the plugin),
   *    but awaiting a Fastify registration triggers `ready()` and locks hook
   *    order in — registration order. CORS first means `@fastify/cors`'s
   *    `onRequest` hook answers a preflight with a 204 before the rate limiter
   *    ever sees it, so preflights don't burn the /admin budget. Reversed, a
   *    429 would be sent *without* `Access-Control-Allow-Origin` and the
   *    browser would report an opaque CORS failure instead of a rate limit —
   *    the worst debugging experience available.
   *
   * `@fastify/cors` needs no install: `@nestjs/platform-fastify` declares it as
   * a direct dependency, and `FastifyAdapter.enableCors` just registers it.
   */
  app.enableCors(
    corsOptionsFrom({
      CORS_ALLOWED_ORIGINS: config.get('CORS_ALLOWED_ORIGINS', { infer: true }),
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
    })
  );

  /**
   * Rate limiting, per-route budgets from `common/rate-limit.ts`.
   *
   * Registered here rather than as a Nest guard because the policy is about
   * routes and cost, not about who is calling — and because this way it runs in
   * Fastify's `onRequest` hook, ahead of body parsing and ahead of the auth
   * guard's JWT verification. A flood should be refused before it makes the
   * server do work, which is the entire point.
   *
   * That ordering is also why the bucket key reads the token's `sub` without
   * verifying it — see `trackerFor`.
   */
  await app.register(rateLimit, {
    global: true,
    max: (request) => budgetFor(request.url).max,
    timeWindow: (request) => budgetFor(request.url).windowMs,
    keyGenerator: trackerFor,
    allowList: (request) => isExempt(request.url),
    errorResponseBuilder: (request, context) => tooManyRequests(request, context),
    // Sent on every response, not only on a 429: a client that can see its own
    // budget draining can back off before it is refused.
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  // No global `ValidationPipe` — this project standardized on Zod
  // (`ZodValidationPipe`, applied per-route via `@UsePipes`), not
  // `class-validator` decorators on DTO classes. A global `ValidationPipe`
  // would need `class-validator` installed for nothing: no DTO here uses its
  // decorators, so it would never actually validate anything.

  // Served in every non-production environment — never in prod, so the API
  // surface isn't handed out for free to anyone who finds the URL.
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Sougouba API')
        .setDescription('Backend for the Sougouba marketplace — see docs/BACKEND-BUILD-PHASES.md in the mobile repo.')
        .setVersion('0.0.1')
        .addBearerAuth()
        .build()
    );
    SwaggerModule.setup('docs', app, document);
  }

  return app;
}
