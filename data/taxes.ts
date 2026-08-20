/**
 * Québec sales tax, as it applies to a Sougouba order.
 *
 * TPS (federal) and TVQ (provincial) are charged on the products only — the
 * delivery fee is added afterwards, untaxed. Both are taken from the same base
 * rather than compounding: Québec de-harmonised TVQ in 2013, so it is no longer
 * levied on top of the TPS.
 *
 * Lives in `data/` rather than `lib/` because the seed builder and the mock API
 * both derive totals from it, and `data/` does not reach up into `lib/`.
 */

export const GST_RATE = 0.05;
export const QST_RATE = 0.09975;

export interface OrderTaxes {
  gstCad: number;
  qstCad: number;
}

/** Money is summed from floats, so round once at each boundary. */
export function roundCad(value: number): number {
  return Math.round(value * 100) / 100;
}

export function taxesOn(subtotalCad: number): OrderTaxes {
  return {
    gstCad: roundCad(subtotalCad * GST_RATE),
    qstCad: roundCad(subtotalCad * QST_RATE),
  };
}

/**
 * The one place the bottom line is computed. It used to be spelled out at the
 * checkout, in the cart hook and in the seed builder; three copies of a formula
 * that now has two more terms is three chances for the receipt to disagree with
 * what was charged.
 */
export function orderTotal(subtotalCad: number, taxes: OrderTaxes, deliveryFeeCad: number): number {
  return roundCad(subtotalCad + taxes.gstCad + taxes.qstCad + deliveryFeeCad);
}
