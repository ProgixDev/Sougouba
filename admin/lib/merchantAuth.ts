'use client';
import { anonymousApiPost, ApiError, merchantApiGet } from './api/client';
import { merchantSupabase } from './supabase';

/**
 * The merchant portal's session — real Supabase Auth, the same account the
 * shop owner uses in the mobile app.
 *
 * Kept separate from `lib/auth.ts` (the platform super-admin session)
 * deliberately: two account kinds, two sessions, two storage keys
 * (`merchantSupabase`). A merchant has no password — like the app, they sign
 * in with a 6-digit code sent to their email, through the API's
 * `/auth/email/start` and `/auth/email/verify`.
 *
 * As with the admin, **the gate is the API's**: every portal call goes to
 * `/vendors/me/*`, which resolves the shop from the token and answers only
 * for it. This file decides what to render, not what may be read.
 */

export interface MerchantSession {
  userId: string;
  vendorId: string;
  vendorName: string;
  /**
   * `approved` is the only status that takes orders; the portal still opens for
   * the others. `subscription_hold` is approved but offline until the monthly
   * subscription is paid.
   */
  vendorStatus: 'pending' | 'approved' | 'suspended' | 'rejected' | 'subscription_hold';
  contactName: string;
  email: string;
  signedInAt: string;
}

/** The sign-in failures the login page words for the merchant. */
export type MerchantSignInError = 'code_invalid' | 'code_expired' | 'cooldown' | 'no_shop' | 'unreachable';

export class MerchantAuthError extends Error {
  constructor(readonly code: MerchantSignInError) {
    super(code);
    this.name = 'MerchantAuthError';
  }
}

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * The signed-in merchant and their shop, or null.
 *
 * Asks the API for the shop each time rather than caching it: a shop's name
 * and status change (an approval, a suspension) without this browser hearing
 * about it. An account with no shop is not a merchant session at all.
 */
export async function getMerchantSession(): Promise<MerchantSession | null> {
  const { data } = await merchantSupabase().auth.getSession();
  if (!data.session) return null;
  try {
    return await sessionFor(data.session.user.last_sign_in_at);
  } catch (error) {
    if (error instanceof MerchantAuthError || (error instanceof ApiError && error.isUnauthenticated)) {
      await merchantSupabase().auth.signOut();
      return null;
    }
    throw error;
  }
}

/** Step one: email a 6-digit code. The API answers the same whether or not the address has an account. */
export async function startMerchantSignIn(email: string): Promise<void> {
  try {
    await anonymousApiPost('/auth/email/start', { email: normalise(email) });
  } catch (error) {
    if (error instanceof ApiError && error.isRateLimited) throw new MerchantAuthError('cooldown');
    if (error instanceof ApiError && error.status === 0) throw new MerchantAuthError('unreachable');
    throw error;
  }
}

/**
 * Step two: trade the code for a session, then make sure there is a shop
 * behind it.
 *
 * ⚠️ The API's verify step signs in *or signs up*: a code for an address with
 * no account creates one. A stranger who completes it here gets a plain
 * account with no shop, is signed straight back out, and is told to register
 * in the app — the portal never shows them anything.
 */
export async function verifyMerchantSignIn(email: string, code: string): Promise<MerchantSession> {
  let tokens: { accessToken: string; refreshToken: string };
  try {
    tokens = await anonymousApiPost('/auth/email/verify', { email: normalise(email), code: code.trim() });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) throw new MerchantAuthError('code_invalid');
    if (error instanceof ApiError && error.status === 410) throw new MerchantAuthError('code_expired');
    if (error instanceof ApiError && error.isRateLimited) throw new MerchantAuthError('cooldown');
    if (error instanceof ApiError && error.status === 0) throw new MerchantAuthError('unreachable');
    throw error;
  }

  const { error } = await merchantSupabase().auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  if (error) throw error;

  try {
    return await sessionFor(new Date().toISOString());
  } catch (caught) {
    await merchantSupabase().auth.signOut();
    throw caught;
  }
}

export async function merchantSignOut(): Promise<void> {
  await merchantSupabase().auth.signOut();
}

async function sessionFor(signedInAt: string | undefined): Promise<MerchantSession> {
  const [profile, vendor] = await Promise.all([
    merchantApiGet<{ id: string; fullName: string | null; email?: string | null }>('/me'),
    merchantApiGet<{ id: string; name: string; status: MerchantSession['vendorStatus'] }>('/vendors/me').catch(
      (error: unknown) => {
        // 404: this account owns no shop — a customer or a courier, not a merchant.
        if (error instanceof ApiError && error.status === 404) throw new MerchantAuthError('no_shop');
        throw error;
      }
    ),
  ]);
  const { data } = await merchantSupabase().auth.getSession();
  return {
    userId: profile.id,
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorStatus: vendor.status,
    contactName: profile.fullName ?? '',
    email: data.session?.user.email ?? profile.email ?? '',
    signedInAt: signedInAt ?? new Date().toISOString(),
  };
}
