import { describe, expect, it } from 'vitest';

import { refundShareOf, splitOrder } from './split.js';

/** The order the addendum prices line by line (§03). */
const ADDENDUM = { subtotalCad: 32.5, gstCad: 1.63, qstCad: 3.24, deliveryFeeCad: 4.99, totalCad: 42.36 };

describe('splitOrder — who gets what out of one order', () => {
  it('gives the shop its goods and their taxes less the commission, and Sougouba the commission and the delivery fee', () => {
    const split = splitOrder(ADDENDUM, { rate: 0.12 });

    expect(split).toEqual({ commissionCad: 3.9, merchantShareCad: 33.47, platformShareCad: 8.89 });
    // Nothing is created or lost: the two shares are the payment.
    expect(split.merchantShareCad + split.platformShareCad).toBeCloseTo(ADDENDUM.totalCad, 2);
    // Sougouba's side is exactly the commission plus the delivery fee.
    expect(split.platformShareCad).toBeCloseTo(split.commissionCad + ADDENDUM.deliveryFeeCad, 2);
  });

  it('has Sougouba, not the shop, pay for loyalty points', () => {
    // 5 $ of points: the shopper pays 5 $ less, the shop is owed the same.
    const split = splitOrder({ ...ADDENDUM, pointsDiscountCad: 5, totalCad: 37.36 }, { rate: 0.12 });

    expect(split.merchantShareCad).toBe(33.47);
    expect(split.platformShareCad).toBe(3.89);
  });

  it('can owe the shop more than the shopper paid — why shops are paid by transfer, not by splitting the payment', () => {
    // A 100 $ basket, the full 20 % in points, a 2,99 $ delivery.
    const order = { subtotalCad: 100, gstCad: 5, qstCad: 9.98, deliveryFeeCad: 2.99, pointsDiscountCad: 20, totalCad: 97.97 };
    const split = splitOrder(order, { rate: 0.12 });

    expect(split.merchantShareCad).toBe(102.98);
    expect(split.merchantShareCad).toBeGreaterThan(order.totalCad);
    expect(split.platformShareCad).toBe(-5.01);
  });

  it('has the shop pay for its own promo code, with the commission still on the full price', () => {
    // 10 % off the goods, offered by the shop.
    const split = splitOrder({ ...ADDENDUM, couponDiscountCad: 3.25, totalCad: 39.11 }, { rate: 0.12 });

    expect(split.commissionCad).toBe(3.9);
    expect(split.merchantShareCad).toBe(30.22);
    // Sougouba's side does not move: the discount was never its money.
    expect(split.platformShareCad).toBe(8.89);
  });

  it('keeps the commission fixed when the order was placed, whatever the rate is today', () => {
    expect(splitOrder(ADDENDUM, { commissionCad: 3.25 }).merchantShareCad).toBe(34.12);
    expect(splitOrder(ADDENDUM, { rate: 0.15 }).commissionCad).toBe(4.88);
  });
});

describe('refundShareOf — the shop gives back the same fraction it received', () => {
  const order = { totalCad: 42.36, merchantShareCad: 33.47 };

  it('charges the shop its whole share when the whole order is refunded — and no more', () => {
    expect(refundShareOf(order, 42.36)).toBe(33.47);
    // Not the 42,36 $: the delivery fee and the commission were never the shop's.
    expect(refundShareOf(order, 999)).toBe(33.47);
  });

  it('charges the shop half its share for half the order', () => {
    expect(refundShareOf(order, 21.18)).toBe(16.74);
  });

  it('takes nothing for no refund, a free order, or a shop that was owed nothing', () => {
    expect(refundShareOf(order, 0)).toBe(0);
    expect(refundShareOf({ totalCad: 0, merchantShareCad: 10 }, 5)).toBe(0);
    expect(refundShareOf({ totalCad: 20, merchantShareCad: 0 }, 5)).toBe(0);
  });
});
