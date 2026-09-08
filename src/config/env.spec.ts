import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.js';

const validBase = {
  SUPABASE_URL: 'https://project-ref.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};

describe('validateEnv', () => {
  it('accepts the minimal required set and fills in defaults', () => {
    const env = validateEnv(validBase);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.SUPABASE_URL).toBe(validBase.SUPABASE_URL);
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe(validBase.SUPABASE_SERVICE_ROLE_KEY);
  });

  it('rejects a boot with no SUPABASE_SERVICE_ROLE_KEY — it is the database credential now, not an optional extra', () => {
    expect(() => validateEnv({ SUPABASE_URL: validBase.SUPABASE_URL })).toThrowError(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('rejects a boot with no SUPABASE_URL, listing it by name — the auth guard needs it from Phase 1 on', () => {
    expect(() => validateEnv({ SUPABASE_SERVICE_ROLE_KEY: validBase.SUPABASE_SERVICE_ROLE_KEY })).toThrowError(/SUPABASE_URL/);
  });

  it('coerces PORT from the string every real process.env gives it', () => {
    const env = validateEnv({ ...validBase, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('rejects an unknown NODE_ENV rather than silently accepting it', () => {
    expect(() => validateEnv({ ...validBase, NODE_ENV: 'staging' })).toThrow();
  });

  it('leaves CORS_ALLOWED_ORIGINS undefined when unset — the dev fallback lives in config/cors.ts, not here', () => {
    expect(validateEnv(validBase).CORS_ALLOWED_ORIGINS).toBeUndefined();
  });

  it('passes CORS_ALLOWED_ORIGINS through verbatim, leaving the parsing to config/cors.ts', () => {
    const raw = 'https://a.example, https://b.example/';
    expect(validateEnv({ ...validBase, CORS_ALLOWED_ORIGINS: raw }).CORS_ALLOWED_ORIGINS).toBe(raw);
  });
});
