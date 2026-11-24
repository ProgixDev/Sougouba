import { currentAccessToken } from '../lib/supabase';

/**
 * The one place this app talks to the Sougouba API.
 *
 * Every `data/api/*` module goes through here, so the things that must be true
 * of every request — the bearer token, the base URL, French error messages, a
 * timeout — are true once rather than nine times.
 *
 * ── The error contract ──────────────────────────────────────────────────────
 *
 * The API answers failures as `{ statusCode, error, message, path, timestamp }`
 * (see its `HttpExceptionFilter`). `message` is written for a human and is
 * already in French where the rule is a business one — "Ce code promo a atteint
 * sa limite", "NIP incorrect" — so it is surfaced as-is rather than replaced
 * with something vaguer. Anything without a usable `message` gets a generic
 * French fallback, because an English stack-shaped string in a French app is
 * worse than "réessayez".
 */

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!BASE_URL) {
  throw new Error('EXPO_PUBLIC_API_URL must be set. See .env.example.');
}

/** Long enough for a cold serverless start, short enough that a dead network is not a spinner forever. */
const TIMEOUT_MS = 15_000;

/**
 * An absolute URL on the API, for the one kind of caller that is not `api()`:
 * something outside the app that has to be handed a link — the system browser
 * opening a receipt. Everything the app itself fetches still goes through `api()`.
 */
export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The API's own machine-readable code, when it sent one. */
    readonly code?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The shape a screen usually branches on: "this is mine to fix" vs "this is broken". */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header for a genuinely public read, saving a session lookup. */
  anonymous?: boolean;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Override `TIMEOUT_MS` for a call whose server side is known to be slow (e.g. one that sends mail). */
  timeoutMs?: number;
};

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { method = 'GET', body, anonymous = false, query, timeoutMs = TIMEOUT_MS } = options;

  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      // `undefined` and `null` mean "not asked for", not "asked for nothing" —
      // sending `?status=undefined` would filter on the literal string.
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (!anonymous) {
    const token = await currentAccessToken();
    // No token is not an error here: signed-out browsing is a real state and
    // the API answers 401 itself for anything that needs identity.
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    // Aborts and DNS/offline failures land here alike, and read alike to a
    // user: the request did not happen.
    // Read the signal, not the error: expo/fetch rejects an abort with
    // FetchRequestCanceledException, not a DOMException named `AbortError`.
    const aborted = controller.signal.aborted;
    throw new ApiError(
      0,
      aborted
        ? 'La connexion a expiré. Vérifiez votre réseau et réessayez.'
        : 'Impossible de joindre le serveur. Vérifiez votre connexion.'
    );
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && typeof (payload as any).message === 'string'
        ? (payload as any).message
        : null) ?? genericMessageFor(response.status);
    throw new ApiError(response.status, message, (payload as any)?.error);
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // A proxy or a tunnel returning HTML is the usual cause. Keeping the raw
    // text out of the thrown message on purpose — an HTML page in a toast tells
    // a user nothing and can carry markup.
    return null;
  }
}

function genericMessageFor(status: number): string {
  if (status === 401) return 'Votre session a expiré. Reconnectez-vous.';
  if (status === 403) return "Vous n'avez pas accès à cette ressource.";
  if (status === 404) return 'Introuvable.';
  if (status === 409) return 'Cette action entre en conflit avec un changement récent.';
  if (status >= 500) return 'Le serveur a rencontré un problème. Réessayez dans un instant.';
  return 'La requête a échoué. Réessayez.';
}

/** `Page<T>` as the API's list endpoints return it. */
export type Page<T> = { items: T[]; total: number; limit: number; offset: number };
