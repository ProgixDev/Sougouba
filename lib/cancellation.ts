import type { CustomerCancelReason, Order, RunReleaseReason } from '@/data/types';
import type { MessageKey } from '@/lib/i18n';

/**
 * Ending an order early, from each side that can.
 *
 * The lists are the API's own (`CUSTOMER_CANCEL_REASONS`, `RELEASE_REASONS`):
 * a code added there needs its label here, and the server refuses one it does
 * not know. The rules below decide who gets a button; the server decides again
 * who is allowed, so a button shown a second too late is refused cleanly.
 */

export const customerCancelReasons: CustomerCancelReason[] = [
  'changed_mind',
  'ordered_by_mistake',
  'wrong_address',
  'wrong_items',
  'too_long',
  'other',
];

export function customerCancelReasonKey(reason: CustomerCancelReason): MessageKey {
  return `domain.cancelReason.${reason}` as MessageKey;
}

/**
 * The shopper may cancel only while the shop has not answered. Once it is
 * accepted someone has started preparing it, and that is a conversation with
 * support rather than a button.
 */
export function canCustomerCancel(order: Order): boolean {
  return order.status === 'pending';
}

export const runReleaseReasons: RunReleaseReason[] = ['vehicle_problem', 'too_far', 'shop_delay', 'personal', 'other'];

export function runReleaseReasonKey(reason: RunReleaseReason): MessageKey {
  return `domain.releaseReason.${reason}` as MessageKey;
}

/**
 * A courier may hand a run back until they have picked it up. After that the
 * bag is in their hands and there is nobody to hand it back to — the "report a
 * problem" screen is the way out, and a person decides.
 */
export function canReleaseRun(order: Order): boolean {
  return order.status === 'ready' && Boolean(order.delivery) && !order.delivery?.pickedUpAt;
}

/** "Cancelled by …", as one line. Falls back to a plain "cancelled" on an order that never recorded who. */
export function cancelledByKey(order: Order): MessageKey {
  const by = order.cancellation?.by;
  // The system has two timers; the reason says which one gave up.
  if (by === 'system' && order.cancellation?.reason === 'shop_no_response') return 'domain.cancelledBy.shopNoResponse';
  return (by ? `domain.cancelledBy.${by}` : 'domain.cancelledBy.unknown') as MessageKey;
}

/** The shopper's reason as a label, when the cancellation carries one the app knows. */
export function cancellationReasonKey(order: Order): MessageKey | null {
  const reason = order.cancellation?.reason;
  if (!reason || order.cancellation?.by !== 'customer') return null;
  return (customerCancelReasons as string[]).includes(reason) ? customerCancelReasonKey(reason as CustomerCancelReason) : null;
}
