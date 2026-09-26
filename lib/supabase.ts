import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

/**
 * The app's Supabase client — **auth only**, plus Storage and Realtime later.
 *
 * Everything about *data* goes through `data/http.ts` to the NestJS API, not
 * through PostgREST from here. That split is deliberate and load-bearing: the
 * API is where authorization lives (guards, ownership checks, money), and a
 * client that could read tables directly would be a second, unguarded door into
 * the same database. RLS is the wall behind that door, not a substitute for it.
 *
 * So this client's job is narrow: sign in, keep the session fresh, and hand
 * `data/http.ts` a bearer token.
 *
 * ── Why AsyncStorage and not SecureStore ────────────────────────────────────
 *
 * Checked against the SDK 57 docs rather than assumed: `expo-secure-store` is
 * documented to reject large values — "some iOS releases refused values above
 * roughly 2048 bytes" — and a Supabase session is an access token, a refresh
 * token and a serialised user object, which goes past that comfortably. A
 * storage adapter that works until a user's JWT grows a claim is worse than one
 * that never pretended to be encrypted.
 *
 * ⚠️ The consequence, stated plainly: **the session is stored unencrypted on
 * device.** On a rooted/jailbroken phone it is readable. The mitigations that
 * matter are the ones already in place — short-lived access tokens, refresh
 * rotation, and every privileged action being re-checked server-side — not the
 * storage layer. A chunked SecureStore adapter is the upgrade path if the
 * client's risk assessment ever calls for it.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Thrown at import rather than swallowed: a client built with `undefined`
  // fails later with an opaque network error, three screens from the cause.
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set. See .env.example.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // ⚠️ Must be false in React Native. The default parses the *browser* URL
    // for an OAuth fragment; there is no such URL here, and leaving it on makes
    // the client throw on a platform with no `window.location`.
    detectSessionInUrl: false,
  },
});

/**
 * The access token for the current session, refreshed if it is close to expiry.
 *
 * `getSession()` rather than a stored copy: the client rotates the token on its
 * own schedule, and a token captured once goes stale in an hour. Returns null
 * when signed out, which callers treat as "send no Authorization header" rather
 * than as an error — plenty of this API is public.
 */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
