'use client';

/**
 * Mock admin session — a stand-in for real Supabase-Auth-with-an-`admin`-role,
 * which is a Phase 8 backend concern (see docs/BACKEND-BUILD-PHASES.md). This
 * is a frontend prototype's login gate, not a security boundary.
 */
const SESSION_KEY = 'sougouba-admin-session';
const DEMO_EMAIL = 'admin@sougouba.ca';
const DEMO_PASSWORD = 'sougouba-admin';

export interface AdminSession {
  email: string;
  name: string;
  signedInAt: string;
}

export function getSession(): AdminSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AdminSession) : null;
  } catch {
    return null;
  }
}

export function signIn(email: string, password: string): { ok: true; session: AdminSession } | { ok: false; error: string } {
  if (email.trim().toLowerCase() !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return { ok: false, error: 'Identifiants invalides.' };
  }
  const session: AdminSession = { email: DEMO_EMAIL, name: 'Salif Sogodogo', signedInAt: new Date().toISOString() };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function signOut(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

export const DEMO_CREDENTIALS = { email: DEMO_EMAIL, password: DEMO_PASSWORD };
