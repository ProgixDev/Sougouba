/**
 * Deterministic, obviously-synthetic ids for seeded rows.
 *
 * ── This is the guard that actually protects production ─────────────────────
 *
 * Every row this script writes gets an id beginning `5eed` ("seed", and not a
 * plausible prefix for a real v4 uuid, whose third group always starts `4`).
 * `reset.ts` deletes only rows matching `id::text like '5eed%'`.
 *
 * That makes the teardown *structurally incapable* of deleting a row it did
 * not create — independent of any `--yes` flag, any `NODE_ENV` check, and any
 * mistake in the orchestration. The flags are conveniences; this is the
 * guarantee. Never widen the predicate, and never let a delete in this script
 * be scoped by anything else.
 *
 * Ids being deterministic is what makes the whole seed re-runnable: a second
 * run upserts the same 14 shops and ~250 orders in place rather than doubling
 * them.
 *
 * The shape follows the house style already set by
 * `drizzle/0007_seed_categories.sql`, whose 8 category rows are
 * `7f3a1c00-0000-4000-8000-00000000000X`.
 */

/** Not a valid start to a real uuid's time-low field in practice, and readable as "seed". */
const NAMESPACE = '5eed';

/**
 * One family per table, so two tables can share an index without colliding.
 * Values are frozen — changing one orphans every row previously seeded under it.
 */
export const Family = {
  Profile: 1,
  Vendor: 2,
  Section: 3,
  Product: 4,
  Courier: 5,
  Order: 6,
  OrderItem: 7,
  Address: 8,
  StatusEvent: 9,
} as const;

export type FamilyName = keyof typeof Family;

/**
 * `5eedHHHH-0FFF-4000-8000-NNNNNNNNNNNN` — stable across runs, unmistakable in
 * a table viewer, and **visually distinct in the first eight characters**.
 *
 * That last property is not cosmetic. The dashboard displays an order as
 * `#${id.slice(0, 8)}` everywhere, because a full uuid is unreadable in a
 * table. An earlier version of this put the *family* in those characters, so
 * every seeded order rendered as `#5eed0006` — identical in the list, in the
 * detail heading, and in every search result. Real uuids are random there; the
 * fixtures have to vary there too or they misrepresent the thing they stand in
 * for.
 *
 * So chars 5-8 carry a hash of (family, index) purely for legibility.
 * Uniqueness still comes from the index in the final group, and the family
 * moves to the second group to keep families from colliding.
 */
export function seedId(family: number, n: number): string {
  if (!Number.isInteger(family) || family < 0 || family > 0xfff) {
    throw new RangeError(`seed family out of range: ${family}`);
  }
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffffffff) {
    throw new RangeError(`seed index out of range: ${n}`);
  }
  const label = mix16(family, n).toString(16).padStart(4, '0');
  const fam = family.toString(16).padStart(3, '0');
  const tail = n.toString(16).padStart(12, '0');
  return `${NAMESPACE}${label}-0${fam}-4000-8000-${tail}`;
}

/**
 * A small deterministic mix down to 16 bits. Only ever used for the readable
 * portion above — collisions here are harmless, since two ids differing only
 * in this field still differ in the index group.
 */
function mix16(family: number, n: number): number {
  let h = 2166136261 ^ family;
  h = Math.imul(h ^ (n & 0xffff), 16777619);
  h = Math.imul(h ^ (n >>> 16), 16777619);
  return (h ^ (h >>> 16)) & 0xffff;
}

/**
 * The predicate every delete is scoped by. Anchored at the start — a
 * `like '%5eed%'` would match a real uuid that merely contains those hex
 * digits somewhere, which is exactly the kind of near-miss that deletes
 * production data.
 */
export function isSeedId(id: string): boolean {
  return id.startsWith(NAMESPACE);
}

/** The SQL fragment used by `reset.ts`. Exported so a test can assert it stays anchored. */
export const SEED_ID_LIKE_PATTERN = `${NAMESPACE}%`;

/**
 * Seeded accounts live in Supabase's `auth.users`, where GoTrue assigns the
 * ids — so they fall outside the uuid namespace above and need their own
 * marker. `example.com` is IANA-reserved and can never receive mail.
 */
export const SEED_EMAIL_PREFIX = 'seed.';
export const SEED_EMAIL_DOMAIN = '@example.com';

export function seedEmail(key: string): string {
  return `${SEED_EMAIL_PREFIX}${key}${SEED_EMAIL_DOMAIN}`;
}

/** True only for an address this script would have created. */
export function isSeedEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.startsWith(SEED_EMAIL_PREFIX) && email.endsWith(SEED_EMAIL_DOMAIN);
}
