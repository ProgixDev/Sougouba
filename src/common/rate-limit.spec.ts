import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it } from 'vitest';

import { budgetFor, isExempt, tooManyRequests, trackerFor } from './rate-limit.js';

/** Enough of a Fastify request for the two functions that read one. */
function req(url: string, opts: { ip?: string; authorization?: string } = {}) {
  return {
    url,
    ip: opts.ip ?? '203.0.113.7',
    headers: opts.authorization ? { authorization: opts.authorization } : {},
  } as unknown as FastifyRequest;
}

/** An unsigned JWT-shaped token. `trackerFor` reads the payload without verifying it, on purpose. */
function tokenFor(payload: Record<string, unknown>) {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(payload)}.not-a-real-signature`;
}

describe('budgetFor', () => {
  it('gives geocoding the tightest budget, because Mapbox bills per call', () => {
    expect(budgetFor('/geo/reverse').max).toBe(20);
    // Tighter than the catalogue, which is the whole point.
    expect(budgetFor('/geo/reverse').max).toBeLessThan(budgetFor('/vendors').max);
  });

  it('protects the contended dispatch write', () => {
    expect(budgetFor('/courier/offers/123/accept').max).toBe(20);
  });

  it('budgets the support assistant before it exists', () => {
    expect(budgetFor('/support/conversations').max).toBe(15);
  });

  it('falls back to the browse budget for everything unlisted', () => {
    expect(budgetFor('/vendors')).toEqual({ max: 300, windowMs: 60_000 });
    expect(budgetFor('/products?q=attieke')).toEqual({ max: 300, windowMs: 60_000 });
    expect(budgetFor('/')).toEqual({ max: 300, windowMs: 60_000 });
  });

  it('ignores the query string when matching', () => {
    // `/geo?lat=..` and `/geo/reverse?lat=..` must both land on the geo budget.
    expect(budgetFor('/geo?lat=45.5&lng=-73.6').max).toBe(20);
  });

  it('matches on a path prefix, not a substring', () => {
    // A route that merely *contains* 'geo' is not the geocoder.
    expect(budgetFor('/vendors/epicerie-geo').max).toBe(300);
  });
});

describe('isExempt', () => {
  it('never limits the Stripe webhook', () => {
    // Stripe retries a 429, but a burst arrives precisely during an outage, and
    // a dropped payment event is an order paid for and never created.
    expect(isExempt('/webhooks/stripe')).toBe(true);
  });

  it('never limits health checks', () => {
    expect(isExempt('/health')).toBe(true);
    expect(isExempt('/health/db')).toBe(true);
  });

  it('limits everything else', () => {
    expect(isExempt('/orders')).toBe(false);
    expect(isExempt('/admin/settings')).toBe(false);
    // Not a prefix match on the exempt list by accident.
    expect(isExempt('/vendors/health-foods')).toBe(false);
  });
});

describe('trackerFor', () => {
  it('keys on the user when there is a bearer token', () => {
    const token = tokenFor({ sub: 'aaaaaaaa-0000-4000-8000-000000000001' });

    expect(trackerFor(req('/orders', { authorization: `Bearer ${token}` }))).toBe(
      'user:aaaaaaaa-0000-4000-8000-000000000001'
    );
  });

  it('separates two users behind one carrier NAT', () => {
    // The case this exists for. Keyed on IP, an apartment block on the same
    // mobile network would share — and exhaust — one budget.
    const a = trackerFor(req('/vendors', { ip: '100.64.0.1', authorization: `Bearer ${tokenFor({ sub: 'user-a' })}` }));
    const b = trackerFor(req('/vendors', { ip: '100.64.0.1', authorization: `Bearer ${tokenFor({ sub: 'user-b' })}` }));

    expect(a).not.toBe(b);
  });

  it('falls back to the IP with no token', () => {
    expect(trackerFor(req('/vendors', { ip: '198.51.100.4' }))).toBe('ip:198.51.100.4');
  });

  it('falls back to the IP on a malformed token rather than throwing', () => {
    // A garbage Authorization header must not 500 the request ahead of the
    // guard that would have rejected it properly.
    for (const header of ['Bearer', 'Bearer ...', 'Bearer a.b.c', 'Bearer not-base64!!.x.y', 'Basic abc']) {
      expect(trackerFor(req('/vendors', { ip: '198.51.100.4', authorization: header }))).toBe('ip:198.51.100.4');
    }
  });

  it('falls back to the IP when the payload carries no string sub', () => {
    for (const payload of [{}, { sub: 42 }, { sub: null }]) {
      expect(trackerFor(req('/vendors', { ip: '198.51.100.4', authorization: `Bearer ${tokenFor(payload)}` }))).toBe(
        'ip:198.51.100.4'
      );
    }
  });
});

describe('tooManyRequests', () => {
  /**
   * The regression this file most needs.
   *
   * The plugin `throw`s whatever the builder returns, and `HttpExceptionFilter`
   * is a catch-all: anything that is not an `HttpException` is reported as a
   * 500. The first working version of this returned a plain object, so a
   * refused request came back `500 Internal Server Error` — the budget was
   * enforced and the status was a lie, which is worse than no limit at all
   * because a client cannot back off from a 500.
   */
  it('is an HttpException, so the catch-all filter cannot turn it into a 500', () => {
    const thrown = tooManyRequests(req('/geo/coordinates'), { after: '32 seconds' });

    expect(thrown).toBeInstanceOf(HttpException);
    expect(thrown.getStatus()).toBe(429);
  });

  it('carries a message a French-speaking client can show', () => {
    const thrown = tooManyRequests(req('/geo/coordinates'), { after: '32 seconds' });
    const response = thrown.getResponse() as { message: string };

    expect(response.message).toContain('32 seconds');
    expect(response.message).toContain('Trop de requêtes');
  });

  it('resolves to the same error token the filter stamps on every other error', () => {
    // `HttpExceptionFilter` builds `error` from `HttpStatus[status]`, so a
    // caller never has to branch on response shape by status code.
    expect(HttpStatus[tooManyRequests(req('/geo/coordinates'), { after: '1 second' }).getStatus()]).toBe(
      'TOO_MANY_REQUESTS'
    );
  });
});
