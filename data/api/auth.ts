import { supabase } from '../../lib/supabase';
import { api, ApiError } from '../http';
import type { Address, ID, User, UserRole } from '../types';

/** What went wrong, as a code. The words are `auth.error.*` in the catalogue. */
export type AuthErrorCode = 'no_such_account' | 'email_taken' | 'user_not_found';

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

export async function signIn(email: string, password: string): Promise<User> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    // Supabase answers "Invalid login credentials" for both a wrong password
    // and an unknown address, deliberately — telling them apart would let
    // someone enumerate who has an account. The app keeps that property.
    throw new AuthError('no_such_account');
  }
  return currentUser();
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  referralCode?: string
): Promise<User> {
  const { error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    // Read by the `handle_new_user` trigger, which creates the `profiles` row
    // in the same transaction as the account — so the name is on the profile
    // before this function's next line runs.
    options: { data: { full_name: fullName.trim() } },
  });
  if (error) {
    if (/already/i.test(error.message)) throw new AuthError('email_taken');
    throw new AuthError('no_such_account');
  }

  if (referralCode) {
    // Best-effort, exactly as the mock had it: an unknown code is a silent
    // no-op, not a failed signup. A referral is a bonus for both sides, not a
    // gate on using the account.
    await api('/me/referral', { method: 'POST', body: { code: referralCode } }).catch(() => undefined);
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
  throw new AuthError('no_such_account');
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
