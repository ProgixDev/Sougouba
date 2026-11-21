/**
 * Whether Supabase Auth's `banned_until` blocks the account right now — set by
 * the back office's "Bloquer" (`ApprovalsService.setUserBlocked`). Absent or in
 * the past means not banned.
 */
export function isBanned(bannedUntil: string | null | undefined, now = Date.now()): boolean {
  return Boolean(bannedUntil) && Date.parse(bannedUntil!) > now;
}
