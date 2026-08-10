import type { Order } from '@/data/types';

/**
 * The short code a shop and a customer use to talk about one order.
 *
 * Order ids are internal — seeded ones look like `ord_g3_004`, runtime ones like
 * `ord_m1x9k2`, and both were being shown to users by stripping the prefix.
 * Neither is something a merchant can read down a phone line. Hashing to four
 * hex characters gives a stable, pronounceable reference that stays the same for
 * the life of the order and does not leak how many orders the system has.
 */
export function orderReference(order: Order): string {
  return `#${hash(order.id).toString(16).toUpperCase().padStart(4, '0').slice(-4)}`;
}

/** FNV-1a, so the same id always yields the same reference. */
function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
