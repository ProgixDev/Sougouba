/**
 * Creates the seed's Supabase accounts through the **Auth Admin API**.
 *
 * ── Why not `insert into auth.users` ────────────────────────────────────────
 *
 * The API's pooler role *can* write to the `auth` schema, so a direct insert
 * looks like it works: the row appears, `profiles.id`'s foreign key is
 * satisfied, and every seeded screen renders. Then sign-in fails, days later,
 * with a `converting NULL to string is unsupported` error thrown from inside
 * GoTrue — because `auth.users` carries a dozen NOT NULL columns defaulted to
 * the empty string (`confirmation_token`, `recovery_token`, `email_change`,
 * `email_change_token_new`, …) that a hand-written insert leaves null. That
 * failure surfaces at the login screen and reads like a password problem.
 *
 * The column set also changes between GoTrue versions. The Admin API is the
 * contract; the table is an implementation detail.
 *
 * Plain `fetch`, no `@supabase/supabase-js`: this repo does not depend on it
 * and four REST calls do not justify adding it.
 */

export interface SeedPerson {
  /** Stable key used to derive the email and to look the id up afterwards. */
  key: string;
  email: string;
  fullName: string;
  password: string;
}

export interface AuthConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
}

interface GoTrueUser {
  id: string;
  email?: string | null;
}

function headers(cfg: AuthConfig): Record<string, string> {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

/** Every existing account, as `email → id`. Paged, because the default page is small. */
async function existingByEmail(cfg: AuthConfig): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let page = 1; page <= 50; page += 1) {
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: headers(cfg),
    });
    if (!res.ok) throw new Error(`Listing auth users failed (${res.status}): ${await res.text()}`);
    const body = (await res.json()) as { users?: GoTrueUser[] };
    const users = body.users ?? [];
    for (const u of users) if (u.email) found.set(u.email.toLowerCase(), u.id);
    if (users.length < 200) break;
  }
  return found;
}

/**
 * Ensures every person exists as an `auth.users` row and returns `key → uuid`.
 *
 * This is the **only** place a profile id is decided — every downstream insert
 * reads from the returned map. That is deliberate: it works identically whether
 * GoTrue assigned the id or we did, so the seed does not depend on the Admin
 * API accepting an explicit `id`, which is undocumented enough not to build on.
 *
 * Re-runnable: existing accounts are matched by email and left alone. The
 * `handle_new_user` trigger creates `public.profiles` on insert, reading
 * `full_name` out of `user_metadata` — so nothing here inserts a profile, and
 * the caller updates it afterwards for role, vendor/courier links and dates.
 */
export async function ensureAuthUsers(
  cfg: AuthConfig,
  people: SeedPerson[]
): Promise<{ ids: Map<string, string>; created: number; reused: number }> {
  const existing = await existingByEmail(cfg);
  const ids = new Map<string, string>();
  let created = 0;
  let reused = 0;

  // Small concurrency: GoTrue hashes a password per create (bcrypt, deliberately
  // slow), so serial is needlessly slow and a big fan-out just gets rate-limited.
  const QUEUE = 4;
  let cursor = 0;

  async function worker() {
    while (cursor < people.length) {
      const person = people[cursor++];
      const already = existing.get(person.email.toLowerCase());
      if (already) {
        ids.set(person.key, already);
        reused += 1;
        continue;
      }

      const res = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: headers(cfg),
        body: JSON.stringify({
          email: person.email,
          password: person.password,
          // Sets `email_confirmed_at` and, crucially, sends no confirmation
          // email — otherwise seeding mails every fixture address.
          email_confirm: true,
          user_metadata: { full_name: person.fullName },
        }),
      });

      if (!res.ok) throw new Error(`Creating ${person.email} failed (${res.status}): ${await res.text()}`);
      const user = (await res.json()) as GoTrueUser;
      ids.set(person.key, user.id);
      created += 1;
    }
  }

  await Promise.all(Array.from({ length: Math.min(QUEUE, people.length) }, worker));
  return { ids, created, reused };
}

/**
 * Deletes only accounts whose address this seed would have produced.
 *
 * Auth users sit outside the `5eed…` uuid namespace because GoTrue assigns
 * their ids, so the email prefix is their equivalent guard — see `ids.ts`.
 * The admin account is deliberately **not** matched by it and survives a reset.
 */
export async function deleteSeedAuthUsers(
  cfg: AuthConfig,
  isSeedEmail: (email: string | null | undefined) => boolean
): Promise<number> {
  const existing = await existingByEmail(cfg);
  let deleted = 0;
  for (const [email, id] of existing) {
    if (!isSeedEmail(email)) continue;
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users/${id}`, {
      method: 'DELETE',
      headers: headers(cfg),
    });
    if (!res.ok) throw new Error(`Deleting ${email} failed (${res.status}): ${await res.text()}`);
    deleted += 1;
  }
  return deleted;
}
