import { describe, expect, it } from 'vitest';

import { cents, hashString, intBetween, mulberry32, pick } from './rng.js';

/**
 * These values were captured by running the mobile repo's own
 * `data/utils/random.ts` — the module this file is transcribed from. They pin
 * the port to the original: a "harmless" refactor here would silently reshuffle
 * every seeded order, and the seeded database would stop matching the mock the
 * dashboard was designed against.
 */
describe('mulberry32 / hashString — pinned to the mobile original', () => {
  it('hashes the seed phrase to the same value the mobile original does', () => {
    expect(hashString('sougouba-admin-seed-v1')).toBe(1_351_027_352);
  });

  it('produces the same first five draws as the mobile original', () => {
    const rand = mulberry32(hashString('sougouba-admin-seed-v1'));
    const drawn = [rand(), rand(), rand(), rand(), rand()].map((n) => Number(n.toFixed(12)));
    expect(drawn).toEqual([0.460629783804, 0.017468553036, 0.095337195089, 0.278124343371, 0.775181374513]);
  });

  it('is reproducible from the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('stays within [0, 1)', () => {
    const rand = mulberry32(7);
    for (let i = 0; i < 1000; i += 1) {
      const n = rand();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('hashes distinct strings to distinct seeds for the ids the seed uses', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => hashString(`vendor-${i}`)));
    expect(seen.size).toBe(200);
  });
});

describe('intBetween', () => {
  it('is inclusive at both ends', () => {
    const rand = mulberry32(3);
    const drawn = new Set(Array.from({ length: 500 }, () => intBetween(rand, 1, 3)));
    expect([...drawn].sort()).toEqual([1, 2, 3]);
  });

  it('returns the only value when min equals max', () => {
    expect(intBetween(mulberry32(1), 5, 5)).toBe(5);
  });
});

describe('pick', () => {
  it('always returns an element of the list', () => {
    const rand = mulberry32(9);
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i += 1) expect(items).toContain(pick(rand, items));
  });

  it('throws on an empty list rather than returning undefined into a NOT NULL column', () => {
    expect(() => pick(mulberry32(1), [])).toThrow();
  });
});

describe('cents', () => {
  it('formats integer cents as a two-decimal string for a numeric column', () => {
    expect(cents(4250)).toBe('42.50');
    expect(cents(0)).toBe('0.00');
    expect(cents(5)).toBe('0.05');
  });

  it('keeps parts summing exactly to the total, which float arithmetic would not', () => {
    // 0.1 + 0.2 !== 0.3 in IEEE-754; in cents it is exact.
    const subtotal = 10, gst = 20;
    expect(cents(subtotal + gst)).toBe('0.30');
  });

  it('rounds a fractional cent rather than emitting more than two decimals', () => {
    expect(cents(1234.6)).toBe('12.35');
  });
});
