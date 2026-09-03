import { describe, expect, it } from 'vitest';

import { allowedOrigins, corsOptionsFrom, DEV_ORIGINS } from './cors.js';

/** Exercises the `origin` delegate the way @fastify/cors calls it. */
function decide(env: Parameters<typeof corsOptionsFrom>[0], origin: string | undefined): boolean {
  const delegate = corsOptionsFrom(env).origin as (
    origin: string | undefined,
    callback: (err: Error | null, allow: boolean) => void
  ) => void;

  let allowed: boolean | undefined;
  delegate(origin, (err, allow) => {
    if (err) throw err;
    allowed = allow;
  });

  if (allowed === undefined) throw new Error('origin delegate never called back');
  return allowed;
}

const dev = { NODE_ENV: 'development' as const, CORS_ALLOWED_ORIGINS: undefined };
const prod = { NODE_ENV: 'production' as const, CORS_ALLOWED_ORIGINS: undefined };

describe('allowedOrigins', () => {
  it('falls back to the dashboard dev server when unset outside production', () => {
    expect(allowedOrigins(dev)).toEqual(DEV_ORIGINS);
  });

  it('refuses every origin when unset in production, rather than trusting localhost', () => {
    expect(allowedOrigins(prod)).toEqual([]);
  });

  it('splits a comma-separated list and trims the spaces people leave after commas', () => {
    expect(allowedOrigins({ ...prod, CORS_ALLOWED_ORIGINS: 'https://a.example, https://b.example' })).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('strips a trailing slash — the header never carries one, so it would never match', () => {
    expect(allowedOrigins({ ...prod, CORS_ALLOWED_ORIGINS: 'https://admin.example/' })).toEqual(['https://admin.example']);
  });

  it('ignores empty entries from a trailing comma', () => {
    expect(allowedOrigins({ ...prod, CORS_ALLOWED_ORIGINS: 'https://a.example,,' })).toEqual(['https://a.example']);
  });

  it('replaces the dev fallback rather than extending it once the var is set', () => {
    expect(allowedOrigins({ ...dev, CORS_ALLOWED_ORIGINS: 'https://a.example' })).toEqual(['https://a.example']);
  });
});

describe('corsOptionsFrom', () => {
  it('allows a listed origin', () => {
    expect(decide(dev, 'http://localhost:4320')).toBe(true);
  });

  it('refuses an unlisted origin', () => {
    expect(decide(dev, 'https://evil.example')).toBe(false);
  });

  it('allows a request with no Origin header — curl, Swagger, server-to-server', () => {
    expect(decide(dev, undefined)).toBe(true);
  });

  it('matches a listed origin that was written with a trailing slash', () => {
    expect(decide({ ...prod, CORS_ALLOWED_ORIGINS: 'https://admin.example/' }, 'https://admin.example')).toBe(true);
  });

  it('refuses everything cross-origin when unset in production', () => {
    expect(decide(prod, 'https://admin.example')).toBe(false);
  });

  it('exposes the rate-limit headers, so the dashboard can see its budget draining', () => {
    expect(corsOptionsFrom(dev).exposedHeaders).toContain('x-ratelimit-remaining');
  });

  it('does not enable credentials — this API authenticates with a bearer token, not cookies', () => {
    expect(corsOptionsFrom(dev).credentials).toBe(false);
  });
});
