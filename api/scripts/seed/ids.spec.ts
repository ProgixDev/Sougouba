import { describe, expect, it } from 'vitest';

import { Family, isSeedEmail, isSeedId, seedEmail, seedId, SEED_ID_LIKE_PATTERN } from './ids.js';

/**
 * The test that protects production. If `isSeedId` or the LIKE pattern ever
 * widens, the seed's teardown starts deleting rows it did not create.
 */
describe('isSeedId', () => {
  it('is false for a real v4 uuid', () => {
    expect(isSeedId('21d3ea35-ef83-4ad8-8d0d-b1ce2b6d3f06')).toBe(false);
    expect(isSeedId('7f3a1c00-0000-4000-8000-000000000001')).toBe(false);
  });

  it('is true for every id the seed generates', () => {
    for (const family of Object.values(Family)) {
      for (const n of [0, 1, 42, 999_999]) {
        expect(isSeedId(seedId(family, n))).toBe(true);
      }
    }
  });

  it('is false for a uuid that merely contains the marker away from the start', () => {
    // The near-miss an unanchored `like '%5eed%'` would wrongly match.
    expect(isSeedId('a1b2c3d4-5eed-4000-8000-000000000001')).toBe(false);
  });

  it('is case-sensitive, matching the SQL predicate — an uppercase variant is not ours', () => {
    expect(isSeedId('5EED0002-0000-4000-8000-000000000001')).toBe(false);
  });
});

describe('SEED_ID_LIKE_PATTERN', () => {
  it('is anchored at the start — a leading % would scope deletes to the whole table', () => {
    expect(SEED_ID_LIKE_PATTERN.startsWith('%')).toBe(false);
    expect(SEED_ID_LIKE_PATTERN).toBe('5eed%');
  });

  it('matches exactly the ids isSeedId accepts', () => {
    const prefix = SEED_ID_LIKE_PATTERN.replace('%', '');
    expect(seedId(Family.Order, 7).startsWith(prefix)).toBe(true);
  });
});

describe('seedId', () => {
  it('is deterministic across calls — the whole re-runnability of the seed rests on this', () => {
    expect(seedId(Family.Order, 12)).toBe(seedId(Family.Order, 12));
  });

  it('never collides across families for the same index', () => {
    const ids = Object.values(Family).map((f) => seedId(f, 1));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never collides across indexes within a family', () => {
    const ids = Array.from({ length: 500 }, (_, i) => seedId(Family.Order, i));
    expect(new Set(ids).size).toBe(500);
  });

  it('emits a well-formed uuid Postgres will accept', () => {
    expect(seedId(Family.Vendor, 3)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('varies in the first eight characters — what the dashboard actually displays', () => {
    // The dashboard renders `#${id.slice(0, 8)}`. When the family lived in
    // those characters every seeded order showed as `#5eed0006`, identical in
    // the list, the detail heading and every search hit. Real uuids are random
    // there; fixtures must be too, or they misrepresent what they stand in for.
    const shown = new Set(Array.from({ length: 250 }, (_, i) => seedId(Family.Order, i).slice(0, 8)));
    expect(shown.size).toBeGreaterThan(200);
  });

  it('still marks every id as seeded despite that variation', () => {
    for (let i = 0; i < 250; i += 1) expect(isSeedId(seedId(Family.Order, i))).toBe(true);
  });

  it('refuses an out-of-range family or index rather than emitting a malformed uuid', () => {
    expect(() => seedId(-1, 0)).toThrow();
    // The family occupies three hex digits, so 0xfff is the last valid one.
    expect(seedId(0xfff, 0)).toContain('-0fff-');
    expect(() => seedId(0x1000, 0)).toThrow();
    expect(() => seedId(Family.Order, -1)).toThrow();
    expect(() => seedId(Family.Order, 1.5)).toThrow();
  });
});

describe('seed emails', () => {
  it('round-trips through isSeedEmail', () => {
    expect(isSeedEmail(seedEmail('amina'))).toBe(true);
    expect(seedEmail('amina')).toBe('seed.amina@example.com');
  });

  it('rejects a real address, including the admin account the seed also creates', () => {
    expect(isSeedEmail('admin@sougouba.ca')).toBe(false);
    expect(isSeedEmail('someone@gmail.com')).toBe(false);
    expect(isSeedEmail(null)).toBe(false);
  });

  it('rejects an address that merely ends with the reserved domain', () => {
    // Teardown must not delete an account someone else created at example.com.
    expect(isSeedEmail('real.person@example.com')).toBe(false);
  });
});
