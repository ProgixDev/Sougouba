/**
 * Drizzle returned camelCase properties; PostgREST returns the column names,
 * which are snake_case. The admin dashboard is already wired to this API and
 * the mobile cutover is written against the same shapes, so the wire contract
 * must not move — these translate at the data-layer boundary instead.
 *
 * Deep by design: PostgREST embeds (`select('*, order_items(*)')`) nest rows,
 * and those need the same treatment as the top level.
 *
 * ⚠️ `OPAQUE_KEYS` are columns whose *value* is caller-authored JSON, not a
 * row. `admin_audit_log.changes` holds `{field: {before, after}}` where the
 * field names are database column names by definition — camelising them would
 * rewrite the evidence the audit log exists to preserve. Anything jsonb added
 * later belongs in this list unless it is genuinely a nested row.
 */
const OPAQUE_KEYS = new Set(['changes']);

const toCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function convert(value: unknown, key: (k: string) => string): unknown {
  if (Array.isArray(value)) return value.map((v) => convert(v, key));
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[key(k)] = OPAQUE_KEYS.has(k) ? v : convert(v, key);
  }
  return out;
}

/** Rows out of PostgREST → the camelCase shape every existing consumer expects. */
export function camelize<T>(value: unknown): T {
  return convert(value, toCamel) as T;
}

/** Insert/update payloads written in camelCase → the column names PostgREST wants. */
export function snakeize<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return convert(value, toSnake) as Record<string, unknown>;
}
