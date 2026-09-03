import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.js';

const validBase = {
  DATABASE_URL: 'postgresql://user:pass@host:5432/postgres',
  SUPABASE_URL: 'https://project-ref.supabase.co',
};

describe('validateEnv', () => {
  it('accepts the minimal required set and fills in defaults', () => {
    const env = validateEnv(validBase);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_URL).toBe(validBase.DATABASE_URL);
    expect(env.SUPABASE_URL).toBe(validBase.SUPABASE_URL);
  });

  it('rejects a boot with no DATABASE_URL, listing it by name', () => {
    expect(() => validateEnv({ SUPABASE_URL: validBase.SUPABASE_URL })).toThrowError(/DATABASE_URL/);
  });

  it('rejects a boot with no SUPABASE_URL, listing it by name — the auth guard needs it from Phase 1 on', () => {
    expect(() => validateEnv({ DATABASE_URL: validBase.DATABASE_URL })).toThrowError(/SUPABASE_URL/);
  });

  it('coerces PORT from the string every real process.env gives it', () => {
    const env = validateEnv({ ...validBase, PORT: '4000' });
    expect(env.PORT).toBe(4000);
  });

  it('rejects an unknown NODE_ENV rather than silently accepting it', () => {
    expect(() => validateEnv({ ...validBase, NODE_ENV: 'staging' })).toThrow();
  });
});
