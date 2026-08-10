let counter = 0;

/** Deterministic-enough id generator for runtime-created mock records (new orders, addresses, products). */
export function generateId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}`;
}
