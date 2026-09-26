import type { LoyaltyReason } from '@/data/types';
import type { MessageKey } from '@/lib/i18n';

/**
 * The key naming each `LoyaltyReason` — the points-ledger twin of
 * `orderStatusKey` in `lib/orderStatus.ts`. One place, so the history list and
 * anywhere else a transaction is named agree. Wording is `domain.loyaltyReason.*`.
 */
export function loyaltyReasonKey(reason: LoyaltyReason): MessageKey {
  return `domain.loyaltyReason.${reason}` as MessageKey;
}

/** "+45" or "-500" — the sign is the point, so it is never dropped even though `Intl` would round-trip it fine without. */
export function formatPoints(points: number): string {
  return points > 0 ? `+${points}` : String(points);
}
