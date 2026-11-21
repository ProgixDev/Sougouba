import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { PickedImage } from '../../hooks/useImagePicker';
import { supabase } from '../../lib/supabase';
import { api, ApiError } from '../http';
import type { Address, ID, User, UserRole } from '../types';
import { uploadMediaImage, type MediaImageType } from './media';

/** What went wrong, as a code. The words are `auth.error.*` in the catalogue. */
export type AuthErrorCode =
  | 'user_not_found'
  | 'code_invalid'
  | 'code_expired'
  | 'code_cooldown'
  | 'oauth_unavailable'
  | 'oauth_failed';

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

/** Upload a new profile photo and return the Storage path to save as `avatarUrl`. */
export async function uploadAvatar(image: PickedImage, contentType: MediaImageType): Promise<string> {
  return uploadMediaImage('/me/avatar-upload', image, contentType);
}

/** Save the profile: name and/or photo path (`''` removes the photo). */
export async function updateProfile(patch: { fullName?: string; avatarUrl?: string }): Promise<void> {
  await api('/me', { method: 'PATCH', body: patch });
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
 * Where the provider sends the browser back to: `sougouba://auth/callback`.
 * Must be in Supabase → Authentication → URL Configuration → Redirect URLs
 * (`sougouba://**` covers it), or Supabase falls back to the Site URL and the
 * browser never returns to the app.
 */
const OAUTH_REDIRECT = Linking.createURL('auth/callback');

/**
 * Sign in with Google or Apple, through Supabase Auth.
 *
 * Apple is native, not a browser round trip: iOS shows its own sheet and hands
 * back an identity token, which Supabase verifies against Apple's keys
 * (`signInWithIdToken`). That needs only the bundle id in Supabase's Apple
 * "Client IDs" — no Services ID, no `.p8`, no secret to rotate every six
 * months. The button is iOS-only (`welcome.tsx`), which is also where Apple's
 * guideline 4.8 requires it.
 *
 * Google goes through the browser, described below.
 *
 * Supabase builds the provider URL; the system browser shows the provider's
 * own sign-in page (`openAuthSessionAsync` — ASWebAuthenticationSession on
 * iOS, a Custom Tab on Android), and comes back to `OAUTH_REDIRECT` with a
 * one-time code that is exchanged here for an ordinary Supabase session. From
 * then on it is the same session the email code produces, and the API sees no
 * difference.
 *
 * The account is created by Supabase on first sign-in, and the profile by the
 * same `auth.users` trigger as every other account — with the name Google
 * supplied (`raw_user_meta_data.full_name`), so most Google sign-ups skip the
 * name step. `isNewUser` means the same thing it does for the email flow: the
 * profile still has no name.
 *
 * Returns null when the shopper closed the browser — a choice, not an error.
 */
export async function oauthContinue(provider: 'google' | 'apple'): Promise<{ user: User; isNewUser: boolean } | null> {
  if (provider === 'apple') return appleSignIn();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) throw new AuthError('oauth_failed');

  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
  if (result.type !== 'success') return null;

  const params = callbackParams(result.url);
  // The provider or Supabase refused — a denied consent screen, a provider
  // that is switched off in the dashboard, a redirect URL not on the list.
  if (params.error || !params.code) throw new AuthError('oauth_failed');

  const exchanged = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchanged.error) throw new AuthError('oauth_failed');

  const user = await currentUser();
  return { user, isNewUser: !user.fullName.trim() };
}

async function appleSignIn(): Promise<{ user: User; isNewUser: boolean } | null> {
  if (!(await AppleAuthentication.isAvailableAsync())) throw new AuthError('oauth_unavailable');

  // Replay protection: Apple signs the *hash* into the token, Supabase is given
  // the raw value and checks the two agree. A token lifted from somewhere else
  // carries someone else's nonce and is refused.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw new AuthError('oauth_failed');
  }
  if (!credential.identityToken) throw new AuthError('oauth_failed');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw new AuthError('oauth_failed');

  // ⚠️ Apple gives the name **once**, on the very first sign-in, and never
  // again — not in the token, not on the next sign-in. The profile was just
  // created nameless by the `auth.users` trigger, so it is written now or it
  // is gone (the shopper would be asked for it by the name step instead).
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(' ').trim();
  let user = await currentUser();
  if (name && !user.fullName.trim()) {
    await api('/me', { method: 'PATCH', body: { fullName: name } }).catch(() => undefined);
    user = await currentUser();
  }
  return { user, isNewUser: !user.fullName.trim() };
}

/** Query and fragment, merged — Supabase reports errors in either, depending on where the flow failed. */
function callbackParams(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const [beforeHash, hash = ''] = url.split('#');
  const query = beforeHash.includes('?') ? beforeHash.slice(beforeHash.indexOf('?') + 1) : '';
  for (const part of [query, hash]) {
    for (const [key, value] of new URLSearchParams(part)) out[key] = value;
  }
  return out;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Deletes the signed-in account, permanently. The API refuses with a 409 and a
 * sentence to show while an order is still in progress.
 *
 * ⚠️ This does not end the local session — the caller follows it with the
 * session store's `signOut`, which is what clears this device.
 */
export async function deleteAccount(): Promise<void> {
  await api<void>('/me', { method: 'DELETE' });
}
