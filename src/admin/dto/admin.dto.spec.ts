import { describe, expect, it } from 'vitest';

import { num, numOrNull } from './admin-detail.dto.js';
import { orderListQuerySchema } from './admin.dto.js';

/**
 * These are the 400s that stop a malformed dashboard request from becoming a
 * 500 in a service method. Every field here arrives as a string, because that
 * is all a query string can carry.
 */
describe('orderListQuerySchema', () => {
  it('fills in the pagination defaults when the dashboard sends nothing', () => {
    const parsed = orderListQuerySchema.parse({});
    expect(parsed).toMatchObject({ limit: 20, offset: 0 });
    expect(parsed.status).toBeUndefined();
  });

  it('coerces limit and offset from the strings a query string actually carries', () => {
    expect(orderListQuerySchema.parse({ limit: '50', offset: '100' })).toMatchObject({ limit: 50, offset: 100 });
  });

  it('rejects a limit past the ceiling rather than letting one request pull the table', () => {
    expect(() => orderListQuerySchema.parse({ limit: '100000' })).toThrow();
  });

  it('accepts every real order status', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled']) {
      expect(orderListQuerySchema.parse({ status }).status).toBe(status);
    }
  });

  it('rejects a status outside the enum instead of quietly returning everything', () => {
    expect(() => orderListQuerySchema.parse({ status: 'refunded' })).toThrow();
  });

  it('rejects a vendorId that is not a uuid, before it reaches the query builder', () => {
    expect(() => orderListQuerySchema.parse({ vendorId: 'not-a-uuid' })).toThrow();
  });

  it('trims a search term, so a stray space does not become part of the pattern', () => {
    expect(orderListQuerySchema.parse({ search: '  Aïssatou  ' }).search).toBe('Aïssatou');
  });

  it('rejects a search that is empty once trimmed, rather than matching everything', () => {
    expect(() => orderListQuerySchema.parse({ search: '   ' })).toThrow();
  });
});

/**
 * Pins the `numeric`-as-string behaviour these helpers exist for: postgres.js
 * returns `"42.50"`, and arithmetic or sorting on that string is the bug.
 */
describe('numeric helpers', () => {
  it('converts a numeric string to a number, so money adds instead of concatenating', () => {
    expect(num('42.50')).toBe(42.5);
    expect(num('31.47') + num('12.50')).toBe(43.97);
  });

  it('keeps null as null rather than turning "never refunded" into $0', () => {
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull('12.50')).toBe(12.5);
  });

  it('converts "0.00" to 0 rather than leaving a falsy-looking string', () => {
    expect(num('0.00')).toBe(0);
  });
});
