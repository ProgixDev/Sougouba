import type { LoyaltyReason } from '@/data/types';

/**
 * French label for each `LoyaltyReason` — the points-ledger twin of
 * `orderStatusMeta` in `lib/orderStatus.ts`. One place, so the history list and
 * anywhere else a transaction is named agree.
 */
export const loyaltyReasonLabel: Record<LoyaltyReason, string> = {
  order_delivered: 'Commande livrée',
  referral_referred: 'Parrainage — bienvenue chez Sougouba',
  referral_referrer: 'Parrainage — un ami vous a rejoint',
  redeemed: 'Utilisés à la commande',
  order_refunded: 'Commande remboursée',
};

/** "+45" or "-500" — the sign is the point, so it is never dropped even though `Intl` would round-trip it fine without. */
export function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}
