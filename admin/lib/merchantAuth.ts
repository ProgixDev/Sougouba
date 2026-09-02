'use client';
import { getSeed } from './api/seed';

/**
 * Mock merchant-portal session — the CDC's second back-office surface: a
 * shop's own order list/detail, scoped to their own vendorId. Kept separate
 * from `lib/auth.ts` (the platform super-admin session) deliberately: they
 * are two different account kinds that should never be confused for one
 * another, even in a shared mock layer.
 */
const SESSION_KEY = 'sougouba-merchant-session';
const DEMO_PASSWORD = 'sougouba-merchant';

export interface MerchantSession {
  userId: string;
  vendorId: string;
  vendorName: string;
  contactName: string;
  email: string;
  signedInAt: string;
}

export function getMerchantSession(): MerchantSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as MerchantSession) : null;
  } catch {
    return null;
  }
}

export function merchantSignIn(email: string, password: string): { ok: true; session: MerchantSession } | { ok: false; error: string } {
  if (password !== DEMO_PASSWORD) {
    return { ok: false, error: 'Identifiants invalides.' };
  }
  const { users, vendors } = getSeed();
  const user = users.find((u) => u.role === 'business' && u.email.toLowerCase() === email.trim().toLowerCase());
  const vendor = user?.vendorId ? vendors.find((v) => v.id === user.vendorId) : undefined;
  if (!user || !vendor) {
    return { ok: false, error: 'Identifiants invalides.' };
  }
  const session: MerchantSession = {
    userId: user.id,
    vendorId: vendor.id,
    vendorName: vendor.name,
    contactName: user.fullName,
    email: user.email,
    signedInAt: new Date().toISOString(),
  };
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return { ok: true, session };
}

export function merchantSignOut(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_KEY);
}

/** A couple of real seeded shop owners, so the demo login screen can suggest one. */
export function demoMerchantAccounts(): { email: string; vendorName: string }[] {
  const { users, vendors } = getSeed();
  return users
    .filter((u) => u.role === 'business' && u.vendorId)
    .slice(0, 3)
    .map((u) => ({ email: u.email, vendorName: vendors.find((v) => v.id === u.vendorId)?.name ?? u.vendorId! }));
}

export const MERCHANT_DEMO_PASSWORD = DEMO_PASSWORD;
