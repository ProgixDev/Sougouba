import { supabase } from '../../lib/supabase';
import { api, ApiError } from '../http';
import type { Address, ID, User, UserRole } from '../types';

/** What went wrong, as a code. The words are `auth.error.*` in the catalogue. */
export type AuthErrorCode =
  | 'user_not_found'
  | 'code_invalid'
  | 'code_expired'
  | 'code_cooldown'
  | 'oauth_unavailable';

/**
 * An API layer must not return display copy.
 *
 * The screen maps the code through `t()`. This was written for the mock and is
 * unchanged by the cutover — which is the point: it was always the shape a real
 * client would need, and it is what lets the sign-in screen stay untouched.
 */
export class AuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
  }
}

/**
 * The account, assembled.
 *
 * `User` is richer than the API's `/me` profile — it carries the favourites and
 * the address book, which the API serves from their own endpoints. Composed
 * here rather than widened server-side: `/me` is read on nearly every screen and
 * making it join three tables to serve one that needs them would tax all of them.
 *
 * The three reads run together; a failure in any is a failure to sign in, which
 * is correct — a session whose address book silently came back empty would put
 * a shopper at checkout with nowhere to deliver.
 */
async function currentUser(): Promise<User> {
  const [profile, favProducts, favVendors, addresses] = await Promise.all([
    api<Record<string, any>>('/me'),
    api<{ productId: ID }[]>('/me/favorites/products'),
    api<{ vendorId: ID }[]>('/me/favorites/vendors'),
    api<Address[]>('/me/addresses'),
  ]);

  return {
    id: profile.id,
    fullName: profile.fullName ?? '',
    email: profile.email ?? '',
    avatarUrl: profile.avatarUrl ?? undefined,
    memberSince: profile.memberSince ?? undefined,
    role: (profile.role ?? null) as UserRole | null,
    vendorId: profile.vendorId ?? undefined,
    courierId: profile.courierId ?? undefined,
    favoriteProductIds: favProducts.map((f) => f.productId),
    favoriteVendorIds: favVendors.map((f) => f.vendorId),
    addresses,
    referredBy: profile.referredBy ?? undefined,
  };
}

const normalise = (email: string) => email.trim().toLowerCase();

/**
 * Step one of the only way in: email a 6-digit code to this address.
 *
 * Sign-in and sign-up are the same call — there are no passwords. The API
 * answers identically whether or not the address has an account, and a
 * second call inside a minute is refused (`code_cooldown`); this is also the
 * "resend".
 */
export async function startEmail(email: string): Promise<void> {
  try {
    await api('/auth/email/start', { method: 'POST', anonymous: true, body: { email: normalise(email) } });
  } catch (error) {
    if (error instanceof ApiError && error.status === 429) throw new AuthError('code_cooldown');
    throw error;
  }
}

/**
 * Step two: trade the code for a session.
 *
 * The API creates the account if there was none and hands back Supabase
 * tokens, installed here with `setSession` — from then on it is an ordinary
 * Supabase session, refreshed and persisted like any other.
 *
 * `isNewUser` means the profile has no name yet. The caller must not put the
 * user in the session store until `completeProfile` has run — the store's
 * user is what the auth gate reads, and it would move on without a name.
 */
export async function verifyEmailCode(email: string, code: string): Promise<{ user: User; isNewUser: boolean }> {
  let session: { accessToken: string; refreshToken: string; isNewUser: boolean };
  try {
    session = await api('/auth/email/verify', {
      method: 'POST',
      anonymous: true,
      body: { email: normalise(email), code },
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) throw new AuthError('code_invalid');
    if (error instanceof ApiError && error.status === 410) throw new AuthError('code_expired');
    throw error;
  }

  const { error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) throw error;

  return { user: await currentUser(), isNewUser: session.isNewUser };
}

/** The last step for a new account: its name, and the referral code if a friend sent them. */
export async function completeProfile(fullName: string, referralCode?: string): Promise<User> {
  await api('/me', { method: 'PATCH', body: { fullName: fullName.trim() } });
  if (referralCode?.trim()) {
    // Best-effort, exactly as the mock had it: an unknown code is a silent
    // no-op, not a failed signup. A referral is a bonus for both sides, not a
    // gate on using the account.
    await api('/me/referral', { method: 'POST', body: { code: referralCode.trim() } }).catch(() => undefined);
  }
  return currentUser();
}

/** One-way: a role, once set, is never rewritten through this endpoint. */
export async function selectRole(_userId: ID, role: UserRole): Promise<User> {
  await api('/me/role', { method: 'PATCH', body: { role } });
  return currentUser();
}

/**
 * Re-read the account after a shop or courier file was created.
 *
 * ⚠️ These were `mockAttachVendor` / `mockAttachCourier`, and they wrote the
 * link themselves. They no longer can, and should not: the API sets
 * `profiles.vendor_id` inside the same transaction that creates the shop
 * (`vendor_apply`), so the link is already true by the time the app asks. All
 * that is left is to pick up the change — the id argument is ignored and kept
 * only so the two demo hooks calling this need no edit.
 */
export async function refreshAfterVendorAttached(_userId: ID, _vendorId: ID): Promise<User> {
  return currentUser();
}

export async function refreshAfterCourierAttached(_userId: ID, _courierId: ID): Promise<User> {
  return currentUser();
}

/**
 * The signed-in account, or undefined.
 *
 * ⚠️ Narrower than the mock's `mockGetUserById`, which could look up *any*
 * account by id because it held the whole table. There is no such endpoint and
 * there should not be: a shopper asking the server for a stranger's profile is
 * exactly what the back office exists to do under an admin guard. Every caller
 * passes the signed-in user's own id, so the argument is checked rather than
 * used.
 */
export async function getUserById(id: ID): Promise<User | undefined> {
  try {
    const user = await currentUser();
    if (user.id !== id) throw new AuthError('user_not_found');
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return undefined;
    throw error;
  }
}

/**
 * ⚠️ Google and Apple sign-in are **not wired**. The mock returned a fabricated
 * account for either provider, which made the buttons look finished; leaving
 * that in place against a real backend would be worse — a tap that appears to
 * sign someone in and does not.
 *
 * Doing it properly needs `expo-auth-session` plus the provider configured in
 * Supabase Auth, and Apple additionally needs the entitlement and an Apple
 * Developer account the client owns. Both are contracted (devis: "auth
 * email/Google/Apple"), neither is done.
 */
export async function oauthContinue(_provider: 'google' | 'apple'): Promise<User> {
  throw new AuthError('oauth_unavailable');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
