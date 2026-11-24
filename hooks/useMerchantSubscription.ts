import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';

import { vendorsApi } from '@/data/api';
import type { MerchantSubscription } from '@/data/api/vendors';
import { ApiError } from '@/data/http';
import { useT } from '@/lib/i18n/useT';

export interface MerchantSubscriptionState {
  /** Null until read, and when the read failed — the screen then states the price and offers nothing. */
  subscription: MerchantSubscription | null;
  /** Opens Stripe's checkout to start the subscription, then re-reads it. */
  subscribe: () => Promise<void>;
  /** Opens Stripe's portal — card, invoices, cancellation — then re-reads it. */
  manage: () => Promise<void>;
  /** True while a Stripe page is being fetched or is open. */
  busy: boolean;
  /** Why the last action failed, worded for the merchant. */
  error: string | null;
}

/**
 * The shop's monthly subscription: where it stands, and the two things a
 * merchant can do about it.
 *
 * The card never passes through the app or the API — Stripe's hosted pages
 * collect it, in an auth session that closes itself when the API's return
 * route redirects to `sougouba://subscription-return`.
 *
 * `active` is false until the shop is approved: the API refuses to bill a shop
 * that cannot sell yet.
 */
export function useMerchantSubscription(active: boolean): MerchantSubscriptionState {
  const t = useT();
  const [subscription, setSubscription] = useState<MerchantSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!active) return;
    try {
      setSubscription(await vendorsApi.getMySubscription());
    } catch {
      // Not worth an error on the profile: the plan card still states the price.
      setSubscription(null);
    }
  }, [active]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const through = useCallback(
    async (link: () => Promise<string>) => {
      if (busy) return;
      setError(null);
      setBusy(true);
      try {
        const url = await link();
        await WebBrowser.openAuthSessionAsync(url, vendorsApi.SUBSCRIPTION_RETURN_URL);
        // Whatever the browser reported — paid, closed early, cancelled —
        // Stripe is the one that knows where the subscription stands now.
        await reload();
      } catch (cause) {
        setError(cause instanceof ApiError ? cause.message : t('common.genericError'));
      } finally {
        setBusy(false);
      }
    },
    [busy, reload, t]
  );

  const subscribe = useCallback(() => through(vendorsApi.startSubscriptionCheckout), [through]);
  const manage = useCallback(() => through(vendorsApi.openSubscriptionPortal), [through]);

  return { subscription, subscribe, manage, busy, error };
}
