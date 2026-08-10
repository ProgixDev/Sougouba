/** Simulates network latency so screens exercise real loading states against mock data. */
export function delay(minMs = 300, maxMs = 800): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, ms));
}
