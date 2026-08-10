import type { OrderStatus } from '@/data/types';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'secondary' | 'destructive';

interface StatusMeta {
  label: string;
  tone: BadgeTone;
}

/** French label + badge tone for every order status. One place, so lists and detail agree. */
export const orderStatusMeta: Record<OrderStatus, StatusMeta> = {
  pending: { label: 'En attente', tone: 'neutral' },
  confirmed: { label: 'Confirmée', tone: 'primary' },
  preparing: { label: 'En préparation', tone: 'warning' },
  ready: { label: 'Prête', tone: 'primary' },
  out_for_delivery: { label: 'En livraison', tone: 'secondary' },
  delivered: { label: 'Livrée', tone: 'success' },
  cancelled: { label: 'Annulée', tone: 'destructive' },
};

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

/** Short, human summary for a list row. */
export function orderSummaryLine(itemCount: number): string {
  return itemCount === 1 ? '1 article' : `${itemCount} articles`;
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
 * Imperative label for the advance button, phrased as the action the shop is
 * taking rather than the state it lands in ("Accepter", not "Confirmée") — a
 * button labelled with a past participle reads as a status, not a control.
 */
const ADVANCE_LABELS: Record<OrderStatus, string> = {
  pending: 'Accepter la commande',
  confirmed: 'Commencer la préparation',
  preparing: 'Marquer comme prête',
  ready: 'Confier au livreur',
  out_for_delivery: 'Marquer comme livrée',
  delivered: '',
  cancelled: '',
};

export function advanceActionLabel(status: OrderStatus): string | null {
  return nextStatus(status) ? ADVANCE_LABELS[status] : null;
}
