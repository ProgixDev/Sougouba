/**
 * PostgREST decides an embedded resource's cardinality from the constraints it
 * finds: a one-to-one relationship (the foreign key is unique or a primary key)
 * comes back as an object, a one-to-many as an array. That detection depends on
 * the schema, not on the query — so a relationship that is 1:1 today returns an
 * object, and the same select against a table that later loses its unique
 * constraint silently starts returning an array.
 *
 * Drizzle's relational builder decided this from the declared relation and
 * never changed shape underneath a caller. `one()` restores that: it takes
 * whichever PostgREST sent and yields the single row or null.
 *
 * Only for relationships that genuinely are 1:1 — an order's delivery, a
 * delivery's proof, an order's dispute. Using it on a real one-to-many would
 * silently discard every row but the first.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length > 0 ? value[0] : null;
  return value;
}

/** The array side of the same problem, for embeds that are genuinely one-to-many. */
export function many<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
