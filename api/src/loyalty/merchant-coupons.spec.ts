import { describe, expect, it } from 'vitest';

import { createCouponSchema } from './dto/coupon.dto.js';
import { isCouponActive } from './merchant-coupons.service.js';

describe('creating a coupon', () => {
  const base = { code: 'ETE10', discountType: 'percentage', discountValue: 10 } as const;

  it('upper-cases and trims the code', () => {
    expect(createCouponSchema.parse({ ...base, code: '  ete10 ' }).code).toBe('ETE10');
  });

  it('refuses codes a shopper could not type or that would act as wildcards', () => {
    for (const code of ['AB', 'A'.repeat(21), 'ETE 10', 'ETE-10', 'ETE%', 'ETE_10', 'ÉTÉ10']) {
      expect(createCouponSchema.safeParse({ ...base, code }).success).toBe(false);
    }
  });

  it('holds a percentage to whole numbers from 1 to 90', () => {
    for (const discountValue of [1, 15, 90]) {
      expect(createCouponSchema.safeParse({ ...base, discountValue }).success).toBe(true);
    }
    for (const discountValue of [0, -5, 12.5, 91, 100]) {
      expect(createCouponSchema.safeParse({ ...base, discountValue }).success).toBe(false);
    }
  });

  it('holds a fixed amount to cents, up to 500 $', () => {
    const fixed = { ...base, discountType: 'fixed' } as const;
    for (const discountValue of [0.01, 5, 7.5, 500]) {
      expect(createCouponSchema.safeParse({ ...fixed, discountValue }).success).toBe(true);
    }
    for (const discountValue of [0, 500.01, 1.005]) {
      expect(createCouponSchema.safeParse({ ...fixed, discountValue }).success).toBe(false);
    }
  });

  it('treats the limit and the duration as optional, and bounded when given', () => {
    expect(createCouponSchema.safeParse({ ...base, usageLimit: 50, validDays: 30 }).success).toBe(true);
    expect(createCouponSchema.safeParse({ ...base, usageLimit: 0 }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, validDays: 0 }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, validDays: 366 }).success).toBe(false);
  });

  it('has no way to name another shop', () => {
    const parsed = createCouponSchema.parse({ ...base, vendorId: 'someone-else' } as never);
    expect('vendorId' in parsed).toBe(false);
  });
});

describe('whether a coupon is live', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const open = { startsAt: null, endsAt: null, usageLimit: null, usedCount: 0 };

  it('is live with no window and no limit', () => {
    expect(isCouponActive(open, now)).toBe(true);
  });

  it('respects the window, end-exclusive like checkout', () => {
    expect(isCouponActive({ ...open, startsAt: '2026-11-20T00:00:00Z' }, now)).toBe(false);
    expect(isCouponActive({ ...open, endsAt: '2026-11-19T12:00:00Z' }, now)).toBe(false);
    expect(isCouponActive({ ...open, endsAt: '2026-11-19T12:00:00.001Z' }, now)).toBe(true);
  });

  it('stops at the usage limit', () => {
    expect(isCouponActive({ ...open, usageLimit: 3, usedCount: 2 }, now)).toBe(true);
    expect(isCouponActive({ ...open, usageLimit: 3, usedCount: 3 }, now)).toBe(false);
  });
});
