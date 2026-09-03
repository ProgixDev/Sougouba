import { describe, expect, it } from 'vitest';

import { containsPattern } from '../common/sql/like.js';
import { looksLikeIdFragment } from './admin.service.js';
import { adminSearchQuerySchema } from './dto/admin.dto.js';

/**
 * The branch that decides between an indexable prefix match on `orders.id` and
 * an `ILIKE` name search. Getting it wrong turns a typeahead into a sequential
 * scan of the orders table — no index can serve `ILIKE '%…%'` on a uuid cast
 * to text.
 */
describe('looksLikeIdFragment', () => {
  it('routes a pasted id fragment to prefix matching', () => {
    expect(looksLikeIdFragment('a3f1')).toBe(true);
    expect(looksLikeIdFragment('5eed0006')).toBe(true);
    expect(looksLikeIdFragment('5eed0006-0000')).toBe(true);
    // The full uuid, which is what "copy id" actually yields.
    expect(looksLikeIdFragment('5eed0006-0000-4000-8000-0000000000e3')).toBe(true);
  });

  it('routes a name to the name search, including accented and spaced ones', () => {
    expect(looksLikeIdFragment('Aïssatou')).toBe(false);
    expect(looksLikeIdFragment('Marché Bamako')).toBe(false);
    expect(looksLikeIdFragment('Sofia')).toBe(false);
  });

  it('treats a name that happens to be hex as an id fragment — accepted trade-off', () => {
    // "abc" and "dade" are valid hex. Prefix-matching them against uuids simply
    // returns nothing, whereas mis-routing an id to a name search would scan
    // the table. Failing toward the cheap query is the right default.
    expect(looksLikeIdFragment('abc')).toBe(true);
  });

  it('is false for a single character, which the schema rejects anyway', () => {
    expect(looksLikeIdFragment('a')).toBe(false);
  });

  it('is false for anything carrying pattern or wildcard characters', () => {
    expect(looksLikeIdFragment('%')).toBe(false);
    expect(looksLikeIdFragment("a3f1' or 1=1")).toBe(false);
  });
});

describe('adminSearchQuerySchema', () => {
  it('rejects a one-character query rather than scanning four tables for noise', () => {
    expect(() => adminSearchQuerySchema.parse({ q: 'a' })).toThrow();
  });

  it('accepts two characters', () => {
    expect(adminSearchQuerySchema.parse({ q: 'ab' }).q).toBe('ab');
  });

  it('trims before applying the minimum, so spaces cannot pad a short query', () => {
    expect(() => adminSearchQuerySchema.parse({ q: ' a ' })).toThrow();
  });

  it('defaults perType to 5 and caps it, so one request cannot pull 40 rows per table', () => {
    expect(adminSearchQuerySchema.parse({ q: 'ab' }).perType).toBe(5);
    expect(() => adminSearchQuerySchema.parse({ q: 'ab', perType: '50' })).toThrow();
  });
});

describe('search patterns are escaped', () => {
  it('neutralises a literal % so it matches itself instead of every row', () => {
    // The bug this guards: `%${q}%` with q = '%' builds `%%%`, which matches
    // everything — handing the caller all four tables.
    expect(containsPattern('%')).toBe('%\\%%');
  });

  it('neutralises a literal underscore, the same trap one character at a time', () => {
    expect(containsPattern('_')).toBe('%\\_%');
  });

  it('leaves an ordinary query alone', () => {
    expect(containsPattern('Sofia')).toBe('%Sofia%');
  });
});
