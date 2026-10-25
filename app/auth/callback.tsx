import { router } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/lib/routes';

/**
 * Where Google (and later Apple) sends the browser back to:
 * `sougouba://auth/callback`.
 *
 * The sign-in itself is finished by `oauthContinue`, which is awaiting this
 * exact URL from `openAuthSessionAsync`. On Android the same link also reaches
 * the router, which would otherwise show "page not found" over the sign-in
 * screen — so this route exists only to step straight back to it.
 */
export default function OAuthCallback() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.splash);
  }, []);
  return null;
}
