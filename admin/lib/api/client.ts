'use client';

import { supabase } from '../supabase';

/**
 * The HTTP layer between this dashboard and `sougouba-api`.
 *
 * Replaces `storage.ts`'s localStorage tables. Every call carries the signed-in
 * administrator's Supabase access token; the API verifies it against the
 * project's JWKS and then checks `profiles.role = 'admin'` on every request —
 * the role is a live database lookup, not a JWT claim, so revoking someone's
 * admin rights takes effect immediately rather than when their token expires.
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * A failed API call, carrying enough for a caller to react rather than just
 * apologise.
 *
 * The API's error envelope is uniform — `{ statusCode, error, message, path,
 * timestamp }` — with one wrinkle: **`message` is a string array for validation
 * failures and a plain string for everything else.** Both are normalised here so
 * no call site has to remember.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Field-level messages from a Zod failure, empty for other errors. */
    readonly issues: string[] = []
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Not signed in, or the token expired mid-session. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** Signed in, but the account is not an administrator. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /**
   * The approvals race: `POST /admin/vendors/:id/approve` and its siblings
   * update `where status = <what we just read>`, so a decision made in another
   * tab loses this one with a 400. It is not bad input — the right response is
   * to refetch the queue and show the current state, not a validation error.
   */
  get isStaleDecision(): boolean {
    return this.status === 400 && /décidé|someone else|already/i.test(this.message);
  }

  /** The `/admin` budget is 120 requests/minute, keyed by account. */
  get isRateLimited(): boolean {
    return this.status === 429;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  // `getSession()` refreshes an expired token transparently, which is why this
  // is read per request rather than captured once at sign-in.
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, 'Session expirée. Reconnectez-vous.');
  return { Authorization: `Bearer ${token}` };
}

function buildUrl(path: string, params?: QueryParams): string {
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, BASE.endsWith('/') ? BASE : `${BASE}/`);
  for (const [key, value] of Object.entries(params ?? {})) {
    // Undefined means "don't filter by this". Sending `?status=undefined`
    // would be a 400 from the enum, which is how an unset filter turns into a
    // broken page.
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function request<T>(method: string, path: string, opts: { params?: QueryParams; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { ...(await authHeaders()) };
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.params), {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
  } catch {
    // A network-level failure, which in development almost always means the
    // API is not running. Says so, rather than "Failed to fetch".
    throw new ApiError(0, `Impossible de joindre l'API (${BASE}). Est-elle démarrée ?`);
  }

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const raw = (payload as { message?: string | string[] } | null)?.message;
    const issues = Array.isArray(raw) ? raw : [];
    const message = Array.isArray(raw) ? raw.join(' · ') : (raw ?? `Erreur ${res.status}`);
    throw new ApiError(res.status, message, issues);
  }

  return payload as T;
}

export const apiGet = <T>(path: string, params?: QueryParams) => request<T>('GET', path, { params });
export const apiPost = <T>(path: string, body?: unknown) => request<T>('POST', path, { body });
export const apiPatch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body });

/** The envelope every paginated admin list returns. */
export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * `GET /admin/orders/:id` and friends 404 for an id that does not exist, which
 * for a detail page is a normal outcome rather than an error — it renders
 * "introuvable". Everything else still throws.
 */
export async function apiGetOrNull<T>(path: string, params?: QueryParams): Promise<T | null> {
  try {
    return await apiGet<T>(path, params);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
