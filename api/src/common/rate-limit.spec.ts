import { HttpException, HttpStatus } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import {
  budgetFor,
  createTracker,
  isExempt,
  proxyWarning,
  rememberingVerifier,
  tooManyRequests,
  trustedProxyHops,
  type TokenVerifier,
} from './rate-limit.js';

/** Enough of a Fastify request for the two functions that read one. */
function req(url: string, opts: { ip?: string; authorization?: string } = {}) {
  return {
    url,
    ip: opts.ip ?? '203.0.113.7',
    headers: opts.authorization ? { authorization: opts.authorization } : {},
  } as unknown as FastifyRequest;
}

/** A JWT-shaped token naming a subject. Whether it "verifies" is up to the verifier each spec supplies. */
function tokenFor(payload: Record<string, unknown>) {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'ES256', typ: 'JWT' })}.${part(payload)}.signature`;
}

/** Stands in for the signature check: believes the tokens it was given, by subject, and no others. */
function verifierFor(...subjects: string[]): TokenVerifier {
  const known = new Map(subjects.map((sub) => [tokenFor({ sub }), sub]));
  return async (token) => known.get(token) ?? null;
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

describe('createTracker', () => {
  it('keys on the account when the token verifies', async () => {
    const sub = 'aaaaaaaa-0000-4000-8000-000000000001';
    const tracker = createTracker(verifierFor(sub));

    await expect(tracker(req('/orders', { authorization: `Bearer ${tokenFor({ sub })}` }))).resolves.toBe(`user:${sub}`);
  });

  it('separates two users behind one carrier NAT', async () => {
    // The case this exists for. Keyed on IP, an apartment block on the same
    // mobile network would share — and exhaust — one budget.
    const tracker = createTracker(verifierFor('user-a', 'user-b'));
    const a = await tracker(req('/vendors', { ip: '100.64.0.1', authorization: `Bearer ${tokenFor({ sub: 'user-a' })}` }));
    const b = await tracker(req('/vendors', { ip: '100.64.0.1', authorization: `Bearer ${tokenFor({ sub: 'user-b' })}` }));

    expect(a).not.toBe(b);
  });

  it('gives a forged token no bucket of its own', async () => {
    // The hole this closes: on a public route nothing else checks the token,
    // so a made-up `sub` per request used to be a fresh budget per request.
    const tracker = createTracker(verifierFor('real-user'));
    const forged = await Promise.all(
      ['made-up-1', 'made-up-2', 'made-up-3'].map((sub) =>
        tracker(req('/products', { ip: '198.51.100.4', authorization: `Bearer ${tokenFor({ sub })}` }))
      )
    );

    expect(forged).toEqual(['ip:198.51.100.4', 'ip:198.51.100.4', 'ip:198.51.100.4']);
  });

  it('falls back to the IP with no token', async () => {
    const tracker = createTracker(verifierFor());
    await expect(tracker(req('/vendors', { ip: '198.51.100.4' }))).resolves.toBe('ip:198.51.100.4');
  });

  it('does not ask the verifier about anything that is not a bearer token', async () => {
    const verify = vi.fn(async () => 'someone');
    const tracker = createTracker(verify);

    await expect(tracker(req('/vendors', { ip: '198.51.100.4', authorization: 'Basic abc' }))).resolves.toBe('ip:198.51.100.4');
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('rememberingVerifier', () => {
  const HOUR = 3_600_000;

  it('checks a token once, then answers from memory until it expires', async () => {
    let clock = 1_000_000;
    const check = vi.fn(async () => ({ sub: 'user-a', expiresAt: 1_000_000 + HOUR }));
    const verify = rememberingVerifier(check, () => clock);
    const token = tokenFor({ sub: 'user-a' });

    await expect(verify(token)).resolves.toBe('user-a');
    await expect(verify(token)).resolves.toBe('user-a');
    expect(check).toHaveBeenCalledTimes(1);

    // Past its expiry the remembered answer is worth nothing: checked again.
    clock += HOUR;
    await verify(token);
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('answers null, never throws, when the signature check fails', async () => {
    const verify = rememberingVerifier(async () => {
      throw new Error('signature verification failed');
    });

    await expect(verify(tokenFor({ sub: 'forged' }))).resolves.toBeNull();
  });

  it('does not remember a failure, and does not believe an expired token', async () => {
    const check = vi
      .fn<(token: string) => Promise<{ sub: string; expiresAt: number } | null>>()
      .mockRejectedValueOnce(new Error('keys unreachable'))
      .mockResolvedValueOnce({ sub: 'user-a', expiresAt: 500 })
      .mockResolvedValue({ sub: 'user-a', expiresAt: 5_000 });
    const verify = rememberingVerifier(check, () => 1_000);
    const token = tokenFor({ sub: 'user-a' });

    await expect(verify(token)).resolves.toBeNull();
    await expect(verify(token)).resolves.toBeNull();
    await expect(verify(token)).resolves.toBe('user-a');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('refuses what is not shaped like a token before doing any work', async () => {
    const check = vi.fn(async () => ({ sub: 'x', expiresAt: Number.MAX_SAFE_INTEGER }));
    const verify = rememberingVerifier(check);

    // A garbage Authorization header must not 500 the request ahead of the
    // guard that would have rejected it properly.
    for (const token of ['', '..', 'a..c', 'a.b', 'a.b.c.d', 'not-a-token', `${'a'.repeat(5000)}.b.c`]) {
      await expect(verify(token)).resolves.toBeNull();
    }
    expect(check).not.toHaveBeenCalled();
  });
});

describe('trustedProxyHops', () => {
  it('trusts no proxy unless told how many there are', () => {
    expect(trustedProxyHops({})).toBe(0);
    for (const value of ['', '0', '-1', 'abc', 'true']) expect(trustedProxyHops({ TRUST_PROXY_HOPS: value })).toBe(0);
  });

  it('reads the number of proxies in front of the server', () => {
    expect(trustedProxyHops({ TRUST_PROXY_HOPS: '1' })).toBe(1);
    expect(trustedProxyHops({ TRUST_PROXY_HOPS: '3' })).toBe(3);
    // Believing a hundred entries of a header a client can write is believing the client.
    expect(trustedProxyHops({ TRUST_PROXY_HOPS: '100' })).toBe(10);
  });
});

describe('proxyWarning', () => {
  it('says nothing when no proxy is involved, or once the proxies are declared', () => {
    expect(proxyWarning(undefined, 0)).toBeNull();
    expect(proxyWarning('', 0)).toBeNull();
    expect(proxyWarning('203.0.113.7, 10.0.0.2', 2)).toBeNull();
  });

  it('names the likely setting when requests arrive through an undeclared proxy', () => {
    const warning = proxyWarning('203.0.113.7, 172.71.0.9, 10.0.0.2', 0);

    expect(warning).toContain('TRUST_PROXY_HOPS');
    expect(warning).toContain('3 entries');
    // Counts only: an address in a log line is personal data nobody asked for.
    expect(warning).not.toContain('203.0.113.7');
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
