import { ForbiddenException } from '@nestjs/common';

/**
 * Who is entitled to move an order, enforced server-side.
 *
 * The mobile app already encodes this in `lib/orderStatus.ts` — but there it
 * decides *who gets a button*, which is a UI question. The same table asked as
 * an authorization question is what stops a merchant marking their own order
 * delivered without a courier ever touching it, or a courier confirming an
 * order the shop has not finished packing.
 */
export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StatusActor = 'merchant' | 'courier';

/**
 * The happy path, in order. `cancelled` is deliberately absent: it is an exit
 * from the flow rather than a step in it.
 */
export const ORDER_PROGRESSION: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
];

/**
 * Who may move an order *out of* a given status.
 *
 * The merchant's job ends when the bag is packed; the two steps that describe
 * someone physically carrying it belong to whoever is carrying it. `null` means
 * the status is terminal (`delivered`, `cancelled`) or is waiting on something
 * other than a button — `ready` sits there until a courier accepts.
 *
 * Note `ready` and `out_for_delivery` are the courier's, but the *endpoints*
 * that advance them are Phase 5's (`/courier/:orderId/pickup` and `/complete`),
 * because each also writes a pickup time, a proof, or a payout. This table is
 * what those endpoints will check; `PATCH /orders/:id/status` refuses them
 * outright rather than offering a second, evidence-free way to reach
 * `delivered`.
 */
export const STATUS_ACTOR: Record<OrderStatus, StatusActor | null> = {
  pending: 'merchant',
  confirmed: 'merchant',
  preparing: 'merchant',
  ready: 'courier',
  out_for_delivery: 'courier',
  delivered: null,
  cancelled: null,
};

export function progressionIndex(status: OrderStatus): number {
  return ORDER_PROGRESSION.indexOf(status);
}

/** The next step on the happy path, or null at the end of it. */
export function nextStatus(status: OrderStatus): OrderStatus | null {
  const index = progressionIndex(status);
  if (index === -1 || index === ORDER_PROGRESSION.length - 1) return null;
  return ORDER_PROGRESSION[index + 1];
}

/** Still in the shop's queue — i.e. not finished and not cancelled. */
export function isActiveStatus(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

/**
 * Who may cancel, and until when.
 *
 * Nothing in the mock ever set `cancelled` — the status existed with no code
 * path reaching it. The rule chosen here is the conservative one: a merchant
 * may cancel while they still hold the bag, and nobody may cancel once a
 * courier is carrying it, because at that point there is food in a car and the
 * question is a refund rather than a cancellation.
 *
 * A *shopper*-initiated cancellation is deliberately not offered: it would have
 * to reverse a captured Stripe payment, and the refund flow that implies is
 * Phase 6's, wired to `reverseForOrder`. Until then, a shopper who needs one
 * opens a dispute, which is a path that exists and that a human reads.
 */
export function canCancel(status: OrderStatus, actor: StatusActor): boolean {
  if (actor !== 'merchant') return false;
  return status === 'pending' || status === 'confirmed' || status === 'preparing';
}

/**
 * Assert a status change is one this actor may make from where the order
 * actually is. Throws rather than returning a boolean so that every caller
 * fails the same way, with the same message.
 *
 * Three separate refusals, because they are three different mistakes:
 * a step that is not the next one, a step that belongs to somebody else, and a
 * step out of a status nobody can leave.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, actor: StatusActor): void {
  if (from === to) {
    throw new ForbiddenException(`Order is already "${from}"`);
  }

  if (to === 'cancelled') {
    if (!canCancel(from, actor)) {
      throw new ForbiddenException(`An order that is "${from}" can no longer be cancelled here`);
    }
    return;
  }

  if (!isActiveStatus(from)) {
    throw new ForbiddenException(`Order is "${from}" and cannot change status`);
  }

  const owner = STATUS_ACTOR[from];
  if (owner === null) {
    throw new ForbiddenException(`Nothing can move an order out of "${from}"`);
  }
  if (owner !== actor) {
    throw new ForbiddenException(`Only the ${owner} can move an order out of "${from}"`);
  }

  const expected = nextStatus(from);
  if (to !== expected) {
    // Skipping ahead is refused, not just going backwards: an order that jumps
    // `confirmed` -> `ready` never passed through a kitchen, and its status
    // history — which the dispute flow reads — would say so.
    throw new ForbiddenException(`An order that is "${from}" can only move to "${expected}", not "${to}"`);
  }
}
