import { router } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/lib/routes';

/**
 * Where Stripe's payout onboarding lands: `sougouba://payouts-return`, via the
 * API's `/stripe/connect/return` redirect.
 *
 * `useCourierPayouts` is awaiting this URL from `openAuthSessionAsync` and
 * re-reads the status itself. On Android the link also reaches the router, so
 * — like `auth/callback` — this route only steps back to where the courier was.
 */
export default function PayoutsReturn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.splash);
  }, []);
  return null;
}
