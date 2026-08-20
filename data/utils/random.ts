/**
 * Deterministic randomness for the mock layer.
 *
 * Nothing in `data/` may call `Math.random`: the persisted table layers stored
 * rows over the seeds by id, so a generator that shuffled between launches would
 * accumulate duplicates instead of updating rows. These two functions were
 * written out three times across the codebase before they lived here.
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
