import { router } from 'expo-router';
import { useEffect } from 'react';

import { routes } from '@/lib/routes';

/**
 * Where Stripe's subscription checkout and portal land:
 * `sougouba://subscription-return`, via the API's `/stripe/billing/return`
 * redirect.
 *
 * `useMerchantSubscription` is awaiting this URL from `openAuthSessionAsync`
 * and re-reads the subscription itself. On Android the link also reaches the
 * router, so — like `payouts-return` — this route only steps back to where the
 * merchant was.
 */
export default function SubscriptionReturn() {
  useEffect(() => {
    if (router.canGoBack()) router.back();
    else router.replace(routes.splash);
  }, []);
  return null;
}
