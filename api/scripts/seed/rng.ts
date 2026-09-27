/**
 * Deterministic randomness for the seed.
 *
 * Transcribed verbatim from the mobile repo's `data/utils/random.ts`, which is
 * also what `admin/lib/api/seed.ts` draws its mock data from. Keeping the exact
 * algorithm means the seeded database and the dashboard's existing mock produce
 * *the same shaped* dataset — same distribution of statuses, same rough order
 * counts per shop — so a screen that changes when the wiring lands is a bug,
 * not a data difference.
 *
 * Copied rather than imported: this repo has no path to `../sougouba/data/`,
 * and adding one would make CI depend on a sibling checkout it does not have.
 *
 * Nothing here may call `Math.random`. Every id is deterministic so a re-run
 * upserts in place; a shuffling generator would make each run write a different
 * dataset over the last one.
 */

/** Small, well-distributed PRNG, stable across engines. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a. Turns an id into a seed, or into a stable index into a fixed list. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Integer in `[min, max]`, inclusive at both ends. */
export function intBetween(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

/** One element, uniformly. Throws on an empty list rather than returning undefined. */
export function pick<T>(rand: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() called with an empty list');
  return items[Math.floor(rand() * items.length)];
}

/**
 * Money as **integer cents**, formatted for a `numeric` column.
 *
 * Every amount in the seed is computed in cents and only becomes a string at
 * the boundary. Handing Drizzle a JS `number` for a `numeric` column is the
 * conversion `src/catalog/mappers.ts` warns about at length: a float cannot
 * hold `0.1 + 0.2`, and an order whose parts do not sum to its total is a
 * dataset that makes every downstream total look broken.
 */
export function cents(value: number): string {
  return (Math.round(value) / 100).toFixed(2);
}
