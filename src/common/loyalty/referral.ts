/**
 * Direct port of `data/loyalty.ts` + `data/utils/random.ts` (`hashString`) in
 * the mobile repo. This exact pair of functions is the one place a referral
 * code is computed — see `drizzle/0004_profile_creation_trigger.sql`'s
 * comment for why that migration deliberately does *not* reimplement this in
 * plpgsql. If either function changes, it must change in both repos at once,
 * or an account's own code (or a friend's, typed in) stops resolving.
 */

/** FNV-1a. Turns an id into a stable, well-distributed 32-bit unsigned value. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A shopper's own referral code, derived from their account id rather than
 * stored on it — hashed rather than a literal id suffix, because two
 * accounts that happen to share a name suffix would otherwise collide (a
 * real bug this session's own `scripts/verify-loyalty.ts` caught once).
 */
export function referralCodeFor(userId: string): string {
  const code = hashString(userId).toString(36).toUpperCase().padStart(6, '0').slice(-6);
  return `SGB-${code}`;
}
