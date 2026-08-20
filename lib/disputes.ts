import type { CourierIssueReason, DisputeReason, Order, OrderDispute } from '@/data/types';

/**
 * The reasons a shopper can pick, in the order they are offered.
 *
 * Ordered by how often they actually happen in grocery delivery — a missing item
 * is the common case and belongs first, "Autre" last because a list that opens
 * with an escape hatch gets nothing but escape hatches.
 */
export const disputeReasons: { key: DisputeReason; label: string }[] = [
  { key: 'missing_items', label: 'Articles manquants' },
  { key: 'wrong_order', label: 'Commande incorrecte' },
  { key: 'quality', label: 'Qualité du produit' },
  { key: 'late', label: 'Livraison en retard' },
  { key: 'other', label: 'Autre' },
];

const labelByReason = new Map(disputeReasons.map((r) => [r.key, r.label]));

export function disputeReasonLabel(reason: DisputeReason): string {
  return labelByReason.get(reason) ?? 'Autre';
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

/** One line for a list row — what the merchant sees before opening the ticket. */
export function disputeSummary(dispute: OrderDispute): string {
  return dispute.status === 'answered'
    ? `${disputeReasonLabel(dispute.reason)} · répondu`
    : disputeReasonLabel(dispute.reason);
}

// ── the courier's side ──────────────────────────────────────────────────────

/**
 * What a courier can flag, in the order these happen on the road.
 *
 * Nobody home is far and away the common case, so it leads. "Autre" is last for
 * the same reason it is last in `disputeReasons`: a list that opens with an
 * escape hatch collects nothing but escape hatches.
 */
export const courierIssueReasons: { key: CourierIssueReason; label: string }[] = [
  { key: 'customer_absent', label: 'Client absent' },
  { key: 'wrong_address', label: 'Adresse incorrecte' },
  { key: 'access_problem', label: 'Accès impossible' },
  { key: 'shop_not_ready', label: 'Commande pas prête' },
  { key: 'order_incomplete', label: 'Commande incomplète' },
  { key: 'other', label: 'Autre' },
];

const labelByIssue = new Map(courierIssueReasons.map((r) => [r.key, r.label]));

export function courierIssueLabel(reason: CourierIssueReason): string {
  return labelByIssue.get(reason) ?? 'Autre';
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
