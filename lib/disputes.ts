import type { CourierIssueReason, DisputeReason, Order, OrderDispute } from '@/data/types';
import type { MessageKey, TFunction } from '@/lib/i18n';

/**
 * The reasons a shopper can pick, in the order they are offered.
 *
 * Ordered by how often they actually happen in grocery delivery — a missing item
 * is the common case and belongs first, "Autre" last because a list that opens
 * with an escape hatch gets nothing but escape hatches. That ordering is
 * editorial and stays here; the words are `domain.disputeReason.*`.
 */
export const disputeReasons: DisputeReason[] = [
  'missing_items',
  'wrong_order',
  'quality',
  'late',
  'other',
];

/**
 * The key naming a reason.
 *
 * The old lookup fell back to "Autre" for an unrecognised reason. There is no
 * fallback now because there is no longer a way to miss: `DisputeReason` is a
 * closed union and an unhandled member is a missing catalogue key, caught by
 * `tsc` rather than shown to a shopper as the wrong reason.
 */
export function disputeReasonKey(reason: DisputeReason): MessageKey {
  return `domain.disputeReason.${reason}` as MessageKey;
}

/**
 * Whether an order can still be reported on.
 *
 * Only once it has finished: while an order is in flight the status timeline is
 * the answer to "where is it?", and a dispute raised against a shop still
 * packing the bag is a support ticket about nothing. A cancelled order stays
 * disputable — being charged for one is exactly the kind of thing to report.
 */
export function canOpenDispute(order: Order): boolean {
  if (order.dispute) return false;
  return order.status === 'delivered' || order.status === 'cancelled';
}

/**
 * One line for a list row — what the merchant sees before opening the ticket.
 *
 * Takes `t` rather than returning a `Message` because it *composes*: the
 * answered form interpolates an already-translated reason, and i18n-js resolves
 * one message per call, so the inner one has to be rendered first. The whole
 * sentence is a single key rather than a reason with " · répondu" appended, so a
 * language can reorder it or use its own separator.
 */
export function disputeSummary(t: TFunction, dispute: OrderDispute): string {
  const reason = t(disputeReasonKey(dispute.reason));
  return dispute.status === 'answered' ? t('domain.dispute.answered', { reason }) : reason;
}

// ── the courier's side ──────────────────────────────────────────────────────

/**
 * What a courier can flag, in the order these happen on the road.
 *
 * Nobody home is far and away the common case, so it leads. "Autre" is last for
 * the same reason it is last in `disputeReasons`: a list that opens with an
 * escape hatch collects nothing but escape hatches.
 */
export const courierIssueReasons: CourierIssueReason[] = [
  'customer_absent',
  'wrong_address',
  'access_problem',
  'shop_not_ready',
  'order_incomplete',
  'other',
];

export function courierIssueKey(reason: CourierIssueReason): MessageKey {
  return `domain.courierIssueReason.${reason}` as MessageKey;
}

/**
 * Whether the courier can still flag this run.
 *
 * The mirror image of `canOpenDispute`: a courier reports *during* the run,
 * because the whole point is that something is blocking them right now. Once the
 * order is delivered there is nothing left to unblock, and one report per run —
 * a second would overwrite the first.
 */
export function canReportIssue(order: Order): boolean {
  if (order.courierIssue) return false;
  return order.status === 'ready' || order.status === 'out_for_delivery';
}
