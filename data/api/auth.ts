import { referralCodeFor } from '../loyalty';
import { users as seedUsers } from '../seed/users';
import type { ID, User, UserRole } from '../types';
import { delay } from '../utils/delay';
import { generateId } from '../utils/ids';
import { createPersistedTable } from '../utils/persistedTable';

/**
 * The mock "backend"'s account table.
 *
 * Persisted so an account created during a demo survives a restart — otherwise
 * signing back in reports "no such account", which reads as a broken app rather
 * than a mock-data limitation.
 */
const table = createPersistedTable<User>('sougouba-mock-accounts', seedUsers);

/** Copies out so the session store never holds a live reference into the table. */
function snapshot(user: User): User {
  return { ...user };
}

function findByEmail(email: string): User | undefined {
  const normalized = email.trim().toLowerCase();
  return table.rows().find((u) => u.email.toLowerCase() === normalized);
}

/** The code's own id lives nowhere — it is derived, so resolving one back to an account means recomputing it per row. */
function findByReferralCode(code: string): User | undefined {
  const normalized = code.trim().toUpperCase();
  return table.rows().find((u) => referralCodeFor(u.id) === normalized);
}

export class AuthError extends Error {}

export async function mockSignIn(email: string, _password: string): Promise<User> {
  await table.ready;
  await delay(500, 900);
  const user = findByEmail(email);
  if (!user) {
    throw new AuthError('Aucun compte ne correspond à cette adresse courriel.');
  }
  return snapshot(user);
}

/**
 * `referralCode` is optional and best-effort: an unknown or malformed code is
 * silently ignored rather than blocking the account. A referral is a bonus for
 * both sides, not a gate on signing up — Points Sougouba's own anti-fraud rule
 * only kicks in later, when the reward would actually be paid out (see
 * `creditForDeliveredOrder` in `data/api/loyalty.ts`), so there is nothing to
 * enforce here yet.
 */
export async function mockSignUp(
  fullName: string,
  email: string,
  _password: string,
  referralCode?: string
): Promise<User> {
  await table.ready;
  await delay(500, 900);
  if (findByEmail(email)) {
    throw new AuthError('Un compte existe déjà avec cette adresse courriel.');
  }
  const referrer = referralCode?.trim() ? findByReferralCode(referralCode) : undefined;
  const user: User = {
    id: generateId('usr'),
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    memberSince: new Date().toISOString(),
    role: null,
    favoriteProductIds: [],
    favoriteVendorIds: [],
    addresses: [],
    ...(referrer ? { referredBy: referrer.id } : {}),
  };
  await table.add(user);
  return snapshot(user);
}

export async function mockSelectRole(userId: string, role: UserRole): Promise<User> {
  await table.ready;
  await delay(300, 500);
  const user = table.rows().find((u) => u.id === userId);
  if (!user) throw new AuthError('Utilisateur introuvable.');
  user.role = role;
  await table.save(user.id);
  return snapshot(user);
}

/**
 * Link a merchant account to a shop — the moment a registration is approved.
 *
 * No screen in the app calls this, and none should: under the CDC addendum the
 * approval happens in the administration back-office, by a person reading the
 * documents the merchant uploaded. This is the app-side half of that write, kept
 * so the pending state has something real to become when that back-office
 * exists. Until then, `usr_owner_*` accounts arrive already linked from the seed.
 */
export async function mockAttachVendor(userId: string, vendorId: string): Promise<User> {
  await table.ready;
  await delay(200, 400);
  const user = table.rows().find((u) => u.id === userId);
  if (!user) throw new AuthError('Utilisateur introuvable.');
  user.vendorId = vendorId;
  await table.save(user.id);
  return snapshot(user);
}

/**
 * Links an approved courier file to its account.
 *
 * The courier half of `mockAttachVendor`, and the same caveat: the approval
 * itself belongs to the administration back-office. What the app can honestly
 * write is the association, once someone else has decided.
 */
export async function mockAttachCourier(userId: string, courierId: string): Promise<User> {
  await table.ready;
  await delay(200, 400);
  const user = table.rows().find((u) => u.id === userId);
  if (!user) throw new AuthError('Utilisateur introuvable.');
  user.courierId = courierId;
  await table.save(user.id);
  return snapshot(user);
}

/** Read-only lookup by id — `data/api/loyalty.ts` needs the referring account, not the session's own copy. */
export async function mockGetUserById(id: ID): Promise<User | undefined> {
  await table.ready;
  const user = table.rows().find((u) => u.id === id);
  return user ? snapshot(user) : undefined;
}

export async function mockOAuthContinue(provider: 'google' | 'apple'): Promise<User> {
  await table.ready;
  await delay(600, 1000);
  const email = provider === 'google' ? 'demo.google@sougouba.ca' : 'demo.apple@sougouba.ca';
  const existing = findByEmail(email);
  if (existing) return snapshot(existing);
  const user: User = {
    id: generateId('usr'),
    fullName: provider === 'google' ? 'Utilisateur Google' : 'Utilisateur Apple',
    email,
    memberSince: new Date().toISOString(),
    role: null,
    favoriteProductIds: [],
    favoriteVendorIds: [],
    addresses: [],
  };
  await table.add(user);
  return snapshot(user);
}
