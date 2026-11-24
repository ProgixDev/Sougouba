import { createHmac } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import type { Locale } from '../../notifications/messages.js';

/**
 * A short-lived link to one receipt's PDF.
 *
 * The app opens a receipt in the system browser (`expo-web-browser`), and a
 * browser cannot send the shopper's bearer token. So the API hands the app a
 * URL that *is* the credential: a signed token naming one order, good for a
 * few minutes. Whoever holds the link can read that one receipt until it
 * lapses, and nothing else, ever — which is the same exposure as the PDF itself
 * sitting in a downloads folder.
 *
 * Signed rather than stored: there is no table of issued links to clean up, and
 * a link cannot be forged or pointed at another order without the key.
 */

/** Long enough to open, save and share; short enough that a pasted link is dead by the time it travels. */
export const RECEIPT_LINK_TTL_SECONDS = 10 * 60;

const AUDIENCE = 'sougouba:receipt';
const ALGORITHM = 'HS256';

/**
 * The signing key, derived from a secret the API already holds.
 *
 * One-way: the key says nothing about the secret it came from. Deriving it
 * means a deploy needs no new variable to start issuing links — and rotating
 * the service-role key retires every outstanding link with it, which is the
 * right side effect.
 */
export function receiptLinkKey(secret: string): Uint8Array {
  return createHmac('sha256', secret).update('sougouba:receipt-link:v1').digest();
}

export interface ReceiptLinkClaims {
  orderId: string;
  /** The language the PDF is drawn in — the one the app was showing when it asked. */
  locale: Locale;
}

export async function signReceiptLink(
  claims: ReceiptLinkClaims,
  key: Uint8Array,
  now: Date = new Date()
): Promise<{ token: string; expiresAt: string }> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expires = issuedAt + RECEIPT_LINK_TTL_SECONDS;
  const token = await new SignJWT({ lang: claims.locale })
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(claims.orderId)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expires)
    .sign(key);
  return { token, expiresAt: new Date(expires * 1000).toISOString() };
}

/**
 * The order a link names, or null — expired, tampered with, signed by another
 * key and plain garbage all answer alike, so a caller cannot tell a link that
 * used to work from one that never did.
 */
export async function verifyReceiptLink(token: string, key: Uint8Array, now: Date = new Date()): Promise<ReceiptLinkClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { audience: AUDIENCE, algorithms: [ALGORITHM], currentDate: now });
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return { orderId: payload.sub, locale: payload.lang === 'en' ? 'en' : 'fr' };
  } catch {
    return null;
  }
}
