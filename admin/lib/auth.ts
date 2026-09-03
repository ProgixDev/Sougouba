'use client';

import { supabase } from './supabase';

/**
 * The administrator's session — real Supabase Auth.
 *
 * This replaced a hardcoded string comparison against `admin@sougouba.ca` that
 * wrote a session object straight into localStorage. That was a login *screen*,
 * not a login: anyone could set the key by hand, and it produced no credential,
 * so no API call could have been authorised by it.
 *
 * Now `signIn` gets a real access token, and the API verifies it against the
 * Supabase project's JWKS on every request before checking that the account's
 * `profiles.role` is still `admin`. Note where authority lives: **the gate is
 * the API's, not this file's.** Everything here is a convenience for rendering —
 * hiding the sidebar from a signed-out visitor is courtesy, and a non-admin who
 * forced their way to a dashboard route would still get a 403 from every call
 * the page made.
 *
 * The exported surface is deliberately unchanged from the mock — same names,
 * same shapes — so `app/login/page.tsx`, the dashboard layout and `Topbar`
 * needed almost no edits. The one real difference is that `getSession` and
 * `signIn` are now genuinely asynchronous.
 */

export interface AdminSession {
  email: string;
  name: string;
  signedInAt: string;
}

/** Supabase stores `full_name` in user metadata; the seed sets it at creation. */
function sessionFrom(user: { email?: string; user_metadata?: Record<string, unknown> }, signedInAt: string): AdminSession {
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : (user.email ?? 'Administrateur');
  return { email: user.email ?? '', name, signedInAt };
}

/**
 * The current session, or null.
 *
 * Async because Supabase reads the persisted session and silently refreshes an
 * expired access token — the mock could answer synchronously from localStorage
 * because it never had a token to keep alive. Every caller already ran this
 * inside a `useEffect`, so awaiting it changed no component's structure.
 */
export async function getSession(): Promise<AdminSession | null> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) return null;
  return sessionFrom(data.session.user, new Date(data.session.user.last_sign_in_at ?? Date.now()).toISOString());
}

export async function signIn(
  email: string,
  password: string
): Promise<{ ok: true; session: AdminSession } | { ok: false; error: string }> {
  const { data, error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });

  if (error || !data.session) {
    // Supabase's own message is English and leaks whether the address exists;
    // both reasons to replace it with one line that says neither.
    return { ok: false, error: 'Identifiants invalides.' };
  }

  return { ok: true, session: sessionFrom(data.session.user, new Date().toISOString()) };
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut();
}

/**
 * Shown on the login card. These are the credentials `npm run db:seed` creates
 * in the API repo — a real Supabase account, not a bypass, so changing this
 * constant alone grants nothing.
 */
export const DEMO_CREDENTIALS = { email: 'admin@sougouba.ca', password: 'sougouba-admin' };
