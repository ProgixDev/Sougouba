import { describe, expect, it } from 'vitest';

import {
  couponDiscountFor,
  deliveryFeeFor,
  distanceKm,
  maxRedeemablePoints,
  orderTotal,
  pointsToDiscountCad,
  priceOrder,
  roundCad,
  taxesOn,
  toStripeAmount,
} from './pricing.js';

describe('taxesOn', () => {
  it('charges TPS 5 % and TVQ 9.975 % from the same base, not compounded', () => {
    // Québec de-harmonised TVQ in 2013 — it is no longer levied on top of the
    // TPS. Compounding would give 10.47 here instead of 9.98.
    expect(taxesOn(100)).toEqual({ gstCad: 5, qstCad: 9.98 });
  });

  it('rounds each line once, at the boundary', () => {
    // 49.99 * 0.09975 = 4.98650…  → 4.99
    expect(taxesOn(49.99)).toEqual({ gstCad: 2.5, qstCad: 4.99 });
  });
});

describe('orderTotal', () => {
  it('adds delivery after tax, never taxing it', () => {
    // The delivery fee must not appear in either tax base: 100 + 5 + 9.98 + 3.99.
    expect(orderTotal(100, taxesOn(100), 3.99)).toBe(118.97);
  });
});

describe('deliveryFeeFor', () => {
  it('prices by band, with the upper bound inclusive', () => {
    expect(deliveryFeeFor(0)).toBe(2.99);
    expect(deliveryFeeFor(2)).toBe(2.99);
    expect(deliveryFeeFor(2.01)).toBe(3.99);
    expect(deliveryFeeFor(5)).toBe(3.99);
    expect(deliveryFeeFor(8)).toBe(5.49);
    expect(deliveryFeeFor(12)).toBe(6.99);
    expect(deliveryFeeFor(12.01)).toBe(8.99);
    expect(deliveryFeeFor(500)).toBe(8.99);
  });

  it('treats a broken distance as the nearest band, not as free delivery', () => {
    // A negative or NaN distance is a bug upstream. Pricing it at zero would
    // turn that bug into free deliveries nobody notices until the month's end.
    expect(deliveryFeeFor(-5)).toBe(2.99);
    expect(deliveryFeeFor(Number.NaN)).toBe(2.99);
    // Infinity is *not* the top band, despite the top band's `maxKm: Infinity`:
    // a non-finite distance is a broken measurement, not a very long trip, so
    // it lands in the first band with the other nonsense. Faithful to the
    // mock's own `Number.isFinite(km) ? Math.max(0, km) : 0` guard — charging
    // 8,99 $ because a coordinate came back NaN would be the worse failure.
    expect(deliveryFeeFor(Number.POSITIVE_INFINITY)).toBe(2.99);
  });
});

describe('distanceKm', () => {
  it('measures a known Montréal pair to within a few hundred metres', () => {
    // Place des Arts → Marché Jean-Talon: ~4.8 km as the crow flies.
    const km = distanceKm({ lat: 45.5088, lng: -73.5678 }, { lat: 45.5366, lng: -73.6145 });
    expect(km).toBeGreaterThan(4.6);
    expect(km).toBeLessThan(5);
  });

  it('is zero for a point against itself and symmetric between two', () => {
    const a = { lat: 45.53, lng: -73.6 };
    const b = { lat: 45.51, lng: -73.57 };
    expect(distanceKm(a, a)).toBe(0);
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 12);
  });
});

describe('maxRedeemablePoints', () => {
  it('caps a redemption at 20 % of the subtotal', () => {
    // 20 % of 50 $ is 10 $, which is 1000 points — even holding 5000.
    expect(maxRedeemablePoints(50, 5000)).toBe(1000);
  });

  it('never redeems more than the shopper actually has', () => {
    expect(maxRedeemablePoints(50, 250)).toBe(250);
  });

  it('floors to a whole point', () => {
    // 20 % of 10.99 = 2.198 → rounds to 2.20 $ → 220 points.
    expect(maxRedeemablePoints(10.99, 99999)).toBe(220);
  });

  it('treats nonsense inputs as zero rather than as credit', () => {
    expect(maxRedeemablePoints(-50, 5000)).toBe(0);
    expect(maxRedeemablePoints(50, -5000)).toBe(0);
  });
});

describe('pointsToDiscountCad', () => {
  it('converts at 100 points to the dollar', () => {
    expect(pointsToDiscountCad(1000)).toBe(10);
    expect(pointsToDiscountCad(250)).toBe(2.5);
    expect(pointsToDiscountCad(0)).toBe(0);
  });
});

describe('priceOrder', () => {
  const vendorLocation = { lat: 45.5366, lng: -73.6145 };
  const deliveryLocation = { lat: 45.5088, lng: -73.5678 }; // ~4.3 km → 3.99 band

  const items = [
    { productId: 'p1', name: 'Mangue Kent', qty: 3, unitPriceCad: 4.5 },
    { productId: 'p2', name: 'Gombo frais', qty: 1, unitPriceCad: 6.5 },
  ];

  it('prices a whole receipt from the server’s own figures', () => {
    const priced = priceOrder({ items, vendorLocation, deliveryLocation, requestedPoints: 0, availablePoints: 0 });
    expect(priced.subtotalCad).toBe(20);
    expect(priced.gstCad).toBe(1);
    expect(priced.qstCad).toBe(2);
    expect(priced.deliveryFeeCad).toBe(3.99);
    expect(priced.pointsRedeemed).toBe(0);
    expect(priced.totalCad).toBe(26.99);
  });

  it('clamps a greedy redemption request to the 20 % cap', () => {
    // Asked for 10 000 points against a 20 $ subtotal: the cap is 4 $ = 400.
    const priced = priceOrder({
      items,
      vendorLocation,
      deliveryLocation,
      requestedPoints: 10_000,
      availablePoints: 10_000,
    });
    expect(priced.pointsRedeemed).toBe(400);
    expect(priced.pointsDiscountCad).toBe(4);
    expect(priced.totalCad).toBe(22.99);
  });

  it('clamps to the real balance when the client claims more', () => {
    // The attack this closes: a client posting `redeemPoints: 999999` for a
    // free order. The balance is looked up server-side and wins.
    const priced = priceOrder({
      items,
      vendorLocation,
      deliveryLocation,
      requestedPoints: 999_999,
      availablePoints: 150,
    });
    expect(priced.pointsRedeemed).toBe(150);
    expect(priced.pointsDiscountCad).toBe(1.5);
    expect(priced.totalCad).toBe(25.49);
  });

  it('discounts the subtotal only — never the tax or delivery lines', () => {
    const withoutPoints = priceOrder({ items, vendorLocation, deliveryLocation, requestedPoints: 0, availablePoints: 0 });
    const withPoints = priceOrder({
      items,
      vendorLocation,
      deliveryLocation,
      requestedPoints: 400,
      availablePoints: 400,
    });
    expect(withPoints.gstCad).toBe(withoutPoints.gstCad);
    expect(withPoints.qstCad).toBe(withoutPoints.qstCad);
    expect(withPoints.deliveryFeeCad).toBe(withoutPoints.deliveryFeeCad);
    expect(withPoints.totalCad).toBe(roundCad(withoutPoints.totalCad - 4));
  });

  it('never produces a negative total', () => {
    const priced = priceOrder({
      items: [{ productId: 'p1', name: 'Petit', qty: 1, unitPriceCad: 1 }],
      vendorLocation,
      deliveryLocation,
      requestedPoints: 999_999,
      availablePoints: 999_999,
    });
    expect(priced.totalCad).toBeGreaterThan(0);
  });
});

describe('coupons', () => {
  const vendorLocation = { lat: 45.5366, lng: -73.6145 };
  const deliveryLocation = { lat: 45.5088, lng: -73.5678 };
  const items = [{ productId: 'p1', name: 'Panier', qty: 1, unitPriceCad: 50 }];

  const price = (coupon: Parameters<typeof couponDiscountFor>[0], requestedPoints = 0) =>
    priceOrder({ items, vendorLocation, deliveryLocation, requestedPoints, availablePoints: 100_000, coupon });

  it('takes a percentage off the subtotal only', () => {
    const priced = price({ code: 'BIENVENUE10', discountType: 'percentage', discountValue: 10 });
    expect(priced.couponDiscountCad).toBe(5);
    // Tax and delivery are untouched — discounting the tax would mean remitting
    // money that was never collected.
    expect(priced.gstCad).toBe(2.5);
    expect(priced.qstCad).toBe(4.99);
    expect(priced.deliveryFeeCad).toBe(3.99);
    expect(priced.totalCad).toBe(56.48);
  });

  it('takes a fixed amount off', () => {
    expect(price({ code: 'MOINS15', discountType: 'fixed', discountValue: 15 }).couponDiscountCad).toBe(15);
  });

  it('never discounts more than the goods are worth', () => {
    // A 200 $ coupon on a 50 $ basket takes 50 $ — it does not start eating the
    // delivery fee or hand back change.
    const priced = price({ code: 'ENORME', discountType: 'fixed', discountValue: 200 });
    expect(priced.couponDiscountCad).toBe(50);
    expect(priced.totalCad).toBe(roundCad(2.5 + 4.99 + 3.99));
  });

  it('clamps a nonsense percentage rather than paying the shopper', () => {
    expect(couponDiscountFor({ code: 'X', discountType: 'percentage', discountValue: 500 }, 50)).toBe(50);
    expect(couponDiscountFor({ code: 'X', discountType: 'percentage', discountValue: -20 }, 50)).toBe(0);
  });

  it('is nothing at all when no coupon was given', () => {
    const priced = price(null);
    expect(priced.couponCode).toBeNull();
    expect(priced.couponDiscountCad).toBe(0);
  });

  it('stacks with points against the original subtotal, capped at it', () => {
    // Points cap is 20 % of 50 $ = 10 $ (1000 points). The coupon takes another
    // 5 $. Both come off the *original* subtotal: a coupon must not silently
    // shrink what a shopper's own points are worth.
    const priced = price({ code: 'BIENVENUE10', discountType: 'percentage', discountValue: 10 }, 100_000);
    expect(priced.pointsRedeemed).toBe(1000);
    expect(priced.pointsDiscountCad).toBe(10);
    expect(priced.couponDiscountCad).toBe(5);
    expect(priced.totalCad).toBe(roundCad(50 + 2.5 + 4.99 + 3.99 - 15));
  });

  it('caps the combined discount at the subtotal so tax stays payable', () => {
    // Without the cap on the *sum*, a large coupon plus points could exceed the
    // goods' value and start eating tax the platform still has to remit.
    const priced = price({ code: 'ENORME', discountType: 'fixed', discountValue: 50 }, 100_000);
    expect(priced.totalCad).toBe(roundCad(2.5 + 4.99 + 3.99));
    expect(priced.totalCad).toBeGreaterThan(0);
  });
});

describe('toStripeAmount', () => {
  it('converts to cents without losing one to float truncation', () => {
    // 19.99 * 100 is 1998.9999999999998 in IEEE 754 — `Math.trunc` would charge
    // 19,98 $ and hand the shopper a receipt that doesn't match.
    expect(toStripeAmount(19.99)).toBe(1999);
    expect(toStripeAmount(26.99)).toBe(2699);
    expect(toStripeAmount(1.1)).toBe(110);
    expect(toStripeAmount(0)).toBe(0);
  });
});
