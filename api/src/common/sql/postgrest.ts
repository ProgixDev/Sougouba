/**
 * Quoting for values that go inside a PostgREST `or=(…)` / `and=(…)` filter.
 *
 * `escapeLikePattern` neutralises the *pattern* metacharacters (`% _ \`). This
 * is the second, separate escaping problem underneath it: PostgREST's filter
 * grammar is itself comma- and parenthesis-delimited, so
 *
 *     .or(`name.ilike.${pattern},specialty_fr.ilike.${pattern}`)
 *
 * breaks the moment the shopper types a comma — `?q=riz,mais` splits into three
 * malformed conditions and the request either errors or, worse, filters on
 * something nobody asked for. A closing parenthesis ends the group early.
 *
 * PostgREST's answer is to double-quote the value, inside which `"` and `\`
 * are backslash-escaped. Drizzle never had this problem because the value
 * travelled as a bind parameter and never touched the query text; over HTTP
 * the filter *is* text, so the escaping has to be explicit.
 *
 * ⚠️ Every `.or()` built from user input must pass its values through here.
 */
export function quoteFilterValue(value: string): string {
  return `"${value.replace(/[\\"]/g, (char) => `\\${char}`)}"`;
}

/** `['name','specialty_fr']`, `'%riz%'` → `name.ilike."%riz%",specialty_fr.ilike."%riz%"` */
export function orIlike(columns: string[], pattern: string): string {
  const quoted = quoteFilterValue(pattern);
  return columns.map((column) => `${column}.ilike.${quoted}`).join(',');
}
