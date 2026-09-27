/**
 * Lowercase, accent-free, hyphenated — the shop's own address on the platform.
 * Port of `slugify` in the mobile repo's `data/api/vendors.ts`.
 *
 * The one difference from that original is the accent-stripping step: it writes
 * the combining-marks range as `[̀-ͯ]`, this writes the equivalent
 * `\p{M}` (any Unicode mark). After `NFD` has split "é" into "e" + a combining
 * acute, both match the same characters — `\p{M}` just survives a copy-paste
 * between editors, where a literal escape range is one bad normalisation away
 * from silently becoming something else.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * `vendors.slug` is `NOT NULL UNIQUE`, and two shops called "Marché Sahel" are
 * an ordinary thing rather than an error worth rejecting a registration over.
 * The mock never had to solve this — it fell back to the row id, which is
 * unique but unreadable ("vnd_a8f3…" in the URL of every second shop).
 *
 * `taken` is the set of slugs already in use; the first free `-2`, `-3`, … wins.
 */
export function uniqueSlug(name: string, taken: ReadonlySet<string>, fallback: string): string {
  const base = slugify(name) || fallback;
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return fallback;
}
