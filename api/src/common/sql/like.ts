/**
 * Escape a user-supplied string for use inside a `LIKE`/`ILIKE` pattern.
 *
 * The bug this exists to prevent: `` `%${q}%` `` with `q = "%"` builds the
 * pattern `%%%`, which matches every row — so `GET /products/search?q=%`
 * returns the entire catalogue instead of the near-empty result a literal
 * substring match gives. `_` is the same trap one character at a time.
 *
 * The mobile original these searches port is `name.includes(q)`, which has no
 * pattern syntax at all. This restores that: after escaping, every character
 * the caller typed matches only itself.
 *
 * Postgres's default `LIKE` escape character is a backslash, so the backslash
 * itself has to be escaped first — doing it last would double-escape the
 * backslashes this function just added.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** `foo` → `%foo%`, with any pattern characters in `foo` neutralised. */
export function containsPattern(value: string): string {
  return `%${escapeLikePattern(value)}%`;
}
