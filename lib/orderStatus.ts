import type { OrderStatus } from '@/data/types';
import type { Message, MessageKey } from '@/lib/i18n';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'secondary' | 'destructive';

/**
 * Badge tone per order status. One place, so lists and detail agree.
 *
 * The label used to live here too, as a French string. It moved to
 * `domain.orderStatus.*`: a `Record<OrderStatus, string>` built at module scope
 * is captured at import time and would render the launch language forever, and
 * `scripts/verify-logic.ts` imports this module under bare `tsx` where no
 * translator exists. Screens read `t(orderStatusKey(status))`.
 */
export const orderStatusTone: Record<OrderStatus, BadgeTone> = {
  pending: 'neutral',
  confirmed: 'primary',
  preparing: 'warning',
  ready: 'primary',
  out_for_delivery: 'secondary',
  delivered: 'success',
  cancelled: 'destructive',
};

export function orderStatusKey(status: OrderStatus): MessageKey {
  return `domain.orderStatus.${status}` as MessageKey;
}

/**
 * The happy path, in order. `cancelled` is deliberately absent: it is an exit
 * from the flow rather than a step in it, so the timeline renders it separately
 * instead of trying to place it on the track.
 */
export const orderProgression: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];

/** -1 when the status is not on the happy path (i.e. cancelled). */
export function progressionIndex(status: OrderStatus): number {
  return orderProgression.indexOf(status);
}

/**
 * Short, human summary for a list row.
 *
 * Returns a `Message` rather than a sentence: the plural forms differ per
 * language and are chosen by the pluralizer, not by a ternary here.
 */
export function orderSummaryLine(itemCount: number): Message {
  return { key: 'domain.order.itemCount', params: { count: itemCount } };
}

/** Still in the shop's queue — i.e. not finished and not cancelled. */
export function isActiveStatus(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

/** The next step a shop can advance an order to, or null at the end of the flow. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = progressionIndex(status);
  if (index === -1 || index === orderProgression.length - 1) return null;
  return orderProgression[index + 1];
}

/**
 * Who is entitled to move an order out of a given status.
 *
 * Before there were couriers the merchant advanced the whole path, including
 * "Confier au livreur" — an action they could take while nobody had so much as
 * accepted the run. Now the merchant's job ends when the bag is packed, and the
 * two steps that describe someone physically carrying it belong to whoever is
 * carrying it.
 *
 * `null` means the status is terminal, or is waiting on something other than a
 * button: `ready` sits there until a courier accepts.
 */
export type StatusActor = 'merchant' | 'courier';

export const STATUS_ACTOR: Record<OrderStatus, StatusActor | null> = {
  pending: 'merchant',
  confirmed: 'merchant',
  preparing: 'merchant',
  ready: 'courier',
  out_for_delivery: 'courier',
  delivered: null,
  cancelled: null,
};

/**
 * The next step *this* actor can take, or null if it is not their move.
 *
 * `nextStatus` still answers the shape of the happy path and is what the
 * timeline and the seed reason about; this answers who gets a button.
 */
export function nextStatusFor(status: OrderStatus, actor: StatusActor): OrderStatus | null {
  return STATUS_ACTOR[status] === actor ? nextStatus(status) : null;
}

/** The two statuses a courier can advance out of. Wording is `domain.courierAdvance.*`. */
const COURIER_ADVANCE: OrderStatus[] = ['ready', 'out_for_delivery'];

/** The key for the courier's advance button, or null when it is not their move. */
export function courierActionKey(status: OrderStatus): MessageKey | null {
  if (!nextStatusFor(status, 'courier') || !COURIER_ADVANCE.includes(status)) return null;
  return `domain.courierAdvance.${status}` as MessageKey;
}

/**
 * The key for the merchant's advance button, or null at the end of the flow.
 *
 * The wording lives in `domain.orderAdvance.*`, phrased as the action the shop
 * is taking rather than the state it lands in ("Accepter", not "Confirmée") — a
 * button labelled with a past participle reads as a status, not a control.
 *
 * `delivered` and `cancelled` have no entry, where the old
 * `Record<OrderStatus, string>` needed empty strings for them purely to satisfy
 * its own type. `nextStatus` already returns null there, so the partiality is
 * now stated once instead of papered over twice.
 */
export function advanceActionKey(status: OrderStatus): MessageKey | null {
  return nextStatus(status) ? (`domain.orderAdvance.${status}` as MessageKey) : null;
}
