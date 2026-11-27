import { roundCad } from './pricing.js';

/**
 * Who gets what out of one order — the rule, in one place.
 *
 * Each side receives what it is answerable for:
 *
 *   • the **shop** gets its goods and the taxes on them, because it is the
 *     seller and owes those taxes itself, less Sougouba's commission and less
 *     any promo code it chose to offer;
 *   • **Sougouba** gets the commission and the delivery fee, because it is the
 *     one paying the courier — and it pays for loyalty points out of that, the
 *     points being its own programme.
 *
 * With the addendum's own order (goods 32,50 $, TPS 1,63 $, TVQ 3,24 $,
 * delivery 4,99 $, total 42,36 $, commission 12 %): the shop is owed 33,47 $
 * and Sougouba keeps 8,89 $, from which the courier is paid.
 *
 * Two consequences worth knowing before reading the code that calls this:
 *
 * - A shop can be owed **more than the shopper paid**. Points lower what the
 *   shopper pays and not what the shop is owed, so the difference comes out of
 *   Sougouba's balance. That is why shops are paid by transfer after delivery
 *   (`billing/merchant-payouts.service.ts`) rather than by splitting the card payment:
 *   a payment cannot be split into more than itself.
 * - The commission is on the goods at their full price, promo code or not —
 *   the shop funds its own discount (`loyalty/merchant-coupons.service.ts`
 *   tells merchants so when they create a code).
 *
 * ⚠️ Decided with the developer on 2026-11-27 as the most defensible reading;
 * the client has not signed it. The tax side in particular (who remits when a
 * shop is not registered) is an accountant's question.
 */
export interface OrderMoney {
  subtotalCad: number;
  gstCad: number;
  qstCad: number;
  deliveryFeeCad: number;
  totalCad: number;
  /** A promo code the shop created. Null or absent when none was used. */
  couponDiscountCad?: number | null;
  /** Loyalty points redeemed. Not needed to work out the shop's share — it does not change. */
  pointsDiscountCad?: number | null;
}

export interface OrderSplit {
  /** Sougouba's commission, on the goods at full price. */
  commissionCad: number;
  /** What the shop is owed once the order is delivered. */
  merchantShareCad: number;
  /** What is left of the payment for Sougouba: commission and delivery, less the points it honoured. Can be negative. */
  platformShareCad: number;
}

/**
 * `commissionCad` may be handed in — the commission fixed when the order was
 * placed — so a rate changed since then does not rewrite a past order.
 */
export function splitOrder(order: OrderMoney, commission: { rate: number } | { commissionCad: number }): OrderSplit {
  const commissionCad = 'commissionCad' in commission ? roundCad(commission.commissionCad) : roundCad(order.subtotalCad * commission.rate);
  const merchantShareCad = roundCad(
    order.subtotalCad + order.gstCad + order.qstCad - (order.couponDiscountCad ?? 0) - commissionCad
  );
  return {
    commissionCad,
    merchantShareCad,
    platformShareCad: roundCad(order.totalCad - merchantShareCad),
  };
}

/**
 * The shop's part of a refund given after delivery.
 *
 * A refund hands back a fraction of what the shopper paid, and each side gives
 * back the same fraction of what it received: half the order refunded costs
 * the shop half its share and Sougouba half of its own. Charging the whole
 * refund to the shop would take from it the delivery fee it never had.
 *
 * Never more than the share itself, and nothing on an order that cost nothing.
 */
export function refundShareOf(order: { totalCad: number; merchantShareCad: number }, refundCad: number): number {
  if (order.totalCad <= 0 || refundCad <= 0 || order.merchantShareCad <= 0) return 0;
  const fraction = Math.min(refundCad / order.totalCad, 1);
  return Math.min(roundCad(order.merchantShareCad * fraction), order.merchantShareCad);
}
